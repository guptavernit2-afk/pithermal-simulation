"""Serve the workbench and its live sensor on loopback: python -m simulator."""

import argparse
import json
import signal
from decimal import Decimal, DecimalException
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .runtime import ProbeDisconnected, running_probe


ROOT = Path(__file__).resolve().parents[1]


def field(body, name):
    payload = json.loads(body, parse_float=Decimal)
    if not isinstance(payload, dict) or name not in payload:
        raise ValueError(f"Expected a JSON object with {name}")
    return payload[name]


def millidegrees(body):
    value = field(body, "celsius")
    if type(value) not in (int, Decimal) or not -55 <= value <= 125:
        raise ValueError("Expected a temperature from -55 to 125 °C")
    value = Decimal(value)
    if value != value.quantize(Decimal("0.001")):
        raise ValueError("Use at most three decimal places")
    return int(value * 1000)


class WorkbenchHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # A plain static server still serves the Phase 1 circuit on its own.
        self.send_header("X-PiThermal-Monitor", "1")
        super().end_headers()

    def local_api_request(self):
        port = self.server.server_port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if port == 80:
            hosts.update({"127.0.0.1", "localhost"})
        host = self.headers.get("Host", "").lower()
        origin = self.headers.get("Origin")
        if host in hosts and (origin is None or origin == f"http://{host}"):
            return True
        self.send_error(403, "Use the local workbench address")
        return False

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/api/temperature", "/api/mode", "/api/connection"):
            self.send_error(404)
            return
        if not self.local_api_request():
            return
        if self.headers.get_content_type() != "application/json":
            self.send_error(415, "Expected JSON")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 128:
                raise ValueError("Invalid request size")
            body = self.rfile.read(size)
            probe = self.server.probe
            if path == "/api/temperature":
                revision = probe.set_millidegrees(millidegrees(body))
            elif path == "/api/mode":
                revision = probe.set_mode(field(body, "mode"))
            else:
                revision = probe.set_connected(field(body, "connected"))
        except (ValueError, DecimalException):
            self.send_error(400, "Invalid probe control")
            return
        except ProbeDisconnected:
            self.send_error(409, "Probe is disconnected")
            return
        except (OSError, RuntimeError):
            self.send_error(503, "Could not update virtual probe")
            return
        self.send_response(204)
        self.send_header("X-Probe-Revision", str(revision))
        self.end_headers()

    def do_GET(self):
        if urlsplit(self.path).path != "/api/events":
            return super().do_GET()
        if not self.local_api_request():
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        previous = -1
        probe = self.server.probe
        try:
            while not probe.closed:
                previous, snapshot = probe.next_snapshot(previous)
                if probe.closed:
                    return
                event = f"data: {json.dumps(snapshot)}\n\n" if snapshot else ": keepalive\n\n"
                self.wfile.write(event.encode("utf-8"))
                self.wfile.flush()
        except ConnectionError:
            pass  # Closing or refreshing the browser ends just this subscription.


def main():
    parser = argparse.ArgumentParser(description="Run the PiThermal local sensor simulator.")
    parser.add_argument("--hardware-dir", type=Path, default=ROOT.parent / "pithermal-hardware",
                        help="companion hardware checkout (default: sibling pithermal-hardware)")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    hardware = args.hardware_dir.resolve()
    if not all((hardware / "src" / name).is_file() for name in ("monitor.py", "sensor_reader.py")):
        parser.error("Clone pithermal-hardware beside this project or pass --hardware-dir PATH")
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")

    handler = partial(WorkbenchHandler, directory=str(ROOT / "web"))
    stopping = False

    def request_stop(signum, frame):
        nonlocal stopping
        stopping = True

    previous_handler = signal.signal(signal.SIGTERM, request_stop)
    try:
        with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
            server.timeout = 0.5
            with running_probe(hardware) as (probe, process):
                server.probe = probe
                print(f"Workbench: http://127.0.0.1:{server.server_port}/", flush=True)
                print(f"Virtual sensor file: {probe.file}", flush=True)
                print(f"Hardware monitor PID: {process.pid}", flush=True)
                while not stopping:
                    server.handle_request()
    except KeyboardInterrupt:
        pass
    except OSError as exc:
        parser.exit(1, f"Could not run the simulator: {exc}\n")
    finally:
        signal.signal(signal.SIGTERM, previous_handler)
    print("Simulator stopped.")


if __name__ == "__main__":
    main()

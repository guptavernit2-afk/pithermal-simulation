"""One file-backed DS18B20 and the companion project's real monitor process."""

import subprocess
import sys
import tempfile
import threading
import time
from collections import deque
from contextlib import contextmanager
from pathlib import Path


MINIMUM = -55000
MAXIMUM = 125000
STEP = 500  # Millidegrees per one-second simulation tick.


class ProbeDisconnected(RuntimeError):
    """A temperature control was used while the probe was off the bus."""


def _replace(source, destination):
    # On Windows a simultaneous monitor read can briefly block a rename.
    for attempt in range(5):
        try:
            source.replace(destination)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.01)


class ProbeSession:
    def __init__(self, directory):
        self.devices_dir = directory / "devices"
        self.file = self.devices_dir / "28-0123456789ab" / "temperature"
        self.parked = directory / "unplugged"
        self.file.parent.mkdir(parents=True)
        self.changed = threading.Condition()
        self.lines = deque(maxlen=60)
        self.revision = 0
        self.closed = False
        self.exit_code = None
        self.monitor_pid = None
        self.connected = True
        self.mode = "hold"
        self.adjustment_error = None
        self.set_millidegrees(25000)

    def _write_temperature(self, value):
        pending = self.file.with_suffix(".tmp")
        pending.write_text(f"{value}\n", encoding="ascii")
        _replace(pending, self.file)
        self.millidegrees = value

    def _require_probe(self):
        if self.closed:
            raise RuntimeError("The simulation has stopped")
        if not self.connected:
            raise ProbeDisconnected("Reconnect the probe to change its temperature")

    def set_millidegrees(self, value):
        with self.changed:
            self._require_probe()
            self._write_temperature(value)
            self.mode = "hold"
            self.adjustment_error = None
            return self._notify()

    def set_mode(self, mode):
        if mode not in ("warm", "cool", "hold"):
            raise ValueError("Expected warm, cool or hold")
        with self.changed:
            self._require_probe()
            if ((mode == "warm" and self.millidegrees == MAXIMUM)
                    or (mode == "cool" and self.millidegrees == MINIMUM)):
                mode = "hold"
            self.mode = mode
            self.adjustment_error = None
            return self._notify()

    def set_connected(self, connected):
        if type(connected) is not bool:
            raise ValueError("Expected a boolean connection state")
        with self.changed:
            if self.closed:
                raise RuntimeError("The simulation has stopped")
            if self.connected != connected:
                # Move the complete probe out of or back onto the bus in one
                # rename. Its ID and last reading survive the disconnection.
                if connected:
                    _replace(self.parked, self.file.parent)
                else:
                    _replace(self.file.parent, self.parked)
                self.connected = connected
                self.mode = "hold"
                self.adjustment_error = None
                self._notify()
            return self.revision

    def adjust_temperature(self):
        with self.changed:
            while not self.closed:
                self.changed.wait_for(lambda: self.closed or self.mode != "hold")
                if self.closed:
                    return
                mode = self.mode
                # Output lines and browser requests can also wake the condition.
                # Only a mode change or shutdown interrupts the one-second tick.
                if self.changed.wait_for(lambda: self.closed or self.mode != mode, timeout=1):
                    continue
                step = STEP if mode == "warm" else -STEP
                value = max(MINIMUM, min(MAXIMUM, self.millidegrees + step))
                try:
                    self._write_temperature(value)
                except OSError:
                    self.adjustment_error = "Temperature adjustment stopped because the sensor file could not be written."
                    self.mode = "hold"
                if value in (MINIMUM, MAXIMUM):
                    self.mode = "hold"
                self._notify()

    def _notify(self):
        self.revision += 1
        self.changed.notify_all()
        return self.revision

    def capture(self, process):
        for line in process.stdout:
            with self.changed:
                self.lines.append(line.rstrip("\r\n"))
                self._notify()
        code = process.wait()
        with self.changed:
            self.exit_code = code
            self._notify()

    def next_snapshot(self, previous):
        with self.changed:
            self.changed.wait_for(lambda: self.closed or self.revision != previous, timeout=10)
            if self.closed or self.revision == previous:
                return self.revision, None
            raw = None
            if self.connected:
                try:
                    raw = self.file.read_text(encoding="ascii").strip()
                except (OSError, UnicodeError):
                    pass
            return self.revision, {
                "revision": self.revision,
                "file": str(self.file),
                "raw": raw,
                "connected": self.connected,
                "mode": self.mode,
                "adjustmentError": self.adjustment_error,
                "lines": list(self.lines),
                "monitorPid": self.monitor_pid,
                "exitCode": self.exit_code,
            }


@contextmanager
def running_probe(hardware_dir):
    with tempfile.TemporaryDirectory(prefix="pithermal-") as directory:
        session = ProbeSession(Path(directory))
        command = [sys.executable, "-E", "-B", "-X", "utf8", "-u", "-m", "src.monitor",
                   "--devices-dir", str(session.devices_dir)]
        with subprocess.Popen(command, cwd=hardware_dir, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, encoding="utf-8") as process:
            session.monitor_pid = process.pid
            reader = threading.Thread(target=session.capture, args=(process,), daemon=True)
            adjustment = threading.Thread(target=session.adjust_temperature, daemon=True)
            reader.start()
            adjustment.start()
            try:
                yield session, process
            finally:
                with session.changed:
                    session.closed = True
                    session._notify()
                adjustment.join()
                if process.poll() is None:
                    process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                reader.join()

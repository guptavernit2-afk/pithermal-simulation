"""One file-backed DS18B20 and the companion project's real monitor process."""

import subprocess
import sys
import tempfile
import threading
import time
from collections import deque
from contextlib import contextmanager
from pathlib import Path


class ProbeSession:
    def __init__(self, devices_dir):
        self.file = devices_dir / "28-0123456789ab" / "temperature"
        self.file.parent.mkdir()
        self.changed = threading.Condition()
        self.lines = deque(maxlen=60)
        self.revision = 0
        self.closed = False
        self.exit_code = None
        self.set_millidegrees(25000)

    def set_millidegrees(self, value):
        with self.changed:
            if self.closed:
                raise RuntimeError("The simulation has stopped")
            # Serialize writers and replace the whole file so a simultaneous
            # hardware monitor read sees one complete sample.
            pending = self.file.with_suffix(".tmp")
            pending.write_text(f"{value}\n", encoding="ascii")
            for attempt in range(5):
                try:
                    pending.replace(self.file)
                    break
                except PermissionError:
                    # Windows may briefly hold the destination open during a read.
                    if attempt == 4:
                        raise
                    time.sleep(0.01)
            self._notify()
            return self.revision

    def _notify(self):
        self.revision += 1
        self.changed.notify_all()

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
            try:
                raw = self.file.read_text(encoding="ascii").strip()
            except (OSError, UnicodeError):
                raw = None
            return self.revision, {
                "revision": self.revision,
                "file": str(self.file),
                "raw": raw,
                "lines": list(self.lines),
                "exitCode": self.exit_code,
            }


@contextmanager
def running_probe(hardware_dir):
    with tempfile.TemporaryDirectory(prefix="pithermal-") as directory:
        session = ProbeSession(Path(directory))
        command = [sys.executable, "-E", "-B", "-X", "utf8", "-u", "-m", "src.monitor",
                   "--devices-dir", directory]
        with subprocess.Popen(command, cwd=hardware_dir, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, encoding="utf-8") as process:
            reader = threading.Thread(target=session.capture, args=(process,), daemon=True)
            reader.start()
            try:
                yield session, process
            finally:
                with session.changed:
                    session.closed = True
                    session._notify()
                if process.poll() is None:
                    process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                reader.join()

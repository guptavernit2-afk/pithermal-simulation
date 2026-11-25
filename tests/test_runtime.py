import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from simulator.__main__ import millidegrees
from simulator.runtime import running_probe


ROOT = Path(__file__).resolve().parents[1]
HARDWARE = Path(os.environ.get("PITHERMAL_TEST_HARDWARE", ROOT.parent / "pithermal-hardware"))


class RuntimeTests(unittest.TestCase):
    def test_millidegree_conversion_and_limits(self):
        for text, expected in [("-55", -55000), ("0", 0), ("0.001", 1),
                               ("27.5", 27500), ("30", 30000), ("31.25", 31250), ("125", 125000)]:
            with self.subTest(text=text):
                self.assertEqual(millidegrees(f'{{"celsius":{text}}}'.encode()), expected)

    def test_invalid_values(self):
        for text in ["true", '"30"', "null", "NaN", "Infinity", "-55.001", "125.001", "0.0001"]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                millidegrees(f'{{"celsius":{text}}}'.encode())

    def test_hardware_process_and_temp_directory_lifecycle(self):
        with running_probe(HARDWARE) as (session, process):
            devices_dir = session.file.parents[1]
            self.assertEqual(session.file.read_text().strip(), "25000")
            with session.changed:
                received = session.changed.wait_for(
                    lambda: any(line.endswith("25.000 °C  NORMAL") for line in session.lines),
                    timeout=8,
                )
            self.assertTrue(received, list(session.lines))
            self.assertIsNone(process.poll())
        self.assertIsNotNone(process.poll())
        self.assertFalse(devices_dir.exists())

    def test_missing_hardware_checkout_has_actionable_startup_error(self):
        with tempfile.TemporaryDirectory() as empty:
            result = subprocess.run(
                [sys.executable, "-B", "-m", "simulator", "--hardware-dir", empty, "--port", "0"],
                cwd=ROOT, capture_output=True, text=True, timeout=5,
            )
        self.assertEqual(result.returncode, 2)
        self.assertIn("--hardware-dir PATH", result.stderr)

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from simulator.__main__ import millidegrees
from simulator.runtime import ProbeDisconnected, running_probe


ROOT = Path(__file__).resolve().parents[1]
HARDWARE = Path(os.environ.get("PITHERMAL_TEST_HARDWARE", ROOT.parent / "pithermal-hardware"))


class RuntimeTests(unittest.TestCase):
    def wait_for_output(self, session, text):
        with session.changed:
            matched = session.changed.wait_for(
                lambda: session.lines and text in session.lines[-1], timeout=8,
            )
            self.assertTrue(matched, list(session.lines))

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
            directory = session.devices_dir.parent
            self.assertEqual(session.file.read_text().strip(), "25000")
            self.wait_for_output(session, "25.000 °C  NORMAL")
            self.assertIsNone(process.poll())
        self.assertIsNotNone(process.poll())
        self.assertFalse(directory.exists())

    def test_gradual_adjustments_stop_at_both_sensor_limits(self):
        with running_probe(HARDWARE) as (session, _):
            for mode, start, middle, limit in [("warm", 124250, 124750, 125000),
                                               ("cool", -54250, -54750, -55000)]:
                with self.subTest(mode=mode), session.changed:
                    session.set_millidegrees(start)
                    session.set_mode(mode)
                    self.assertEqual(int(session.file.read_text()), start)
                    self.assertTrue(session.changed.wait_for(lambda: session.millidegrees == middle, 4))
                    self.assertEqual(int(session.file.read_text()), middle)
                    self.assertTrue(session.changed.wait_for(lambda: session.mode == "hold", 4))
                    self.assertEqual(int(session.file.read_text()), limit)
                    session.set_mode(mode)
                    self.assertEqual(session.mode, "hold")

    def test_manual_slider_stops_an_active_adjustment(self):
        with running_probe(HARDWARE) as (session, _), session.changed:
            session.set_mode("warm")
            self.assertTrue(session.changed.wait_for(lambda: session.millidegrees > 25000, 4))
            session.set_millidegrees(27500)
            self.assertEqual(session.mode, "hold")
            self.assertFalse(session.changed.wait_for(lambda: session.millidegrees != 27500, 1.3))
            self.assertEqual(int(session.file.read_text()), 27500)

    def test_disconnect_and_reconnect_while_python_keeps_sampling(self):
        with running_probe(HARDWARE) as (session, process):
            self.wait_for_output(session, "25.000 °C  NORMAL")
            pid = process.pid
            self.assertEqual(session.next_snapshot(-1)[1]["monitorPid"], pid)
            with session.changed:
                session.set_mode("warm")
                session.set_connected(False)
            session.set_connected(False)  # Retrying must leave the bus empty.
            self.assertEqual(list(session.devices_dir.iterdir()), [])
            self.assertIsNone(session.next_snapshot(-1)[1]["raw"])
            with self.assertRaises(ProbeDisconnected):
                session.set_millidegrees(33000)
            with self.assertRaises(ProbeDisconnected):
                session.set_mode("warm")
            self.wait_for_output(session, "SENSOR ERROR  No DS18B20 found")
            self.assertIsNone(process.poll())

            session.set_connected(True)
            session.set_connected(True)
            self.assertEqual(list(session.devices_dir.iterdir()), [session.file.parent])
            self.assertEqual(int(session.file.read_text()), 25000)
            self.assertEqual(session.mode, "hold")
            self.wait_for_output(session, "25.000 °C  NORMAL")
            self.assertIsNone(process.poll())
            snapshot = session.next_snapshot(-1)[1]
            self.assertEqual(snapshot["monitorPid"], pid)
            self.assertEqual(sum(line.startswith("Threshold:") for line in snapshot["lines"]), 1)

    def test_missing_hardware_checkout_has_actionable_startup_error(self):
        with tempfile.TemporaryDirectory() as empty:
            result = subprocess.run(
                [sys.executable, "-B", "-m", "simulator", "--hardware-dir", empty, "--port", "0"],
                cwd=ROOT, capture_output=True, text=True, timeout=5,
            )
        self.assertEqual(result.returncode, 2)
        self.assertIn("--hardware-dir PATH", result.stderr)

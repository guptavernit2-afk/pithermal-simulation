# PiThermal Simulation

An offline classroom simulator for **Operating Systems CCA · Project 13 · Raspberry Pi Temperature Monitoring System**. Trace the Pi 4B circuit, move the virtual DS18B20 slider, inspect its sensor file, and watch the hardware project's Python monitor sample it.

**Current status — Phase 2 ready for review.** The slider, on-disk file and live Python output are connected. The monitor runs from the [companion hardware repository](https://github.com/guptavernit2-afk/pithermal-hardware).

## Run the circuit workbench

Use Python 3.8 or later and a modern browser. For first-time setup, clone both repositories into the same parent folder:

```sh
git clone https://github.com/guptavernit2-afk/pithermal-simulation.git
git clone https://github.com/guptavernit2-afk/pithermal-hardware.git
cd pithermal-simulation
```

If both checkouts are already on the laptop, start here. From the simulation repo root:

```sh
python -m simulator
```

Open [the local workbench](http://127.0.0.1:8765/). Use `python3` if that is your Python 3 command. After cloning, the simulator runs offline with the Python standard library. It creates one temporary probe at 25°C and starts one monitor process. Ctrl+C stops the service and its child process and removes the temporary device directory.

- **Change temperature.** Drag the slider or use the arrow keys for exact 0.25°C steps. **Virtual sensor file** shows the raw contents in millidegrees. Hover over the filename for its full path, also printed by the launcher.
- **Read the terminal.** **Python output** shows up to 60 recent lines captured from the companion process. The file changes as you move the slider. The monitor prints its next reading on its own two-second interval and warns only above 30°C.
- **Troubleshooting.** For a differently named hardware checkout, run `python -m simulator --hardware-dir "../path to checkout"`. If the port is busy, stop the previous server or use `--port 8766` and open the URL the launcher prints. The earlier `python -m http.server 8765 --bind 127.0.0.1 --directory web` command still serves the standalone wiring diagram.

Click a wire on the diagram, or Tab to its connection button and press Enter or Space. Try **1-Wire data** followed by **Pull-up resistor**. Both reach the DQ strip, but their other ends and purposes differ. Use **+** to enlarge the board, scroll to inspect its holes, and choose **Fit** to restore the whole drawing.

![PiThermal workbench showing the probe control, raw file and hardware monitor beside the circuit](docs/circuit-workbench.png)

## The classroom demo

The first three rows are implemented. Gradual cooling and probe disconnection are planned for Phase 3.

| What the presenter does | What the audience should see |
| --- | --- |
| Select the data wire | Both endpoints light up. Labels identify the probe's DQ pin and the Pi's GPIO4. |
| Set the slider to 27.5°C | The sensor file contains `27500`. On its next sample Python prints `27.500 °C  NORMAL` with a timestamp. |
| Set exactly 30°C, then 31.25°C | With the default 30°C threshold, Python first prints `NORMAL`, then `31.250 °C  WARNING`. |
| Press **Cool probe** | The simulated temperature falls gradually. The warning clears on the first sample at or below 30°C. |
| Disconnect the probe, then reconnect it | The sensor file disappears, Python prints `SENSOR ERROR`, and valid readings resume in the same process after reconnection. |

The slider gives the presenter exact values for boundary tests. **Warm probe** and **Cool probe** will change the simulated temperature gradually for a hands-on demonstration. The screen will identify the readings as simulated.

## Circuit wiring

The workbench shows a Raspberry Pi 4 with its 40-pin header, one three-pin DS18B20, a breadboard and a 4.7 kΩ pull-up. On this board each numbered strip from F through J is connected internally. For example, a jumper in J14 reaches the probe's DQ pin in F14. The selected strip is shaded between these contacts.

| Select | A | B | Purpose |
| --- | --- | --- | --- |
| Power feed | Pi 3.3 V, physical pin 1 | + rail, hole 2 | Supplies the positive rail. |
| Ground feed | Pi GND, physical pin 6 | − rail, hole 4 | Establishes the ground reference. |
| 1-Wire data | BCM GPIO4, physical pin 7 | J14 → DQ at F14 | Carries commands and temperature responses. |
| Probe supply | + rail, hole 20 | H15 → VDD at F15 | Supplies the probe with 3.3 V. |
| Probe ground | − rail, hole 8 | H13 → GND at F13 | Returns current to the Pi's ground. |
| Pull-up resistor | + rail, hole 18 | G14 → DQ at F14 | Holds the idle data line high through 4.7 kΩ. |

The pin map and sensor connections follow the component datasheets. Voltage measurement, 1-Wire electrical timing and the physical probe's response to heat belong to the bench investigation. [Raspberry Pi 4 Model B datasheet, §5.1](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf) · [DS18B20 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/DS18B20.pdf)

## Reproduce the checks

Keep `python -m simulator` running on its default port. The browser tests operate the slider in this local session. Use Node.js 20 or later and an installed Edge (Windows default) or Chrome (macOS/Linux default). In a second terminal at the simulation repository root:

```sh
npm --prefix tests ci
npm --prefix tests test
python -B -m unittest discover -s tests -v
```

The npm installation is a one-time step for automated browser tests. To use Chrome on Windows, set `$env:PITHERMAL_BROWSER_CHANNEL = "chrome"` before running them. `npm --prefix tests run test:circuit` runs just the nine wiring checks. The Python tests start a separate temporary probe and verify cleanup. If testing with a nonstandard companion path, set `PITHERMAL_TEST_HARDWARE` to that checkout for the Python tests.

**Phase 1 result on Windows: 9/9 passed in Edge and 9/9 in Chrome.** The checks click the drawing at independently specified positions, compare the two visible rings against the expected terminal coordinates, and check the inspector text. They also cover the resistor lead, keyboard selection, zoomed wire picking on a narrow screen, and loading with external requests blocked.

**Phase 2 results on Windows.** All 13 browser checks passed in both Edge and Chrome, and all four Python service tests passed. The browser test moves the native slider, waits for the file viewer, independently reads the temporary file from disk, and checks the most recent timestamped terminal line. Refreshing the page reattached to the running session and received a new sample. After Ctrl+C, the launcher's recorded monitor PID had exited and the temporary device directory was gone.

| Slider | Verified file contents | Verified Python output after the timestamp |
| --- | ---: | --- |
| 27.5°C | `27500` | `27.500 °C  NORMAL` |
| 30°C | `30000` | `30.000 °C  NORMAL` |
| 31.25°C | `31250` | `31.250 °C  WARNING` |

## How a slider movement reaches Python

1. **Browser.** The presenter changes the virtual probe's temperature. A local Python service receives the value.
2. **Virtual device.** The service converts °C to whole millidegrees and updates a temporary file such as `<devices-dir>/28-0123456789ab/temperature`. The file viewer displays the raw value. This directory models the device files Linux exposes through sysfs.
3. **Existing monitor.** From the hardware checkout, the service starts `python -m src.monitor --devices-dir <devices-dir>`. The monitor discovers the probe and reads the file. Its defaults are a two-second interval and a warning strictly above 30°C.
4. **Terminal.** The service captures the child process's output and forwards updates to the browser using server-sent events. The hardware monitor owns the warning decision. Each terminal line reflects a completed sample, so it can follow a slider movement by one sampling interval.

On a real Pi, the **Linux 1-Wire driver** supplies the file. In this demo, the **local service** supplies it. The monitor exercises the same file-reading interface in both cases. The diagram and file viewer make that OS boundary visible during the viva.

The companion checkout used for verification was [hardware revision 7493bf9](https://github.com/guptavernit2-afk/pithermal-hardware/tree/7493bf956623e0b35fc6f2a0a41b89893939c6cd).

## Repository structure

```text
pithermal-simulation/
├── README.md       Project guide, circuit map, phase plan and review status
├── simulator/      Local service, virtual probe files and monitor process management
├── web/            Browser interface, circuit controls, file viewer and live terminal
│   └── assets/     Local circuit artwork and other assets needed offline
├── tests/          Simulator tests and browser-to-monitor integration checks
└── docs/           Verified demo evidence and diagrams for the CCA report
```

The circuit geometry lives in [wiring.js](web/wiring.js) and its drawing in [board.js](web/assets/board.js). The [local service](simulator/__main__.py) connects the [probe and child process](simulator/runtime.py) to the [browser controls](web/probe.js). The [sensor browser tests](tests/probe.test.cjs) exercise the full path.

## Build and review phases

| Phase | Deliverable | What must pass before review |
| --- | --- | --- |
| **1 · Interactive circuit** | Reviewed local circuit workbench and connection inspector. | Verified all six pairs of terminals, their purposes, keyboard selection, zoom alignment and local asset loading. |
| **2 · Sensor-to-terminal path** | Working slider, virtual file and Python terminal, ready for review. | Verified the three requested temperatures, stream reconnection, startup and shutdown. |
| **3 · Demonstration controls** | Add gradual warming, cooling, and probe disconnect/reconnect. | Observe a complete warning and recovery cycle. Disconnect during a run, verify the error, reconnect, and observe a fresh valid reading in the same process. |
| **4 · Offline verification and handoff** | Finish one-command setup instructions, troubleshooting, and the classroom walkthrough. | From fresh checkouts, complete setup, disconnect from the network, launch the simulator, run the demo twice, and record results for the report. |

For each phase, implement the agreed scope, run its acceptance checks and earlier automated tests, record actual results, then commit and push for team review. The initial README commit establishes the plan. Simulator results will be added as each phase is verified.

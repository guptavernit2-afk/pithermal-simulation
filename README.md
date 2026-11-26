# PiThermal Simulation

A classroom simulator for **Operating Systems CCA · Project 13 · Raspberry Pi Temperature Monitoring System**. Trace the Pi 4B circuit, warm or unplug the virtual DS18B20, and watch the hardware project's Python monitor read its sensor file.

**[Open the live simulator](https://pithermal-simulation.onrender.com/)**. The free Render service can take about a minute to wake after inactivity. Visitors share one virtual probe.

The simulator runs the same Python monitor that will run on the physical Pi. The offline laptop demo and hosted demo have been tested. Physical wiring and sensor readings still need a bench test. [Companion hardware repository](https://github.com/guptavernit2-afk/pithermal-hardware) · [Offline verification](#phase-4-offline-verification)

## Prepare the laptop while online

The presenter needs **Python 3.8 or later** and a web browser such as Edge or Chrome. The demo runs on a laptop using Python's standard library. The simulator supplies the virtual sensor, and the hardware checkout supplies the monitor that reads it.

Open a terminal in an empty parent folder. With Git installed, this one line gets both repositories in PowerShell 7, Command Prompt, macOS or Linux. In Windows PowerShell 5.1, run the two `git clone` commands on separate lines.

```sh
git clone https://github.com/guptavernit2-afk/pithermal-simulation.git && git clone https://github.com/guptavernit2-afk/pithermal-hardware.git
```

For a classroom laptop that is already offline, copy both prepared folders onto it side by side. Keep the folder names `pithermal-simulation` and `pithermal-hardware`. Only the automated browser checks need Node.js and an npm dependency. [Test setup](#reproduce-the-checks)

## Run the circuit workbench

1. To demonstrate offline operation, switch off Wi-Fi and unplug Ethernet if connected. The workbench uses the laptop's loopback address.
2. Open a terminal in `pithermal-simulation`, or enter `cd pithermal-simulation` from the parent folder. Start the entire demo with one command. Use `python3` if that is your Python 3 command.

   ```sh
   python -m simulator
   ```

3. Open the address printed in the terminal and keep the terminal open. The launcher also prints the sensor file path and the Python monitor's process ID (PID). The workbench starts at **25°C**, the virtual file reads **25000**, and Python prints `25.000 °C  NORMAL`. [Open the default local workbench](http://127.0.0.1:8765/)

### Workbench controls

- **Change temperature.** Use the probe controls above the diagram. Drag the slider or use the arrow keys for exact 0.25°C steps. **Virtual sensor file** under the Python log shows the raw value in millidegrees. Expand its name to see or copy the full path, also printed by the launcher.
- **Warm, cool or hold.** **Warm** adds 0.5°C each second. **Cool** subtracts 0.5°C each second. Choose **Hold** to keep the current value. Moving the slider or reaching −55°C or 125°C also stops the adjustment. The local service sets this classroom demonstration rate.
- **Unplug and reconnect.** Select the DS18B20 on the diagram, then choose **Unplug from circuit** in the inspector. The socket at F13–F15 becomes empty and Python prints `SENSOR ERROR`. Select the empty socket and choose **Insert into circuit** to resume at the last temperature. The probe controls at the top also have **Disconnect probe** and **Reconnect probe** buttons for these actions.
- **Read the records.** Choose **Python log** in the top navigation. The full-width **Python output** panel groups the monitor's actual output by time, reading and status. It keeps up to 60 lines. Scroll back to read earlier samples and choose **Latest** to follow new ones again. The monitor samples every two seconds and warns only above 30°C.

Click a wire or one of the probe's three pin contacts to trace a connection. Its two ends and purpose appear in the inspector. Click the Pi, breadboard or probe to inspect the part and trace a related wire. For keyboard access use the wire buttons or the **Components** menu. Use **+** to zoom in, drag or scroll to pan, and choose **Fit** to see the whole circuit again.

![PiThermal with probe controls above the circuit, the selected part in the inspector, and Python readings in the full-width log below](docs/circuit-workbench.png)

## The classroom demo

Run the rows in order. Give Python time to print a new line before moving to the next step.

| What the presenter does | What the audience should see |
| --- | --- |
| Select the data wire | Both endpoints light up. Labels identify the probe's DQ pin and the Pi's GPIO4. |
| Set the slider to 27.5°C | The sensor file contains `27500`. On its next sample Python prints `27.500 °C  NORMAL` with a timestamp. |
| Set exactly 30°C, wait for a reading, then set 31.25°C | With the default 30°C threshold, Python first prints `30.000 °C  NORMAL`, then `31.250 °C  WARNING`. |
| Set 29.5°C, wait for a reading, then press **Warm** | Python starts at `NORMAL`. Let it sample a temperature above 30°C and print `WARNING`. |
| Press **Cool**, then **Hold** when the warning clears | The file value falls every second. Python prints `NORMAL` on its first sample at or below 30°C. |
| Set 27.5°C, wait for `NORMAL`, then press **Disconnect probe** | The probe disappears from the drawing and the file viewer says **File absent**. Wait for Python to print `SENSOR ERROR  No DS18B20 found`. |
| Press **Reconnect probe**, wait for 27.5°C, then move the slider to 28.25°C | The same file returns. Python first prints `27.500 °C  NORMAL`, then `28.250 °C  NORMAL`. The monitor PID stays the same. |

To reset a local demo, press **Ctrl+C** in the launch terminal and wait for `Simulator stopped.` Start `python -m simulator` again and reopen the printed address. The new session starts at 25°C with a fresh temporary directory and monitor. For the hosted demo, reconnect the probe if needed, select **Hold**, and set the slider to 25°C. Refreshing the page shows the current session.

### Troubleshooting during the demo

| What you see | What to do |
| --- | --- |
| The launcher asks for the hardware checkout | Put both repos in the same parent folder, or supply the actual path with `python -m simulator --hardware-dir "../path to checkout"`. |
| The launcher reports that the port is in use | For the classroom demo, run `python -m simulator --port 8766` and open its printed URL. The automated browser checks default to port 8765. |
| Only the wiring diagram appears | The static server serves the diagram alone. Start `python -m simulator` from the simulation repo and open the address it prints to get the live probe controls. |
| The file changed but Python still shows the previous reading | Wait for the next timestamp. The monitor samples every two seconds. Exactly 30°C is `NORMAL`. |
| The log says **Reconnecting…** | Leave the tab open. The controls pause and the last Python records remain available. Current readings return when the stream reconnects. |
| The log says **Exited** | For a local run, press Ctrl+C in the launch terminal and run `python -m simulator` again. For a hosted run, wait for the service to come back online or use the local demo. |

## Pre-deployment review

The Windows laptop review passed **25 browser checks in Edge and 25 in Chrome**, each against its own simulator with the real Python monitor and no physical sensor. All **9 simulator Python tests** and **13 companion-project Python tests** passed. A separate static-server check verified the diagram-only launch instructions. Each browser tab connected to the same simulator sees and controls the same probe.

| Reviewed area | Verified behavior |
| --- | --- |
| Circuit and inspector | All six connections highlight their endpoints. A tap between nearby wires selects the closest one. The breadboard lists both supply rails, and unplugging the sensor identifies its empty socket. |
| Sensor file and real Python monitor | At 30°C Python prints `NORMAL`. At 30.001°C the workbench shows the exact reading and Python prints `WARNING`. Cooling clears the warning. After unplugging and reconnecting, the same Python process resumes sampling. |
| Interrupted sessions | Losing the live stream clears current readings and preserves log history. Temporary service errors recover without a page refresh. If the monitor process exits, warming and cooling stop and controls are disabled. |
| Interface | The temperature display and full file path fit at 320 CSS pixels with enlarged text. Earlier log records can be selected and copied while new readings arrive. Keyboard users can inspect wires, components and the file path. |

## Host the live demo on Render

The [public deployment](https://pithermal-simulation.onrender.com/) was checked through the browser. Python printed `NORMAL` at 30°C and `WARNING` at 31.25°C. Cooling cleared the warning. Disconnecting produced `SENSOR ERROR`, and reconnecting restored readings in the same Python process.

To deploy your own copy:

1. In the Render dashboard, choose **New → Blueprint** and select this repository and the `main` branch. If it is missing from the connected repository list, use its public GitHub URL.
2. Give the Blueprint a name and choose **Deploy Blueprint**. The checked-in [render.yaml](render.yaml) selects one free Python web service in Singapore. The build checks out the verified hardware-monitor revision automatically.
3. When the service shows **Live**, open its `onrender.com` URL. Set 30°C, then 31.25°C, and check that the Python output switches from `NORMAL` to `WARNING`. Disconnect and reconnect the probe and confirm that the monitor keeps its PID.

Everyone using that URL controls the same probe. The free instance can sleep after 15 minutes of inactivity and takes about a minute to wake. A fresh instance starts at 25°C. Open the link before presenting so the monitor has time to start. Local launches still use loopback. [Render free service limits](https://render.com/docs/free)

For a circuit-only deployment in Vercel, import this repository, select the **Other** framework preset, and set the **Root Directory** to `web`. The static page supports zooming, wire selection and the inspector. The live controls and Python log require the Render service or a local launch.

## Phase 4 offline verification

The two runs used fresh GitHub clones of the reviewed simulator and hardware monitor. Each ran in its own Debian 13 container with read-only checkouts, Python 3.13.5 and a fresh headless Chromium 156 browser profile. Docker's `--network none` left only the loopback interface for the browser and Python. In each container, an external connection attempt returned `Network is unreachable` and the system listed zero physical DS18B20 probes. [Simulator revision a25d4cb](https://github.com/guptavernit2-afk/pithermal-simulation/tree/a25d4cbaa8b232a51c101698992116c6dd97da32) · [Hardware revision 7493bf9](https://github.com/guptavernit2-afk/pithermal-hardware/tree/7493bf956623e0b35fc6f2a0a41b89893939c6cd)

| Run | Temporary session directory under `/tmp` | Python on warming → cooling | Python after reconnect → slider change | Browser checks |
| --- | --- | --- | --- | --- |
| 1 | `pithermal-pq832t4a` | `31.000 °C  WARNING` → `29.500 °C  NORMAL` | `27.500 °C  NORMAL` → `28.250 °C  NORMAL` | 15/15 passed |
| 2 | `pithermal-uimzuev9` | `31.000 °C  WARNING` → `29.500 °C  NORMAL` | `27.500 °C  NORMAL` → `28.250 °C  NORMAL` | 15/15 passed |

In both runs the sensor started at `25000` millidegrees and Python printed `25.000 °C  NORMAL`. The browser checks verified both ends of all six connections. At 27.5°C, 30°C and 31.25°C the file on disk contained `27500`, `30000` and `31250`. Python reported `NORMAL`, `NORMAL` and `WARNING` in that order.

Unplugging the probe removed its directory from the virtual bus and produced `SENSOR ERROR`. The monitor kept its PID across reconnect in each run. After the stop signal, the process exited, the temporary directory was gone and port 8765 was free. All **7 simulator Python tests** and **13 hardware-project Python tests** also passed offline.

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

To automate the walkthrough, prepare **Node.js 20 or later** and an installed Edge (Windows default) or Chrome (macOS/Linux default). While still online, install the locked test dependency once from the simulation repository root.

```sh
npm --prefix tests ci
```

After disconnecting, start `python -m simulator` on its default port. In a second terminal in the simulation repo, run the following checks. To repeat the browser demo, stop the launcher, start it again, and rerun the npm test command.

```sh
npm --prefix tests test
python -B -m unittest discover -s tests -v
```

The browser suite covers touch selection, zoomed panning, unplugging from the diagram, precision at the warning threshold, stream interruption, log selection and narrow screens with enlarged text. To use Chrome on Windows, set `$env:PITHERMAL_BROWSER_CHANNEL = "chrome"` before running it. To test a separate local simulator, set `PITHERMAL_TEST_URL` to its printed address. `npm --prefix tests run test:circuit` runs the wiring and diagram-interaction checks alone.

The simulator Python tests start their own temporary probe. For a nonstandard hardware checkout, set `PITHERMAL_TEST_HARDWARE` to its path. To run the companion project's Python tests, run the same unittest command from the `pithermal-hardware` folder.

**Phase 1 result on Windows: 9/9 passed in Edge and 9/9 in Chrome.** The checks click the drawing at independently specified positions, compare the two visible rings against the expected terminal coordinates, and check the inspector text. They also cover the resistor lead, keyboard selection, zoomed wire picking on a narrow screen, and loading with external requests blocked.

**Phase 2 results on Windows.** All 13 browser checks passed in both Edge and Chrome, and all four Python service tests passed. The browser test moves the native slider, waits for the file viewer, independently reads the temporary file from disk, and checks the most recent timestamped terminal line. Refreshing the page reattached to the running session and received a new sample. After Ctrl+C, the launcher's recorded monitor PID had exited and the temporary device directory was gone.

| Slider | Verified file contents | Verified Python output after the timestamp |
| --- | ---: | --- |
| 27.5°C | `27500` | `27.500 °C  NORMAL` |
| 30°C | `30000` | `30.000 °C  NORMAL` |
| 31.25°C | `31250` | `31.250 °C  WARNING` |

**Phase 3 results on Windows.** All 15 browser checks passed in Edge and again in Chrome. All seven simulator Python tests and all 13 companion hardware tests passed on the laptop. In the browser demo, Python reported `29.500 °C  NORMAL`, then `31.000 °C  WARNING` during warming, then `29.500 °C  NORMAL` during cooling. The exact value on the first normal line depends on when Python samples.

Disconnecting at 27.5°C removed the device directory and produced `SENSOR ERROR  No DS18B20 found`. After reconnecting, the same PID printed `27.500 °C  NORMAL` and then `28.250 °C  NORMAL` after a slider change. The browser checks compare the PID and the on-disk path across reconnection. The Python tests also exercise both temperature limits, manual override, and the lifetime of the original monitor process.

## How the controls reach Python

1. **Browser.** The presenter sends a temperature, adjustment mode, or connection change to the local Python service. All open tabs share one probe. Warming and cooling continue when the page is refreshed.
2. **Virtual device.** The service writes whole millidegrees to `<devices-dir>/28-0123456789ab/temperature`. The file viewer reads this file. Disconnecting moves the entire probe directory outside the bus. Reconnecting moves it back with the same ID and reading. This models device discovery through Linux sysfs.
3. **Existing monitor.** From the hardware checkout, the service starts `python -m src.monitor --devices-dir <devices-dir>`. The monitor discovers the probe and reads the file. Its defaults are a two-second interval and a warning strictly above 30°C.
4. **Terminal.** The service captures the child process's output and forwards updates to the browser using server-sent events. The hardware monitor owns the warning decision. Each terminal line reflects a completed sample, so it can follow a slider movement by one sampling interval.

On a real Pi, the **Linux 1-Wire driver** supplies the file. In this demo, the **local service** supplies it. The monitor exercises the same file-reading interface in both cases. The diagram and file viewer make that OS boundary visible during the viva.

## Repository structure

```text
pithermal-simulation/
├── README.md       Project guide, circuit map, phase plan and review status
├── render.yaml     Render deployment settings and pinned monitor revision
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
| **2 · Sensor-to-terminal path** | Reviewed slider, virtual file and Python terminal. | Verified the three requested temperatures, stream reconnection, startup and shutdown. |
| **3 · Demonstration controls** | Reviewed warm, cool, hold, and disconnect/reconnect controls. | Verified a warning cleared during cooling and the same Python process recovered after the probe returned. |
| **4 · Offline verification and handoff** | Laptop setup, one-command launch, troubleshooting and classroom walkthrough. | Completed two offline demos from fresh checkouts and verified the sensor, Python output and cleanup in each. |
| **5 · Public deployment** | Live simulator on Render. | Verified the warning threshold, cooling and probe recovery through the public link. |

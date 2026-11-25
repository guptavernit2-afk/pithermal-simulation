# PiThermal Simulation

A planned offline classroom simulator for **Operating Systems CCA · Project 13 · Raspberry Pi Temperature Monitoring System**. A student will be able to trace the wires, warm a virtual DS18B20 probe, inspect the sensor file, and see the hardware project's Python monitor issue a temperature warning.

**Current status — README and repository structure ready for review.** Implementation starts in Phase 1. The table below describes the intended demo and its acceptance criteria. The physical build and its tested monitor live in the [companion hardware repository](https://github.com/guptavernit2-afk/pithermal-hardware).

## The classroom demo

| What the presenter does | What the audience should see |
| --- | --- |
| Select the data wire | Both endpoints light up. Labels identify the probe's DQ pin and the Pi's GPIO4. |
| Set the slider to 27.5°C | The sensor file contains `27500`. On its next sample Python prints `27.500 °C  NORMAL` with a timestamp. |
| Set exactly 30°C, then 31.25°C | With the default 30°C threshold, Python first prints `NORMAL`, then `31.250 °C  WARNING`. |
| Press **Cool probe** | The simulated temperature falls gradually. The warning clears on the first sample at or below 30°C. |
| Disconnect the probe, then reconnect it | The sensor file disappears, Python prints `SENSOR ERROR`, and valid readings resume in the same process after reconnection. |

The slider gives the presenter exact values for boundary tests. **Warm probe** and **Cool probe** will change the simulated temperature gradually for a hands-on demonstration. The screen will identify the readings as simulated.

## Circuit to draw

Use a Raspberry Pi 4 with a 40-pin header, one three-pin DS18B20, a breadboard, jumper wires and a 4.7 kΩ pull-up resistor. Show the breadboard rows and the full path of each connection. Selecting a wire should reveal its endpoints and purpose even for someone who cannot distinguish its colour.

| From | To | Purpose |
| --- | --- | --- |
| Pi 3.3 V, physical pin 1 | Breadboard power rail → probe VDD | Supplies power to the probe. |
| Pi ground, physical pin 6 | Breadboard ground rail → probe GND | Gives the circuit a common ground. |
| Pi BCM GPIO4, physical pin 7 | Probe DQ row | Carries the 1-Wire data signal. GPIO4 is the software pin name. Pin 7 is its physical position. |
| 3.3 V rail | DQ row through 4.7 kΩ | Holds the data line high when the bus is idle. |

The first version models this fixed circuit and a probe connection switch. Voltage measurement, 1-Wire electrical timing and the physical probe's response to heat belong to the bench investigation.

## How a slider movement reaches Python

1. **Browser.** The presenter changes the virtual probe's temperature. A local Python service receives the value.
2. **Virtual device.** The service converts °C to whole millidegrees and updates a temporary file such as `<devices-dir>/28-0123456789ab/temperature`. The file viewer displays the raw value. This directory models the device files Linux exposes through sysfs.
3. **Existing monitor.** From the hardware checkout, the service starts `python -m src.monitor --devices-dir <devices-dir>`. The monitor discovers the probe and reads the file. Its defaults are a two-second interval and a warning strictly above 30°C.
4. **Terminal.** The local service forwards the running process's output to the browser. This keeps one implementation of conversion, warnings and error recovery across both repositories. Each terminal line reflects a completed sample, so it can follow a slider movement by one sampling interval.

On a real Pi, the **Linux 1-Wire driver** supplies the file. In this demo, the **local service** supplies it. The monitor exercises the same file-reading interface in both cases. The diagram and file viewer make that OS boundary visible during the viva.

## Local setup plan

The intended setup is a laptop with Python 3, a browser, and local copies of both repositories. Place the checkouts side by side as `pithermal-simulation/` and `pithermal-hardware/`. The initial integration target is the [tested hardware monitor at revision 7493bf9](https://github.com/guptavernit2-afk/pithermal-hardware/tree/7493bf956623e0b35fc6f2a0a41b89893939c6cd). Using a recorded revision lets a teammate reproduce the demo later.

After setup, the simulator should start with one local command, serve its browser assets from the laptop, and support repeated runs without an account, network access or a session timer. The launcher should identify missing prerequisites, stop its monitor process on shutdown, and clean up temporary readings. The verified launch command will be added when the launcher exists.

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

The folders currently contain Git placeholders. Production monitor code stays in the companion repo. The simulator team owns the virtual device and the browser experience.

## Build and review phases

| Phase | Deliverable | What must pass before review |
| --- | --- | --- |
| **1 · Interactive circuit** | Serve the local circuit view, label each component and let the presenter inspect a wire. | Trace power, ground, data and the pull-up to the endpoints above. Check legibility on a laptop and confirm the circuit assets load locally. |
| **2 · Sensor-to-terminal path** | Connect the slider to the temporary device file and stream the hardware monitor's output. | Using the browser, set 27.5, 30 and 31.25°C. Verify each raw file value and the matching sampled terminal line. Check startup and shutdown. |
| **3 · Demonstration controls** | Add gradual warming, cooling, and probe disconnect/reconnect. | Observe a complete warning and recovery cycle. Disconnect during a run, verify the error, reconnect, and observe a fresh valid reading in the same process. |
| **4 · Offline verification and handoff** | Finish one-command setup instructions, troubleshooting, and the classroom walkthrough. | From fresh checkouts, complete setup, disconnect from the network, launch the simulator, run the demo twice, and record results for the report. |

For each phase, implement the agreed scope, run its acceptance checks and earlier automated tests, record actual results, then commit and push for team review. The initial README commit establishes the plan. Simulator results will be added as each phase is verified.

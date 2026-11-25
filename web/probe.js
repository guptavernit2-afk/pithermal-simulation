import { setProbeConnected } from "./workbench.js";

const panel = document.getElementById("live-probe");
const slider = document.getElementById("temperature-slider");
const target = document.getElementById("target-temperature");
const modeButtons = document.querySelectorAll(".thermal-controls button");
const connection = document.getElementById("probe-connection");
const probeState = document.getElementById("probe-state");
const file = document.getElementById("sensor-file");
const raw = document.getElementById("raw-temperature");
const unit = document.getElementById("raw-unit");
const terminal = document.getElementById("monitor-output");
const pid = document.getElementById("monitor-pid");
const status = document.getElementById("monitor-status");
const error = document.getElementById("probe-error");
const commands = [];
let writing = false;
let online = false;
let acceptedRevision = -1;
let latest = null;
let requestError = "";

function showTarget() {
  target.value = `${Number(slider.value).toFixed(2)} °C`;
  slider.setAttribute("aria-valuetext", target.value);
}

function syncSlider() {
  if (writing || !latest || latest.revision < acceptedRevision) return;
  if (latest.raw === null) {
    target.value = "—";
    slider.setAttribute("aria-valuetext", "Unavailable");
    return;
  }
  const celsius = Number(latest.raw) / 1000;
  if (Number.isFinite(celsius)) {
    slider.value = celsius;
    showTarget();
  }
}

function showError() {
  error.textContent = requestError || latest?.adjustmentError || "";
  error.hidden = !error.textContent;
}

// Keep actions in click order. Consecutive unsent slider values can be
// replaced by the final value without skipping a mode or connection change.
function send(path, payload) {
  const command = { path, payload };
  if (path === "/api/temperature" && commands.at(-1)?.path === path) {
    commands[commands.length - 1] = command;
  } else {
    commands.push(command);
  }
  if (!writing) void flushChanges();
}

async function flushChanges() {
  writing = true;
  while (commands.length) {
    const { path, payload } = commands.shift();
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        acceptedRevision = Number(response.headers.get("X-Probe-Revision"));
        requestError = "";
      } else {
        requestError = response.status === 409 ? "Reconnect the probe to change its temperature." :
          "Could not apply this control. Try again.";
      }
    } catch {
      requestError = "Could not reach the simulator. Check its connection and try again.";
    }
    showError();
  }
  writing = false;
  syncSlider();
}

slider.addEventListener("input", () => {
  showTarget();
  send("/api/temperature", { celsius: Number(slider.value) });
});
for (const button of modeButtons) {
  button.addEventListener("click", () => send("/api/mode", { mode: button.dataset.mode }));
}
connection.addEventListener("click", () => {
  if (latest) send("/api/connection", { connected: !latest.connected });
});

function enableControls() {
  connection.disabled = !online || latest?.exitCode !== null;
  slider.disabled = connection.disabled || !latest?.connected;
  for (const button of modeButtons) button.disabled = slider.disabled;
}

function display(snapshot) {
  latest = snapshot;
  online = true;
  raw.value = snapshot.raw ?? (snapshot.connected ? "Unavailable" : "File absent");
  unit.hidden = snapshot.raw === null;
  file.textContent = snapshot.file.split(/[\\/]/).slice(-2).join("/");
  file.title = snapshot.file;
  if (probeState.dataset.connected !== String(snapshot.connected)) {
    probeState.textContent = snapshot.connected ? "Connected" : "Disconnected";
    probeState.dataset.connected = String(snapshot.connected);
    setProbeConnected(snapshot.connected);
    connection.textContent = snapshot.connected ? "Disconnect probe" : "Reconnect probe";
  }
  for (const button of modeButtons) {
    button.setAttribute("aria-pressed", String(snapshot.connected && button.dataset.mode === snapshot.mode));
  }
  enableControls();
  syncSlider();
  showError();
  const output = snapshot.lines.join("\n");
  if (terminal.textContent !== output) {
    const follow = terminal.scrollTop + terminal.clientHeight >= terminal.scrollHeight - 4;
    terminal.textContent = output;
    if (follow) terminal.scrollTop = terminal.scrollHeight;
  }
  pid.textContent = `PID ${snapshot.monitorPid}`;
  const monitorState = snapshot.exitCode === null ? "Running" : `Exited (${snapshot.exitCode})`;
  if (status.textContent !== monitorState) status.textContent = monitorState;
}

async function connect() {
  // Keep the original static-only circuit usable without a monitor backend.
  const page = await fetch(location.pathname, { method: "HEAD", cache: "no-store" });
  if (page.headers.get("X-PiThermal-Monitor") !== "1") return;
  panel.hidden = false;
  const events = new EventSource("/api/events");
  events.onopen = () => { acceptedRevision = -1; };
  events.onmessage = event => display(JSON.parse(event.data));
  events.onerror = () => {
    online = false;
    enableControls();
    probeState.textContent = "Unknown";
    delete probeState.dataset.connected;
    status.textContent = "Reconnecting…";
  };
}

connect().catch(() => {
  panel.hidden = false;
  status.textContent = "Service unavailable";
});

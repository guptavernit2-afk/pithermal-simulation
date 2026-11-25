import { setProbeConnected } from "./workbench.js";

const liveElements = document.querySelectorAll("[data-live]");
const slider = document.getElementById("temperature-slider");
const target = document.getElementById("target-temperature");
const modeButtons = document.querySelectorAll(".thermal-controls button");
const connection = document.getElementById("probe-connection");
const circuitAction = document.getElementById("circuit-probe-action");
const probeState = document.getElementById("probe-state");
const file = document.getElementById("sensor-file");
const fullPath = document.getElementById("sensor-full-path");
const raw = document.getElementById("raw-temperature");
const unit = document.getElementById("raw-unit");
const terminal = document.getElementById("monitor-output");
const jumpLatest = document.getElementById("jump-latest");
const pid = document.getElementById("monitor-pid");
const status = document.getElementById("monitor-status");
const error = document.getElementById("probe-error");
const commands = [];
let activeWrite = null;
let online = false;
let acceptedRevision = -1;
let latest = null;
let requestError = "";

function showTarget(celsius) {
  target.value = celsius === null ? "—" : `${celsius.toFixed(3).replace(/(\.\d{2})0$/, "$1")} °C`;
  slider.setAttribute("aria-valuetext", celsius === null ? "Unavailable" : target.value);
}

function syncSlider() {
  if (activeWrite || !latest || latest.revision < acceptedRevision) return;
  const celsius = Number(latest.raw) / 1000;
  if (/^-?\d{1,6}$/.test(latest.raw) && celsius >= -55 && celsius <= 125) {
    slider.value = celsius;
    // The file can contain millidegrees between the slider's quarter-degree steps.
    showTarget(celsius);
  } else {
    showTarget(null);
  }
}

function showError() {
  const message = latest && latest.exitCode !== null
    ? "Python has stopped sampling. Restart the simulator from its launch terminal to resume."
    : requestError || latest?.adjustmentError || "";
  if (error.textContent !== message) error.textContent = message;
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
  if (!activeWrite) void flushChanges();
}

async function flushChanges() {
  const controller = new AbortController();
  activeWrite = controller;
  while (commands.length) {
    const { path, payload } = commands.shift();
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.ok) {
        acceptedRevision = Number(response.headers.get("X-Probe-Revision"));
        requestError = "";
      } else {
        requestError = response.status === 409 ? "Reconnect the probe to change its temperature." :
          "Could not apply this control. Try again.";
      }
    } catch {
      if (controller.signal.aborted) return;
      requestError = "Could not reach the simulator. Check its connection and try again.";
    }
    showError();
  }
  activeWrite = null;
  syncSlider();
}

slider.addEventListener("input", () => {
  showTarget(Number(slider.value));
  send("/api/temperature", { celsius: Number(slider.value) });
});
for (const button of modeButtons) {
  button.addEventListener("click", () => send("/api/mode", { mode: button.dataset.mode }));
}
for (const button of [connection, circuitAction]) {
  button.addEventListener("click", () => {
    if (latest) send("/api/connection", { connected: !latest.connected });
  });
}

function enableControls() {
  connection.disabled = !online || latest?.exitCode !== null;
  circuitAction.disabled = connection.disabled;
  slider.disabled = connection.disabled || !latest?.connected;
  for (const button of modeButtons) button.disabled = slider.disabled;
}

function atLatest() {
  return terminal.scrollTop + terminal.clientHeight >= terminal.scrollHeight - 4;
}

let following = true;
let logWidth = terminal.clientWidth;
function updateJumpButton() {
  jumpLatest.disabled = atLatest();
}
terminal.addEventListener("scroll", () => {
  // A width change can wrap old error messages and shift the scroll position.
  // Keep the user's follow setting until the resize has finished.
  if (terminal.clientWidth === logWidth) following = atLatest();
  updateJumpButton();
}, { passive: true });
jumpLatest.addEventListener("click", () => {
  following = true;
  terminal.scrollTop = terminal.scrollHeight;
  updateJumpButton();
});
new ResizeObserver(() => {
  logWidth = terminal.clientWidth;
  if (following) terminal.scrollTop = terminal.scrollHeight;
  updateJumpButton();
}).observe(terminal);

function token(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

let renderedLines = [];
function displayLines(lines) {
  // Each snapshot contains a rolling window. Retain the rows shared by both
  // windows so reading, selecting and copying older output survives updates.
  const first = renderedLines.findIndex((line, index) =>
    line === lines[0] && renderedLines.slice(index).every((old, offset) => old === lines[offset]));
  const retained = first < 0 ? 0 : renderedLines.length - first;
  if (retained === renderedLines.length && retained === lines.length) return;
  const anchor = !following && first > 0 ? terminal.children[first] : null;
  const anchorTop = anchor?.getBoundingClientRect().top;
  if (retained === 0) {
    terminal.replaceChildren();
  } else {
    for (let index = 0; index < first; index++) {
      terminal.firstChild.remove(); // old record
      terminal.firstChild.remove(); // intervening newline
    }
  }
  const fragment = document.createDocumentFragment();
  for (let index = retained; index < lines.length; index++) {
    const line = lines[index];
    if (index) fragment.append("\n");
    const row = document.createElement("span");
    row.className = "log-row";
    fragment.append(row);
    const timed = /^(\d{2}:\d{2}:\d{2}  )(.*)$/.exec(line);
    if (!timed) {
      row.append(token("log-banner", line));
      continue;
    }
    row.append(token("log-time", timed[1]));
    const reading = /^(.*  )(NORMAL|WARNING)$/.exec(timed[2]);
    if (reading) {
      row.append(token("log-reading", reading[1]), token(reading[2] === "NORMAL" ? "log-normal" : "log-warning", reading[2]));
    } else {
      row.append(token(timed[2].startsWith("SENSOR ERROR") ? "log-message log-error" : "log-message", timed[2]));
    }
  }
  terminal.append(fragment);
  renderedLines = lines;
  if (following) terminal.scrollTop = terminal.scrollHeight;
  else if (anchor) terminal.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
  updateJumpButton();
}

function display(snapshot) {
  latest = snapshot;
  online = true;
  raw.value = snapshot.raw ?? (snapshot.connected ? "Unavailable" : "File absent");
  unit.hidden = snapshot.raw === null;
  file.textContent = snapshot.file.split(/[\\/]/).slice(-2).join("/");
  file.title = snapshot.file;
  fullPath.textContent = snapshot.file;
  if (probeState.dataset.connected !== String(snapshot.connected)) {
    probeState.textContent = snapshot.connected ? "Connected" : "Disconnected";
    probeState.dataset.connected = String(snapshot.connected);
    setProbeConnected(snapshot.connected);
    connection.textContent = snapshot.connected ? "Disconnect probe" : "Reconnect probe";
    circuitAction.textContent = snapshot.connected ? "Unplug from circuit" : "Insert into circuit";
  }
  for (const button of modeButtons) {
    button.setAttribute("aria-pressed", String(snapshot.connected && button.dataset.mode === snapshot.mode));
  }
  enableControls();
  syncSlider();
  showError();
  displayLines(snapshot.lines);
  pid.textContent = `PID ${snapshot.monitorPid}`;
  const monitorState = snapshot.exitCode === null ? "Running" : `Exited (${snapshot.exitCode})`;
  status.dataset.running = String(snapshot.exitCode === null);
  if (status.textContent !== monitorState) status.textContent = monitorState;
}

function serviceUnavailable(message) {
  activeWrite?.abort();
  activeWrite = null;
  commands.length = 0;
  latest = null;
  online = false;
  acceptedRevision = -1;
  requestError = "";
  enableControls();
  showTarget(null);
  showError();
  probeState.textContent = "Unknown";
  delete probeState.dataset.connected;
  raw.value = "Unavailable";
  unit.hidden = true;
  for (const button of modeButtons) button.setAttribute("aria-pressed", "false");
  pid.textContent = "";
  delete status.dataset.running;
  status.textContent = message;
}

async function connect() {
  // Keep the original static-only circuit usable without a monitor backend.
  try {
    const page = await fetch(location.pathname, { method: "HEAD", cache: "no-store" });
    if (!page.ok) throw new Error("Cannot reach the workbench");
    if (page.headers.get("X-PiThermal-Monitor") !== "1") {
      for (const element of liveElements) element.hidden = true;
      document.getElementById("static-notice").hidden = false;
      return;
    }
  } catch {
    for (const element of liveElements) element.hidden = false;
    serviceUnavailable("Service unavailable · retrying…");
    setTimeout(connect, 3000);
    return;
  }
  for (const element of liveElements) element.hidden = false;
  const events = new EventSource("/api/events");
  events.onmessage = event => display(JSON.parse(event.data));
  events.onerror = () => {
    serviceUnavailable("Reconnecting…");
    // A closed stream (for example an HTTP 503) no longer retries itself.
    if (events.readyState === EventSource.CLOSED) setTimeout(connect, 3000);
  };
}

void connect();

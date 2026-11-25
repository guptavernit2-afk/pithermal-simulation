const panel = document.getElementById("live-probe");
const slider = document.getElementById("temperature-slider");
const target = document.getElementById("target-temperature");
const file = document.getElementById("sensor-file");
const raw = document.getElementById("raw-temperature");
const terminal = document.getElementById("monitor-output");
const status = document.getElementById("monitor-status");
const error = document.getElementById("probe-error");
let queued = null;
let writing = false;
let acceptedRevision = -1;
let latest = null;

function showTarget() {
  target.value = `${Number(slider.value).toFixed(2)} °C`;
  slider.setAttribute("aria-valuetext", target.value);
}

function syncSlider() {
  if (writing || !latest || latest.revision < acceptedRevision || !latest.raw) return;
  const celsius = Number(latest.raw) / 1000;
  if (Number.isFinite(celsius)) {
    slider.value = celsius;
    showTarget();
  }
}

// Keep at most one write in flight. While it completes, retain the last
// slider movement so a slower earlier request cannot overwrite the final value.
async function flushChanges() {
  writing = true;
  try {
    while (queued !== null) {
      const celsius = queued;
      queued = null;
      const response = await fetch("/api/temperature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ celsius }),
      });
      if (!response.ok) throw new Error("Temperature update failed");
      acceptedRevision = Number(response.headers.get("X-Probe-Revision"));
      error.hidden = true;
    }
  } catch {
    queued = null;
    error.textContent = "Could not write this temperature. Move the slider to retry.";
    error.hidden = false;
  } finally {
    writing = false;
    syncSlider();
  }
}

slider.addEventListener("input", () => {
  showTarget();
  queued = Number(slider.value);
  if (!writing) void flushChanges();
});

function display(snapshot) {
  latest = snapshot;
  raw.value = snapshot.raw ?? "Unavailable";
  file.textContent = snapshot.file.split(/[\\/]/).slice(-2).join("/");
  file.title = snapshot.file;
  syncSlider();
  const output = snapshot.lines.join("\n");
  if (terminal.textContent !== output) {
    const follow = terminal.scrollTop + terminal.clientHeight >= terminal.scrollHeight - 4;
    terminal.textContent = output;
    if (follow) terminal.scrollTop = terminal.scrollHeight;
  }
  slider.disabled = snapshot.exitCode !== null;
  status.textContent = slider.disabled ? `Exited (${snapshot.exitCode})` : "Running";
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
    slider.disabled = true;
    status.textContent = "Reconnecting…";
  };
}

connect().catch(() => {
  panel.hidden = false;
  status.textContent = "Service unavailable";
});

import { drawCircuit, wireAt } from "./assets/board.js";
import { SIZE, wires } from "./wiring.js";

const byId = id => document.getElementById(id);
const canvas = byId("board");
const wiredDescription = canvas.getAttribute("aria-label");
const ctx = canvas.getContext("2d");
const scene = byId("scene");
const viewport = byId("viewport");
const buttons = new Map();
const zoomLevels = [1, 1.5, 2, 3];
let zoomIndex = 0;
let probeConnected = true;
let selected = wires.find(wire => wire.id === "data");

export function setProbeConnected(connected) {
  if (probeConnected === connected) return;
  probeConnected = connected;
  canvas.setAttribute("aria-label", connected ? wiredDescription :
    "Raspberry Pi 4 and breadboard with the DS18B20 removed. Probe contacts F13 through F15 are empty.");
  redraw();
}

function redraw() {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(bounds.width * ratio);
  const height = Math.round(bounds.height * ratio);
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(width / SIZE.width, 0, 0, height / SIZE.height, 0, 0);
  drawCircuit(ctx, selected, probeConnected);
}

function showEndpoint(markerId, field, terminal) {
  const marker = byId(markerId);
  marker.style.left = `${100 * terminal.point[0] / SIZE.width}%`;
  marker.style.top = `${100 * terminal.point[1] / SIZE.height}%`;
  byId(`${field}-name`).textContent = terminal.name;
  byId(`${field}-detail`).textContent = terminal.detail;
}

function selectWire(wire) {
  selected = wire;
  for (const [id, button] of buttons) {
    button.setAttribute("aria-pressed", String(id === wire.id));
  }
  byId("wire-type").textContent = wire.type;
  byId("wire-name").textContent = wire.name;
  byId("wire-swatch").style.backgroundColor = wire.color;
  byId("wire-purpose").textContent = wire.purpose;
  showEndpoint("end-a", "source", wire.from);
  showEndpoint("end-b", "target", wire.to);
  redraw();
}

for (const wire of wires) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wire-button";
  button.style.setProperty("--wire", wire.color);
  const swatch = document.createElement("span");
  swatch.className = "wire-sample";
  button.append(swatch, wire.name);
  button.addEventListener("click", () => selectWire(wire));
  byId("wire-list").append(button);
  buttons.set(wire.id, button);
}

function wireUnderPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const scale = SIZE.width / bounds.width;
  const x = (event.clientX - bounds.left) * scale;
  const y = (event.clientY - bounds.top) * SIZE.height / bounds.height;
  return wireAt(x, y, (event.pointerType === "touch" ? 28 : 17) * scale, selected);
}

canvas.addEventListener("click", event => {
  const wire = wireUnderPointer(event);
  if (wire) selectWire(wire);
});
canvas.addEventListener("pointermove", event => {
  canvas.style.cursor = wireUnderPointer(event) ? "pointer" : "default";
});

function setZoom(index) {
  zoomIndex = index;
  scene.style.width = `${zoomLevels[index] * 100}%`;
  byId("zoom-out").disabled = index === 0;
  byId("zoom-in").disabled = index === zoomLevels.length - 1;
  if (index === 0) viewport.scrollTo(0, 0);
}
byId("zoom-in").addEventListener("click", () => setZoom(zoomIndex + 1));
byId("zoom-out").addEventListener("click", () => setZoom(zoomIndex - 1));
byId("fit").addEventListener("click", () => setZoom(0));

setZoom(0);
selectWire(selected);
new ResizeObserver(redraw).observe(scene);

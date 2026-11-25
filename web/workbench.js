import { drawCircuit, itemAt } from "./assets/board.js";
import { components, SIZE, wires } from "./wiring.js";

const byId = id => document.getElementById(id);
const canvas = byId("board");
const wiredDescription = canvas.getAttribute("aria-label");
const ctx = canvas.getContext("2d");
const scene = byId("scene");
const viewport = byId("viewport");
const picker = byId("component-picker");
const buttons = new Map();
const zoomLevels = [1, 1.5, 2, 3];
let zoomIndex = 0;
let probeConnected = true;
let selected = wires.find(wire => wire.id === "data");
let hovered = null;
let drag = null;
let dragged = false;

export function setProbeConnected(connected) {
  if (probeConnected === connected) return;
  probeConnected = connected;
  canvas.setAttribute("aria-label", connected ? wiredDescription :
    "Raspberry Pi 4 and breadboard with the DS18B20 removed. Probe contacts F13 through F15 are empty.");
  if (selected.id === "probe") showPurpose();
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
  drawCircuit(ctx, selected, probeConnected, hovered);
}

function showEndpoint(markerId, field, terminal) {
  const marker = byId(markerId);
  marker.style.left = `${100 * terminal.point[0] / SIZE.width}%`;
  marker.style.top = `${100 * terminal.point[1] / SIZE.height}%`;
  byId(`${field}-name`).textContent = terminal.name;
  byId(`${field}-detail`).textContent = terminal.detail;
}

function showPurpose() {
  byId("wire-purpose").textContent = selected.id === "probe" && !probeConnected ?
    selected.emptyPurpose : selected.purpose;
}

function selectItem(item) {
  selected = item;
  const isComponent = Boolean(item.bounds);
  for (const [id, button] of buttons) {
    button.setAttribute("aria-pressed", String(id === item.id));
  }
  picker.value = isComponent ? item.id : "";
  byId("wire-type").textContent = item.type;
  byId("wire-name").textContent = item.name;
  byId("wire-swatch").style.backgroundColor = item.color;
  showPurpose();

  for (const id of ["end-a", "end-b", "wire-terminals"]) byId(id).hidden = isComponent;
  byId("part-tools").hidden = !isComponent;
  byId("probe-socket").hidden = item.id !== "probe";
  if (isComponent) {
    const traces = item.wires.map(id => {
      const wireButton = buttons.get(id);
      const trace = document.createElement("button");
      trace.type = "button";
      trace.textContent = wireButton.textContent;
      trace.setAttribute("aria-label", `Trace ${trace.textContent}`);
      trace.addEventListener("click", () => {
        wireButton.click();
        wireButton.focus({ preventScroll: true });
      });
      return trace;
    });
    byId("part-wires").replaceChildren(...traces);
  } else {
    showEndpoint("end-a", "source", item.from);
    showEndpoint("end-b", "target", item.to);
  }
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
  button.addEventListener("click", () => selectItem(wire));
  byId("wire-list").append(button);
  buttons.set(wire.id, button);
}
for (const part of components) picker.add(new Option(part.name, part.id));
picker.options[0].disabled = true;
picker.addEventListener("change", () => selectItem(components.find(part => part.id === picker.value)));

function itemUnderPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const scale = SIZE.width / bounds.width;
  const x = (event.clientX - bounds.left) * scale;
  const y = (event.clientY - bounds.top) * SIZE.height / bounds.height;
  return itemAt(x, y, (event.pointerType === "touch" ? 28 : 17) * scale, selected, probeConnected);
}

function setHover(item) {
  if (item !== hovered) {
    hovered = item;
    canvas.title = item ? `Inspect ${item.name}` : "";
    redraw();
  }
  canvas.style.cursor = item ? "pointer" : zoomIndex ? "grab" : "default";
}

canvas.addEventListener("click", event => {
  if (dragged) return;
  const item = itemUnderPointer(event);
  if (item) selectItem(item);
});

// Touch pans the scrollable viewport natively. With a mouse, distinguish a
// short click on a component from a drag across the enlarged drawing.
canvas.addEventListener("pointerdown", event => {
  dragged = false;
  if (!zoomIndex || event.button !== 0 || event.pointerType === "touch") return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", event => {
  if (drag && drag.id === event.pointerId) {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) < 5 && !dragged) return;
    dragged = true;
    setHover(null);
    canvas.style.cursor = "grabbing";
    viewport.scrollTo(drag.left - dx, drag.top - dy);
  } else if (event.pointerType !== "touch") {
    setHover(itemUnderPointer(event));
  }
});
canvas.addEventListener("lostpointercapture", () => { drag = null; });
canvas.addEventListener("pointerup", () => { if (dragged) setHover(null); });
canvas.addEventListener("pointerleave", () => { if (!drag) setHover(null); });

function setZoom(index) {
  zoomIndex = index;
  scene.style.width = `${zoomLevels[index] * 100}%`;
  viewport.classList.toggle("is-zoomed", index > 0);
  byId("pan-hint").hidden = index === 0;
  byId("zoom-out").disabled = index === 0;
  byId("zoom-in").disabled = index === zoomLevels.length - 1;
  if (index === 0) viewport.scrollTo(0, 0);
}
byId("zoom-in").addEventListener("click", () => setZoom(zoomIndex + 1));
byId("zoom-out").addEventListener("click", () => setZoom(zoomIndex - 1));
byId("fit").addEventListener("click", () => setZoom(0));

setZoom(0);
selectItem(selected);
new ResizeObserver(redraw).observe(scene);

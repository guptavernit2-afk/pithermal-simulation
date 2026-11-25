// Original canvas artwork. Pin and hole positions come from the same layout
// used by the jumper endpoints, so the drawing stays aligned at every zoom.
import { gpio, hole, rail, SIZE, wires } from "../wiring.js";

const mono = 'Consolas, "Liberation Mono", monospace';
const sans = '"Segoe UI", system-ui, sans-serif';

function box(ctx, x, y, w, h, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function dot(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
}

function label(ctx, value, x, y, size, color, family = mono, weight = 500) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillText(value, x, y);
}

function metal(ctx, x, y, w, h) {
  const finish = ctx.createLinearGradient(x, y, x + w * 0.7, y + h);
  finish.addColorStop(0, "#e6e8df");
  finish.addColorStop(0.38, "#bec7c1");
  finish.addColorStop(0.58, "#d7dcd3");
  finish.addColorStop(1, "#9eaba7");
  box(ctx, x, y, w, h, 2, finish);
}

function drawPi(ctx) {
  const mask = ctx.createLinearGradient(40, 165, 420, 405);
  mask.addColorStop(0, "#438160");
  mask.addColorStop(1, "#265e4d");
  box(ctx, 37, 170, 374, 229, 15, "#102b28");
  box(ctx, 37, 166, 374, 229, 15, "#829e76");
  box(ctx, 39, 168, 370, 225, 13, mask);
  // Faint copper traces, kept on the PCB so jumpers stand out.
  ctx.strokeStyle = "#85b69655";
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(160 + i * 4, 222);
    ctx.lineTo(160 + i * 4, 232 + i);
    ctx.lineTo(184 + i * 4, 256 + i);
    ctx.lineTo(247 + i * 5, 256 + i);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(230, 285 + i * 4);
    ctx.lineTo(259 + i * 3, 285 + i * 4);
    ctx.lineTo(275 + i * 3, 301 + i * 4);
    ctx.lineTo(339, 301 + i * 4);
    ctx.stroke();
  }
  for (const [x, y] of [[53, 183], [322, 183], [53, 378], [322, 378]]) {
    dot(ctx, x, y, 8.2, "#cbba7a");
    dot(ctx, x, y, 5.1, "#263936");
    dot(ctx, x, y - 0.8, 3.6, "#19292d");
  }
  // J8, viewed with the USB sockets on the right. Pin 1 is the square pad.
  box(ctx, 69, 178, 250, 33, 3, "#16362c");
  box(ctx, 72, 180, 242, 29, 2, "#222e2c");
  for (let pin = 1; pin <= 40; pin++) {
    const [x, y] = gpio(pin);
    box(ctx, x - 4, y - 4, 8, 8, 1, "#43504a");
    box(ctx, x - 2.5, y - 3, 5, 6, 0.5, "#d6ac59");
    box(ctx, x - 2.5, y - 3, 4, 2, 0.5, "#f4d88b");
  }
  label(ctx, "1", 76, 220, 9, "#edf2d6");
  label(ctx, "J8  /  GPIO", 227, 219, 9, "#deebcf");
  // Processor, memory, radio shield and the edge connectors.
  box(ctx, 132, 245, 72, 66, 4, "#293d37");
  metal(ctx, 138, 250, 60, 56);
  label(ctx, "BCM2711", 145, 280, 10, "#53615f");
  box(ctx, 224, 240, 47, 40, 2, "#243531");
  label(ctx, "RAM", 236, 263, 9, "#91a099");
  metal(ctx, 60, 244, 43, 37);
  box(ctx, 50, 296, 12, 43, 2, "#263934");
  box(ctx, 51, 298, 3, 39, 1, "#dddfc8");
  for (const [x, y] of [[215, 295], [226, 295], [237, 295], [88, 312], [100, 312], [277, 225], [288, 225]]) {
    box(ctx, x, y, 8, 4, 0.6, "#c4c6a4");
    box(ctx, x + 2, y, 4, 4, 0, "#726e55");
  }
  for (const [y, insert] of [[182, "#354448"], [248, "#2c76a0"], [315, "#3b4643"]]) {
    box(ctx, 345, y - 2, 77, 60, 3, "#324d43");
    metal(ctx, 348, y, 76, 54);
    box(ctx, 416, y + 2, 8, 50, 1, "#8d9c98");
    box(ctx, 420, y + 8, 4, 38, 0, insert);
    box(ctx, 355, y + 5, 12, 2, 1, "#899894");
    box(ctx, 355, y + 46, 12, 2, 1, "#899894");
  }
  metal(ctx, 64, 381, 43, 19);
  metal(ctx, 134, 382, 31, 17);
  metal(ctx, 184, 382, 31, 17);
  box(ctx, 248, 355, 15, 37, 2, "#d8d8bd");
  box(ctx, 250, 356, 3, 35, 1, "#343c37");
  label(ctx, "Raspberry Pi", 86, 342, 19, "#e9f1de", sans, 650);
  label(ctx, "4 MODEL B", 88, 358, 10, "#daebd6");
}

function drawBreadboard(ctx) {
  box(ctx, 492, 144, 467, 264, 9, "#12292a");
  box(ctx, 492, 138, 467, 264, 8, "#b9c4bf");
  box(ctx, 493, 138, 465, 260, 8, "#edece3");
  box(ctx, 499, 201, 452, 2, 1, "#bec5bf");
  box(ctx, 500, 300, 449, 10, 2, "#ccd1c9");
  box(ctx, 500, 300, 449, 2, 1, "#b2bcb5");
  box(ctx, 520, 148, 403, 2.5, 1, "#ce6459");
  box(ctx, 520, 193, 403, 2.5, 1, "#5080a2");
  label(ctx, "+", 504, 166, 17, "#ac493e");
  label(ctx, "−", 504, 188, 17, "#356f95");
  for (let row = 1; row <= 20; row++) {
    const [x] = rail("+", row);
    if (row === 1 || row % 5 === 0 || row === 13 || row === 14) {
      ctx.textAlign = "center";
      label(ctx, String(row), x, 212, 10, "#536164");
      ctx.textAlign = "start";
    }
    for (const [px, py] of [rail("+", row), rail("−", row),
      ...Array.from("ABCDEFGHIJ", letter => hole(letter, row))]) {
      box(ctx, px - 3.3, py - 3.4, 6.6, 6.8, 1, "#c1c6bd");
      box(ctx, px - 2, py - 2, 4, 4, 0.5, "#5e6861");
    }
  }
  for (const letter of "ABCDEFGHIJ") {
    const [, y] = hole(letter, 1);
    label(ctx, letter, 505, y + 3, 10, "#5d6b69");
    label(ctx, letter, 937, y + 3, 10, "#5d6b69");
  }
}

function drawProbe(ctx) {
  // The flat face is visible. From left to right: GND, DQ and VDD.
  for (const [index, row] of [13, 14, 15].entries()) {
    const [x, y] = hole("F", row);
    const topX = 778 + 12 * index;
    const leg = new Path2D();
    leg.moveTo(topX, 266);
    leg.lineTo(topX, 281);
    leg.lineTo(x, 294);
    leg.lineTo(x, y);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#596761";
    ctx.stroke(leg);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#c3c9c2";
    ctx.stroke(leg);
  }
  box(ctx, 755, 225, 70, 49, [17, 17, 4, 4], "#182322");
  box(ctx, 757, 226, 66, 43, [15, 15, 3, 3], "#35413e");
  label(ctx, "DS18B20", 762, 251, 13, "#f0f0e6", mono, 650);
  label(ctx, "1   2   3", 768, 265, 8, "#bdc7c1");
}

const resistorBody = { x: 861, y: 216, width: 18, height: 63 };
function drawResistor(ctx) {
  const { x, y, width, height } = resistorBody;
  box(ctx, x, y, width, height, 6, "#ddba85");
  for (const [offset, color] of [[9, "#e1b82b"], [19, "#88529b"], [29, "#b64736"], [49, "#b8994f"]]) {
    box(ctx, x, y + offset, width, 5, 0, color);
  }
  box(ctx, x + 3, y + 3, 3, height - 6, 1, "#ffffff42");
}

function jumperPath(wire) {
  const points = [wire.from.point, ...wire.bends, wire.to.point];
  const path = new Path2D();
  path.moveTo(...points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    path.arcTo(...points[i], ...points[i + 1], 10);
  }
  path.lineTo(...wire.to.point);
  return path;
}

const paths = new Map(wires.map(wire => [wire.id, jumperPath(wire)]));

function drawJumper(ctx, wire, selected) {
  const path = paths.get(wire.id);
  ctx.lineWidth = selected ? 9 : 7;
  ctx.strokeStyle = selected ? "#f9fcf3" : "#182a2cd9";
  ctx.stroke(path);
  ctx.lineWidth = selected ? 5 : 4;
  ctx.strokeStyle = wire.color;
  ctx.stroke(path);
  for (const [x, y] of [wire.from.point, wire.to.point]) {
    dot(ctx, x, y, 4.6, "#223637");
    dot(ctx, x, y, 2.7, wire.color);
  }
  if (wire.id === "pull-up") drawResistor(ctx);
}

export function drawCircuit(ctx, selected) {
  ctx.clearRect(0, 0, SIZE.width, SIZE.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawPi(ctx);
  drawBreadboard(ctx);
  if (selected.probePin) {
    // Reveal continuity underneath this numbered F–J strip.
    const [x, y] = selected.probePin;
    box(ctx, x - 6, y - 5, 12, selected.to.point[1] - y + 10, 5, "#78998c66");
  }
  drawProbe(ctx);
  for (const wire of wires) {
    if (wire !== selected) drawJumper(ctx, wire, false);
  }
  drawJumper(ctx, selected, true);
  label(ctx, "3.3 V", 165, 60, 14, "#ffc1a8");
  label(ctx, "GND", 245, 87, 14, "#bad8ff");
  label(ctx, "GPIO4", 327, 113, 14, "#f9da84");
  label(ctx, "DS18B20   +   4.7 kΩ", 708, 121, 15, "#e0e9e2");
  label(ctx, "Raspberry Pi 4 Model B", 39, 438, 21, "#eff5ef", sans, 600);
  label(ctx, "40-pin GPIO header", 40, 461, 15, "#b2c7c2");
  label(ctx, "Solderless breadboard", 494, 438, 21, "#eff5ef", sans, 600);
  label(ctx, "DS18B20 pins at F13–F15", 495, 461, 15, "#b2c7c2");
}

const pick = document.createElement("canvas").getContext("2d");
export function wireAt(x, y, tolerance, selected) {
  const r = resistorBody;
  if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
    return wires.find(wire => wire.id === "pull-up");
  }
  // Use the visible stroke first; expand the target only when the click missed.
  // This keeps neighboring pins and crossing wires individually selectable.
  const frontToBack = [selected, ...wires.filter(wire => wire !== selected).reverse()];
  pick.lineCap = "round";
  for (const width of [7, tolerance]) {
    pick.lineWidth = width;
    const hit = frontToBack.find(wire => pick.isPointInStroke(paths.get(wire.id), x, y));
    if (hit) return hit;
  }
  return null;
}

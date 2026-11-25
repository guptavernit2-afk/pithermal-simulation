const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright-core");

// Start the README's local server first. Browser tooling is test-only.
const address = new URL("/", process.env.PITHERMAL_TEST_URL || "http://127.0.0.1:8765/").href;
const channel = process.env.PITHERMAL_BROWSER_CHANNEL ||
  (process.platform === "win32" ? "msedge" : "chrome");
const view = { width: 1366, height: 900 };
let browser;
let page;
const problems = [];

before(async () => {
  browser = await chromium.launch({ channel });
  page = await browser.newPage({ viewport: view, hasTouch: true, serviceWorkers: "block" });
  page.on("pageerror", error => problems.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(address)) return route.continue();
    problems.push(`External request: ${url}`);
    return route.abort();
  });
  await page.goto(address);
  await page.getByRole("button", { name: "1-Wire data", exact: true }).waitFor();
});
after(async () => { if (browser) await browser.close(); });

// Independent points along the pictured conductors and the physical terminals
// on the 1000 × 490 drawing. No application model or click handlers are imported.
const expected = [
  { name: "Power feed", click: [290, 66], a: [80, 202], b: [550, 160],
    from: "Pi 3.3 V", to: "Positive rail", role: /positive rail with 3\.3 V from the Pi/ },
  { name: "Ground feed", click: [305, 92], a: [104, 187], b: [590, 181],
    from: "Pi ground", to: "Ground rail", role: /shared zero-volt reference/ },
  { name: "1-Wire data", click: [457, 270], a: [116, 202], b: [790, 386],
    from: "BCM GPIO4", to: "DS18B20 DQ row", role: /commands from the Pi.*temperature response/ },
  { name: "Probe supply", click: [910, 260], a: [910, 160], b: [810, 352],
    from: "Positive rail", to: "DS18B20 VDD row", role: /3\.3 V.*VDD pin/ },
  { name: "Probe ground", click: [670, 270], a: [670, 181], b: [770, 352],
    from: "Ground rail", to: "DS18B20 GND row", role: /GND pin.*power return/ },
  { name: "Pull-up resistor", click: [870, 245], a: [870, 160], b: [790, 335],
    from: "Positive rail", to: "DS18B20 DQ row", role: /data line near 3\.3 V.*idle/ },
];

function screenPoint(canvas, [x, y]) {
  return { x: canvas.x + x * canvas.width / 1000, y: canvas.y + y * canvas.height / 490 };
}

async function clickWire(point) {
  await page.locator("#viewport").scrollIntoViewIfNeeded();
  const canvas = await page.locator("#board").boundingBox();
  const pixel = screenPoint(canvas, point);
  await page.mouse.click(pixel.x, pixel.y);
}

async function checkSelection(wire) {
  const activeNames = await page.locator('#wire-list [aria-pressed="true"]').allTextContents();
  assert.deepEqual(activeNames, [wire.name]);
  assert.equal(await page.locator("#wire-name").innerText(), wire.name);
  assert.equal(await page.locator("#source-name").innerText(), wire.from);
  assert.equal(await page.locator("#target-name").innerText(), wire.to);
  assert.match(await page.locator("#wire-purpose").innerText(), wire.role);

  const canvas = await page.locator("#board").boundingBox();
  const markers = page.locator(".end-marker:visible");
  assert.equal(await markers.count(), 2);
  for (const [letter, point] of [["A", wire.a], ["B", wire.b]]) {
    const ring = markers.filter({ hasText: letter });
    const box = await ring.boundingBox();
    const target = screenPoint(canvas, point);
    assert.ok(box && box.width >= 10 && box.height >= 10, `Visible endpoint ${letter}`);
    assert.ok(Math.abs(box.x + box.width / 2 - target.x) < 1.5, `Endpoint ${letter} x`);
    assert.ok(Math.abs(box.y + box.height / 2 - target.y) < 1.5, `Endpoint ${letter} y`);
  }
}

for (const wire of expected) {
  test(`clicking ${wire.name} marks both terminals and explains its purpose`, async () => {
    await clickWire(wire.click);
    await checkSelection(wire);
  });
}

test("the resistor lead, keyboard selector and empty canvas behave consistently", async () => {
  const power = page.getByRole("button", { name: "Power feed", exact: true });
  await power.focus();
  await page.keyboard.press("Enter");
  await checkSelection(expected[0]);
  await clickWire([835, 335]);
  await checkSelection(expected[5]);
  await clickWire([460, 445]);
  await checkSelection(expected[5]);
});

test("zoomed wire picking and both markers stay aligned on a narrow screen", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Zoom in" }).click();
  const viewport = page.locator("#viewport");
  await viewport.evaluate(element => element.scrollTo(element.scrollWidth, element.scrollHeight));
  await clickWire(expected[3].click);
  await checkSelection(expected[3]);
  await page.getByRole("button", { name: "Fit entire circuit" }).click();
  assert.equal(await viewport.evaluate(element => element.scrollLeft), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await checkSelection(expected[3]);
});

test("parts and probe pins are selectable on the drawing and by keyboard", async () => {
  await page.setViewportSize(view);
  const picker = page.getByRole("combobox", { name: "Inspect a component" });
  for (const [point, id, name] of [[[160, 274], "pi", "Raspberry Pi 4B"],
                                   [[605, 250], "breadboard", "Breadboard"],
                                   [[785, 237], "probe", "DS18B20 probe"]]) {
    await clickWire(point);
    assert.equal(await picker.inputValue(), id);
    assert.equal(await page.locator("#wire-name").innerText(), name);
    assert.equal(await page.locator(".end-marker:visible").count(), 0);
  }
  await picker.focus();
  await picker.press("End");
  assert.equal(await page.locator("#wire-name").innerText(), "Breadboard");
  const trace = page.getByRole("button", { name: "Trace Pull-up resistor" });
  await trace.focus();
  await trace.press("Enter");
  await checkSelection(expected[5]);
  assert.equal(await picker.inputValue(), "");
  await clickWire([770, 318]); // Ground leg at F13.
  await checkSelection(expected[4]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#viewport").scrollIntoViewIfNeeded();
  const finger = screenPoint(await page.locator("#board").boundingBox(), [790, 318]);
  await page.touchscreen.tap(finger.x, finger.y); // DQ at F14 is close to the pull-up lead.
  await checkSelection(expected[2]);
});

test("dragging a zoomed circuit pans without changing the inspected item", async () => {
  await page.setViewportSize(view);
  await page.getByRole("button", { name: "1-Wire data", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  const viewport = page.locator("#viewport");
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  const x = box.x + box.width * .65;
  const y = box.y + box.height * .65;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 95, y - 65, { steps: 8 });
  await page.mouse.up();
  assert.ok(await viewport.evaluate(element => element.scrollLeft >= 90 && element.scrollTop >= 60));
  assert.equal(await page.locator("#wire-name").innerText(), "1-Wire data");
  await page.getByRole("button", { name: "Fit entire circuit" }).click();
  assert.deepEqual(await viewport.evaluate(element => [element.scrollLeft, element.scrollTop]), [0, 0]);
});

test("all circuit assets load locally without browser errors", () => {
  assert.deepEqual(problems, []);
});

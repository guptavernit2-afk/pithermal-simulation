const assert = require("node:assert/strict");
const { readFile, stat } = require("node:fs/promises");
const { dirname } = require("node:path");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright-core");

const address = "http://127.0.0.1:8765/";
const channel = process.env.PITHERMAL_BROWSER_CHANNEL ||
  (process.platform === "win32" ? "msedge" : "chrome");
let browser;
let page;
let slider;
let sensorFile;

async function moveSlider(celsius) {
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  const fraction = (celsius + 55) / 180;
  // Click the native range track, then use its quarter-degree keyboard steps
  // to reach the exact test value on screens with different pixel densities.
  await slider.click({ position: { x: 8 + fraction * (box.width - 16), y: box.height / 2 } });
  const steps = Math.round((celsius - Number(await slider.inputValue())) / 0.25);
  for (let i = 0; i < Math.abs(steps); i++) {
    await slider.press(steps < 0 ? "ArrowLeft" : "ArrowRight");
  }
  assert.equal(Number(await slider.inputValue()), celsius);
}

async function waitForLine(text) {
  const matched = await page.waitForFunction(expected => {
    const line = document.querySelector("#monitor-output").textContent.split("\n").at(-1);
    return /^\d{2}:\d{2}:\d{2}  /.test(line) && line.includes(expected) && line;
  }, text, { timeout: 12000 });
  return matched.jsonValue();
}

function waitForSample(celsius, status) {
  return waitForLine(`  ${celsius.toFixed(3)} °C  ${status}`);
}

async function selectMode(label) {
  const button = page.getByRole("button", { name: label, exact: true });
  await button.click();
  await page.getByRole("button", { name: label, pressed: true, exact: true }).waitFor();
}

function probeBodyPixel() {
  // Inside the probe's dark case when fitted, on the bare board when removed.
  return page.locator("#board").evaluate(canvas => {
    const x = Math.floor(canvas.width * 785 / 1000);
    const y = Math.floor(canvas.height * 237 / 490);
    return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data);
  });
}

before(async () => {
  browser = await chromium.launch({ channel });
  page = await browser.newPage({ serviceWorkers: "block" });
  await page.route("**/*", route =>
    route.request().url().startsWith(address) ? route.continue() : route.abort());
  await page.goto(address);
  slider = page.getByRole("slider", { name: "Temperature" });
  await page.waitForFunction(() => !document.querySelector("#probe-connection").disabled);
  const reconnect = page.getByRole("button", { name: "Reconnect probe" });
  if (await reconnect.isVisible()) await reconnect.click();
  await page.waitForFunction(() => !document.querySelector("#temperature-slider").disabled);
  await selectMode("Hold");
  sensorFile = await page.locator("#sensor-file").getAttribute("title");
  assert.match(sensorFile, /[\\/]28-[0-9a-f]{12}[\\/]temperature$/);
  // Start from a distinct sampled baseline even when rerunning on a warm server.
  await moveSlider(25);
  await waitForSample(25, "NORMAL");
});
after(async () => { if (browser) await browser.close(); });

for (const [value, raw, status] of [[27.5, "27500", "NORMAL"], [30, "30000", "NORMAL"],
                                    [31.25, "31250", "WARNING"]]) {
  test(`slider at ${value} °C writes ${raw} and Python prints ${status}`, async t => {
    await moveSlider(value);
    await page.waitForFunction(expected =>
      document.querySelector("#raw-temperature").value === expected, raw, { timeout: 5000 });
    assert.equal((await readFile(sensorFile, "ascii")).trim(), raw);
    const line = await waitForSample(value, status);
    assert.equal(await page.locator("#monitor-status").innerText(), "Running");
    t.diagnostic(`file ${raw} | stdout ${line}`);
  });
}

test("refresh restores the current file and resumes the terminal stream", async () => {
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#raw-temperature").value === "31250");
  assert.equal(await page.locator("#sensor-file").getAttribute("title"), sensorFile);
  assert.equal(Number(await slider.inputValue()), 31.25);
  const replayed = await waitForSample(31.25, "WARNING");
  await page.waitForFunction(previous => {
    const latest = document.querySelector("#monitor-output").textContent.split("\n").at(-1);
    return latest !== previous && latest.endsWith("31.250 °C  WARNING");
  }, replayed, { timeout: 10000 });
});

test("warming raises a Python warning and cooling clears it", async t => {
  await moveSlider(29.5);
  const baseline = await waitForSample(29.5, "NORMAL");
  await selectMode("Warm probe");
  const warning = await waitForLine(" °C  WARNING");
  const hot = Number(warning.slice(10).split(" ")[0]);
  assert.ok(hot > 30, warning);

  await selectMode("Cool probe");
  const normal = await waitForLine(" °C  NORMAL");
  const cool = Number(normal.slice(10).split(" ")[0]);
  assert.ok(cool <= 30, normal);
  assert.notEqual(normal, baseline);
  await selectMode("Hold");
  const held = Number((await readFile(sensorFile, "ascii")).trim()) / 1000;
  await waitForSample(held, "NORMAL");
  t.diagnostic(`stdout ${baseline} → ${warning} → ${normal}`);
});

test("disconnect removes the probe and the same Python process recovers after reconnect", async t => {
  await moveSlider(27.5);
  const before = await waitForSample(27.5, "NORMAL");
  const fitted = await probeBodyPixel();
  const monitorPid = page.locator("#monitor-pid");
  const pid = await monitorPid.innerText();
  assert.match(pid, /^PID [1-9]\d*$/);
  await page.getByRole("button", { name: "Disconnect probe" }).click();
  await page.waitForFunction(() => document.querySelector("#raw-temperature").value === "File absent");
  await assert.rejects(stat(dirname(sensorFile)), { code: "ENOENT" });
  assert.notDeepEqual(await probeBodyPixel(), fitted);
  assert.equal(await slider.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Warm probe" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Cool probe" }).isDisabled(), true);
  // An update already in flight from another tab must not recreate the probe.
  const lateWrite = await page.request.post(new URL("/api/temperature", address).href,
    { data: { celsius: 33 } });
  assert.equal(lateWrite.status(), 409);
  const failure = await waitForLine("SENSOR ERROR  No DS18B20 found");
  assert.equal(await page.locator("#monitor-status").innerText(), "Running");

  await page.reload();
  const reconnect = page.getByRole("button", { name: "Reconnect probe" });
  await reconnect.waitFor();
  assert.equal(await page.locator("#probe-state").innerText(), "Disconnected");
  assert.equal(await monitorPid.innerText(), pid);
  await reconnect.click();
  await page.waitForFunction(() => document.querySelector("#raw-temperature").value === "27500");
  assert.equal(await page.locator("#sensor-file").getAttribute("title"), sensorFile);
  assert.equal((await readFile(sensorFile, "ascii")).trim(), "27500");
  assert.deepEqual(await probeBodyPixel(), fitted);
  const recovered = await waitForSample(27.5, "NORMAL");
  assert.notEqual(recovered, before);
  await moveSlider(28.25);
  const next = await waitForSample(28.25, "NORMAL");
  assert.equal(await monitorPid.innerText(), pid);
  assert.equal(await page.locator("#monitor-status").innerText(), "Running");
  t.diagnostic(`${pid} throughout | stdout ${before} → ${failure} → ${recovered} → ${next}`);
});

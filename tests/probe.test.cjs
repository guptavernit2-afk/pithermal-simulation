const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
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

async function waitForSample(celsius, status) {
  const message = `${celsius.toFixed(3)} °C  ${status}`;
  await page.waitForFunction(expected => {
    const line = document.querySelector("#monitor-output").textContent.split("\n").at(-1);
    return /^\d{2}:\d{2}:\d{2}  /.test(line) && line.slice(10) === expected;
  }, message, { timeout: 10000 });
  return (await page.locator("#monitor-output").innerText()).split("\n").at(-1);
}

before(async () => {
  browser = await chromium.launch({ channel });
  page = await browser.newPage({ serviceWorkers: "block" });
  await page.route("**/*", route =>
    route.request().url().startsWith(address) ? route.continue() : route.abort());
  await page.goto(address);
  slider = page.getByRole("slider", { name: "Temperature" });
  await page.waitForFunction(() => !document.querySelector("#temperature-slider").disabled);
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

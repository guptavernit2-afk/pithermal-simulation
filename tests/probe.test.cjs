const assert = require("node:assert/strict");
const { readFile, stat } = require("node:fs/promises");
const { dirname } = require("node:path");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright-core");

const address = new URL("/", process.env.PITHERMAL_TEST_URL || "http://127.0.0.1:8765/").href;
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
    const latestStatus = page.locator(`#monitor-output .log-row:last-child .log-${status.toLowerCase()}`);
    assert.equal(await latestStatus.textContent(), status);
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
  await page.getByRole("button", { name: "1-Wire data", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect probe" }).click();
  await page.waitForFunction(() => document.querySelector("#raw-temperature").value === "File absent");
  assert.match(await page.locator("#target-detail").textContent(), /empty socket/i);
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
  await page.getByRole("button", { name: "1-Wire data", exact: true }).click();
  await reconnect.click();
  await page.waitForFunction(() => document.querySelector("#raw-temperature").value === "27500");
  assert.match(await page.locator("#target-detail").textContent(), /probe DQ/i);
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

test("the probe and empty socket on the drawing operate the live Python sensor", async () => {
  await moveSlider(26.5);
  const before = await waitForSample(26.5, "NORMAL");
  const pid = await page.locator("#monitor-pid").innerText();
  const board = page.locator("#board");
  async function pickProbe() {
    await page.locator("#viewport").scrollIntoViewIfNeeded();
    const box = await board.boundingBox();
    await board.click({ position: { x: box.width * .785, y: box.height * 237 / 490 } });
    assert.equal(await page.locator("#component-picker").inputValue(), "probe");
  }
  await pickProbe();
  await page.getByRole("button", { name: "Unplug from circuit" }).click();
  await waitForLine("SENSOR ERROR  No DS18B20 found");
  await assert.rejects(stat(dirname(sensorFile)), { code: "ENOENT" });
  assert.equal(await slider.isDisabled(), true);
  assert.match(await page.locator("#wire-purpose").innerText(), /unplugged/);
  await page.getByRole("button", { name: "Power feed", exact: true }).click();
  await pickProbe(); // Re-select the empty socket, then reinsert the probe.
  await page.getByRole("button", { name: "Insert into circuit" }).click();
  assert.notEqual(await waitForSample(26.5, "NORMAL"), before);
  assert.equal((await readFile(sensorFile, "ascii")).trim(), "26500");
  assert.equal(await page.locator("#monitor-pid").innerText(), pid);
});

test("the full-width Python log works on desktop and mobile and can resume following", async () => {
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    const log = await page.locator("#python-log").boundingBox();
    const circuit = await page.locator("#circuit").boundingBox();
    const controls = await page.locator("#live-probe").boundingBox();
    assert.ok(controls.y + controls.height <= circuit.y && circuit.y + circuit.height <= log.y);
    assert.equal(Math.round(log.width), Math.round(circuit.width));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.getByRole("link", { name: "Python log" }).click();
  const log = page.locator("#monitor-output");
  const jump = page.getByRole("button", { name: "Jump to latest Python output" });
  await log.evaluate(el => { el.scrollTop = 0; });
  await page.waitForFunction(() => !document.querySelector("#jump-latest").disabled);
  const selectedRecord = await log.locator(".log-row").nth(2).evaluate(row => {
    window.getSelection().selectAllChildren(row);
    return window.getSelection().toString();
  });
  assert.ok(selectedRecord);
  const last = await log.locator(".log-row").last().textContent();
  await page.waitForFunction(previous => document.querySelector("#monitor-output .log-row:last-child").textContent !== previous,
    last, { timeout: 8000 });
  assert.ok(await log.evaluate(el => el.scrollTop < 2));
  assert.equal(await page.evaluate(() => window.getSelection().toString()), selectedRecord);
  await jump.click();
  await page.waitForFunction(() => document.querySelector("#jump-latest").disabled);
  for (const width of [1366, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await page.waitForFunction(() => {
      const output = document.querySelector("#monitor-output");
      return output.scrollTop + output.clientHeight >= output.scrollHeight - 4;
    }, null, { timeout: 4000 });
  }
});

for (const [stage, message] of [["backend detection", "Service unavailable · retrying…"], ["event stream", "Reconnecting…"]]) {
  test(`a 503 during ${stage} recovers without refreshing`, async () => {
    const viewer = await browser.newPage({ serviceWorkers: "block" });
    let failOnce = true;
    await viewer.route("**/*", route => {
      const request = route.request();
      if (!request.url().startsWith(address)) return route.abort();
      const target = stage === "backend detection" ? request.method() === "HEAD" : request.url().endsWith("/api/events");
      if (failOnce && target) {
        failOnce = false;
        return route.fulfill({ status: 503, body: "" });
      }
      return route.continue();
    });
    try {
      await viewer.goto(address);
      await viewer.getByText(message, { exact: true }).waitFor();
      assert.equal(await viewer.locator("#static-notice").isHidden(), true);
      assert.equal(await viewer.locator("#temperature-slider").isDisabled(), true);
      await viewer.waitForFunction(() => !document.querySelector("#temperature-slider").disabled, null, { timeout: 8000 });
      assert.equal(await viewer.locator("#monitor-status").textContent(), "Running");
    } finally {
      await viewer.close();
    }
  });
}

test("the readout keeps millidegree precision between slider steps", async () => {
  for (const celsius of [30.001, -5.125]) {
    const response = await page.request.post(new URL("/api/temperature", address).href, { data: { celsius } });
    assert.equal(response.ok(), true);
    await page.waitForFunction(expected => document.querySelector("#raw-temperature").value === expected,
      String(Math.round(celsius * 1000)));
    const label = `${celsius} °C`;
    assert.equal(await page.locator("#target-temperature").textContent(), label);
    assert.equal(await slider.getAttribute("aria-valuetext"), label);
    await waitForSample(celsius, celsius > 30 ? "WARNING" : "NORMAL");
  }
});

test("the full readout and file path fit a narrow screen with enlarged text", async () => {
  const response = await page.request.post(new URL("/api/temperature", address).href, { data: { celsius: 124.875 } });
  assert.equal(response.ok(), true);
  await page.waitForFunction(() => document.querySelector("#target-temperature").value === "124.875 °C");
  const summary = page.locator(".file-location summary");
  await summary.focus();
  await summary.press("Enter");
  assert.equal(await page.locator("#sensor-full-path").innerText(), sensorFile);
  try {
    for (const width of [320, 561, 981, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      for (const scale of ["100%", "200%"]) {
        const fits = await page.evaluate(fontSize => {
          document.documentElement.style.fontSize = fontSize;
          const target = document.querySelector("#target-temperature");
          const range = document.createRange();
          range.selectNodeContents(target);
          const text = range.getBoundingClientRect();
          const box = target.getBoundingClientRect();
          const path = document.querySelector("#sensor-full-path").getBoundingClientRect();
          return text.left >= box.left - 1 && text.right <= box.right + 1 &&
            path.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
        }, scale);
        assert.ok(fits, `Contents fit at ${width}px and ${scale} text`);
      }
    }
  } finally {
    await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
    await summary.press("Enter");
  }
});

test("an interrupted stream clears live readings and restores them on reconnect", async () => {
  const snapshot = await page.evaluate(() => new Promise(resolve => {
    const events = new EventSource("/api/events");
    events.onmessage = event => { events.close(); resolve(event.data); };
  }));
  const viewer = await browser.newPage({ serviceWorkers: "block" });
  await viewer.route("**/*", route =>
    route.request().url().startsWith(address) ? route.continue() : route.abort());
  let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  let first = true;
  await viewer.route("**/api/events", async route => {
    if (first) {
      first = false;
      // A valid SSE response ending after one snapshot exercises native reconnect.
      await route.fulfill({ contentType: "text/event-stream", body: `retry: 100\ndata: ${snapshot}\n\n` });
    } else {
      await gate;
      await route.continue().catch(() => {});
    }
  });
  try {
    await viewer.goto(address);
    await viewer.waitForFunction(() => document.querySelector("#monitor-status").textContent === "Reconnecting…");
    assert.equal(await viewer.locator("#temperature-slider").isDisabled(), true);
    assert.equal(await viewer.locator("#target-temperature").textContent(), "—");
    assert.equal(await viewer.locator("#raw-temperature").textContent(), "Unavailable");
    assert.equal(await viewer.locator("#raw-unit").isHidden(), true);
    assert.equal(await viewer.locator("#monitor-output").textContent(), JSON.parse(snapshot).lines.join("\n"));
    resume();
    await viewer.waitForFunction(() => !document.querySelector("#temperature-slider").disabled);
    assert.equal(await viewer.locator("#monitor-status").textContent(), "Running");
    assert.equal(await viewer.locator("#raw-temperature").textContent(), JSON.parse(snapshot).raw);
  } finally {
    resume();
    await viewer.close();
  }
});

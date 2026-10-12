import { test, expect } from "@playwright/test";
import { emptyConfig } from "../../src/engine/audio";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ request }) => {
  const { revision } = await (await request.get("/api/config")).json();
  expect(
    (
      await request.put("/api/config", {
        data: { config: emptyConfig(), revision },
      })
    ).ok(),
  ).toBe(true);
});

test("maps grouped channels through real PCM analysis and synchronizes a display", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/control");
  await expect(
    page.getByText("SERVICE CONNECTED", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".audio-mapping")
    .filter({ hasText: "guitar" })
    .locator("summary")
    .click();
  await page
    .getByRole("group", { name: "guitar input assignments" })
    .getByLabel("USB 11 · Input 1", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "guitar input assignments" })
    .getByLabel("USB 12 · Input 2", { exact: true })
    .check();
  await page.getByRole("button", { name: "Apply input settings" }).click();
  await expect(
    page.getByText("Input settings saved.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.locator(".status-strip")).toContainText(
    "Live · synthetic soundcheck",
  );
  await expect
    .poll(async () =>
      Number(
        await page.getByLabel("guitar live input level").getAttribute("value"),
      ),
    )
    .toBeGreaterThan(0.05);
  const display = await context.newPage();
  await display.setViewportSize({ width: 1920, height: 1080 });
  await display.goto("/experience?performance=1");
  await expect(display.locator(".stage-status")).toContainText(
    "LIVE · SYNTHETIC SOUNDCHECK",
  );
  await expect(display.getByText("SAMPLE CAPTION")).toHaveCount(0);
  await expect(display.locator("canvas")).toBeVisible();
  await page
    .getByLabel("Caption text")
    .fill("Selamat datang — Glitz Inclusive");
  await page.getByRole("button", { name: "Send caption" }).click();
  await expect(display.locator(".captions")).toContainText("Selamat datang");
  await display.screenshot({
    path: ".impeccable/review/audio-display-1920.png",
  });
  expect(
    await display.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.bringToFront();
  await page.getByRole("button", { name: "Standby", exact: true }).click();
  await expect(display.locator(".stage-status")).toContainText("STANDBY");
  await expect(page.getByLabel("guitar live input level")).toHaveAttribute(
    "value",
    "0",
  );
  await page.reload();
  await expect(
    page
      .locator(".audio-mapping")
      .filter({ hasText: "guitar" })
      .locator("summary"),
  ).toContainText("USB 11, USB 12");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: ".impeccable/review/audio-control-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page
    .locator(".audio-mapping")
    .filter({ hasText: "guitar" })
    .locator("summary")
    .click();
  await page.screenshot({
    path: ".impeccable/review/audio-control-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("stale frames enter standby and automatic reconnection restores live input", async ({
  page,
  request,
}) => {
  const settings = await (await request.get("/api/config")).json();
  settings.config.instruments.drums.channels = [13];
  await request.put("/api/config", { data: settings });
  let stalled = false;
  let reconnects = 0;
  await page.routeWebSocket("**/ws", (client) => {
    reconnects++;
    const server = client.connectToServer();
    client.onMessage((message) => {
      if (!stalled) server.send(message);
    });
    server.onMessage((message) => {
      if (!stalled) client.send(message);
    });
  });
  await page.goto("/control");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.locator(".status-strip")).toContainText(
    "Live · synthetic soundcheck",
  );
  stalled = true;
  await expect(page.locator(".status-strip")).toContainText(
    "Standby · waiting for live audio",
  );
  await expect.poll(() => reconnects, { timeout: 10000 }).toBeGreaterThan(1);
  stalled = false;
  await expect(page.locator(".status-strip")).toContainText(
    "Live · synthetic soundcheck",
  );
});

test("Demo works with no service and has no public runtime dependencies", async ({
  page,
}) => {
  await page.routeWebSocket("**/ws", (route) => route.close());
  await page.route("**/api/**", (route) => route.abort());
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1")
      external.push(request.url());
  });
  await page.goto("/control");
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await expect(page.locator(".status-strip")).toContainText("Demo playing");
  await expect
    .poll(async () =>
      Number(
        await page
          .getByLabel("guitar synthetic input level")
          .getAttribute("value"),
      ),
    )
    .toBeGreaterThan(0);
  expect(external).toEqual([]);
});

test("measures the complete five-instrument projection under synthetic multichannel load", async ({
  page,
  request,
  context,
}, testInfo) => {
  const settings = await (await request.get("/api/config")).json();
  for (const [index, instrument] of [
    "vocals",
    "guitar",
    "drums",
    "bass",
    "piano",
  ].entries())
    settings.config.instruments[instrument].channels =
      instrument === "drums" ? [13, 18, 23] : [11 + index];
  await request.put("/api/config", { data: settings });
  await page.goto("/control");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  const operator = page;
  page = await context.newPage();
  await page.goto("/experience?performance=1");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator(".stage-status")).toContainText(
    "LIVE · SYNTHETIC SOUNDCHECK",
  );
  const metrics = await page.evaluate(async () => {
    const intervals: number[] = [];
    const ages: number[] = [];
    const ws = new WebSocket(`ws://${location.host}/ws`);
    let drops = 0,
      overflows = 0;
    ws.onmessage = (event) => {
      const p = JSON.parse(event.data);
      if (p.type === "features") {
        ages.push(p.health.processingMs);
        drops = p.health.dropped;
        overflows = p.health.overflows;
      }
    };
    await new Promise<void>((resolve) => {
      let previous = 0,
        start = 0;
      function frame(now: number) {
        if (!start) start = now;
        if (previous) intervals.push(now - previous);
        previous = now;
        if (now - start < 6000) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    ws.close();
    intervals.sort((a, b) => a - b);
    ages.sort((a, b) => a - b);
    return {
      frames: intervals.length,
      fps: 1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length),
      frameP95Ms: intervals[Math.floor(intervals.length * 0.95)],
      processingAgeP95Ms: ages[Math.floor(ages.length * 0.95)],
      featurePackets: ages.length,
      drops,
      overflows,
      quality: document
        .querySelector(".score-renderer")
        ?.getAttribute("data-quality"),
      renderer: document
        .querySelector(".score-renderer")
        ?.getAttribute("data-renderer"),
    };
  });
  await testInfo.attach("synthetic-performance", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  console.log("Synthetic projection metrics:", JSON.stringify(metrics));
  expect(metrics.featurePackets).toBeGreaterThan(80);
  expect(metrics.processingAgeP95Ms).toBeLessThan(100);
  await page.screenshot({ path: ".impeccable/review/audio-ensemble-1920.png" });
  const quiet = await (await request.get("/api/config")).json();
  for (const instrument of Object.values(quiet.config.instruments) as {
    sensitivity: number;
  }[])
    instrument.sensitivity = 0.1;
  await request.put("/api/config", { data: quiet });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ".impeccable/review/audio-quiet-1920.png" });
  await operator.getByLabel("Reduced motion").check();
  await expect(page.locator(".stage-status")).toContainText(
    "LIVE · SYNTHETIC SOUNDCHECK",
  );
  await page.screenshot({ path: ".impeccable/review/audio-reduced-1920.png" });
});

test("operator start/stop and safe settings restore", async ({ page }) => {
  await page.goto("/control");
  await expect(
    page.getByText("SERVICE CONNECTED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start Live", exact: true }).click();
  await expect(page.locator(".status-strip")).toContainText(
    "Live · synthetic soundcheck",
  );
  await page
    .getByRole("button", { name: "Stop visualization", exact: true })
    .click();
  await expect(page.locator(".status-strip")).toContainText("Standby");
  await page
    .getByText("Settings backup and troubleshooting", { exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const file = await download;
  const path = await file.path();
  if (!path) throw new Error("No settings download");
  await page.getByLabel("Restore settings").setInputFiles(path);
  await expect(
    page.getByText("Backup downloaded.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Capture device")).toHaveValue("");
  await page
    .getByRole("button", { name: "Apply input settings", exact: true })
    .click();
  await expect(
    page.getByText("Input settings saved.", { exact: false }),
  ).toBeVisible();
  expect((await page.request.get("/guide/Panduan-Operator.html")).ok()).toBe(
    true,
  );
});

test("display opened directly can enter and exit browser fullscreen", async ({
  page,
}) => {
  await page.goto("/experience?performance=1");
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page
    .getByRole("button", { name: "Exit performance view", exact: true })
    .focus();
  await page
    .getByRole("button", { name: "Exit performance view", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
});

test("hiding captions removes the band, fills the stage and preserves cues across modes", async ({
  page,
  context,
}) => {
  await page.goto("/control");
  const display = await context.newPage();
  await display.setViewportSize({ width: 1920, height: 1080 });
  await display.goto("/experience?performance=1");
  await page
    .getByLabel("Caption text")
    .fill("Caption retained — selamat datang");
  await page.getByRole("button", { name: "Send caption", exact: true }).click();
  await expect(display.locator(".captions")).toContainText("Caption retained");
  const height = await page
    .locator(".operator-preview")
    .evaluate((el) => el.getBoundingClientRect().height);
  for (const mode of ["Demo", "Live", "Standby"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.getByLabel("Show captions", { exact: true }).uncheck();
    await expect(display.locator(".captions")).toHaveCount(0);
    await expect(page.locator(".operator-preview .captions")).toHaveCount(0);
    await expect(
      display.getByText("CAPTIONS OFF", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page
        .locator(".operator-preview")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeCloseTo(height, 0);
    expect(
      await page
        .locator(".operator-preview .score")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThan(240);
    expect(
      await display
        .locator(".stage > .score")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThan(1070);
    await page.getByLabel("Show captions", { exact: true }).check();
    await expect(display.locator(".captions")).toContainText(
      "Caption retained",
    );
  }
  await page.getByLabel("Show captions", { exact: true }).uncheck();
  await page.getByLabel("Caption text").fill("Updated while hidden");
  await page.getByRole("button", { name: "Send caption", exact: true }).click();
  await expect(
    page.getByText("Caption saved while hidden.", { exact: false }),
  ).toBeVisible();
  await expect(display.locator(".captions")).toHaveCount(0);
  await display.screenshot({
    path: ".impeccable/review/captions-hidden-1920.png",
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: ".impeccable/review/caption-desk-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Show captions", { exact: true }).focus();
  await page.getByLabel("Show captions", { exact: true }).press("Space");
  await expect(display.locator(".captions")).toContainText(
    "Updated while hidden",
  );
  await display.screenshot({
    path: ".impeccable/review/captions-shown-1920.png",
  });
  await page.getByLabel("Show captions", { exact: true }).uncheck();
  await page
    .getByText("Settings backup and troubleshooting", { exact: true })
    .click();
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const file = await (await pendingDownload).path();
  if (!file) throw new Error("Missing settings export");
  await page.getByLabel("Show captions", { exact: true }).check();
  await page.getByLabel("Restore settings").setInputFiles(file);
  await expect(
    page.getByLabel("Show captions", { exact: true }),
  ).not.toBeChecked();
  await expect(display.locator(".captions")).toHaveCount(0);
  const other = await context.newPage();
  await other.goto("/control");
  await expect(
    other.getByLabel("Show captions", { exact: true }),
  ).toBeDisabled();
});

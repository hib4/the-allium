import { test, expect } from "@playwright/test";
import { emptyConfig } from "../../src/engine/audio";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ request }) => {
  const { revision } = await (await request.get("/api/config")).json();
  expect(
    (
      await request.put("/api/config", {
        data: { config: { ...emptyConfig(), channels: [1, 2] }, revision },
      })
    ).ok(),
  ).toBe(true);
});

test("mixed input controls feed measured layers and synchronize the venue display", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/control");
  await page.getByLabel("Show captions", { exact: true }).check();
  await expect(
    page.getByText("SERVICE CONNECTED", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Capture device").selectOption({
    label: "Synthetic mixed soundcheck · Fixture · 32 inputs",
  });
  await page.getByLabel("Signal format").selectOption("stereo");
  await page.getByLabel("Left input", { exact: true }).selectOption("11");
  await page.getByLabel("Right input", { exact: true }).selectOption("12");
  await page.getByLabel("Sample rate", { exact: true }).selectOption("44100");
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
        await page
          .getByLabel("Mid flowing lines audio activity")
          .getAttribute("value"),
      ),
    )
    .toBeGreaterThan(0.05);
  await expect(page.getByLabel("Input 11 level dBFS")).toBeVisible();
  await expect(
    page.getByText("Actual capture: 44,100 Hz", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Display profile", { exact: true })
    .selectOption("venue");
  const display = await context.newPage();
  await display.setViewportSize({ width: 4416, height: 896 });
  await display.goto("/experience?performance=1");
  await expect(display.locator(".stage-status")).toContainText(
    "LIVE · SYNTHETIC SOUNDCHECK",
  );
  await expect(display.locator(".venue-display")).toBeVisible();
  await expect(display.locator("canvas")).toBeVisible();
  const rect = await display.locator(".stage").boundingBox();
  expect(rect?.width).toBe(4416);
  expect(rect?.height).toBe(896);
  await page.getByLabel("Low currents", { exact: true }).fill("0");
  await page.getByLabel("Display calibration", { exact: true }).check();
  await expect(display.locator(".calibration")).toBeVisible();
  await display.screenshot({
    path: ".impeccable/review/mixed-calibration-4416.png",
  });
  await page.getByLabel("Display calibration", { exact: true }).uncheck();
  await page
    .getByLabel("Caption text")
    .fill("Selamat datang — Glitz Inclusive");
  await page.getByRole("button", { name: "Send caption", exact: true }).click();
  await expect(display.locator(".captions")).toContainText("Selamat datang");
  await display.waitForTimeout(600);
  await display.screenshot({ path: ".impeccable/review/mixed-live-4416.png" });
  const { streamId } = await page.evaluate(async () => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    return await new Promise<{ streamId: string }>((resolve) => {
      ws.onmessage = (e) => {
        const p = JSON.parse(e.data);
        if (p.type === "features") {
          ws.close();
          resolve(p);
        }
      };
    });
  });
  await page.getByRole("button", { name: "Standby", exact: true }).click();
  await expect(display.locator(".stage-status")).toContainText("STANDBY");
  await expect(
    page.getByLabel("Mid flowing lines audio activity"),
  ).toHaveAttribute("value", "0");
  await page.getByRole("button", { name: "Start Live", exact: true }).click();
  await expect(display.locator(".stage-status")).toContainText("LIVE");
  const sameStream = await page.evaluate(async () => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    return await new Promise<string>((resolve) => {
      ws.onmessage = (e) => {
        const p = JSON.parse(e.data);
        if (p.type === "features") {
          ws.close();
          resolve(p.streamId);
        }
      };
    });
  });
  expect(sameStream).toBe(streamId);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: ".impeccable/review/mixed-control-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: ".impeccable/review/mixed-control-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("stale frames enter standby and automatic reconnection restores live input", async ({
  page,
}) => {
  let stalled = false,
    reconnects = 0;
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

test("Demo works offline and missing Live input never substitutes simulation", async ({
  page,
}) => {
  await page.routeWebSocket("**/ws", (route) => route.close());
  await page.route("**/api/**", (route) => route.abort());
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
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.locator(".status-strip")).toContainText(
    "Standby · waiting for live audio",
  );
  await expect(page.getByLabel("Low currents audio activity")).toHaveAttribute(
    "value",
    "0",
  );
  await expect(
    page.getByText("Instrument channels", { exact: true }),
  ).toHaveCount(0);
});

for (const renderer of ["webgl", "canvas"])
  test(`venue layout and reduced motion using ${renderer}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.goto("/control");
    await page.getByRole("button", { name: "Live", exact: true }).click();
    await page
      .getByLabel("Display profile", { exact: true })
      .selectOption("venue");
    await page.getByLabel("Reduced motion", { exact: true }).check();
    const display = await context.newPage();
    await display.setViewportSize({ width: 4416, height: 896 });
    await display.goto(
      `/experience?performance=1${renderer === "canvas" ? "&renderer=canvas" : ""}`,
    );
    await expect(display.locator(".score-renderer")).toHaveAttribute(
      "data-renderer",
      renderer,
    );
    await display.waitForTimeout(600);
    const metrics = await display.evaluate(async () => {
      const intervals: number[] = [];
      await new Promise<void>((resolve) => {
        let previous = 0,
          start = 0;
        function frame(now: number) {
          if (!start) start = now;
          if (previous) intervals.push(now - previous);
          previous = now;
          if (now - start < 1500) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });
      return {
        fps: 1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length),
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    expect(metrics.scrollWidth).toBe(4416);
    expect(metrics.scrollHeight).toBe(896);
    await testInfo.attach(`${renderer}-software-performance`, {
      body: JSON.stringify(metrics),
      contentType: "application/json",
    });
    await display.screenshot({
      path: `.impeccable/review/mixed-${renderer}-reduced-4416.png`,
    });
    if (renderer === "webgl") {
      await display.evaluate(() => {
        const canvas = document.querySelector("canvas")!;
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      });
      await expect(display.locator(".score-renderer")).toHaveAttribute(
        "data-renderer",
        "canvas",
      );
      await expect(display.locator(".stage-status")).toContainText("LIVE");
    }
    await display.setViewportSize({ width: 1920, height: 1080 });
    const rect = await display.locator(".stage").boundingBox();
    expect(rect!.width / rect!.height).toBeCloseTo(69 / 14, 2);
    expect(rect!.width).toBeLessThanOrEqual(1920);
    expect(rect!.height).toBeLessThanOrEqual(1080);
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
  await expect(
    page.getByLabel("Show captions", { exact: true }),
  ).not.toBeChecked();
  await expect(display.locator(".captions")).toHaveCount(0);
  await page.getByLabel("Show captions", { exact: true }).check();
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

test("legacy restore preserves visual preferences and requires explicit mix setup", async ({
  page,
}) => {
  await page.goto("/control");
  await expect(
    page.getByText("SERVICE CONNECTED", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Settings backup and troubleshooting", { exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const saved = JSON.parse(Buffer.concat(chunks).toString());
  saved.version = 1;
  saved.audio = {
    device: { name: "Old mixer", hostApi: "Core Audio" },
    instruments: { guitar: { channels: [11, 12] } },
  };
  delete saved.visual.channels.saxophone;
  delete saved.visual.layers;
  delete saved.visual.displayProfile;
  delete saved.visual.calibration;
  saved.visual.intensity = 0.4;
  await page.getByLabel("Restore settings").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(
    page.getByText("Backup downloaded.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Capture device")).toHaveValue("");
  await expect(
    page.getByLabel("Overall intensity", { exact: true }),
  ).toHaveValue("40");
  await page
    .getByRole("button", { name: "Apply input settings", exact: true })
    .click();
  await expect(
    page.getByText("Input settings saved.", { exact: false }),
  ).toBeVisible();
  const { config } = await (await page.request.get("/api/config")).json();
  expect(config.channels).toEqual([]);
  expect(config.device).toBeNull();
});

test("healthy silence, missing hardware and recovery report distinct input states", async ({
  page,
}) => {
  let condition = "active";
  await page.routeWebSocket("**/ws", (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const p = JSON.parse(String(message));
      if (p.type === "features" && condition !== "active") {
        p.mix = {
          ...p.mix,
          active: false,
          rms: 0,
          peak: 0,
          intensity: 0,
          bands: [0, 0, 0],
          spectrum: Array(32).fill(0),
          centroid: 0,
          flux: 0,
          shortEnergy: 0,
          longEnergy: 0,
          dynamics: 0,
        };
        p.events = [];
        p.meters = p.meters.map(() => ({
          rms: 0,
          peak: 0,
          db: -120,
          clip: false,
        }));
        if (condition === "missing") {
          p.status = "unavailable";
          p.fresh = false;
          p.actual = null;
          p.error = "USB input disconnected";
        }
      }
      client.send(JSON.stringify(p));
    });
  });
  await page.goto("/control");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.locator(".status-strip")).toContainText(
    "Live · synthetic soundcheck",
  );
  condition = "silent";
  await expect(
    page.getByText("Input connected · silence.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Low currents audio activity")).toHaveAttribute(
    "value",
    "0",
  );
  await expect(
    page.getByRole("button", { name: "Live", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  condition = "missing";
  await expect(page.locator(".audio-status")).toContainText(
    "USB input disconnected",
  );
  await expect(page.locator(".status-strip")).toContainText(
    "Standby · waiting for live audio",
  );
  await expect(
    page.getByRole("button", { name: "Demo", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  condition = "active";
  await expect(page.locator(".status-strip")).toContainText(
    "Live · synthetic soundcheck",
  );
  await expect
    .poll(async () =>
      Number(
        await page
          .getByLabel("Low currents audio activity")
          .getAttribute("value"),
      ),
    )
    .toBeGreaterThan(0.05);
});

test("named mono microphone controls show raw levels independently of the visual gate", async ({
  page,
}) => {
  // Device discovery is mocked; PCM remains the explicitly labelled fixture, not real microphone evidence.
  await page.route("**/api/devices*", (route) =>
    route.fulfill({
      json: {
        fixture: true,
        devices: [
          {
            id: 1,
            name: "MacBook Pro Microphone",
            hostApi: "Core Audio",
            channels: 1,
            sampleRate: 48000,
            checkedConfigurations: [{ channels: 1, sampleRate: 48000 }],
          },
        ],
      },
    }),
  );
  await page.goto("/control");
  await expect(
    page.getByText("SERVICE CONNECTED", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Capture device")
    .selectOption({ label: "MacBook Pro Microphone · Core Audio · 1 inputs" });
  await expect(
    page.getByLabel("Signal format").locator('option[value="stereo"]'),
  ).toHaveAttribute("disabled", "");
  await page.getByLabel("Mono input", { exact: true }).selectOption("1");
  await page.getByLabel("Noise threshold", { exact: true }).fill("-10");
  await page
    .getByRole("button", { name: "Apply input settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(
    page.getByText("Input connected · below the noise threshold.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Input 1 raw levels")).toContainText("RMS");
  await expect(page.getByLabel("Input 1 raw levels")).toContainText("Peak");
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Input 1 level dBFS").getAttribute("value")),
    )
    .toBeGreaterThan(-60);
  await expect(page.getByLabel("Low currents audio activity")).toHaveAttribute(
    "value",
    "0",
  );
  await expect(page.getByLabel("Capture diagnostics")).toContainText(
    "MacBook Pro Microphone · Core Audio",
  );
  await expect(page.getByLabel("Capture diagnostics")).toContainText(
    "Frames: fresh",
  );
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Live choreographies synchronize and return immediately without restarting capture", async ({
  page,
  context,
}) => {
  await page.goto("/control");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  const selector = page.getByLabel("Live choreography", { exact: true });
  await expect(selector).toHaveValue("current");
  const stream = await page.evaluate(async () => {
    const p = await fetch("/api/config").then((r) => r.json());
    return p.revision;
  });
  const display = await context.newPage();
  await display.setViewportSize({ width: 4416, height: 896 });
  await display.goto("/experience?performance=1");
  await selector.selectOption("living");
  // A second operator is read-only but receives the same synchronized choice.
  const observer = await context.newPage();
  await observer.goto("/control");
  await expect(
    observer.getByLabel("Live choreography", { exact: true }),
  ).toHaveValue("living");
  await expect(
    observer.getByLabel("Live choreography", { exact: true }),
  ).toBeDisabled();
  await expect(display.locator("canvas")).toBeVisible();
  await selector.selectOption("original");
  await expect(
    observer.getByLabel("Live choreography", { exact: true }),
  ).toHaveValue("original");
  await expect(display.locator("canvas")).toBeVisible();
  await selector.selectOption("combined");
  await expect(
    observer.getByLabel("Live choreography", { exact: true }),
  ).toHaveValue("combined");
  await expect(display.locator("canvas")).toBeVisible();
  await page
    .getByText("Settings backup and troubleshooting", { exact: true })
    .click();
  const pendingExport = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const settings = await (await pendingExport).path();
  if (!settings) throw new Error("Missing Combined settings export");
  await selector.selectOption("living");
  await page.getByLabel("Restore settings").setInputFiles(settings);
  await expect(selector).toHaveValue("combined");
  await expect(
    observer.getByLabel("Live choreography", { exact: true }),
  ).toHaveValue("combined");
  await selector.selectOption("current");
  await expect(
    observer.getByLabel("Live choreography", { exact: true }),
  ).toHaveValue("current");
  expect(
    await page.evaluate(async () => {
      const p = await fetch("/api/config").then((r) => r.json());
      return p.revision;
    }),
  ).toBe(stream);
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(
    page.getByLabel("Live choreography", { exact: true }),
  ).toHaveCount(0);
  await expect(display.locator("canvas")).toBeVisible();
});

test("small instrument guides follow Original and Combined and fit display and preview artwork", async ({
  page,
  context,
}) => {
  await page.goto("/control");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  const selector = page.getByLabel("Live choreography", { exact: true });
  const display = await context.newPage();
  await display.goto("/experience?performance=1");
  const guide = display.getByRole("list", { name: "Instrument visual guide" });
  const preview = page.locator(".operator-preview");
  const previewGuide = preview.getByRole("list", {
    name: "Instrument visual guide",
  });
  const names = ["Vocals", "Guitar", "Drums", "Bass", "Piano"];
  const fits = async () => {
    const measurements = await guide.evaluate((el) => {
      const score = el.closest(".score")!.getBoundingClientRect();
      const identity = document
        .querySelector(".stage-top .identity")!
        .getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        pointerEvents: style.pointerEvents,
        fontSize: parseFloat(style.fontSize),
        items: [...el.children].map((li) => {
          const r = li.getBoundingClientRect();
          return {
            inside:
              r.left >= score.left &&
              r.right <= score.right + 1 &&
              r.top >= score.top &&
              r.bottom <= score.bottom + 1,
            clearIdentity:
              r.right <= identity.left ||
              r.left >= identity.right ||
              r.bottom <= identity.top ||
              r.top >= identity.bottom,
          };
        }),
      };
    });
    expect(measurements.pointerEvents).toBe("none");
    expect(measurements.fontSize).toBeLessThanOrEqual(15);
    expect(measurements.items.every((i) => i.inside && i.clearIdentity)).toBe(
      true,
    );
  };
  await expect(guide).toHaveCount(0);
  for (const variant of ["original", "combined"]) {
    await selector.selectOption(variant);
    await expect(guide.locator("li")).toHaveText(names);
    await expect(previewGuide.locator("li")).toHaveText(names);
    expect(
      await previewGuide.evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("11px");
    for (const [width, height] of [
      [4416, 896],
      [1920, 1080],
      [320, 800],
    ]) {
      await display.setViewportSize({ width, height });
      expect(
        await display
          .locator(".stage-top .identity")
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBe(width === 4416 ? 42 : 32);
      for (const captions of [false, true]) {
        await page
          .getByLabel("Show captions", { exact: true })
          .setChecked(captions);
        await fits();
        await display.screenshot({
          path: `.impeccable/review/instrument-guide-${variant}-${width}-${captions ? "captions" : "art"}.png`,
        });
      }
    }
    await preview.screenshot({
      path: `.impeccable/review/instrument-guide-${variant}-preview.png`,
    });
    await page.setViewportSize({ width: 320, height: 800 });
    const previewFits = await previewGuide.evaluate((el) => {
      const score = el.closest(".score")!.getBoundingClientRect();
      return [...el.children].every((li) => {
        const r = li.getBoundingClientRect();
        return (
          r.left >= score.left &&
          r.right <= score.right + 1 &&
          r.top >= score.top &&
          r.bottom <= score.bottom + 1
        );
      });
    });
    expect(previewFits).toBe(true);
    await preview.screenshot({
      path: `.impeccable/review/instrument-guide-${variant}-preview-mobile.png`,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await display.goto("/experience");
    await fits();
    await display.screenshot({
      path: `.impeccable/review/instrument-guide-${variant}-experience-mobile.png`,
      fullPage: true,
    });
    await display.goto("/experience?performance=1");
    await display.setViewportSize({ width: 4416, height: 896 });
    await page
      .getByLabel("Display profile", { exact: true })
      .selectOption("venue");
    await fits();
    await display.screenshot({
      path: `.impeccable/review/instrument-guide-${variant}-venue.png`,
    });
    await page
      .getByLabel("Display profile", { exact: true })
      .selectOption("responsive");
  }
  await page.getByRole("button", { name: "Standby", exact: true }).click();
  await expect(guide.locator("li")).toHaveText(names);
  await selector.selectOption("current");
  await expect(guide).toHaveCount(0);
  await selector.selectOption("living");
  await expect(guide).toHaveCount(0);
  await selector.selectOption("combined");
  await expect(guide).toBeVisible();
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(guide).toHaveCount(0);
});

for (const renderer of ["webgl", "canvas"]) {
  test(`2424 display profile sizes, calibrates, synchronizes and restores using ${renderer}`, async ({
    page,
    context,
  }) => {
    await page.goto("/control");
    await page.getByRole("button", { name: "Live", exact: true }).click();
    const profile = page.getByLabel("Display profile", { exact: true });
    await profile.selectOption({ label: "Venue LED · 2424 × 896" });
    const display = await context.newPage();
    await display.setViewportSize({ width: 2424, height: 896 });
    await display.goto(
      `/experience?performance=1${renderer === "canvas" ? "&renderer=canvas" : ""}`,
    );
    await expect(display.locator(".experience")).toHaveAttribute(
      "data-display-profile",
      "venue-2424",
    );
    await expect(display.locator(".score-renderer")).toHaveAttribute(
      "data-renderer",
      renderer,
    );
    const stage = display.locator(".stage");
    const checkRatio = async () => {
      const r = (await stage.boundingBox())!;
      expect(r.width / r.height).toBeCloseTo(2424 / 896, 3);
      return r;
    };
    for (const variant of ["original", "combined"]) {
      await page
        .getByLabel("Live choreography", { exact: true })
        .selectOption(variant);
      await expect(
        display.getByRole("list", { name: "Instrument visual guide" }),
      ).toBeVisible();
      for (const captions of [false, true]) {
        await page
          .getByLabel("Show captions", { exact: true })
          .setChecked(captions);
        const r = await checkRatio();
        expect(r.width).toBe(2424);
        expect(r.height).toBe(896);
        if (captions) await expect(display.locator(".captions")).toBeVisible();
        else await expect(display.locator(".captions")).toHaveCount(0);
        expect(
          await display.evaluate(
            () =>
              document.documentElement.scrollWidth === 2424 &&
              document.documentElement.scrollHeight === 896,
          ),
        ).toBe(true);
        await display.screenshot({
          path: `.impeccable/review/profile-2424-${renderer}-${variant}-${captions ? "captions" : "art"}.png`,
        });
      }
    }
    await page.getByLabel("Display calibration", { exact: true }).check();
    await expect(display.locator(".calibration strong")).toContainText(
      "Target 2424 × 896 · 303:112",
    );
    await expect(
      page.locator(".operator-preview .calibration strong"),
    ).toContainText("Target 2424 × 896 · 303:112");
    for (const circle of await display.locator(".calibration circle").all()) {
      const r = (await circle.boundingBox())!;
      expect(Math.abs(r.width - r.height)).toBeLessThan(0.1);
    }
    await display.screenshot({
      path: `.impeccable/review/profile-2424-${renderer}-calibration.png`,
    });
    await display.setViewportSize({ width: 1920, height: 1080 });
    const contained = await checkRatio();
    expect(contained.width).toBeLessThanOrEqual(1920);
    expect(contained.height).toBeLessThanOrEqual(1080);
    await expect(display.locator(".calibration strong")).toContainText(
      "Viewport 1920 × 1080",
    );
    await display.screenshot({
      path: `.impeccable/review/profile-2424-${renderer}-contained.png`,
    });
    await page.getByLabel("Display calibration", { exact: true }).uncheck();
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const preview = page.locator(".operator-preview");
      const r = (await preview.boundingBox())!;
      expect(r.width / r.height).toBeCloseTo(2424 / 896, 1);
      expect(
        await preview
          .getByRole("list", { name: "Instrument visual guide" })
          .evaluate((el) => {
            const score = el.closest(".score")!.getBoundingClientRect();
            return [...el.children].every((li) => {
              const r = li.getBoundingClientRect();
              return (
                r.left >= score.left &&
                r.right <= score.right + 1 &&
                r.top >= score.top &&
                r.bottom <= score.bottom + 1
              );
            });
          }),
      ).toBe(true);
      await preview.screenshot({
        path: `.impeccable/review/profile-2424-${renderer}-preview-${width}.png`,
      });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page
      .getByText("Settings backup and troubleshooting", { exact: true })
      .click();
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export settings", exact: true })
      .click();
    const file = await (await pending).path();
    if (!file) throw Error("Missing profile settings export");
    await profile.selectOption("responsive");
    await expect(display.locator(".experience")).toHaveAttribute(
      "data-display-profile",
      "responsive",
    );
    await page.getByLabel("Display calibration", { exact: true }).check();
    await expect(display.locator(".calibration strong")).toContainText(
      "Responsive · Viewport 1920 × 1080",
    );
    await page.getByLabel("Restore settings").setInputFiles(file);
    await expect(profile).toHaveValue("venue-2424");
    await expect(display.locator(".experience")).toHaveAttribute(
      "data-display-profile",
      "venue-2424",
    );
    await checkRatio();
    await profile.selectOption("venue");
    await expect(display.locator(".experience")).toHaveAttribute(
      "data-display-profile",
      "venue",
    );
    const legacy = (await stage.boundingBox())!;
    expect(legacy.width / legacy.height).toBeCloseTo(69 / 14, 3);
    await profile.selectOption("responsive");
    await expect(display.locator(".experience")).toHaveAttribute(
      "data-display-profile",
      "responsive",
    );
    const responsive = (await stage.boundingBox())!;
    expect(responsive.width).toBe(1920);
    expect(responsive.height).toBe(1080);
  });
}

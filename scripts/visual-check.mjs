/** Opt-in rendering fixture. Never connects to or reconfigures the audio service. */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ALLIUM_URL || "http://localhost:5173";
const seconds = Number(process.env.ALLIUM_VISUAL_SECONDS || 120);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 600)
  throw new Error("Use 5–600 seconds per backend.");
const directory = "artifacts/verification/live-refinement";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const report = {
  fixture: true,
  secondsPerBackend: seconds,
  viewport: [4416, 896],
  results: [],
};
try {
  for (const backend of ["webgl", "canvas"]) {
    const page = await browser.newPage({
      viewport: { width: 4416, height: 896 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/__visual-check*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body style="margin:0;background:#05091c"><div id="field" style="width:100vw;height:100vh"></div></body></html>',
      }),
    );
    await page.goto(`${base}/__visual-check?renderer=${backend}`);
    await page.evaluate(async () => {
      const { ScoreRenderer } = await import("/src/engine/renderer.ts");
      const { Session } = await import("/src/engine/session.ts");
      const session = new Session(false);
      session.update({
        mode: "live",
        motion: 1,
        particles: 1,
        intensity: 1,
        scene: "Ensemble",
        reduced: false,
      });
      const check = (window.__visual = {
        condition: "moderate",
        intervals: [],
        quality: [],
        errors: [],
      });
      const source = {
        events: () => [],
        frame: () => ({}),
        mixed: (time, from) => {
          const silent = check.condition === "silence";
          const intensity =
            check.condition === "quiet"
              ? 0.045
              : check.condition === "intense"
                ? 0.95
                : 0.45;
          const high = check.condition === "high";
          return {
            feature: {
              active: !silent,
              rms: silent ? 0 : intensity * 0.15,
              peak: silent ? 0 : intensity * 0.4,
              intensity: silent ? 0 : intensity,
              bands: high
                ? [0.03, 0.12, 0.9]
                : [intensity * 0.8, intensity * 0.65, intensity * 0.4],
              spectrum: Array.from(
                { length: 32 },
                (_, i) => intensity * (0.2 + 0.5 * Math.sin(i * 0.7) ** 2),
              ),
              centroid: high ? 8500 : 1800,
              flux: high ? 0.7 : 0.15,
              shortEnergy: intensity,
              longEnergy: intensity * 0.7,
              dynamics: intensity * 0.3,
            },
            events:
              !silent &&
              check.condition !== "quiet" &&
              Math.floor(time / 650) > Math.floor(from / 650)
                ? [{ timestamp: time, intensity }]
                : [],
          };
        },
      };
      const renderer = new ScoreRenderer(
        document.querySelector("#field"),
        session,
        {},
        source,
      );
      await renderer.initialize();
      check.reduced = (value) => session.update({ reduced: value });
      check.options = (value) => renderer.options(value);
      check.dispose = () => {
        renderer.dispose();
        session.dispose();
      };
      let previous = 0;
      const tick = (now) => {
        if (previous && check.measure) check.intervals.push(now - previous);
        previous = now;
        check.raf = requestAnimationFrame(tick);
      };
      check.raf = requestAnimationFrame(tick);
    });
    for (const condition of [
      "quiet",
      "moderate",
      "intense",
      "high",
      "silence",
    ]) {
      await page.evaluate((c) => {
        window.__visual.condition = c;
      }, condition);
      await page.waitForTimeout(condition === "silence" ? 7000 : 1800);
      await page.screenshot({
        path: `${directory}/${backend}-${condition}-4416.png`,
      });
    }
    await page.evaluate(() => {
      window.__visual.condition = "moderate";
      window.__visual.reduced(true);
    });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${directory}/${backend}-reduced-4416.png` });
    await page.evaluate(() => window.__visual.options({ highContrast: true }));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${directory}/${backend}-contrast-4416.png`,
    });
    await page.evaluate(() => window.__visual.options({}));
    await page.setViewportSize({ width: 320, height: 500 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${directory}/${backend}-narrow.png` });
    await page.setViewportSize({ width: 900, height: 182 });
    await page.evaluate(() => window.__visual.options({ profile: "preview" }));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${directory}/${backend}-preview.png` });
    await page.setViewportSize({ width: 4416, height: 896 });
    await page.evaluate(() => {
      window.__visual.options({});
      window.__visual.reduced(false);
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      window.__visual.condition = "intense";
      window.__visual.measure = true;
    });
    // Small waits keep the host responsive and expose intermediate quality measurements.
    for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
      await page.waitForTimeout(Math.min(5, seconds - elapsed) * 1000);
      await page.evaluate(() =>
        window.__visual.quality.push(
          Number(document.querySelector("#field").dataset.quality),
        ),
      );
    }
    const result = await page.evaluate(() => {
      const c = window.__visual,
        a = c.intervals.sort((a, b) => a - b);
      const actual = document.querySelector("#field").dataset.renderer;
      c.dispose();
      cancelAnimationFrame(c.raf);
      return {
        actual,
        frames: a.length,
        fps: 1000 / (a.reduce((s, v) => s + v, 0) / a.length),
        p50Ms: a[Math.floor(a.length * 0.5)],
        p95Ms: a[Math.floor(a.length * 0.95)],
        p99Ms: a[Math.floor(a.length * 0.99)],
        maxMs: a.at(-1),
        quality: c.quality,
        scroll: [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ],
      };
    });
    // The same renderer remains alive through resizing and accessibility changes.
    await page.close();
    report.results.push({ requested: backend, ...result, errors });
    console.log(JSON.stringify(report.results.at(-1)));
  }
  await writeFile(
    `${directory}/performance.json`,
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser.close();
}
if (
  report.results.some(
    (r) =>
      r.errors.length ||
      r.actual !== r.requested ||
      r.scroll[0] !== 4416 ||
      r.scroll[1] !== 896,
  )
)
  process.exitCode = 1;

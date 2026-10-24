/** Explicit developer capture/comparison. No production route, audio writes, or PCM recording. */
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seconds: { type: "string", default: "120" },
    input: { type: "string" },
    output: { type: "string" },
    headful: { type: "boolean", default: false },
  },
});
const command = positionals[0];
if (!["record", "compare", "fixture"].includes(command))
  throw Error("Use record, compare --input FILE, or fixture.");
const seconds = Number(values.seconds);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 180)
  throw Error("Use 5–180 seconds.");
const base = process.env.ALLIUM_URL || "http://localhost:5173";
const directory = values.output || "artifacts/verification/living-composition";
await mkdir(directory, { recursive: true });
let timeline;
if (command === "compare") {
  if (!values.input)
    throw Error("Supply --input with a feature-only timeline file.");
  const file = await readFile(values.input);
  if (file.length > 8 * 1024 * 1024) throw Error("Timeline exceeds 8 MiB.");
  timeline = JSON.parse(file.toString());
}
const browser = await chromium.launch({
  channel: "chrome",
  headless: !values.headful,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 4416, height: 896 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__living-comparison*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body style="margin:0;background:#05091c"><div id="field" style="width:100vw;height:100vh"></div></body></html>',
    }),
  );
  await page.goto(command === "record" ? `${base}/fonts/LICENSE.txt` : `${base}/__living-comparison`);
  if (command === "record") {
    console.log(
      `Capturing ${seconds}s of measured features from the currently selected input. Play your music now. No PCM or device identifiers are saved.`,
    );
    timeline = await page.evaluate(async (seconds) => {
      const { validPacket } = await import("/src/engine/audio.ts");
      const { validTimeline } = await import("/scripts/feature-timeline.ts");
      const timeline = {
        version: 1,
        kind: "measured",
        duration: seconds * 1000,
        samples: [],
      };
      const url = new URL("/ws", location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const start = performance.now();
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        let lastSequence = -1,
          lastStream = "",
          lastReceived = 0;
        const finish = (error) => {
          clearTimeout(timer);
          clearInterval(watch);
          ws.close();
          error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => finish(), seconds * 1000);
        const watch = setInterval(() => {
          const time = Math.min(timeline.duration, performance.now() - start);
          if (
            time - lastReceived > 500 &&
            timeline.samples.at(-1)?.feature !== null
          )
            timeline.samples.push({ time, feature: null, events: [] });
        }, 250);
        ws.onerror = () =>
          finish(Error("Cannot connect to the local audio service"));
        ws.onmessage = (e) => {
          let p;
          try {
            p = JSON.parse(e.data);
          } catch {
            return;
          }
          if (!validPacket(p)) return;
          if (p.status === "fixture")
            return finish(Error("Refusing fixture input as measured music"));
          if (p.streamId !== lastStream) {
            lastSequence = -1;
            lastStream = p.streamId;
          }
          if (p.sequence <= lastSequence) return;
          lastSequence = p.sequence;
          const time = Math.min(timeline.duration, performance.now() - start);
          lastReceived = time;
          const f = p.mix;
          const feature =
            p.fresh && p.status === "connected"
              ? {
                  active: f.active,
                  rms: f.rms,
                  peak: f.peak,
                  intensity: f.intensity,
                  bands: [...f.bands],
                  spectrum: [...f.spectrum],
                  centroid: f.centroid,
                  flux: f.flux,
                  shortEnergy: f.shortEnergy,
                  longEnergy: f.longEnergy,
                  dynamics: f.dynamics,
                }
              : null;
          timeline.samples.push({
            time,
            feature,
            events: feature?.active
              ? p.events.map((e) => ({
                  timestamp: Math.max(
                    0,
                    time -
                      Math.min(500, Math.max(0, p.timestamp - e.timestamp)),
                  ),
                  intensity: e.intensity,
                }))
              : [],
          });
        };
      });
      if (!timeline.samples.some((s) => s.feature))
        throw Error(
          "No fresh measured features received; select and start Live input first.",
        );
      if (!validTimeline(timeline))
        throw Error("Captured timeline failed validation");
      return timeline;
    }, seconds);
    await writeFile(
      `${directory}/measured-features.json`,
      JSON.stringify(timeline),
    );
    const active = timeline.samples.filter((s) => s.feature?.active).length;
    console.log(
      JSON.stringify({
        saved: `${directory}/measured-features.json`,
        samples: timeline.samples.length,
        active,
        events: timeline.samples.reduce((n, s) => n + s.events.length, 0),
      }),
    );
    process.exitCode = active ? 0 : 2;
  } else {
    if (command === "fixture")
      timeline = await page.evaluate((seconds) => {
        const samples = [];
        for (let time = 0; time <= seconds * 1000; time += 50) {
          const u = time / (seconds * 1000),
            active = u < 0.92;
          const intensity = !active
            ? 0
            : u < 0.12
              ? 0.07
              : u < 0.35
                ? 0.2 + (u - 0.12) * 2
                : u < 0.68
                  ? 0.87 + Math.sin(time / 900) * 0.05
                  : u < 0.85
                    ? 0.24
                    : 0.06;
          samples.push({
            time,
            feature: {
              active,
              rms: intensity * 0.15,
              peak: intensity * 0.4,
              intensity,
              bands: [
                intensity * (0.65 + Math.sin(time / 1200) * 0.12),
                intensity * 0.7,
                intensity * 0.5,
              ],
              spectrum: Array.from(
                { length: 32 },
                (_, i) =>
                  intensity *
                  (0.35 + Math.sin(i * 0.7 + time / 2500) ** 2 * 0.25),
              ),
              centroid: 1800 + intensity * 2800,
              flux: u > 0.35 && u < 0.68 ? 0.65 : 0.12,
              shortEnergy: intensity,
              longEnergy: intensity * 0.9,
              dynamics: 0.05,
            },
            events:
              active && u > 0.12 && u < 0.85 && time % 450 === 0
                ? [{ timestamp: time, intensity }]
                : [],
          });
        }
        return {
          version: 1,
          kind: "synthetic-fixture",
          duration: seconds * 1000,
          samples,
        };
      }, seconds);
    const valid = await page.evaluate(
      async (t) =>
        (await import("/scripts/feature-timeline.ts")).validTimeline(t),
      timeline,
    );
    if (!valid) throw Error("Invalid feature timeline");
    if (command === "fixture")
      await writeFile(
        `${directory}/synthetic-features.json`,
        JSON.stringify(timeline),
      );
    const report = {
      kind: timeline.kind,
      viewport: [4416, 896],
      duration: timeline.duration,
      results: [],
      errors,
    };
    for (const backend of ["webgl", "canvas"])
      for (const variant of ["current", "living"]) {
        console.log(
          `Comparing ${variant} / ${backend} (${timeline.kind}, ${Math.min(seconds * 1000, timeline.duration) / 1000}s)`,
        );
        await page.goto(`${base}/__living-comparison?renderer=${backend}`);
        await page.evaluate(
          async ({ timeline, variant, backend }) => {
            const { Session } = await import("/src/engine/session.ts");
            const { ReplaySource } =
              await import("/scripts/feature-timeline.ts");
            const { MixedChoreography } = await import("/src/engine/mixed.ts");
            const { CanvasBackend } = await import("/src/engine/backends.ts");
            const source = new ReplaySource(timeline),
              session = new Session(false);
            session.update({
              mode: "live",
              liveChoreography: variant,
              intensity: 0.65,
              motion: 0.65,
              reduced: false,
            });
            const canvas = document.createElement("canvas");
            document.querySelector("#field").replaceChildren(canvas);
            const renderer =
              backend === "canvas"
                ? new CanvasBackend(canvas)
                : new (await import("/src/engine/webgl.ts")).WebGLBackend();
            if (backend !== "canvas") await renderer.initialize(canvas);
            renderer.resize(4416, 896, 1);
            const model = new MixedChoreography(source);
            window.__comparison = {
              session,
              source,
              renderer,
              model,
              time: 0,
              captures: [],
              renderTo(target) {
                for (; this.time <= target; this.time += 1000 / 60)
                  renderer.render(
                    model.update(this.time, session.state, 4416, 896, {}, 1),
                  );
                this.captures.push({
                  time: target,
                  ...model.metrics,
                  paths: model.update(target, session.state, 4416, 896, {}, 1)
                    .pathCount,
                });
              },
            };
          },
          { timeline, variant, backend },
        );
        const fractions = [0.1, 0.3, 0.55, 0.78, 0.97];
        for (const [i, fraction] of fractions.entries()) {
          await page.evaluate(
            (t) => window.__comparison.renderTo(t),
            timeline.duration * fraction,
          );
          await page.screenshot({
            path: `${directory}/${backend}-${variant}-${i}.png`,
          });
        }
        const captures = await page.evaluate(
          () => window.__comparison.captures,
        );
        // Accessibility and viewport captures belong to the same bounded inspection pass.
        for (const condition of ["reduced", "contrast", "preview", "narrow"]) {
          const size =
            condition === "preview"
              ? [900, 182]
              : condition === "narrow"
                ? [320, 500]
                : [4416, 896];
          await page.setViewportSize({ width: size[0], height: size[1] });
          await page.evaluate(
            ({ condition, size }) => {
              const c = window.__comparison;
              c.model = new c.model.constructor(c.source);
              c.session.update({ reduced: condition === "reduced" });
              c.renderer.resize(...size, 1);
              for (let t = 0; t <= 4000; t += 50)
                c.renderer.render(
                  c.model.update(
                    t,
                    c.session.state,
                    ...size,
                    {
                      highContrast: condition === "contrast",
                      profile: condition === "preview" ? "preview" : undefined,
                    },
                    1,
                  ),
                );
            },
            { condition, size },
          );
          await page.screenshot({
            path: `${directory}/${backend}-${variant}-${condition}.png`,
          });
        }
        await page.setViewportSize({ width: 4416, height: 896 });
        await page.evaluate(
          async ({ timeline, variant }) => {
            window.__comparison.renderer.dispose();
            window.__comparison.session.dispose();
            const { Session } = await import("/src/engine/session.ts");
            const { ScoreRenderer } = await import("/src/engine/renderer.ts");
            const { ReplaySource } =
              await import("/scripts/feature-timeline.ts");
            const session = new Session(false),
              source = new ReplaySource(timeline),
              start = Date.now();
            session.time = () => Date.now() - start;
            session.update({
              mode: "live",
              liveChoreography: variant,
              intensity: 0.65,
              motion: 0.65,
              reduced: false,
            });
            const renderer = new ScoreRenderer(
              document.querySelector("#field"),
              session,
              {},
              source,
            );
            await renderer.initialize();
            const m = (window.__measure = {
              intervals: [],
              quality: [],
              start: performance.now(),
              renderer,
              session,
            });
            let previous = 0;
            const tick = (now) => {
              if (previous) m.intervals.push(now - previous);
              previous = now;
              m.raf = requestAnimationFrame(tick);
            };
            m.raf = requestAnimationFrame(tick);
          },
          { timeline, variant },
        );
        const duration = Math.min(seconds * 1000, timeline.duration);
        for (let t = 0; t < duration; t += 5000) {
          await page.waitForTimeout(Math.min(5000, duration - t));
          await page.evaluate(() =>
            window.__measure.quality.push(
              Number(document.querySelector("#field").dataset.quality),
            ),
          );
        }
        const result = await page.evaluate(() => {
          const m = window.__measure;
          cancelAnimationFrame(m.raf);
          const sorted = [...m.intervals].sort((a, b) => a - b),
            p = (q) => sorted[Math.floor((sorted.length - 1) * q)];
          const result = {
            frames: sorted.length,
            fps:
              1000 / (m.intervals.reduce((a, b) => a + b, 0) / sorted.length),
            p95: p(0.95),
            p99: p(0.99),
            quality: m.quality,
            backend: document.querySelector("#field").dataset.renderer,
            scroll: [
              document.documentElement.scrollWidth,
              document.documentElement.scrollHeight,
            ],
          };
          m.renderer.dispose();
          m.session.dispose();
          return result;
        });
        report.results.push({
          variant,
          requestedBackend: backend,
          ...result,
          captures,
        });
        console.log(
          JSON.stringify({
            variant,
            backend,
            fps: result.fps,
            p95: result.p95,
            quality: Math.min(...result.quality),
          }),
        );
      }
    report.regressions = ["webgl", "canvas"].map((backend) => {
      const rows = report.results.filter((r) => r.requestedBackend === backend);
      return {
        backend,
        p95Ratio: rows[1].p95 / rows[0].p95,
        withinTenPercent: rows[1].p95 <= rows[0].p95 * 1.1,
      };
    });
    await writeFile(
      `${directory}/comparison.json`,
      JSON.stringify(report, null, 2),
    );
    if (errors.length || report.regressions.some((r) => !r.withinTenPercent))
      process.exitCode = 1;
    console.log(`Report: ${directory}/comparison.json`);
  }
} finally {
  await browser.close();
}

import { spawn, execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ALLIUM_URL || "http://127.0.0.1:8765";
const duration = Number(process.env.ALLIUM_SOAK_SECONDS || 1800);
if (process.platform === "darwin")
  spawn("/usr/bin/caffeinate", ["-i", "-s", "-w", String(process.pid)], {
    stdio: "ignore",
  }).unref();
let servicePid;
if (process.platform === "darwin")
  servicePid = execFileSync("lsof", ["-t", "-iTCP:8765", "-sTCP:LISTEN"], {
    encoding: "utf8",
  }).trim();
const identity = await (await fetch(base + "/api/health")).json();
if (identity.application !== "The Allium" || identity.fixture !== true)
  throw new Error(
    "Soak requires the explicit synthetic fixture service. Venue settings must not be changed by this test.",
  );
const settings = await (await fetch(base + "/api/config")).json();
settings.config.channels = [1, 2];
await fetch(base + "/api/config", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(settings),
});
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const context = await browser.newContext({
  viewport: { width: 4416, height: 896 },
});
const errors = [];
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
const operator = await context.newPage();
await operator.goto(base + "/control");
await operator.getByRole("button", { name: "Start Live", exact: true }).click();
await operator
  .getByLabel("Display profile", { exact: true })
  .selectOption("venue");
const display = await context.newPage();
await display.goto(base + "/experience?performance=1");
await display.evaluate(() => {
  const m = (window.__soak = {
    frames: 0,
    total: 0,
    max: 0,
    packets: 0,
    ages: [],
    drops: 0,
    overflows: 0,
    reconnects: 0,
    lastPacket: 0,
  });
  let prev = 0;
  const frame = (t) => {
    if (prev) {
      const dt = t - prev;
      m.frames++;
      m.total += dt;
      m.max = Math.max(m.max, dt);
    }
    prev = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
    }, 1000);
    ws.onmessage = (e) => {
      const p = JSON.parse(e.data);
      if (p.type === "features") {
        m.packets++;
        m.lastPacket = Date.now();
        m.ages.push(p.health.processingMs);
        if (m.ages.length > 300) m.ages.shift();
        m.drops = p.health.dropped;
        m.overflows = p.health.overflows;
      }
    };
    ws.onclose = () => {
      clearInterval(ping);
      m.reconnects++;
      setTimeout(connect, 250);
    };
    ws.onerror = () => ws.close();
  }
  connect();
});
const session = await context.newCDPSession(display);
await session.send("Performance.enable");
const samples = [];
const started = Date.now();
while (Date.now() - started < duration * 1000) {
  await new Promise((r) => setTimeout(r, 10000));
  const perf = await session.send("Performance.getMetrics");
  const m = await display.evaluate(() => ({
    ...window.__soak,
    packetAge: Date.now() - window.__soak.lastPacket,
    stage: document.querySelector(".stage-status")?.textContent,
    quality: document
      .querySelector(".score-renderer")
      ?.getAttribute("data-quality"),
  }));
  const ages = m.ages.sort((a, b) => a - b);
  delete m.ages;
  samples.push({
    seconds: (Date.now() - started) / 1000,
    ...m,
    fps: (1000 * m.frames) / m.total,
    ageP95: ages[Math.floor(ages.length * 0.95)],
    serviceRssKiB: servicePid
      ? Number(
          execFileSync("ps", ["-o", "rss=", "-p", servicePid], {
            encoding: "utf8",
          }).trim(),
        )
      : null,
    heap: perf.metrics.find((x) => x.name === "JSHeapUsedSize")?.value,
  });
  await mkdir("artifacts/verification", { recursive: true });
  await writeFile(
    "artifacts/verification/soak-progress.json",
    JSON.stringify({ duration, errors, samples }, null, 2),
  );
  if (samples.length % 6 === 0) console.log(JSON.stringify(samples.at(-1)));
}
await display.screenshot({ path: ".impeccable/review/release-display.png" });
await operator.screenshot({
  path: ".impeccable/review/release-operator.png",
  fullPage: true,
});
await mkdir("artifacts/verification", { recursive: true });
await writeFile(
  "artifacts/verification/soak.json",
  JSON.stringify(
    { duration, host: process.platform, errors, samples },
    null,
    2,
  ),
);
await browser.close();
if (
  errors.length ||
  samples.some(
    (s) =>
      s.packetAge > 3000 || !s.stage?.includes("LIVE · SYNTHETIC SOUNDCHECK"),
  )
)
  process.exitCode = 1;

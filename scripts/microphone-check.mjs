/** Opt-in real-input check. Reads derived features through Vite; never records PCM or selects a device. */
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    seconds: { type: "string", default: "10" },
    label: { type: "string", default: "ambient" },
    output: { type: "string" },
    device: { type: "string", default: "MacBook Pro Microphone" },
  },
});
const seconds = Number(values.seconds);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60)
  throw new Error("Use --seconds between 1 and 60.");
const base = process.env.ALLIUM_URL || "http://localhost:5173";
const response = await fetch(new URL("/api/config", base), {
  signal: AbortSignal.timeout(5000),
});
if (!response.ok)
  throw new Error(`Audio config unavailable: ${response.status}`);
const { config } = await response.json();
if (config.device?.name !== values.device || !config.channels?.length)
  throw new Error(
    `Explicitly select ${values.device} and its channel(s), then Apply input settings first.`,
  );
const url = new URL("/ws", base);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
const stats = {
  label: values.label,
  started: new Date().toISOString(),
  origin: base,
  seconds,
  config,
  packets: 0,
  fresh: 0,
  stale: 0,
  active: 0,
  events: 0,
  rmsMin: Infinity,
  rmsMax: 0,
  peakMax: 0,
  intensityMax: 0,
  bandsMax: [0, 0, 0],
  processingAgeMaxMs: 0,
  actual: null,
  statuses: [],
  errors: [],
  streamIds: [],
  health: null,
  connectionError: "",
  lastStatus: "",
  lastFresh: false,
  lastFrameAgeMs: null,
};
console.log(
  `Monitoring ${values.device} for ${seconds}s (${values.label}). No audio recording.`,
);
let lastReceived = 0;
await new Promise((resolve) => {
  const ws = new WebSocket(url);
  let completed = false;
  const timer = setTimeout(() => {
    completed = true;
    ws.close();
    resolve();
  }, seconds * 1000);
  ws.onmessage = (event) => {
    const p = JSON.parse(event.data);
    if (p.type !== "features") return;
    if (p.status === "fixture" || p.config?.device?.name !== values.device) {
      stats.connectionError =
        "Input changed or fixture received; this is not the requested real microphone.";
      clearTimeout(timer);
      ws.close();
      resolve();
      return;
    }
    lastReceived = Date.now();
    stats.packets++;
    stats.lastStatus = p.status;
    stats.lastFresh = p.fresh;
    if (!stats.statuses.includes(p.status)) stats.statuses.push(p.status);
    if (p.error && !stats.errors.includes(p.error)) stats.errors.push(p.error);
    if (!stats.streamIds.includes(p.streamId)) stats.streamIds.push(p.streamId);
    stats.actual = p.actual;
    stats.health = p.health;
    if (!p.fresh) {
      stats.stale++;
      return;
    }
    stats.fresh++;
    stats.active += Number(p.mix.active);
    stats.events += p.events.length;
    stats.rmsMin = Math.min(stats.rmsMin, p.mix.rms);
    stats.rmsMax = Math.max(stats.rmsMax, p.mix.rms);
    stats.peakMax = Math.max(stats.peakMax, p.mix.peak);
    stats.intensityMax = Math.max(stats.intensityMax, p.mix.intensity);
    stats.bandsMax = stats.bandsMax.map((n, i) => Math.max(n, p.mix.bands[i]));
    stats.processingAgeMaxMs = Math.max(
      stats.processingAgeMaxMs,
      p.health.processingMs,
    );
  };
  ws.onerror = () => {
    stats.connectionError = "WebSocket failed";
    clearTimeout(timer);
    ws.close();
    resolve();
  };
  ws.onclose = () => {
    if (!completed && !stats.connectionError)
      stats.connectionError =
        "WebSocket closed before the requested window completed";
    clearTimeout(timer);
    resolve();
  };
});
stats.lastFrameAgeMs = lastReceived ? Date.now() - lastReceived : null;
if (!Number.isFinite(stats.rmsMin)) stats.rmsMin = 0;
const result = JSON.stringify(stats, null, 2);
if (values.output) await writeFile(values.output, result + "\n");
console.log(result);
if (
  !stats.fresh ||
  !stats.lastFresh ||
  stats.lastFrameAgeMs === null ||
  stats.lastFrameAgeMs > 500 ||
  stats.lastStatus !== "connected" ||
  stats.connectionError
)
  process.exitCode = 1;

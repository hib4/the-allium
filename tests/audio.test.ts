import { afterAll, expect, it } from "vitest";
import {
  AudioConnection,
  ConcertSource,
  emptyConfig,
  validConfig,
  validPacket,
  type AudioPacket,
} from "../src/engine/audio";
import { Session, concert } from "../src/engine/session";
import { defaultLayers } from "../src/engine/types";
import { MixedChoreography } from "../src/engine/mixed";
import { migrateConfig } from "../src/engine/audio";
import { upgradeState, validState } from "../src/engine/session";
afterAll(() => concert.dispose());
export function packet(timestamp: number, sequence = 1): AudioPacket {
  const config = { ...emptyConfig(), channels: [11, 12] };
  return {
    v: 2,
    type: "features",
    streamId: "fixture",
    sequence,
    timestamp,
    revision: 1,
    config,
    status: "fixture",
    error: "",
    fresh: true,
    sampleRate: 44100,
    actual: { sampleRate: 44100, captureChannels: 12, channels: [11, 12] },
    meters: Array.from({ length: 2 }, () => ({
      rms: 0.1,
      peak: 0.2,
      db: -20,
      clip: false,
    })),
    mix: {
      rms: 0.1,
      peak: 0.2,
      active: true,
      intensity: 0.7,
      bands: [0.1, 0.6, 0.1],
      spectrum: Array(32).fill(0.1),
      centroid: 440,
      flux: 0.3,
      shortEnergy: 0.7,
      longEnergy: 0.3,
      dynamics: 0.4,
    },
    events: [{ timestamp, intensity: 0.7 }],
    health: { overflows: 0, dropped: 0, processingMs: 0 },
  };
}
it("validates mixed frames, negotiated rates and selected input meters", () => {
  const p = packet(100);
  expect(validPacket(p)).toBe(true);
  expect(validPacket({ ...p, v: 1 })).toBe(false);
  expect(validPacket({ ...p, meters: [] })).toBe(false);
  expect(validPacket({ ...p, sequence: NaN })).toBe(false);
  expect(validPacket({ ...p, sampleRate: 48000 })).toBe(false);
  p.mix.spectrum[2] = Infinity;
  expect(validPacket(p)).toBe(false);
  const c = { ...emptyConfig(), channels: [11, 12] };
  expect(validConfig(c)).toBe(true);
  c.channels = [11, 11];
  expect(validConfig(c)).toBe(false);
  c.channels = [1, 2, 3];
  expect(validConfig(c)).toBe(false);
});
it("independent mixed sources share events, reject stale input and resume after standby", () => {
  const session = new Session(false);
  session.update({ mode: "live" });
  const connection = new AudioConnection();
  const a = new ConcertSource(session, connection),
    b = new ConcertSource(session, connection);
  a.mixed(1000, 0);
  b.mixed(1000, 0);
  connection.accept(packet(1010), 1010);
  expect(a.mixed(1020, 1000)?.feature.intensity).toBe(0.7);
  expect(a.mixed(1020, 1000)?.events).toEqual(b.mixed(1020, 1000)?.events);
  expect(a.mixed(1020, 1000)?.events).toHaveLength(1);
  expect(a.mixed(1600, 1020)).toBeNull();
  session.update({ mode: "standby" });
  expect(a.mixed(1700, 1600)).toBeNull();
  connection.accept(packet(1710, 2), 1710);
  session.update({ mode: "live" });
  expect(a.mixed(1720, 1700)).toBeNull();
  connection.accept(packet(1730, 3), 1730);
  expect(a.mixed(1740, 1720)?.events).toHaveLength(1);
  expect(a.frame(1740, session.state.section).guitar.intensity).toBe(0);
  session.dispose();
});
it("clears history on configuration revision and never emits unavailable events", () => {
  const c = new AudioConnection();
  c.accept(packet(100), 100);
  const next = packet(200, 2);
  next.revision = 2;
  next.fresh = false;
  next.actual = null;
  c.accept(next, 200);
  expect(c.history).toHaveLength(1);
  expect(c.history[0].events).toEqual([]);
  expect(c.getSnapshot().available).toBe(false);
});
it("bounds buffers, ignores duplicate sequences and clears old streams", () => {
  const connection = new AudioConnection();
  for (let n = 1; n <= 1000; n++) connection.accept(packet(n * 34, n), n * 34);
  expect(connection.history.length).toBe(250);
  connection.accept(packet(34000, 1000), 34000);
  expect(connection.history.length).toBe(250);
  const next = packet(34034);
  next.streamId = "restarted";
  connection.accept(next, 34034);
  expect(connection.history).toHaveLength(1);
  expect(connection.history[0].packet.streamId).toBe("restarted");
});
it("live clock advances independently of paused demo transport", () => {
  const session = new Session(false);
  expect(session.time()).toBe(0);
  session.update({ mode: "live" });
  expect(session.time()).toBeGreaterThan(1e12);
  session.update({ mode: "demo" });
  expect(session.time()).toBe(0);
  session.dispose();
});

it("migrates legacy settings without guessing mix channels", () => {
  expect(
    migrateConfig({
      device: { name: "Old", hostApi: "Core Audio" },
      instruments: {},
    }),
  ).toEqual(emptyConfig());
  const { layers, calibration, displayProfile, ...legacy } = new Session(false)
    .state;
  expect(validState(upgradeState(legacy))).toBe(true);
});
it("mixed geometry stays bounded, silent without input, and responds to layer controls", () => {
  const s = new Session(false);
  s.update({ mode: "live", layers: defaultLayers(), reduced: true });
  let active = true;
  const source = {
    frame: () => ({}) as never,
    events: () => [],
    mixed: (time: number) =>
      active
        ? {
            feature: packet(time).mix,
            events: [{ timestamp: time, intensity: 0.7 }],
          }
        : null,
  };
  const model = new MixedChoreography(source);
  for (let t = 1000; t < 5000; t += 34)
    model.update(t, s.state, 4416, 680, {}, 1);
  const frame = model.update(5010, s.state, 4416, 680, {}, 1);
  expect(frame.energy).toBeGreaterThan(0.5);
  expect(frame.pathCount).toBeLessThanOrEqual(256);
  expect(frame.lightCount).toBeLessThanOrEqual(1200);
  for (const p of frame.paths.slice(0, frame.pathCount)) {
    expect(p.alpha).toBeGreaterThanOrEqual(0);
    expect(p.alpha).toBeLessThanOrEqual(1);
    expect(
      Array.from(p.points.slice(0, p.count * 2)).every(Number.isFinite),
    ).toBe(true);
  }
  s.update({ layers: { currents: 0, lines: 0, filaments: 0, blooms: 0 } });
  expect(model.update(5044, s.state, 4416, 680, {}, 1).pathCount).toBe(0);
  active = false;
  for (let t = 5100; t < 8100; t += 34)
    model.update(t, s.state, 4416, 680, {}, 1);
  expect(model.update(8100, s.state, 4416, 680, {}, 1).energy).toBeLessThan(
    0.02, // 800 ms release preserves phrase continuity rather than snapping to black.
  );
  for (let t = 8134; t <= 12010; t += 34)
    model.update(t, s.state, 4416, 680, {}, 1);
  expect(model.update(12020, s.state, 4416, 680, {}, 1).energy).toBeLessThan(
    0.001,
  );
  s.dispose();
});

it("accepts optional capture-age diagnostics and validates mono microphone frames", () => {
  const p = packet(100);
  p.config = {
    ...emptyConfig(),
    device: { name: "MacBook Pro Microphone", hostApi: "Core Audio" },
    channels: [1],
  };
  p.actual = { sampleRate: p.sampleRate, captureChannels: 1, channels: [1] };
  p.meters = [p.meters[0]];
  p.health.captureAgeMs = 3;
  expect(validPacket(p)).toBe(true);
  p.health.captureAgeMs = null;
  expect(validPacket(p)).toBe(true);
  p.health.captureAgeMs = -1;
  expect(validPacket(p)).toBe(false);
  p.health.captureAgeMs = Infinity;
  expect(validPacket(p)).toBe(false);
});

it("accepts the 2424 display profile through settings serialization while retaining legacy defaults", () => {
  const session = new Session(false);
  expect(session.state.displayProfile).toBe("responsive");
  session.update({ displayProfile: "venue-2424" });
  expect(validState(JSON.parse(JSON.stringify(session.state)))).toBe(true);
  expect(session.state.displayProfile).toBe("venue-2424");
  expect(validState({ ...session.state, displayProfile: "venue" })).toBe(true);
  expect(validState({ ...session.state, displayProfile: "unknown" })).toBe(
    false,
  );
  const { displayProfile, ...legacy } = session.state;
  expect((upgradeState(legacy) as typeof session.state).displayProfile).toBe(
    "responsive",
  );
  session.dispose();
});

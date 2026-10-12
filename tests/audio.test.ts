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
import { instruments } from "../src/engine/types";
afterAll(() => concert.dispose());
function packet(timestamp: number, sequence = 1): AudioPacket {
  const config = emptyConfig();
  config.instruments.guitar.channels = [11];
  return {
    v: 1,
    type: "features",
    streamId: "fixture",
    sequence,
    timestamp,
    revision: 1,
    config,
    status: "fixture",
    error: "",
    fresh: true,
    sampleRate: 48000,
    meters: Array.from({ length: 32 }, () => ({
      rms: 0.1,
      peak: 0.2,
      db: -20,
      clip: false,
    })),
    instruments: Object.fromEntries(
      instruments.map((i) => [
        i,
        {
          intensity: i === "guitar" ? 0.7 : 0,
          bands: [0.1, 0.8, 0.1],
          spectrum: Array(32).fill(0.1),
          pitch: i === "guitar" ? 69 : null,
          confidence: 0.9,
          centroid: 440,
        },
      ]),
    ) as AudioPacket["instruments"],
    events: [
      { instrument: "guitar", timestamp, intensity: 0.7, articulation: null },
    ],
    health: { overflows: 0, dropped: 0, processingMs: 0 },
  };
}
it("rejects invalid frames and assignments before they reach rendering", () => {
  const p = packet(100);
  expect(validPacket(p)).toBe(true);
  expect(validPacket({ ...p, meters: [] })).toBe(false);
  expect(validPacket({ ...p, sequence: NaN })).toBe(false);
  p.instruments.guitar.spectrum[2] = Infinity;
  expect(validPacket(p)).toBe(false);
  const c = emptyConfig();
  c.instruments.drums.channels = [11, 12, 13];
  expect(validConfig(c)).toBe(true);
  c.instruments.drums.channels.push(33);
  expect(validConfig(c)).toBe(false);
});
it("independent render sources receive the same events and silence replaces old levels", () => {
  const session = new Session(false);
  session.update({ mode: "live" });
  const connection = new AudioConnection();
  const a = new ConcertSource(session, connection),
    b = new ConcertSource(session, connection);
  a.frame(1000, session.state.section);
  b.frame(1000, session.state.section);
  connection.accept(packet(1010), 1010);
  expect(a.frame(1020, session.state.section).guitar.intensity).toBe(0.7);
  expect(a.events(1000, 1020, session.state.section, 0)).toEqual(
    b.events(1000, 1020, session.state.section, 0),
  );
  expect(a.events(1000, 1020, session.state.section, 0)).toHaveLength(1);
  expect(a.frame(1600, session.state.section).guitar.intensity).toBe(0);
  const silent = packet(1610, 2);
  silent.instruments.guitar.intensity = 0;
  silent.events = [];
  connection.accept(silent, 1610);
  expect(a.frame(1620, session.state.section).guitar.intensity).toBe(0);
  session.update({ mode: "standby" });
  expect(a.events(1600, 1700, session.state.section, 0)).toEqual([]);
  expect(a.frame(1700, session.state.section).guitar.intensity).toBe(0);
  session.dispose();
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

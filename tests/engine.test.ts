import { afterAll, describe, expect, it, vi } from "vitest";
import { eventsBetween, demoCaption } from "../src/engine/music";
import { instruments, validEvent, visibleChannel } from "../src/engine/types";
import { concert, Session, type Transport } from "../src/engine/session";
import { EventSource } from "../src/engine/source";
afterAll(() => concert.dispose());
describe("musical score", () => {
  it("is deterministic and retains each instrument through a full phrase", () => {
    const a = eventsBetween(-1, 10000, "Chorus");
    expect(a).toEqual(eventsBetween(-1, 10000, "Chorus"));
    expect(new Set(a.map((e) => e.instrument))).toEqual(new Set(instruments));
    expect(a.every(validEvent)).toBe(true);
  });
  it("never doubles an onset when frames meet", () => {
    const a = eventsBetween(-1, 1250, "Chorus");
    const b = eventsBetween(1250, 2500, "Chorus");
    expect([...a, ...b]).toEqual(eventsBetween(-1, 2500, "Chorus"));
  });
  it("makes chorus heavier and solo guitar more active", () => {
    const quiet = eventsBetween(-1, 10000, "Quiet Section");
    const chorus = eventsBetween(-1, 10000, "Chorus");
    expect(chorus.reduce((n, e) => n + e.intensity, 0)).toBeGreaterThan(
      quiet.reduce((n, e) => n + e.intensity, 0) * 2,
    );
    expect(
      eventsBetween(-1, 10000, "Guitar Solo").filter(
        (e) => e.instrument === "guitar",
      ).length,
    ).toBeGreaterThan(chorus.filter((e) => e.instrument === "guitar").length);
    expect(
      new Set(
        eventsBetween(-1, 5000, "Drum Breakdown")
          .filter((e) => e.instrument === "drums")
          .map((e) => e.articulation),
      ).size,
    ).toBe(3);
  });
  it("bounds catch-up work after an inactive tab resumes", () => {
    expect(eventsBetween(0, 3600000, "Chorus").length).toBeLessThan(512);
  });
  it("supports spoken, lyric and non-speech demo cues", () => {
    expect(demoCaption(0, "Chorus")?.category).toBe("speech");
    expect(demoCaption(5000, "Chorus")?.category).toBe("lyrics");
    expect(demoCaption(5000, "Drum Breakdown")?.category).toBe("sound");
  });
  it("rejects malformed external events and bounds its queue", () => {
    const source = new EventSource();
    expect(
      source.push({ instrument: "vocals", intensity: NaN, timestamp: 5 }),
    ).toBe(false);
    expect(
      source.push({
        instrument: "vocals",
        intensity: 0.5,
        timestamp: 5,
        pitch: Infinity,
      }),
    ).toBe(false);
    for (let n = 0; n < 700; n++)
      source.push({
        instrument: "piano",
        timestamp: n,
        intensity: 0.5,
        pitch: 60,
      });
    expect(source.events(-1, 1000)).toHaveLength(512);
  });
});
describe("session controls", () => {
  it("freezes the timeline on pause and resumes without a jump", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const s = new Session(false);
    s.play(true);
    vi.advanceTimersByTime(2000);
    expect(s.time()).toBe(2000);
    s.play(false);
    vi.advanceTimersByTime(3000);
    expect(s.time()).toBe(2000);
    s.play(true);
    vi.advanceTimersByTime(500);
    expect(s.time()).toBe(2500);
    s.dispose();
    vi.useRealTimers();
  });
  it("lets multiple solos coexist while mute wins", () => {
    const s = new Session(false);
    s.update({
      channels: {
        ...s.state.channels,
        vocals: { mute: false, solo: true },
        guitar: { mute: true, solo: true },
      },
    });
    expect(visibleChannel(s.state, "vocals")).toBe(true);
    expect(visibleChannel(s.state, "guitar")).toBe(false);
    expect(visibleChannel(s.state, "bass")).toBe(false);
  });
  it("holds manual Unicode cues until cleared or restored", () => {
    const s = new Session(false);
    s.cue({
      speaker: "MAYA",
      category: "speech",
      text: "Selamat datang — kita bersama.",
    });
    expect(s.state.captionMode).toBe("manual");
    s.section("Chorus");
    expect(s.state.manual?.text).toContain("Selamat datang");
    s.update({ manual: null, captionMode: "manual" });
    expect(s.state.manual).toBeNull();
  });
  it("synchronizes state and late joins, and ignores malformed snapshots", () => {
    const listeners = new Set<(m: unknown) => void>();
    const transport = (): Transport => ({
      send: (m) => listeners.forEach((fn) => fn(m)),
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      close: () => {},
    });
    const a = new Session(true, transport());
    a.update({ scene: "Guitar Focus", intensity: 0.3 });
    const b = new Session(true, transport());
    expect(b.state.scene).toBe("Guitar Focus");
    a.cue({
      speaker: "Maya",
      category: "lyrics",
      text: "We’re brighter together.",
    });
    expect(b.state.manual?.text).toBe("We’re brighter together.");
    transport().send({
      v: 1,
      kind: "state",
      source: "bad",
      role: "operator",
      claimed: 0,
      revision: Date.now() + 10000,
      state: {},
    });
    expect(b.state.scene).toBe("Guitar Focus");
    a.dispose();
    b.dispose();
  });
});

it("rejects oversized manual captions at the state boundary", () => {
  const s = new Session(false);
  s.cue({ speaker: "Maya", category: "speech", text: "音".repeat(181) });
  expect(s.state.manual).toBeNull();
  s.cue({ speaker: "Maya", category: "speech", text: "音".repeat(180) });
  expect(s.state.manual?.text.length).toBe(180);
});

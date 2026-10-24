import { afterAll, expect, it } from "vitest";
import { MixedChoreography } from "../src/engine/mixed";
import { OriginalChoreography } from "../src/engine/original";
import { LIMITS, type ScoreFrame } from "../src/engine/choreography";
import {
  Session,
  concert,
  validState,
  upgradeState,
} from "../src/engine/session";
import { colors, type SessionState } from "../src/engine/types";
import type { MixFeature } from "../src/engine/audio";
import type { MusicSource } from "../src/engine/source";
afterAll(() => concert.dispose());
const feature = (bands = [0.8, 0.6, 0.5]): MixFeature => ({
  active: true,
  rms: 0.1,
  peak: 0.3,
  intensity: 0.8,
  bands,
  spectrum: Array(32).fill(0.4),
  centroid: 3000,
  flux: 0.4,
  shortEnergy: 0.8,
  longEnergy: 0.8,
  dynamics: 0,
});
function setup() {
  const session = new Session(false);
  const state: SessionState = {
    ...session.state,
    mode: "live",
    liveChoreography: "original",
    reduced: false,
  };
  session.dispose();
  let value: MixFeature | null = feature();
  let onset = false;
  const source: MusicSource = {
    frame: () => {
      throw Error("Instrument frame accessed");
    },
    events: () => {
      throw Error("Instrument events accessed");
    },
    mixed: (time, from) =>
      value
        ? {
            feature: value,
            events:
              onset && time > from ? [{ timestamp: time, intensity: 0.8 }] : [],
          }
        : null,
  };
  const model = new OriginalChoreography(source);
  return {
    state,
    source,
    model,
    set: (v: MixFeature | null) => {
      value = v;
    },
    onset: (v: boolean) => {
      onset = v;
    },
    render: (t: number) => model.update(t, state, 4416, 896, {}, 1),
  };
}
const paths = (f: ScoreFrame) => f.paths.slice(0, f.pathCount);
const shape = (f: ScoreFrame, color: string) =>
  Array.from(
    paths(f).find((p) => p.color === parseInt(color.slice(1), 16))!.points,
  );

it("accepts Original snapshots and retains the Current legacy default", () => {
  const { state } = setup();
  expect(validState(state)).toBe(true);
  const legacy = { ...state } as Partial<SessionState>;
  delete legacy.liveChoreography;
  expect((upgradeState(legacy) as SessionState).liveChoreography).toBe(
    "current",
  );
});
it("renders all six original shape families from one measured mix and expires gestures", () => {
  const s = setup();
  s.render(0);
  s.onset(true);
  for (let t = 50; t <= 2000; t += 50) s.render(t);
  const palette = new Set(paths(s.render(2050)).map((p) => p.color));
  for (const color of Object.values(colors))
    expect(palette.has(parseInt(color.slice(1), 16))).toBe(true);
  s.onset(false);
  for (let t = 2100; t <= 8500; t += 50) s.render(t);
  expect(s.model.metrics.chords).toBe(0);
  expect(s.model.metrics.pressures).toBe(0);
  expect(paths(s.render(8550)).some((p) => p.color === 0xc4a5ff)).toBe(false);
});
it("maps lows to currents and mids to lines independently", () => {
  const low = setup(),
    mid = setup();
  low.set(feature([1, 0, 0]));
  mid.set(feature([0, 1, 0]));
  for (let t = 0; t <= 3000; t += 50) {
    low.render(t);
    mid.render(t);
  }
  const alpha = (s: ReturnType<typeof setup>, color: string) =>
    Math.max(
      ...paths(s.render(3050))
        .filter((p) => p.color === parseInt(color.slice(1), 16))
        .map((p) => p.alpha),
    );
  expect(alpha(low, colors.bass)).toBeGreaterThan(alpha(mid, colors.bass));
  expect(alpha(mid, colors.vocals)).toBeGreaterThan(alpha(low, colors.vocals));
});
it("releases transients within 600ms on absent input and Standby and never invents events", () => {
  for (const standby of [true, false]) {
    const s = setup();
    s.render(0);
    s.onset(true);
    for (let t = 50; t <= 1000; t += 50) s.render(t);
    expect(s.model.metrics.chords).toBeGreaterThan(0);
    if (standby) s.state.mode = "standby";
    else s.set(null);
    s.render(1050);
    const a = shape(s.render(1100), colors.saxophone);
    for (let t = 1150; t <= 1750; t += 50) s.render(t);
    expect(
      shape(s.render(1800), colors.saxophone).filter((_, i) => i % 2 === 0),
    ).toEqual(a.filter((_, i) => i % 2 === 0));
    expect(s.model.metrics.chords).toBe(0);
    expect(s.model.metrics.pressures).toBe(0);
    s.state.mode = "live";
    s.set(feature());
    s.onset(false);
    s.render(1850);
    expect(s.model.metrics.chords).toBe(0);
  }
});
it("keeps reduced-motion primary geometry fixed while features change", () => {
  const s = setup();
  s.state.reduced = true;
  for (let t = 0; t <= 2000; t += 50) s.render(t);
  const before = [
    colors.vocals,
    colors.guitar,
    colors.bass,
    colors.saxophone,
  ].map((c) => shape(s.render(2050), c));
  s.set({ ...feature([0.1, 1, 0.9]), centroid: 11000, flux: 1 });
  for (let t = 2100; t <= 4000; t += 50) s.render(t);
  expect(
    [colors.vocals, colors.guitar, colors.bass, colors.saxophone].map((c) =>
      shape(s.render(4050), c),
    ),
  ).toEqual(before);
});
it("obeys layer controls, high contrast and geometry/light budgets at every target size", () => {
  for (const [w, h] of [
    [4416, 896],
    [900, 182],
    [320, 500],
  ]) {
    const s = setup();
    s.onset(true);
    for (let t = 0; t <= 2000; t += 50) {
      const f = s.model.update(
        t,
        s.state,
        w,
        h,
        { profile: "preview", highContrast: true },
        0.35,
      );
      expect(f.pathCount).toBeLessThanOrEqual(LIMITS.paths);
      expect(f.lightCount).toBeLessThanOrEqual(60);
      for (const p of paths(f)) {
        expect(p.color).toBe(0xffffff);
        expect(p.count).toBeLessThanOrEqual(LIMITS.points);
        expect(
          Array.from(p.points.slice(0, p.count * 2)).every(Number.isFinite),
        ).toBe(true);
      }
    }
    s.state.layers = { currents: 0, lines: 0, filaments: 0, blooms: 0 };
    const empty = s.render(2050);
    expect(empty.pathCount).toBe(0);
    expect(empty.lightCount).toBe(0);
  }
});
it("clears Original history after switching away and back", () => {
  const s = setup(),
    model = new MixedChoreography(s.source);
  model.update(0, s.state, 4416, 896, {}, 1);
  s.onset(true);
  for (let t = 50; t <= 1000; t += 50)
    model.update(t, s.state, 4416, 896, {}, 1);
  model.update(
    1050,
    { ...s.state, liveChoreography: "current" },
    4416,
    896,
    {},
    1,
  );
  s.onset(false);
  const f = model.update(1100, s.state, 4416, 896, {}, 1);
  expect(
    paths(f).some((p) => p.color === 0xc4a5ff || p.color === 0xffd84d),
  ).toBe(false);
});

it("keeps reduced-motion ring and bloom event points stationary throughout their fade", () => {
  const s = setup();
  s.state.reduced = true;
  for (let t = 0; t <= 1000; t += 50) s.render(t);
  s.onset(true);
  s.render(1050);
  s.onset(false);
  const snapshot = (t: number) =>
    paths(s.render(t))
      .filter((p) => p.color === 0xffd84d || p.color === 0xc4a5ff)
      .map((p) => Array.from(p.points.slice(0, p.count * 2)));
  const before = snapshot(1100);
  expect(before.length).toBeGreaterThan(0);
  expect(snapshot(1600)).toEqual(before);
});
it("allows high filaments independently of mid lines", () => {
  const s = setup();
  s.state.particles = 0;
  s.state.layers = { currents: 0, lines: 0, filaments: 1, blooms: 0 };
  for (let t = 0; t <= 1000; t += 50) s.render(t);
  s.onset(true);
  s.render(1050);
  s.onset(false);
  expect(s.render(1100).pathCount).toBeGreaterThan(0);
  s.state.layers.filaments = 0;
  expect(s.render(1150).pathCount).toBe(0);
});

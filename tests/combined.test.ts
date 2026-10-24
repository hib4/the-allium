import { afterAll, expect, it } from "vitest";
import { MixedChoreography } from "../src/engine/mixed";
import { LIMITS, type ScoreFrame } from "../src/engine/choreography";
import {
  Session,
  concert,
  validState,
  upgradeState,
} from "../src/engine/session";
import type { SessionState } from "../src/engine/types";
import type { MixFeature } from "../src/engine/audio";
import type { MusicSource } from "../src/engine/source";
import { compareRegressions } from "../scripts/visual-regressions.mjs";
afterAll(() => concert.dispose());
const feature = (intensity = 0.8): MixFeature => ({
  active: true,
  rms: 0.1,
  peak: 0.3,
  intensity,
  bands: [intensity * 0.8, intensity * 0.7, intensity * 0.6],
  spectrum: Array(32).fill(intensity * 0.5),
  centroid: 2800,
  flux: 0.4,
  shortEnergy: intensity,
  longEnergy: intensity,
  dynamics: 0,
});
function setup(variant: "original" | "combined" = "combined") {
  const session = new Session(false);
  const state: SessionState = {
    ...session.state,
    mode: "live",
    liveChoreography: variant,
    reduced: false,
  };
  session.dispose();
  let value: MixFeature | null = feature(),
    onset = false,
    calls = 0,
    onsetStrength = 0.8;
  const source: MusicSource = {
    frame: () => {
      throw Error("Demo frame accessed");
    },
    events: () => {
      throw Error("Demo events accessed");
    },
    mixed: (time, from) => {
      calls++;
      return value
        ? {
            feature: value,
            events:
              onset && time > from
                ? [{ timestamp: time, intensity: onsetStrength }]
                : [],
          }
        : null;
    },
  };
  const model = new MixedChoreography(source);
  return {
    state,
    model,
    set: (v: MixFeature | null) => {
      value = v;
    },
    onset: (v: boolean) => {
      onset = v;
    },
    eventStrength: (v: number) => {
      onsetStrength = v;
    },
    calls: () => calls,
    render: (time: number) => model.update(time, state, 4416, 896, {}, 1),
  };
}
const paths = (f: ScoreFrame) => f.paths.slice(0, f.pathCount);
const coords = (f: ScoreFrame) =>
  paths(f).map((p) => ({
    color: p.color,
    count: p.count,
    points: Array.from(p.points.slice(0, p.count * 2)),
  }));
it("keeps Current as the default and accepts the synchronized Combined selection", () => {
  const s = setup();
  expect(validState(s.state)).toBe(true);
  const legacy = { ...s.state } as Partial<SessionState>;
  delete legacy.liveChoreography;
  expect((upgradeState(legacy) as SessionState).liveChoreography).toBe(
    "current",
  );
});
it("matches Original contour coordinates, positions, motion and event lifetimes exactly", () => {
  const original = setup("original"),
    combined = setup();
  for (let t = 0; t <= 8000; t += 50) {
    original.onset(t >= 1000 && t < 1500);
    combined.onset(t >= 1000 && t < 1500);
    if (t === 3000) {
      original.set(feature(0.2));
      combined.set(feature(0.2));
    }
    const a = original.render(t),
      b = combined.render(t);
    expect(coords(b)).toEqual(coords(a));
    expect(combined.model.metrics.original?.chords).toBe(
      original.model.metrics.original?.chords,
    );
    expect(combined.model.metrics.original?.pressures).toBe(
      original.model.metrics.original?.pressures,
    );
  }
  expect(combined.calls()).toBe(161);
  expect(combined.model.metrics.original?.chords).toBe(0);
});
it("adds luminosity and body while increasing quiet-to-loud contrast", () => {
  const sample = (variant: "original" | "combined", intensity: number) => {
    const s = setup(variant);
    s.set(feature(intensity));
    for (let t = 0; t <= 4000; t += 50) s.render(t);
    const f = s.render(4050);
    const p = paths(f).find((p) => p.color === 0xff3ebb && !p.soft)!;
    return { alpha: p.alpha, width: p.width };
  };
  const quiet = sample("original", 0.02),
    loud = sample("original", 0.85),
    cq = sample("combined", 0.02),
    cl = sample("combined", 0.85);
  expect(cl.alpha).toBeGreaterThan(loud.alpha);
  expect(cl.width).toBeGreaterThan(loud.width);
  expect(cl.alpha / cq.alpha).toBeGreaterThan(loud.alpha / quiet.alpha);
});
it("retains Original's six-second blooms and clears events on absent input or Standby", () => {
  const s = setup();
  s.render(0);
  s.onset(true);
  s.render(50);
  s.onset(false);
  for (let t = 100; t <= 3500; t += 50) s.render(t);
  expect(s.model.metrics.original?.chords).toBe(1);
  for (let t = 3550; t <= 6200; t += 50) s.render(t);
  expect(s.model.metrics.original?.chords).toBe(0);
  for (const standby of [false, true]) {
    const a = setup();
    a.render(0);
    a.onset(true);
    a.render(50);
    a.onset(false);
    if (standby) a.state.mode = "standby";
    else a.set(null);
    for (let t = 100; t <= 750; t += 50) a.render(t);
    expect(a.model.metrics.original?.chords).toBe(0);
    expect(a.model.metrics.original?.pressures).toBe(0);
  }
});
it("keeps reduced-motion contours and event points stationary under changing sound", () => {
  const s = setup();
  s.state.reduced = true;
  for (let t = 0; t <= 1000; t += 50) s.render(t);
  s.onset(true);
  s.render(1050);
  s.onset(false);
  const snapshot = (t: number) => coords(s.render(t));
  const a = snapshot(1100);
  s.set({ ...feature(0.95), centroid: 10000, flux: 0.9 });
  for (let t = 1150; t <= 1600; t += 50) s.render(t);
  expect(snapshot(1650)).toEqual(a);
});
it("preserves controls, contrast, finite geometry and budgets across sizes and quality", () => {
  for (const [w, h] of [
    [4416, 896],
    [900, 182],
    [320, 500],
  ])
    for (const q of [1, 0.35]) {
      const s = setup();
      s.onset(true);
      for (let t = 0; t <= 3000; t += 50) {
        const f = s.model.update(
          t,
          s.state,
          w,
          h,
          { highContrast: true, profile: "preview" },
          q,
        );
        expect(f.pathCount).toBeLessThanOrEqual(LIMITS.paths);
        expect(f.lightCount).toBeLessThanOrEqual(60);
        for (const p of paths(f)) {
          expect(p.color).toBe(0xffffff);
          expect(p.count).toBeLessThanOrEqual(160);
          expect(
            Array.from(p.points.slice(0, p.count * 2)).every(Number.isFinite),
          ).toBe(true);
        }
      }
      s.state.layers = { currents: 0, lines: 0, filaments: 0, blooms: 0 };
      const empty = s.render(3050);
      expect(empty.pathCount).toBe(0);
      expect(empty.lightCount).toBe(0);
    }
});
it("clears stale gestures when switching between Original and Combined", () => {
  const s = setup();
  s.render(0);
  s.onset(true);
  s.render(50);
  expect(s.model.metrics.original?.chords).toBe(1);
  s.onset(false);
  s.state.liveChoreography = "original";
  s.render(100);
  expect(s.model.metrics.original?.chords).toBe(0);
  s.state.liveChoreography = "combined";
  s.render(150);
  expect(s.model.metrics.original?.chords).toBe(0);
});
it("reports every selected variant against Current regardless of order, including single selections", () => {
  const row = (variant: string, p95: number, requestedBackend = "webgl") => ({
    variant,
    p95,
    requestedBackend,
  });
  const r = compareRegressions([
    row("combined", 12),
    row("original", 10.5),
    row("current", 10),
    row("living", 10.2),
    row("current", 20, "canvas"),
    row("combined", 21, "canvas"),
  ]);
  expect(r).toHaveLength(4);
  expect(
    r.find((r) => r.variant === "combined" && r.backend === "webgl")
      ?.withinTenPercent,
  ).toBe(false);
  expect(compareRegressions([row("combined", 10)])).toEqual([]);
  expect(compareRegressions([row("current", 10)])).toEqual([]);
});

it("lifts quiet/moderate audio and attacks faster without raising the ceiling", () => {
  for (const variant of ["original", "combined"] as const) {
    const s = setup(variant);
    s.set(feature(0.1));
    s.render(0);
    const frame = s.render(100);
    const oldResponse = 0.1 * (1 - Math.exp(-116 / 180));
    expect(frame.energy).toBeGreaterThan(oldResponse * 1.5);
    s.set(feature(1));
    for (let t = 150; t <= 3000; t += 50) s.render(t);
    expect(s.render(3050).energy).toBeCloseTo(1, 4);
    expect(s.render(3100).energy).toBeLessThanOrEqual(1);
  }
});
it("accepts softer attacks at 0.30, rejects weaker/duplicate attacks and preserves event expiry", () => {
  for (const variant of ["original", "combined"] as const) {
    const s = setup(variant);
    s.render(0);
    s.onset(true);
    s.eventStrength(0.299);
    s.render(50);
    expect(s.model.metrics.original?.chords).toBe(0);
    s.eventStrength(0.3);
    const hit = s.render(100);
    expect(s.model.metrics.original?.chords).toBe(1);
    expect(s.model.metrics.original?.pressures).toBe(1);
    // Lifted 0.30 also clears the original blue-attack articulation threshold.
    expect(paths(hit).some((p) => p.color === 0x6eb4ff && p.count === 12)).toBe(
      true,
    );
    s.render(150);
    expect(s.model.metrics.original?.chords).toBe(1);
    s.onset(false);
    for (let t = 200; t <= 2550; t += 50) s.render(t);
    expect(s.model.metrics.original?.pressures).toBe(0);
    expect(s.model.metrics.original?.chords).toBe(1);
    for (let t = 2600; t <= 6250; t += 50) s.render(t);
    expect(s.model.metrics.original?.chords).toBe(0);
  }
});
it("never activates events from silent gated input even with strong queued onsets", () => {
  for (const variant of ["original", "combined"] as const) {
    const s = setup(variant);
    s.set({ ...feature(0), active: false });
    s.onset(true);
    for (let t = 0; t <= 3000; t += 50) s.render(t);
    expect(s.render(3050).energy).toBe(0);
    expect(s.model.metrics.original?.chords).toBe(0);
    expect(s.model.metrics.original?.pressures).toBe(0);
  }
});

const pianoPaths = (f: ScoreFrame) =>
  paths(f).filter((p) => p.color === 0xc4a5ff);
const petalSpan = (f: ScoreFrame) => {
  const ys = pianoPaths(f)
    .filter((p) => p.count === 28)
    .flatMap((p) =>
      Array.from(p.points.slice(0, p.count * 2)).filter((_, i) => i % 2 === 1),
    );
  return Math.max(...ys) - Math.min(...ys);
};
it("reveals piano blooms early and keeps a short soft attack visible through its fade", () => {
  for (const variant of ["original", "combined"] as const) {
    const s = setup(variant);
    s.eventStrength(0.3);
    for (let t = 0; t <= 500; t += 50) s.render(t);
    s.onset(true);
    s.render(550);
    s.onset(false);
    for (let t = 600; t <= 850; t += 50) s.render(t);
    const earlySpan = petalSpan(s.render(900));
    s.set(feature(0.01));
    for (let t = 950; t <= 1800; t += 50) s.render(t);
    const f = s.render(1850),
      petals = pianoPaths(f).filter((p) => p.count === 28);
    expect(petals.length).toBeGreaterThan(0);
    expect(earlySpan).toBeGreaterThan(petalSpan(f) * 0.95);
    expect(Math.max(...petals.map((p) => p.alpha))).toBeGreaterThan(0.1);
    expect(Math.max(...petals.map((p) => p.width))).toBeGreaterThan(3);
    for (let t = 1900; t <= 6700; t += 50) s.render(t);
    expect(pianoPaths(s.render(6750))).toHaveLength(0);
  }
});
it("uses proportional readable piano markers without enlarging the flower form", () => {
  const marker = (height: number) => {
    const s = setup();
    s.render(0);
    s.onset(true);
    s.render(50);
    s.onset(false);
    let f: ScoreFrame;
    for (let t = 100; t <= 800; t += 50)
      f = s.model.update(t, s.state, 4416, height, {}, 1);
    const p = pianoPaths(f!).find((p) => p.count === 5)!;
    return {
      width: p.width,
      halfSize: Math.abs(p.points[2] - p.points[0]),
      ratio: petalSpan(f!) / height,
    };
  };
  const small = marker(448),
    large = marker(896);
  expect(large.halfSize / small.halfSize).toBeCloseTo(2, 3);
  expect(large.width / small.width).toBeCloseTo(2, 3);
  expect(large.ratio).toBeCloseTo(small.ratio, 2);
});
it("holds piano geometry stationary at zero Motion while sound levels fall", () => {
  for (const variant of ["original", "combined"] as const) {
    const s = setup(variant);
    s.state.motion = 0;
    for (let t = 0; t <= 500; t += 50) s.render(t);
    s.onset(true);
    s.render(550);
    s.onset(false);
    const first = pianoPaths(s.render(700)).map((p) =>
      Array.from(p.points.slice(0, p.count * 2)),
    );
    expect(first.length).toBeGreaterThan(0);
    s.set(feature(0.01));
    for (let t = 750; t <= 1500; t += 50) s.render(t);
    expect(
      pianoPaths(s.render(1550)).map((p) =>
        Array.from(p.points.slice(0, p.count * 2)),
      ),
    ).toEqual(first);
  }
});

import { afterAll, expect, it } from "vitest";
import { MixedChoreography } from "../src/engine/mixed";
import { LIMITS, type ScoreFrame } from "../src/engine/choreography";
import { Session, concert } from "../src/engine/session";
import { defaultLayers } from "../src/engine/types";
import type { MixFeature } from "../src/engine/audio";
import type { MusicSource } from "../src/engine/source";
afterAll(() => concert.dispose());
const feature = (value: Partial<MixFeature> = {}): MixFeature => ({
  rms: 0.1,
  peak: 0.3,
  active: true,
  intensity: 0.6,
  bands: [0.3, 0.4, 0.2],
  spectrum: Array(32).fill(0.1),
  centroid: 2200,
  flux: 0.1,
  shortEnergy: 0.4,
  longEnergy: 0.3,
  dynamics: 0.1,
  ...value,
});
const session = new Session(false);
session.update({
  mode: "live",
  scene: "Ensemble",
  intensity: 1,
  particles: 1,
  motion: 1,
  reduced: false,
  layers: defaultLayers(),
});
afterAll(() => session.dispose());
const state = () => structuredClone(session.state);
const snap = (f: ScoreFrame) =>
  f.paths.slice(0, f.pathCount).map((p) => ({
    points: Array.from(p.points.slice(0, p.count * 2)),
    width: p.width,
    alpha: p.alpha,
    color: p.color,
    widths: p.variableWidth ? Array.from(p.widths!.slice(0, p.count)) : null,
  }));
function setup(f: MixFeature | null = feature(), onsets = false) {
  let value = f;
  const source: MusicSource = {
    frame: () => ({}) as never,
    events: () => [],
    mixed: (time, from) =>
      value
        ? {
            feature: value,
            events:
              onsets && time > from
                ? [{ timestamp: time, intensity: 0.8 }]
                : [],
          }
        : null,
  };
  const model = new MixedChoreography(source);
  return {
    model,
    set: (next: MixFeature | null) => {
      value = next;
    },
  };
}
function settle(
  model: MixedChoreography,
  s = state(),
  quality = 1,
  width = 4416,
  height = 680,
) {
  for (let t = 0; t <= 3000; t += 50)
    model.update(t, s, width, height, {}, quality);
  return model.update(3050, s, width, height, {}, quality);
}
it("builds richer, larger compositions as measured intensity increases", () => {
  const frames = [0.03, 0.4, 0.95].map((intensity) => {
    const { model } = setup(
      feature({ intensity, bands: [intensity, intensity, intensity] }),
    );
    return structuredClone(settle(model));
  });
  expect(frames.map((f) => f.energy)).toEqual(
    [...frames.map((f) => f.energy)].sort((a, b) => a - b),
  );
  expect(frames[2].pathCount).toBeGreaterThan(frames[0].pathCount);
  expect(frames[2].paths[0].width).toBeGreaterThan(frames[0].paths[0].width);
  expect(frames[2].paths[0].alpha).toBeGreaterThan(frames[0].paths[0].alpha);
});
it("maps low/mid/high energy to distinct geometry and spectral changes to detail", () => {
  const render = (f: MixFeature) => {
    const { model } = setup(f);
    return snap(settle(model));
  };
  const low = render(feature({ bands: [0.9, 0, 0] }));
  const mid = render(feature({ bands: [0, 0.9, 0] }));
  const high = render(feature({ bands: [0, 0, 0.9] }));
  expect(low).not.toEqual(mid);
  expect(mid).not.toEqual(high);
  expect(
    render(
      feature({ centroid: 9000, flux: 0.9, spectrum: Array(32).fill(0.8) }),
    ),
  ).not.toEqual(render(feature()));
});
it("uses tapered, nonparallel contours and spreads focal light across the panorama", () => {
  const { model } = setup();
  const f = settle(model);
  const ribbons = f.paths.slice(0, f.pathCount).filter((p) => p.variableWidth);
  expect(ribbons.length).toBeGreaterThan(3);
  expect(
    Math.min(...ribbons[0].widths!.slice(0, ribbons[0].count)),
  ).toBeLessThan(0.1);
  expect(
    Math.max(...ribbons[0].widths!.slice(0, ribbons[0].count)),
  ).toBeGreaterThan(0.5);
  for (let region = 0; region < 3; region++)
    expect(
      f.lights
        .slice(0, f.lightCount)
        .some((l) => l.x / 4416 >= region / 3 && l.x / 4416 < (region + 1) / 3),
    ).toBe(true);
  // Independent routes cross vertically rather than staying in stacked lanes.
  const a = ribbons[0],
    b = ribbons[4];
  const differences = Array.from(
    { length: a.count },
    (_, i) => a.points[i * 2 + 1] - b.points[i * 2 + 1],
  );
  expect(Math.min(...differences)).toBeLessThan(0);
  expect(Math.max(...differences)).toBeGreaterThan(0);
});
it("localizes onset accents and rejects duplicate or old events", () => {
  const a = setup(feature(), true),
    b = setup(feature(), false);
  const fa = structuredClone(settle(a.model)),
    fb = settle(b.model);
  expect(fa.pathCount).toBeGreaterThan(fb.pathCount);
  expect(fa.pathCount - fb.pathCount).toBeLessThanOrEqual(18);
  expect(a.model.metrics.accents).toBeLessThanOrEqual(6);
  const staleSource: MusicSource = {
    events: () => [],
    frame: () => ({}) as never,
    mixed: () => ({
      feature: feature(),
      events: [{ timestamp: -1000, intensity: 1 }],
    }),
  };
  const stale = new MixedChoreography(staleSource);
  expect(snap(settle(stale))).toEqual(snap(fb));
  const repeatedSource: MusicSource = {
    ...staleSource,
    mixed: () => ({
      feature: feature(),
      events: [{ timestamp: 1000, intensity: 1 }],
    }),
  };
  const repeated = new MixedChoreography(repeatedSource);
  for (let t = 0; t <= 5000; t += 50)
    repeated.update(t, state(), 4416, 680, {}, 1);
  // The repeated old event cannot keep a flower accent alive indefinitely.
  expect(repeated.update(5050, state(), 4416, 680, {}, 1).pathCount).toBe(
    fb.pathCount,
  );
});
it("stops motion without input and returns to a static faint field", () => {
  const { model, set } = setup(feature(), true);
  settle(model);
  set(null);
  for (let t = 3100; t <= 12000; t += 50)
    model.update(t, state(), 4416, 680, {}, 1);
  const a = structuredClone(model.update(12050, state(), 4416, 680, {}, 1));
  const b = model.update(12100, state(), 4416, 680, {}, 1);
  expect(b.energy).toBeLessThan(0.001);
  expect(b.lightCount).toBeLessThanOrEqual(66);
  for (let n = 0; n < a.pathCount; n++)
    expect(Array.from(a.paths[n].points)).toEqual(
      Array.from(b.paths[n].points),
    );
  expect(b.paths.slice(0, b.pathCount).every((p) => p.alpha < 0.05)).toBe(true);
});
it("reduced motion freezes travel and decorative particles while retaining musical shapes", () => {
  const s = { ...state(), reduced: true };
  const { model } = setup();
  settle(model, s);
  const a = snap(model.update(50000, s, 4416, 680, {}, 1));
  // Settle after the explicit background-gap reset, then compare constant input.
  for (let t = 50050; t <= 55000; t += 50) model.update(t, s, 4416, 680, {}, 1);
  const b = snap(model.update(55050, s, 4416, 680, {}, 1));
  const c = snap(model.update(55100, s, 4416, 680, {}, 1));
  expect(a.length).toBeGreaterThan(0);
  expect(b.map((p) => p.points)).toEqual(c.map((p) => p.points));
  const withParticles = structuredClone(
    model.update(55150, s, 4416, 680, {}, 1),
  );
  const withoutParticles = model.update(
    55200,
    { ...s, particles: 0 },
    4416,
    680,
    {},
    1,
  );
  expect(withParticles.lightCount).toBe(withoutParticles.lightCount);
  expect(snap(withParticles)).toEqual(snap(withoutParticles));
});
it("honors every layer, degrades detail before identity, and stays bounded at every aspect", () => {
  for (const [width, height] of [
    [4416, 680],
    [4416, 896],
    [320, 500],
  ]) {
    const { model } = setup(feature({ bands: [1, 1, 1] }), true);
    const full = structuredClone(settle(model, state(), 1, width, height));
    const low = model.update(3100, state(), width, height, {}, 0.35);
    expect(low.pathCount).toBeLessThan(full.pathCount);
    expect(low.pathCount).toBeGreaterThan(20);
    for (const f of [full, low]) {
      expect(f.pathCount).toBeLessThanOrEqual(LIMITS.paths);
      expect(f.lightCount).toBeLessThanOrEqual(180);
      for (const p of f.paths.slice(0, f.pathCount)) {
        expect(p.count).toBeLessThanOrEqual(LIMITS.points);
        expect(
          Array.from(p.points.slice(0, p.count * 2)).every(Number.isFinite),
        ).toBe(true);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
      }
    }
    const s = {
      ...state(),
      layers: { currents: 0, lines: 0, filaments: 0, blooms: 0 },
    };
    expect(model.update(3150, s, width, height, {}, 1).pathCount).toBe(0);
    expect(model.update(3200, s, width, height, {}, 1).lightCount).toBe(0);
  }
});
it("Standby never consumes active input as music and preview lights stay capped", () => {
  const { model } = setup(feature({ bands: [1, 1, 1] }), true);
  settle(model);
  const s = { ...state(), mode: "standby" as const };
  const before = model.update(3075, state(), 4416, 680, {}, 1).energy;
  const entering = model.update(3090, s, 4416, 680, {}, 1).energy;
  expect(entering).toBeGreaterThan(0);
  expect(entering).toBeLessThan(before);
  for (let t = 3100; t <= 12000; t += 50) model.update(t, s, 4416, 680, {}, 1);
  expect(model.update(12050, s, 4416, 680, {}, 1).energy).toBe(0);
  const f = model.update(12100, state(), 4416, 680, { profile: "preview" }, 1);
  expect(f.lightCount).toBeLessThanOrEqual(60);
});

it("keeps layer controls independent and supports high contrast and Calm Mode", () => {
  const render = (layers: ReturnType<typeof defaultLayers>) => {
    const { model } = setup(feature({ bands: [0.8, 0.8, 0.8] }), true);
    return structuredClone(settle(model, { ...state(), layers }));
  };
  const full = render(defaultLayers());
  for (const key of ["currents", "lines", "filaments", "blooms"] as const) {
    const f = render({ ...defaultLayers(), [key]: 0 });
    expect(f.pathCount).toBeLessThan(full.pathCount);
    expect(f.pathCount).toBeGreaterThan(0);
  }
  const { model } = setup(feature({ bands: [0.8, 0.8, 0.8] }), true);
  const calm = settle(model, { ...state(), scene: "Calm Mode" });
  expect(calm.pathCount).toBeLessThan(full.pathCount);
  const contrast = model.update(
    3100,
    state(),
    4416,
    680,
    { highContrast: true },
    1,
  );
  expect(
    contrast.paths
      .slice(0, contrast.pathCount)
      .every((p) => p.color === 0xffffff),
  ).toBe(true);
  expect(
    contrast.lights
      .slice(0, contrast.lightCount)
      .every((p) => p.color === 0xffffff),
  ).toBe(true);
});

it("remains deterministic and bounded through a long passage, resize and background gap", () => {
  const a = setup(feature({ bands: [1, 1, 1] }), true),
    b = setup(feature({ bands: [1, 1, 1] }), true),
    s = state();
  for (let t = 0; t <= 60000; t += 100) {
    const fa = a.model.update(t, s, 4416, 896, {}, 1),
      fb = b.model.update(t, s, 4416, 896, {}, 1);
    expect(fa.pathCount).toBeLessThanOrEqual(LIMITS.paths);
    expect(fa.lightCount).toBeLessThanOrEqual(180);
    if (t % 10000 === 0) expect(snap(fa)).toEqual(snap(fb));
  }
  a.set(null);
  const f = a.model.update(3600000, s, 320, 500, {}, 0.35);
  expect(f.energy).toBe(0);
  for (const p of f.paths.slice(0, f.pathCount)) {
    expect(
      Array.from(p.points.slice(0, p.count * 2)).every(Number.isFinite),
    ).toBe(true);
    if (p.variableWidth)
      expect(
        Array.from(p.widths!.slice(0, p.count)).every(
          (v) => Number.isFinite(v) && v > 0,
        ),
      ).toBe(true);
  }
});

it("onsets deform one local part of a ribbon without changing global brightness", () => {
  const make = (withEvent: boolean) =>
    new MixedChoreography({
      frame: () => ({}) as never,
      events: () => [],
      mixed: (time, from) => ({
        feature: feature(),
        events:
          withEvent && from < 3100 && time >= 3100
            ? [{ timestamp: 3100, intensity: 0.9 }]
            : [],
      }),
    });
  const a = make(true),
    b = make(false),
    s = state();
  settle(a, s);
  settle(b, s);
  a.update(3100, s, 4416, 680, {}, 1);
  b.update(3100, s, 4416, 680, {}, 1);
  const fa = structuredClone(a.update(3300, s, 4416, 680, {}, 1)),
    fb = b.update(3300, s, 4416, 680, {}, 1);
  expect(fa.energy).toBe(fb.energy);
  expect(fa.paths[0].alpha).toBe(fb.paths[0].alpha);
  const changed = Array.from(
    { length: fa.paths[0].count },
    (_, i) =>
      Math.abs(fa.paths[0].points[i * 2 + 1] - fb.paths[0].points[i * 2 + 1]) >
      0.01,
  ).filter(Boolean).length;
  expect(changed).toBeGreaterThan(0);
  expect(changed).toBeLessThan(fa.paths[0].count * 0.4);
  for (const route of [1, 2])
    expect(Array.from(fa.paths[route].points)).toEqual(
      Array.from(fb.paths[route].points),
    );
  for (let t = 3350; t <= 6500; t += 50) a.update(t, s, 4416, 680, {}, 1);
  expect(a.metrics.accents).toBe(0);
});

it("keeps measured history and trails bounded, clearing both on silence and Standby", () => {
  const { model, set } = setup(feature(), true);
  settle(model);
  for (let t = 3100; t <= 15000; t += 50)
    model.update(t, state(), 4416, 680, {}, 1);
  expect(model.metrics.history).toBe(64);
  expect(model.metrics.trails).toBeLessThanOrEqual(8);
  expect(model.metrics.accents).toBeLessThanOrEqual(6);
  set(null);
  model.update(15050, state(), 4416, 680, {}, 1);
  expect(model.metrics.history).toBe(0);
  expect(model.metrics.trails).toBe(0);
  set(feature());
  model.update(15100, { ...state(), mode: "standby" }, 4416, 680, {}, 1);
  expect(model.metrics.history).toBe(0);
  expect(model.metrics.accents).toBe(0);
});

it("reduced-motion onset accents stay in place while their opacity fades", () => {
  const model = new MixedChoreography({
    frame: () => ({}) as never,
    events: () => [],
    mixed: (time, from) => ({
      feature: feature(),
      events:
        from < 3100 && time >= 3100
          ? [{ timestamp: 3100, intensity: 0.9 }]
          : [],
    }),
  });
  const s = { ...state(), reduced: true };
  settle(model, s);
  model.update(3100, s, 4416, 680, {}, 1);
  const a = structuredClone(model.update(3300, s, 4416, 680, {}, 1));
  const b = model.update(3500, s, 4416, 680, {}, 1);
  expect(a.pathCount).toBe(b.pathCount);
  expect(snap(a).map((p) => p.points)).toEqual(snap(b).map((p) => p.points));
  expect(a.paths.some((p, i) => p.alpha !== b.paths[i].alpha)).toBe(true);
});

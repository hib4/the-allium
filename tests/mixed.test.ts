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
const core = (f: ScoreFrame, color = 0xff3ebb) =>
  f.paths
    .slice(0, f.pathCount)
    .filter((p) => p.count === 160 && !p.soft && p.color === color)
    .sort((a, b) => b.width - a.width)[0];
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
  expect(core(frames[2]).width).toBeGreaterThan(core(frames[0]).width);
  expect(core(frames[2]).alpha).toBeGreaterThan(core(frames[0]).alpha);
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
it("uses tapered, crossing ribbon contours across the panorama", () => {
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
  for (const color of [0xff3ebb, 0x6eb4ff]) {
    const p = core(f, color);
    expect(p.points[0]).toBeLessThan(0);
    expect(p.points[(p.count - 1) * 2]).toBeGreaterThan(4416);
  }
  // Related treatments of one mix cross vertically instead of remaining in stacked lanes.
  const a = core(f),
    b = core(f, 0x6eb4ff);
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
  expect(fa.pathCount - fb.pathCount).toBeLessThanOrEqual(90);
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
  for (let t = 3100; t <= 5000; t += 50)
    b.model.update(t, state(), 4416, 680, {}, 1);
  // The repeated old event cannot keep a flower accent alive indefinitely.
  expect(repeated.update(5050, state(), 4416, 680, {}, 1).pathCount).toBe(
    b.model.update(5050, state(), 4416, 680, {}, 1).pathCount,
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
    settle(model, state(), 1, width, height);
    const full = structuredClone(
      model.update(3100, state(), width, height, {}, 1),
    );
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
          (v) => Number.isFinite(v) && v >= 0,
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
  expect(core(fa).alpha).toBe(core(fb).alpha);
  const changed = Array.from(
    { length: core(fa).count },
    (_, i) =>
      Math.abs(core(fa).points[i * 2 + 1] - core(fb).points[i * 2 + 1]) > 0.01,
  ).filter(Boolean).length;
  expect(changed).toBeGreaterThan(0);
  expect(changed).toBeLessThan(core(fa).count * 0.4);
  for (const color of [0x6eb4ff, 0x00b3a7])
    expect(Array.from(core(fa, color).points)).toEqual(
      Array.from(core(fb, color).points),
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

it("uses the tutorial palette and Piano diamond/stem groups without instrument data", () => {
  const source: MusicSource = {
    frame: () => {
      throw new Error("Live must not request instruments");
    },
    events: () => {
      throw new Error("Live must not request instrument events");
    },
    mixed: (time) => ({
      feature: feature(),
      events: [{ timestamp: time, intensity: 0.8 }],
    }),
  };
  const model = new MixedChoreography(source),
    f = settle(model);
  const paths = f.paths.slice(0, f.pathCount);
  expect(paths.some((p) => p.color === 0xff3ebb)).toBe(true);
  expect(paths.some((p) => p.color === 0x6eb4ff)).toBe(true);
  const diamonds = paths.filter((p) => p.count === 5 && p.color === 0xc4a5ff);
  expect(diamonds.length).toBeGreaterThan(0);
  expect(diamonds.length).toBeLessThanOrEqual(10);
  for (const p of diamonds) {
    expect(p.points[0]).toBe(p.points[8]);
    expect(p.points[1]).toBe(p.points[9]);
    expect(p.points[3]).toBe(p.points[7]);
    expect(p.points[2]).toBeGreaterThan(p.points[6]);
  }
  expect(
    paths.filter((p) => p.count === 2 && p.color === 0xc4a5ff).length,
  ).toBeGreaterThanOrEqual(diamonds.length * 2);
  expect(f.pathCount).toBeLessThan(LIMITS.paths);
});

it("Piano markers follow the bloom control and fade with absent input", () => {
  const { model, set } = setup(feature(), true);
  settle(model);
  const s = state();
  const without = model.update(
    3100,
    { ...s, layers: { ...s.layers, blooms: 0 } },
    4416,
    680,
    {},
    1,
  );
  expect(
    without.paths.slice(0, without.pathCount).some((p) => p.count === 5),
  ).toBe(false);
  set(null);
  for (let t = 3150; t <= 14000; t += 50) model.update(t, s, 4416, 680, {}, 1);
  const silent = model.update(14050, s, 4416, 680, {}, 1);
  expect(model.metrics.accents).toBe(0);
  expect(
    silent.paths.slice(0, silent.pathCount).some((p) => p.count === 5),
  ).toBe(false);
});

it("keeps layered ribbon bundles readable while their spread fans and converges", () => {
  for (const intensity of [0.03, 0.95]) {
    const { model } = setup(
      feature({
        intensity,
        bands: [intensity * 0.8, intensity * 0.4, intensity * 0.1],
      }),
    );
    const f = settle(model, { ...state(), reduced: true }, 1, 4416, 896);
    for (const [color, count] of [
      [0xff3ebb, 9],
      [0x6eb4ff, 6],
    ]) {
      const contours = f.paths
        .slice(0, f.pathCount)
        .filter((p) => !p.soft && p.count === 160 && p.color === color);
      expect(contours.length).toBe(count);
      expect(contours.every((p) => p.alpha > 0.035)).toBe(true);
      const spans: number[] = [];
      for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const j = Math.round(u * 159),
          ys = contours.map((p) => p.points[j * 2 + 1]).sort((a, b) => a - b);
        spans.push(ys.at(-1)! - ys[0]);
        expect(spans.at(-1)).toBeGreaterThan(896 * 0.03);
        // Local crossings are intentional; most strands still read separately.
        const separated = ys
          .slice(1)
          .filter((y, n) => y - ys[n] > 896 * 0.0025);
        expect(separated.length).toBeGreaterThanOrEqual(Math.floor(count / 2));
      }
      const glows = f.paths
        .slice(0, f.pathCount)
        .filter((p) => p.soft && p.count === 160 && p.color === color);
      expect(glows.length).toBe(4);
      expect(Math.max(...spans) / Math.min(...spans)).toBeGreaterThan(1.7);
      // Diffusion surrounds the body instead of becoming a bright lower stripe.
      const j = 80,
        ys = contours.map((p) => p.points[j * 2 + 1]);
      expect(
        glows.filter(
          (p) =>
            p.points[j * 2 + 1] > Math.min(...ys) &&
            p.points[j * 2 + 1] < Math.max(...ys),
        ).length,
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

it("preserves defining ribbon strands after secondary quality reduction", () => {
  const { model } = setup();
  const s = { ...state(), reduced: true };
  const full = structuredClone(settle(model, s));
  const lower = model.update(3100, s, 4416, 680, {}, 0.55);
  for (const color of [0xff3ebb, 0x6eb4ff]) {
    const count = (f: ScoreFrame) =>
      f.paths
        .slice(0, f.pathCount)
        .filter((p) => !p.soft && p.count === 160 && p.color === color).length;
    expect(count(lower)).toBe(count(full));
  }
});

const flowerPaths = (f: ScoreFrame) =>
  f.paths
    .slice(0, f.pathCount)
    .filter(
      (p) =>
        p.variableWidth &&
        p.count % 48 === 0 &&
        (p.color === 0xc4a5ff || p.color === 0xe3d1ff),
    );
const floral = (f: ScoreFrame) =>
  f.paths
    .slice(0, f.pathCount)
    .filter(
      (p) =>
        p.color === 0xc4a5ff || (p.color === 0xe3d1ff && p.count % 48 === 0),
    );
function eventSetup(times = [3100, 3400], intensity = 1) {
  let value: MixFeature | null = feature({
    intensity: 0.95,
    dynamics: 0,
    shortEnergy: 0.2,
    longEnergy: 0.2,
  });
  const model = new MixedChoreography({
    frame: () => ({}) as never,
    events: () => [],
    mixed: (time, from) =>
      value
        ? {
            feature: value,
            events: times
              .filter((t) => t > from && t <= time)
              .map((timestamp) => ({ timestamp, intensity })),
          }
        : null,
  });
  return {
    model,
    set: (v: MixFeature | null) => {
      value = v;
    },
  };
}
function advance(
  model: MixedChoreography,
  from: number,
  to: number,
  s = state(),
  q = 1,
  width = 4416,
  height = 896,
) {
  let f!: ScoreFrame;
  for (let t = from; t <= to; t += 50)
    f = model.update(t, s, width, height, {}, q);
  return f;
}

it("constant musical energy cannot sustain flowers, and quiet passages have no floral geometry", () => {
  const { model, set } = eventSetup([]);
  const initial = advance(model, 0, 3050);
  expect(floral(initial)).toHaveLength(0);
  set(feature({ intensity: 0.95, dynamics: 0.8 }));
  advance(model, 3100, 3700);
  expect(model.metrics.bloomEvents).toHaveLength(1);
  const start = model.metrics.bloomEvents[0].time;
  const expired = advance(model, 3750, 7500);
  expect(model.metrics.bloomEvents).toHaveLength(0);
  expect(floral(expired)).toHaveLength(0);
  // Falling growth rearms the next measured rise, rather than cycling under constant input.
  set(
    feature({
      intensity: 0.05,
      dynamics: 0,
      shortEnergy: 0.05,
      longEnergy: 0.05,
    }),
  );
  advance(model, 7550, 11000);
  set(feature({ intensity: 0.95, dynamics: 0.8 }));
  advance(model, 11050, 11700);
  expect(model.metrics.bloomEvents).toHaveLength(1);
  expect(model.metrics.bloomEvents[0].time).toBeGreaterThan(start + 2800);
});

it("creates one primary and one secondary event, with fixed expiry and no automatic promotion", () => {
  const { model } = eventSetup([
    3100, 3400, 3700, 4000, 4300, 4600, 4900, 5200, 5500, 5800, 6100, 6400,
  ]);
  advance(model, 0, 3950);
  expect(model.metrics.bloomEvents.map((b) => b.role)).toEqual([
    "primary",
    "secondary",
  ]);
  const original = model.metrics.bloomEvents.map((b) => ({
    slot: b.slot,
    role: b.role,
    time: b.time,
    expires: b.expires,
  }));
  advance(model, 4000, 5850);
  expect(
    model.metrics.bloomEvents.map((b) => ({
      slot: b.slot,
      role: b.role,
      time: b.time,
      expires: b.expires,
    })),
  ).toEqual(original);
  advance(model, 5900, 5900);
  expect(model.metrics.bloomEvents.map((b) => b.role)).toEqual(["secondary"]);
  advance(model, 5950, 6100);
  expect(model.metrics.bloomEvents).toHaveLength(2);
  const fresh = model.metrics.bloomEvents.find((b) => b.role === "primary")!;
  expect(fresh.time).toBe(6100);
  expect(fresh.slot).not.toBe(original[0].slot); // The original region is resting until 6350.
  const done = advance(model, 6150, 10000);
  expect(model.metrics.bloomEvents).toHaveLength(0);
  expect(floral(done)).toHaveLength(0);
});

it("ignores weak bloom triggers while keeping line accents and freezes event geometry in Reduced Motion", () => {
  const weak = eventSetup([3100], 0.44);
  advance(weak.model, 0, 3600);
  expect(weak.model.metrics.bloomEvents).toHaveLength(0);
  expect(weak.model.metrics.accents).toBe(1);
  const { model } = eventSetup([3100]);
  const s = { ...state(), reduced: true };
  advance(model, 0, 3650, s);
  const a = structuredClone(model.update(3700, s, 4416, 896, {}, 1));
  const b = model.update(3750, s, 4416, 896, {}, 1);
  expect(flowerPaths(a).map((p) => Array.from(p.points))).toEqual(
    flowerPaths(b).map((p) => Array.from(p.points)),
  );
  expect(flowerPaths(a)[0].alpha).not.toBe(flowerPaths(b)[0].alpha);
  const end = advance(model, 3800, 6000, s);
  expect(flowerPaths(end)).toHaveLength(0);
});

it("fades events through silence and Standby, then resumes Live without replay", () => {
  for (const missing of [true, false]) {
    const { model, set } = eventSetup([3100]);
    advance(model, 0, 3650);
    const before = Math.max(...model.metrics.blooms);
    if (missing) set(null);
    const s = missing ? state() : { ...state(), mode: "standby" as const };
    advance(model, 3700, 3750, s);
    expect(Math.max(...model.metrics.blooms)).toBeGreaterThan(0);
    expect(Math.max(...model.metrics.blooms)).toBeLessThan(before);
    const end = advance(model, 3800, 4400, s);
    expect(model.metrics.bloomEvents).toHaveLength(0);
    expect(flowerPaths(end)).toHaveLength(0);
    set(feature({ dynamics: 0, shortEnergy: 0.2, longEnergy: 0.2 }));
    advance(model, 4450, 5000);
    expect(model.metrics.bloomEvents).toHaveLength(0);
  }
});

it("keeps repeated onsets bounded and smooth without extending an event's lifetime", () => {
  const { model } = eventSetup(
    Array.from({ length: 60 }, (_, i) => 3100 + i * 300),
  );
  let previous = [0, 0, 0];
  const lifetimes = new Map<number, number>();
  const lastEnd = new Map<number, number>();
  const seen = new Set<number>();
  for (let t = 0; t <= 22000; t += 50) {
    model.update(t, state(), 4416, 896, {}, 1);
    const { bloomEvents, blooms } = model.metrics;
    expect(
      bloomEvents.filter((b) => b.role === "primary").length,
    ).toBeLessThanOrEqual(1);
    expect(
      bloomEvents.filter((b) => b.role === "secondary").length,
    ).toBeLessThanOrEqual(1);
    for (const b of bloomEvents) {
      expect(b.expires - b.time).toBe(2800);
      if (lifetimes.has(b.time)) expect(b.expires).toBe(lifetimes.get(b.time));
      lifetimes.set(b.time, b.expires);
      if (!seen.has(b.time)) {
        expect(b.time).toBeGreaterThanOrEqual(
          (lastEnd.get(b.slot) ?? -Infinity) + 450,
        );
        lastEnd.set(b.slot, b.expires);
        seen.add(b.time);
      }
    }
    for (let i = 0; i < 3; i++)
      expect(Math.abs(blooms[i] - previous[i])).toBeLessThan(0.23);
    previous = blooms;
  }
});

it("retains the reduced bloom size ceiling, simplified detail and secondary hierarchy inside every artwork", () => {
  for (const [width, height] of [
    [4416, 896],
    [900, 182],
    [320, 500],
  ]) {
    const { model } = eventSetup();
    const f = advance(model, 0, 3950, state(), 1, width, height);
    const flowers = flowerPaths(f);
    expect(flowers).toHaveLength(28); // Primary 54 florets, secondary 30, three per pooled path.
    for (const p of flowers)
      for (let j = 0; j < p.count; j++) {
        expect(p.points[j * 2]).toBeGreaterThanOrEqual(0);
        expect(p.points[j * 2]).toBeLessThanOrEqual(width);
        expect(p.points[j * 2 + 1]).toBeGreaterThanOrEqual(0);
        expect(p.points[j * 2 + 1]).toBeLessThanOrEqual(height);
      }
    const extents = (paths: typeof flowers) => {
      const first = paths[0],
        cx = first.points[0],
        cy = first.points[1];
      const radius = Math.max(
        ...paths.flatMap((p) =>
          Array.from({ length: p.count }, (_, j) =>
            Math.hypot(p.points[j * 2] - cx, p.points[j * 2 + 1] - cy),
          ),
        ),
      );
      // Previous bounded radius, before the requested 0.70 size multiplier.
      const previous = Math.min(
        height * (0.055 + f.energy * 0.025 + 0.24),
        width / ((width / height >= 3 ? 3 : 2) * 3.2),
        Math.min(cx, width - cx, cy, height - cy) / 1.16,
      );
      return { radius, previous };
    };
    const primary = extents(flowers.slice(0, 18)),
      secondary = extents(flowers.slice(18));
    expect(primary.radius / primary.previous).toBeGreaterThan(0.5);
    expect(primary.radius / primary.previous).toBeLessThan(0.77);
    expect(secondary.radius / secondary.previous).toBeGreaterThan(0.32);
    expect(secondary.radius / secondary.previous).toBeLessThan(0.5);
    expect(flowers[22].alpha / flowers[8].alpha).toBeLessThan(0.7);
  }
});

it("retains invisible pooled joins and ribbon geometry while the bloom control removes every flower", () => {
  const { model } = eventSetup();
  const f = structuredClone(advance(model, 0, 3950));
  for (const p of flowerPaths(f))
    for (let j = 0; j < p.count; j += 48) {
      for (const k of [0, 13, 14, 46, 47]) expect(p.widths![j + k]).toBe(0);
      expect(p.widths![j + 25]).toBeGreaterThan(0.7);
    }
  const s = state();
  const without = model.update(
    3950,
    { ...s, layers: { ...s.layers, blooms: 0 } },
    4416,
    896,
    {},
    1,
  );
  expect(flowerPaths(without)).toHaveLength(0);
  expect(Array.from(core(f).points)).toEqual(Array.from(core(without).points));
});

it("reduces rear flower detail at lower quality and stays within the existing resource budgets", () => {
  const render = (q: number) => {
    const { model } = eventSetup();
    return structuredClone(advance(model, 0, 3950, state(), q));
  };
  const full = render(1),
    low = render(0.35);
  expect(flowerPaths(full)).toHaveLength(28);
  expect(flowerPaths(low)).toHaveLength(15);
  expect(flowerPaths(low).some((p) => p.color === 0xe3d1ff)).toBe(true);
  expect(full.pathCount).toBeLessThan(256);
  expect(low.pathCount).toBeLessThan(256);
  expect(full.lightCount).toBeLessThanOrEqual(180);
});

it("coalesces an onset and a growth edge from the same musical change", () => {
  const { model, set } = eventSetup([3100]);
  advance(model, 0, 3050);
  set(feature({ intensity: 0.95, dynamics: 0.8 }));
  advance(model, 3100, 3400);
  expect(model.metrics.bloomEvents).toHaveLength(1);
  expect(model.metrics.bloomEvents[0].role).toBe("primary");
});

function reactiveBloom(
  values: Partial<MixFeature>,
  times = [3100],
  onset = 0.8,
  reduced = false,
  variant: "current" | "living" = "current",
) {
  const result = eventSetup(times, onset);
  result.set(
    feature({ dynamics: 0, shortEnergy: 0.2, longEnergy: 0.2, ...values }),
  );
  const s = { ...state(), reduced, liveChoreography: variant };
  const frame = structuredClone(advance(result.model, 0, 3550, s));
  return { ...result, frame, s };
}
const flowerExtent = (frame: ScoreFrame) => {
  const paths = flowerPaths(frame).slice(0, 18);
  const cx = paths[0].points[0],
    cy = paths[0].points[1];
  return Math.max(
    ...paths.flatMap((p) =>
      Array.from({ length: p.count }, (_, j) =>
        Math.hypot(p.points[j * 2] - cx, p.points[j * 2 + 1] - cy),
      ),
    ),
  );
};

it("makes quiet, moderate and intense bloom events progressively larger and brighter in both Live modes", () => {
  for (const variant of ["current", "living"] as const) {
    const frames = [0.08, 0.4, 0.95].map(
      (intensity) =>
        reactiveBloom({ intensity }, [3100], 0.8, false, variant).frame,
    );
    expect(flowerExtent(frames[1])).toBeGreaterThan(
      flowerExtent(frames[0]) * 1.15,
    );
    expect(flowerExtent(frames[2])).toBeGreaterThan(
      flowerExtent(frames[1]) * 1.1,
    );
    const alpha = frames.map((f) => flowerPaths(f)[8].alpha);
    expect(alpha[1]).toBeGreaterThan(alpha[0]);
    expect(alpha[2]).toBeGreaterThan(alpha[1]);
  }
});

it("opens stronger onsets faster and pulses the primary locally without extending expiry", () => {
  const weak = reactiveBloom({}, [3100], 0.5),
    strong = reactiveBloom({}, [3100], 0.95);
  expect(strong.model.metrics.bloomEvents[0].openingMs).toBeLessThan(
    weak.model.metrics.bloomEvents[0].openingMs,
  );
  const pulsed = reactiveBloom({}, [3100, 3400, 3700, 4000]);
  const control = reactiveBloom({}, [3100, 3400]);
  const a = structuredClone(advance(pulsed.model, 3600, 3800));
  const b = advance(control.model, 3600, 3800);
  const primary = pulsed.model.metrics.bloomEvents.find(
    (e) => e.role === "primary",
  )!;
  expect(primary.pulse).toBeGreaterThan(0.5);
  expect(primary.expires).toBe(5900);
  expect(flowerExtent(a)).toBeGreaterThan(flowerExtent(b) * 1.05);
  expect(flowerExtent(a)).toBeLessThan(flowerExtent(b) * 1.13);
  advance(pulsed.model, 3850, 4050);
  // The onset at 4000 is inside the pulse cooldown, so its attack cannot restart.
  expect(pulsed.model.metrics.bloomEvents[0].pulse).toBeLessThan(primary.pulse);
});

it("uses frequency balance for bloom mass, inner layering and fine petal edges", () => {
  const low = reactiveBloom({ bands: [0.9, 0.05, 0.05] }).frame;
  const mid = reactiveBloom({ bands: [0.05, 0.9, 0.05] }).frame;
  const high = reactiveBloom({ bands: [0.05, 0.05, 0.9] }).frame;
  expect(flowerExtent(low)).toBeGreaterThan(flowerExtent(mid));
  expect(flowerPaths(mid)[0].alpha).toBeGreaterThan(
    flowerPaths(low)[0].alpha * 1.4,
  );
  expect(flowerPaths(high)[8].points).not.toEqual(flowerPaths(mid)[8].points);
  expect(high.pathCount).toBeLessThanOrEqual(LIMITS.paths);
  expect(high.lightCount).toBeLessThanOrEqual(180);
});

it("smooths spectral deformation and freezes flower geometry under Reduced Motion despite changing audio", () => {
  const normal = reactiveBloom({ flux: 0 });
  const before = structuredClone(normal.frame);
  normal.set(
    feature({ flux: 1, dynamics: 0, shortEnergy: 0.2, longEnergy: 0.2 }),
  );
  const zero = normal.model.update(3550, normal.s, 4416, 896, {}, 1);
  expect(flowerPaths(zero)[8].points).toEqual(flowerPaths(before)[8].points);
  const later = advance(normal.model, 3600, 3750, normal.s);
  expect(flowerPaths(later)[8].points).not.toEqual(
    flowerPaths(before)[8].points,
  );
  const reduced = reactiveBloom({ flux: 0 }, [3100], 0.8, true);
  const still = structuredClone(reduced.frame);
  reduced.set(
    feature({
      intensity: 0.95,
      bands: [0, 0, 1],
      flux: 1,
      dynamics: 0,
      shortEnergy: 0.2,
      longEnergy: 0.2,
    }),
  );
  const changed = advance(reduced.model, 3600, 3850, reduced.s);
  expect(flowerPaths(changed).map((p) => Array.from(p.points))).toEqual(
    flowerPaths(still).map((p) => Array.from(p.points)),
  );
  expect(flowerPaths(changed)[8].alpha).not.toBe(flowerPaths(still)[8].alpha);
});

it("develops a wider depth field in both Live modes without adding primary systems", () => {
  for (const liveChoreography of ["current", "living"] as const) {
    const s = { ...state(), liveChoreography };
    const render = (intensity: number) => {
      const { model } = setup(
        feature({ intensity, bands: [intensity, intensity, intensity] }),
      );
      return structuredClone(settle(model, s, 1, 4416, 896));
    };
    const quiet = render(0.06),
      loud = render(0.95);
    const distance = (f: ScoreFrame) => {
      const contours = f.paths
        .slice(0, f.pathCount)
        .filter((p) => p.count === 96);
      expect(contours).toHaveLength(6);
      const ys = contours.map((p) => p.points[96 + 1]);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(distance(loud)).toBeGreaterThan(distance(quiet));
    expect(loud.lightCount).toBeGreaterThan(quiet.lightCount);
    expect(core(loud).width).toBeGreaterThan(core(quiet).width);
    expect(loud.pathCount).toBeLessThan(LIMITS.paths);
  }
});

it("reveals supporting detail continuously and keeps particle and quality controls effective", () => {
  const { model, set } = setup(
    feature({ intensity: 0.5, bands: [0.4, 0.3, 0.1] }),
  );
  const s = state();
  settle(model, s);
  const before = snap(model.update(3100, s, 4416, 896, {}, 1));
  set(feature({ intensity: 1, bands: [1, 1, 1], flux: 1 }));
  // New targets cannot jump geometry or luminosity without elapsed time.
  expect(snap(model.update(3100, s, 4416, 896, {}, 1))).toEqual(before);
  const full = structuredClone(model.update(3150, s, 4416, 896, {}, 1));
  const noDust = structuredClone(
    model.update(3150, { ...s, particles: 0 }, 4416, 896, {}, 1),
  );
  expect(noDust.lightCount).toBeLessThan(full.lightCount);
  expect(snap(noDust)).toEqual(snap(full));
  const low = model.update(3150, s, 4416, 896, {}, 0.35);
  expect(low.paths.slice(0, low.pathCount).some((p) => p.count === 96)).toBe(
    false,
  );
  expect(core(low)).toBeDefined();
});

it("keeps focal blooms and all layers inside shared budgets during sustained peaks", () => {
  for (const liveChoreography of ["current", "living"] as const) {
    const { model } = setup(
      feature({ intensity: 1, bands: [1, 1, 1], flux: 1 }),
      true,
    );
    const s = { ...state(), liveChoreography };
    for (let t = 0; t <= 12000; t += 50) {
      const f = model.update(t, s, 4416, 896, {}, 1);
      expect(f.pathCount).toBeLessThan(LIMITS.paths);
      expect(f.lightCount).toBeLessThanOrEqual(180);
      expect(model.metrics.bloomEvents.length).toBeLessThanOrEqual(2);
      if (model.metrics.bloomEvents.some((b) => b.envelope > 0.1))
        expect(
          f.paths
            .slice(0, f.pathCount)
            .some((p) => p.color === 0xc4a5ff && p.variableWidth),
        ).toBe(true);
    }
  }
});

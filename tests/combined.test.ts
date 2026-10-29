import { afterAll, expect, it } from "vitest";
import { MixedChoreography } from "../src/engine/mixed";
import {
  Choreography,
  LIMITS,
  type ScoreFrame,
} from "../src/engine/choreography";
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
it("uses proportional readable piano markers with a consistent normalized flower form", () => {
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

const verticalCore = (f: ScoreFrame, color: number) =>
  paths(f)
    .filter((p) => p.color === color && !p.soft)
    .reduce((a, b) => (a.width > b.width ? a : b));
const rightY = (f: ScoreFrame, color: number) => {
  const p = verticalCore(f, color);
  return p.points[(p.count - 1) * 2 + 1];
};
function verticalStep(direction: number, calm = false) {
  const subject = setup("original"),
    reference = setup("original");
  if (calm) {
    subject.state.scene = "Calm Mode";
    reference.state.scene = "Calm Mode";
  }
  const rest = { ...feature(0.5), centroid: 3000, flux: 0 };
  subject.set(rest);
  reference.set(rest);
  for (let t = 0; t <= 2000; t += 50) {
    subject.render(t);
    reference.render(t);
  }
  subject.set({ ...rest, centroid: 3000 + direction * 600 });
  const early: Record<number, number> = {},
    late: Record<number, number> = {};
  for (let t = 2050; t <= 2400; t += 50) {
    const a = subject.render(t),
      b = reference.render(t);
    for (const color of [0xff3ebb, 0x6eb4ff]) {
      const movement = -direction * (rightY(a, color) - rightY(b, color));
      if (t === 2200) early[color] = movement;
      if (t === 2400) late[color] = movement;
      expect(verticalCore(a, color).width).toBe(verticalCore(b, color).width);
      expect(verticalCore(a, color).alpha).toBe(verticalCore(b, color).alpha);
    }
  }
  return { early, late };
}
it("gives small upward and downward changes larger, faster vertical travel without altering line appearance", () => {
  for (const direction of [-1, 1]) {
    const r = verticalStep(direction);
    for (const [color, scale] of [
      [0xff3ebb, 0.19],
      [0x6eb4ff, 0.14],
    ]) {
      const formerSteadyTravel = (((600 / 12000) * 24) / 17) * scale * 896;
      expect(r.early[color]).toBeGreaterThan(formerSteadyTravel * 1.5 * 0.6);
      expect(r.late[color]).toBeGreaterThan(formerSteadyTravel * 1.25);
    }
  }
});
it("keeps Calm Mode vertical movement gentler", () => {
  const normal = verticalStep(1),
    calm = verticalStep(1, true);
  for (const color of [0xff3ebb, 0x6eb4ff])
    expect(calm.late[color]).toBeLessThan(normal.late[color] * 0.5);
});
it("bounds amplified vocal/guitar contours on both display sizes and small artwork", () => {
  for (const [width, height] of [
    [4416, 896],
    [2424, 896],
    [900, 182],
    [320, 500],
  ])
    for (const variant of ["original", "combined"] as const) {
      const s = setup(variant);
      s.state.motion = 1;
      for (let t = 0; t <= 3500; t += 50) {
        s.set({ ...feature(0.9), centroid: t < 1750 ? 12000 : 0, flux: 1 });
        const f = s.model.update(t, s.state, width, height, {}, 0.35);
        expect(f.pathCount).toBeLessThanOrEqual(LIMITS.paths);
        for (const p of paths(f).filter(
          (p) => p.color === 0xff3ebb || p.color === 0x6eb4ff,
        ))
          for (let j = 0; j < p.count; j++) {
            expect(p.points[j * 2 + 1]).toBeGreaterThanOrEqual(
              height * 0.1 - 0.001,
            );
            expect(p.points[j * 2 + 1]).toBeLessThanOrEqual(
              height * 0.9 + 0.001,
            );
          }
      }
    }
});
it("shares enhanced up/down geometry between Original and Combined", () => {
  const a = setup("original"),
    b = setup("combined");
  for (let t = 0; t <= 4000; t += 50) {
    const value = {
      ...feature(0.5),
      centroid: t < 1500 ? 3000 : t < 2500 ? 3600 : 2400,
      flux: 0,
    };
    a.set(value);
    b.set(value);
    expect(coords(a.render(t))).toEqual(coords(b.render(t)));
  }
});

it("spreads one piano event per accepted attack across all panorama regions without immediate repeats", () => {
  for (const [width, height, regions] of [
    [4416, 896, 3],
    [2424, 896, 3],
    [320, 500, 2],
  ])
    for (const variant of ["original", "combined"] as const) {
      const s = setup(variant);
      s.onset(true);
      s.eventStrength(0.3);
      for (let t = 0; t <= 1000; t += 50)
        s.model.update(t, s.state, width, height, {}, 1);
      const events = s.model.metrics.original!.pianoEvents;
      expect(events).toHaveLength(4);
      expect(new Set(events.map((e) => e.region)).size).toBe(regions);
      for (let i = 1; i < events.length; i++)
        expect(events[i].region).not.toBe(events[i - 1].region);
      expect(Math.min(...events.map((e) => e.x))).toBeLessThan(0.32);
      expect(Math.max(...events.map((e) => e.x))).toBeGreaterThan(0.68);
      expect(events[0].intensity).toBeCloseTo(
        (1 - Math.pow(0.7, 1.5)) * 1.25,
        10,
      );
      const anchors = events.map(({ x, y, region }) => ({ x, y, region }));
      s.onset(false);
      s.model.update(1050, s.state, width, height, {}, 1);
      expect(
        s.model.metrics.original!.pianoEvents.map(({ x, y, region }) => ({
          x,
          y,
          region,
        })),
      ).toEqual(anchors);
    }
});
it("clears piano placement history on a new Live entry", () => {
  const s = setup();
  s.onset(true);
  for (let t = 0; t <= 1000; t += 50) s.render(t);
  const first = s.model.metrics.original!.pianoEvents[0];
  s.state.mode = "standby";
  s.render(1050);
  s.state.mode = "live";
  s.onset(false);
  s.render(1100);
  s.onset(true);
  s.render(1150);
  const next = s.model.metrics.original!.pianoEvents;
  expect(next).toHaveLength(1);
  expect(next[0].region).toBe(first.region);
  expect(next[0].x).toBe(first.x);
  expect(next[0].y).toBe(first.y);
});
it("tracks bass and saxophone changes quickly in both directions", () => {
  const base = setup().state;
  for (const direction of [-1, 1]) {
    const model = new Choreography();
    const f = { ...feature(0.5), centroid: 3000, flux: 0 };
    for (let t = 0; t <= 2000; t += 50)
      model.updateMeasured(t, base, 2424, 896, {}, 1, {
        feature: f,
        events: [],
      });
    for (let t = 2050; t <= 2400; t += 50)
      model.updateMeasured(t, base, 2424, 896, {}, 1, {
        feature: { ...f, centroid: 3000 + direction * 600 },
        events: [],
      });
    expect(direction * (model.histories.bass.read(1) - 36)).toBeGreaterThan(
      1.08,
    );
    expect(
      direction * (model.histories.saxophone.read(1) - 67),
    ).toBeGreaterThan(1.08);
  }
});
it("keeps stronger bass/saxophone geometry grounded and bounded under extreme input", () => {
  for (const [width, height] of [
    [4416, 896],
    [2424, 896],
    [320, 500],
  ]) {
    const s = setup();
    s.state.motion = 1;
    for (let t = 0; t <= 2500; t += 50) {
      s.set({ ...feature(0.95), centroid: t < 1250 ? 12000 : 0, flux: 1 });
      const f = s.model.update(t, s.state, width, height, {}, 0.35);
      for (const p of paths(f).filter(
        (p) => p.color === 0x00b3a7 || p.color === 0xffaa66,
      ))
        for (let j = 0; j < p.count; j++) {
          const y = p.points[j * 2 + 1];
          expect(Number.isFinite(y)).toBe(true);
          expect(y).toBeGreaterThanOrEqual(
            height * (p.color === 0x00b3a7 ? 0.62 : 0.1) - 0.001,
          );
          expect(y).toBeLessThanOrEqual(
            height * (p.color === 0x00b3a7 ? 0.98 : 0.9) + 0.001,
          );
        }
    }
  }
});
it("gives drum and piano events a stronger bounded response while retaining stationary Reduced Motion", () => {
  const s = setup();
  s.state.reduced = true;
  s.eventStrength(0.3);
  for (let t = 0; t <= 500; t += 50) s.render(t);
  s.onset(true);
  s.render(550);
  s.onset(false);
  const f = s.render(700),
    ring = paths(f).find(
      (p) => p.color === 0xffd84d && p.count === 64 && !p.soft,
    )!;
  const xs = Array.from(ring.points.slice(0, ring.count * 2)).filter(
    (_, i) => i % 2 === 0,
  );
  expect((Math.max(...xs) - Math.min(...xs)) / 2).toBeGreaterThan(896 * 0.065);
  expect(petalSpan(f)).toBeGreaterThan(896 * 0.27);
  const before = coords(f);
  s.set({ ...feature(0.9), centroid: 11000 });
  for (let t = 750; t <= 1000; t += 50) s.render(t);
  expect(coords(s.render(1050))).toEqual(before);
});

it("keeps guitar contours full width while retaining reduced height and thickness without cumulative shrinking", () => {
  for (const variant of ["original", "combined"] as const)
    for (const highContrast of [false, true]) {
      const s = setup(variant);
      s.state.reduced = true;
      let f: ScoreFrame;
      for (let t = 0; t <= 2500; t += 50)
        f = s.model.update(t, s.state, 2424, 896, { highContrast }, 1);
      const guitar = f!.paths
        .slice(0, f!.pathCount)
        .filter((p) => p.count === 80);
      expect(guitar.length).toBeGreaterThan(0);
      for (const p of guitar) {
        expect(p.points[0]).toBeCloseTo(0, 2);
        expect(p.points[(p.count - 1) * 2]).toBeCloseTo(2424, 2);
      }
      const first = guitar.map((p) => ({
        points: Array.from(p.points.slice(0, p.count * 2)),
        width: p.width,
      }));
      const repeat = s.model.update(
        2500,
        s.state,
        2424,
        896,
        { highContrast },
        1,
      );
      expect(
        repeat.paths
          .slice(0, repeat.pathCount)
          .filter((p) => p.count === 80)
          .map((p) => ({
            points: Array.from(p.points.slice(0, p.count * 2)),
            width: p.width,
          })),
      ).toEqual(first);
      for (let t = 2550; t <= 3500; t += 50)
        f = s.model.update(t, s.state, 2424, 896, { highContrast }, 1);
      expect(
        f!.paths
          .slice(0, f!.pathCount)
          .filter((p) => p.count === 80)
          .map((p) => Array.from(p.points.slice(0, p.count * 2))),
      ).toEqual(first.map((p) => p.points));
    }
});
it("makes the teal bass readable during quiet input and retains its layer control", () => {
  const s = setup("original");
  s.set(feature(0.02));
  for (let t = 0; t <= 4000; t += 50) s.render(t);
  const core = paths(s.render(4050)).filter(
    (p) => p.color === 0x00b3a7 && !p.soft,
  );
  expect(core.length).toBeGreaterThan(0);
  for (const p of core) {
    expect(p.width).toBeCloseTo(((1.5 * 896) / 550) * 1.4, 10);
    expect(p.alpha).toBeGreaterThan(0.15);
    expect(p.alpha).toBeLessThanOrEqual(1);
  }
  s.state.layers.currents = 0;
  expect(paths(s.render(4100)).some((p) => p.color === 0x00b3a7)).toBe(false);
});

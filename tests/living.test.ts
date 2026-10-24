import { afterAll, expect, it } from "vitest";
import { LivingComposition } from "../src/engine/living";
import { MixedChoreography } from "../src/engine/mixed";
import {
  Session,
  concert,
  upgradeState,
  validState,
} from "../src/engine/session";
import { LIMITS } from "../src/engine/choreography";
import type { MixFeature } from "../src/engine/audio";
import type { MusicSource } from "../src/engine/source";
afterAll(() => concert.dispose());
const feature = (intensity = 0.5, flux = 0.2): MixFeature => ({
  active: true,
  rms: intensity * 0.1,
  peak: intensity * 0.3,
  intensity,
  bands: [intensity * 0.8, intensity * 0.6, intensity * 0.4],
  spectrum: Array(32).fill(intensity * 0.5),
  centroid: 2000,
  flux,
  shortEnergy: intensity,
  longEnergy: intensity,
  dynamics: 0,
});
it("defaults to Current and upgrades legacy snapshots without accepting unknown variants", () => {
  const session = new Session(false);
  expect(session.state.liveChoreography).toBe("current");
  const legacy = { ...session.state } as Partial<typeof session.state>;
  delete legacy.liveChoreography;
  expect(validState(upgradeState(legacy))).toBe(true);
  expect(validState({ ...session.state, liveChoreography: "other" })).toBe(
    false,
  );
  session.update({ liveChoreography: "living" });
  expect(session.state.liveChoreography).toBe("living");
  session.dispose();
});
it("requires a sustained condition, blends states and applies intense hysteresis", () => {
  const c = new LivingComposition();
  for (let t = 0; t < 600; t += 50)
    c.update(t, 50, feature(0.9, 0.9), [], false, 1, false);
  expect(c.value.state).toBe("calm");
  for (let t = 600; t <= 4000; t += 50)
    c.update(t, 50, feature(0.9, 0.9), [], false, 1, false);
  expect(c.value.state).toBe("intense");
  expect(c.value.expansion).toBeGreaterThan(0.7);
  c.update(4050, 50, feature(0.6, 0.9), [], false, 1, false);
  expect(c.value.state).toBe("intense");
  for (let t = 4100; t <= 5000; t += 50)
    c.update(t, 50, feature(0.5, 0.9), [], false, 1, false);
  expect(c.value.state).toBe("developing");
});
it("distinguishes falling energy from quiet and releases all musical memory", () => {
  const c = new LivingComposition();
  for (let t = 0; t < 20000; t += 50)
    c.update(t, 50, feature(0.9), [], false, 1, false);
  for (let t = 20000; t < 24000; t += 50)
    c.update(t, 50, feature(0.18), [], false, 1, false);
  expect(c.value.state).toBe("releasing");
  const focus = c.value.focus;
  c.update(24000, 50, null, [], false, 1, false);
  const memory = c.value.memory;
  for (let t = 24050; t <= 32200; t += 50)
    c.update(t, 50, null, [{ timestamp: t, intensity: 1 }], false, 1, false);
  expect(c.value.memory).toBe(0);
  expect(c.value.slow).toBeLessThan(memory);
  expect(c.value.density).toBe(0);
  expect(c.value.focus).toBe(focus);
});
it("moves focus only on new measured events or spectral edges and respects motion controls", () => {
  const c = new LivingComposition();
  c.update(0, 16, feature(), [{ timestamp: 0, intensity: 1 }], false, 1, false);
  const target = c.value.targetFocus;
  for (let t = 50; t < 6000; t += 50)
    c.update(
      t,
      50,
      feature(),
      [{ timestamp: 0, intensity: 1 }],
      false,
      1,
      false,
    );
  expect(c.value.targetFocus).toBe(target);
  expect(c.value.density).toBe(0);
  const before = c.value.focus;
  c.update(
    6000,
    50,
    feature(0.9, 0.9),
    [{ timestamp: 6000, intensity: 1 }],
    true,
    1,
    false,
  );
  expect(c.value.focus).toBe(before);
  expect(c.value.targetFocus).toBe(target);
  c.update(6100, 50, feature(), [], false, 0, false);
  expect(c.value.focus).toBe(before);
});
function modelSetup() {
  let value: MixFeature | null = feature(0.9, 0.7);
  let calls = 0;
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
              Math.floor(time / 400) > Math.floor(from / 400)
                ? [{ timestamp: time, intensity: 0.8 }]
                : [],
          }
        : null;
    },
  };
  return {
    model: new MixedChoreography(source),
    set: (f: MixFeature | null) => (value = f),
    calls: () => calls,
  };
}
it("changes composition without adding objects, reads one mix, and clears variant history on return", () => {
  const session = new Session(false);
  session.update({ mode: "live", reduced: false });
  const current = modelSetup(),
    living = modelSetup();
  for (let t = 0; t <= 8000; t += 50) {
    current.model.update(t, session.state, 4416, 896, {}, 1);
    living.model.update(
      t,
      { ...session.state, liveChoreography: "living" },
      4416,
      896,
      {},
      1,
    );
  }
  expect(current.calls()).toBe(161);
  expect(living.calls()).toBe(161);
  const a = current.model.update(8050, session.state, 4416, 896, {}, 1);
  const b = living.model.update(
    8050,
    { ...session.state, liveChoreography: "living" },
    4416,
    896,
    {},
    1,
  );
  expect(b.pathCount).toBeLessThanOrEqual(LIMITS.paths);
  expect(b.lightCount).toBeLessThanOrEqual(180);
  const core = (f: typeof a) =>
    Array.from(
      f.paths.slice(0, f.pathCount).find((p) => p.count === 160 && !p.soft)!
        .points,
    );
  expect(core(b)).not.toEqual(core(a));
  expect(living.model.metrics.bloomEvents.length).toBeLessThanOrEqual(2);
  living.model.update(8100, session.state, 4416, 896, {}, 1);
  expect(living.model.metrics.bloomEvents).toHaveLength(0);
  expect(living.model.metrics.accents).toBe(0);
  session.dispose();
});
it("never creates experimental events in silence, Standby or recovery", () => {
  const session = new Session(false);
  session.update({ mode: "live", liveChoreography: "living", reduced: false });
  const { model, set } = modelSetup();
  for (let t = 0; t <= 4000; t += 50)
    model.update(t, session.state, 4416, 896, {}, 1);
  set(null);
  for (let t = 4050; t <= 14000; t += 50)
    model.update(t, session.state, 4416, 896, {}, 1);
  expect(model.metrics.bloomEvents).toHaveLength(0);
  expect(model.metrics.accents).toBe(0);
  expect(model.metrics.composition.memory).toBe(0);
  session.update({ mode: "standby" });
  model.update(14050, session.state, 4416, 896, {}, 1);
  session.update({ mode: "live" });
  model.update(14100, session.state, 4416, 896, {}, 1);
  expect(model.metrics.bloomEvents).toHaveLength(0);
  expect(model.metrics.composition.density).toBe(0);
  session.dispose();
});
it("keeps geometry finite across quality, aspect ratios and reduced motion", () => {
  const session = new Session(false);
  session.update({ mode: "live", liveChoreography: "living" });
  for (const [width, height] of [
    [4416, 896],
    [900, 182],
    [320, 500],
  ])
    for (const reduced of [true, false]) {
      const { model } = modelSetup();
      for (let t = 0; t <= 4000; t += 50) {
        const frame = model.update(
          t,
          { ...session.state, reduced },
          width,
          height,
          {},
          0.35,
        );
        expect(frame.pathCount).toBeLessThanOrEqual(LIMITS.paths);
        for (const path of frame.paths.slice(0, frame.pathCount))
          expect(
            Array.from(path.points.slice(0, path.count * 2)).every(
              Number.isFinite,
            ),
          ).toBe(true);
      }
    }
  session.dispose();
});

it("replays identical measured features without inventing activity across gaps or after EOF", async () => {
  const { ReplaySource, validTimeline } =
    await import("../scripts/feature-timeline");
  const timeline = {
    version: 1,
    kind: "measured",
    duration: 4000,
    samples: [
      { time: 0, feature: feature(), events: [] },
      {
        time: 200,
        feature: feature(0.9),
        events: [{ timestamp: 180, intensity: 0.8 }],
      },
      { time: 1000, feature: null, events: [] },
      { time: 2000, feature: feature(0.2), events: [] },
    ],
  };
  expect(validTimeline(timeline)).toBe(true);
  const a = new ReplaySource(timeline),
    b = new ReplaySource(timeline);
  for (let t = 0; t <= 4500; t += 50)
    expect(a.mixed(t, t - 50)).toEqual(b.mixed(t, t - 50));
  expect(a.mixed(200, 150)?.events).toHaveLength(1);
  expect(a.mixed(250, 200)?.events).toHaveLength(0);
  expect(a.mixed(800, 750)).toBeNull();
  expect(a.mixed(1500, 1450)).toBeNull();
  expect(a.mixed(4001, 4000)).toBeNull();
  expect(validTimeline({ ...timeline, duration: 180001 })).toBe(false);
  expect(
    validTimeline({
      ...timeline,
      samples: [
        { time: 0, feature: null, events: [{ timestamp: 0, intensity: 1 }] },
      ],
    }),
  ).toBe(false);
  expect(
    validTimeline({
      ...timeline,
      samples: [
        { time: 0, feature: { ...feature(), intensity: NaN }, events: [] },
      ],
    }),
  ).toBe(false);
  expect(() => new ReplaySource({})).toThrow();
});

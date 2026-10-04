import { afterAll, expect, it } from "vitest";
import { Choreography, LIMITS } from "../src/engine/choreography";
import { concert } from "../src/engine/session";
import { continuous, eventsBetween } from "../src/engine/music";
import { instruments } from "../src/engine/types";
afterAll(() => concert.dispose());
const state = () => ({
  ...structuredClone(concert.state),
  playing: true,
  section: "Chorus" as const,
  particles: 1,
  intensity: 1,
});
const snapshot = (model: Choreography) =>
  Array.from({ length: model.frame.pathCount }, (_, n) => ({
    ...model.frame.paths[n],
    points: Array.from(model.frame.paths[n].points),
  }));
it("uses the actual scheduled melody for level and pitch, including section origins", () => {
  for (const time of [3400, 4700, 6250]) {
    const frame = continuous(time, "Chorus", 3000);
    const events = eventsBetween(3000 - 1, time, "Chorus", 3000);
    for (const instrument of instruments) {
      const last = events.filter((e) => e.instrument === instrument).at(-1);
      if (last) expect(frame[instrument].pitch).toBe(last.pitch);
    }
  }
});
it("is deterministic, finite and bounded over a long concert and after a background gap", () => {
  const a = new Choreography(),
    b = new Choreography(),
    s = state();
  for (let time = 0; time <= 60000; time += 100) {
    a.update(time, s, 3840, 768);
    b.update(time, s, 3840, 768);
    expect(a.metrics.pressures).toBeLessThanOrEqual(LIMITS.pressures);
    expect(a.metrics.chords).toBeLessThanOrEqual(LIMITS.chords);
    expect(a.metrics.paths).toBeLessThanOrEqual(LIMITS.paths);
    expect(a.metrics.particles).toBeLessThanOrEqual(LIMITS.particles);
  }
  expect(snapshot(a)).toEqual(snapshot(b));
  a.update(3600000, s, 3840, 768);
  expect(a.metrics.history).toBe(LIMITS.history);
  for (const p of a.frame.paths.slice(0, a.frame.pathCount)) {
    expect(p.alpha).toBeGreaterThanOrEqual(0);
    expect(p.alpha).toBeLessThanOrEqual(1);
    expect(Array.from(p.points).every(Number.isFinite)).toBe(true);
  }
});
it("preserves paused geometry and keeps the companion within its light budget", () => {
  const model = new Choreography(),
    s = state();
  for (let t = 0; t < 4000; t += 16)
    model.update(t, s, 320, 600, { profile: "companion" });
  model.update(4000, s, 320, 600, { profile: "companion" });
  const before = snapshot(model);
  model.update(4000, { ...s, playing: false }, 320, 600, {
    profile: "companion",
  });
  expect(snapshot(model)).toEqual(before);
  expect(model.metrics.particles).toBeLessThanOrEqual(LIMITS.mobileParticles);
});
it("preserves old phrase history on section changes and removes muted instruments", () => {
  const model = new Choreography(),
    s = state();
  for (let t = 0; t <= 4000; t += 100) model.update(t, s, 1440, 600);
  const history = model.histories.vocals.size;
  model.update(
    4016,
    { ...s, section: "Quiet Section", sectionStart: 4016 },
    1440,
    600,
  );
  expect(model.histories.vocals.size).toBeGreaterThanOrEqual(history);
  for (const channel of instruments) s.channels[channel].mute = true;
  model.update(4032, s, 1440, 600);
  expect(model.metrics.paths).toBe(0);
  expect(model.metrics.particles).toBe(0);
});
it("reduced motion removes the travelling particle field and keeps shape information", () => {
  const s = { ...state(), reduced: true },
    a = new Choreography(),
    b = new Choreography();
  for (let t = 0; t < 4000; t += 100) {
    a.update(t, s, 1440, 600);
    b.update(t, { ...s, particles: 0 }, 1440, 600);
  }
  expect(a.frame.lightCount).toBe(b.frame.lightCount);
  expect(a.frame.pathCount).toBeGreaterThan(0);
  expect(snapshot(a)).toEqual(snapshot(b));
});

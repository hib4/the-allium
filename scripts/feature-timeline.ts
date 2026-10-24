/** Developer-only feature replay. This module is never imported by the application. */
import type { MixFeature, MixEvent } from "../src/engine/audio";
import type { MusicSource } from "../src/engine/source";
export interface FeatureTimeline {
  version: 1;
  kind: "measured" | "synthetic-fixture";
  duration: number;
  samples: { time: number; feature: MixFeature | null; events: MixEvent[] }[];
}
const finite = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
export function validTimeline(value: unknown): value is FeatureTimeline {
  if (!value || typeof value !== "object") return false;
  const t = value as FeatureTimeline;
  if (
    t.version !== 1 ||
    !["measured", "synthetic-fixture"].includes(t.kind) ||
    !finite(t.duration, 1, 180000) ||
    !Array.isArray(t.samples) ||
    !t.samples.length ||
    t.samples.length > 10000
  )
    return false;
  let previous = -1;
  return t.samples.every((s) => {
    if (
      !s ||
      !finite(s.time, 0, t.duration) ||
      s.time < previous ||
      !Array.isArray(s.events) ||
      s.events.length > 8 ||
      !s.events.every(
        (e) =>
          e &&
          finite(e.timestamp, Math.max(0, s.time - 500), s.time) &&
          finite(e.intensity, 0, 1),
      )
    )
      return false;
    previous = s.time;
    const f = s.feature;
    if (f === null) return s.events.length === 0;
    return (
      !!f &&
      typeof f.active === "boolean" &&
      finite(f.rms, 0, 100) &&
      finite(f.peak, 0, 100) &&
      finite(f.intensity, 0, 1) &&
      Array.isArray(f.bands) &&
      f.bands.length === 3 &&
      f.bands.every((n) => finite(n, 0, 1)) &&
      Array.isArray(f.spectrum) &&
      f.spectrum.length === 32 &&
      f.spectrum.every((n) => finite(n, 0, 1)) &&
      finite(f.centroid, 0, 192000) &&
      finite(f.flux, 0, 1) &&
      finite(f.shortEnergy, 0, 1) &&
      finite(f.longEnergy, 0, 1) &&
      finite(f.dynamics, -1, 1) &&
      (f.active || !s.events.length)
    );
  });
}
export class ReplaySource implements MusicSource {
  private timeline: FeatureTimeline;
  private onsets: MixEvent[];
  constructor(value: unknown) {
    if (!validTimeline(value)) throw Error("Invalid feature timeline");
    this.timeline = structuredClone(value);
    this.onsets = this.timeline.samples
      .flatMap((s) => s.events)
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((e, i, all) => !i || e.timestamp !== all[i - 1].timestamp);
  }
  frame(): never {
    throw Error("Feature replay cannot supply Demo instruments");
  }
  events(): never {
    throw Error("Feature replay cannot supply Demo instruments");
  }
  mixed(time: number, from: number) {
    if (time < 0 || time > this.timeline.duration) return null;
    let lo = 0,
      hi = this.timeline.samples.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.timeline.samples[mid].time <= time) lo = mid + 1;
      else hi = mid;
    }
    const sample = this.timeline.samples[lo - 1];
    if (!sample?.feature || time - sample.time > 500) return null;
    return {
      feature: sample.feature,
      events: sample.feature.active
        ? this.onsets.filter(
            (e) =>
              e.timestamp > Math.max(from, time - 250) &&
              e.timestamp <= time &&
              e.timestamp >= sample.time - 500,
          )
        : [],
    };
  }
}

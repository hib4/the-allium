import {
  colors,
  instruments,
  visibleChannel,
  type Instrument,
  type MusicEvent,
  type Section,
  type SessionState,
} from "./types";
import { DemoSource, type MusicSource } from "./source";
import type { MixFeature, MixEvent } from "./audio";

export const LIMITS = {
  history: 240,
  pressures: 12,
  chords: 24,
  particles: 1200,
  mobileParticles: 180,
  paths: 256,
  points: 160,
} as const;
export interface RenderOptions {
  instrument?: Instrument;
  highContrast?: boolean;
  preview?: boolean;
  profile?: "concert" | "companion" | "tutorial" | "preview";
}
export interface Stroke {
  points: Float32Array;
  count: number;
  width: number;
  color: number;
  alpha: number;
  soft: boolean;
  /** Optional per-point width multipliers; absent/disabled preserves Demo strokes. */
  widths?: Float32Array;
  variableWidth?: boolean;
}
export interface Light {
  x: number;
  y: number;
  size: number;
  color: number;
  alpha: number;
}
export interface ScoreFrame {
  paths: Stroke[];
  pathCount: number;
  lights: Light[];
  lightCount: number;
  energy: number;
  time: number;
}
interface Pressure {
  time: number;
  x: number;
  y: number;
  intensity: number;
  kind: "kick" | "snare" | "hat";
}
interface Chord {
  time: number;
  x: number;
  y: number;
  intensity: number;
  pitches: number[];
  visualNotes?: number;
  region?: number;
  section: Section;
}
interface Attack {
  time: number;
  pitch: number;
  intensity: number;
}
const palette = Object.fromEntries(
  instruments.map((i) => [i, parseInt(colors[i].slice(1), 16)]),
) as Record<Instrument, number>;
export const clamp = (n: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
class History {
  values = new Float32Array(LIMITS.history);
  levels = new Float32Array(LIMITS.history);
  cursor = 0;
  size = 0;
  add(pitch: number, level: number, smoothingMs = 180, sampleMs = 1000 / 30) {
    const previous = this.size
      ? this.values[(this.cursor - 1 + LIMITS.history) % LIMITS.history]
      : pitch;
    this.values[this.cursor] = mix(
      previous,
      pitch,
      1 - Math.exp(-sampleMs / smoothingMs),
    );
    this.levels[this.cursor] = level;
    this.cursor = (this.cursor + 1) % LIMITS.history;
    this.size = Math.min(LIMITS.history, this.size + 1);
  }
  read(fraction: number) {
    if (!this.size) return 60;
    const offset = clamp(fraction) * (this.size - 1);
    const a = Math.floor(offset),
      b = Math.min(this.size - 1, a + 1);
    const first = (this.cursor - this.size + LIMITS.history) % LIMITS.history;
    return mix(
      this.values[(first + a) % LIMITS.history],
      this.values[(first + b) % LIMITS.history],
      offset - a,
    );
  }
  reset() {
    this.size = 0;
    this.cursor = 0;
  }
}

/** Musical simulation is independent of React, transport and rendering backend. */
export class Choreography {
  readonly frame: ScoreFrame = {
    paths: [],
    pathCount: 0,
    lights: [],
    lightCount: 0,
    energy: 0,
    time: 0,
  };
  readonly histories = Object.fromEntries(
    instruments.map((i) => [i, new History()]),
  ) as Record<Instrument, History>;
  private pressures: Pressure[] = [];
  private chords: Chord[] = [];
  private attacks: Attack[] = [];
  private lastTime = -1;
  private sampled = -1;
  private section?: Section;
  private sectionAge = 0;
  private previousSection?: Section;
  private previousOrigin = 0;
  private sectionOrigin = 0;
  private quality = 1;
  private weights: Record<Instrument, number> = {
    vocals: 1,
    guitar: 1,
    drums: 1,
    bass: 1,
    piano: 1,
    saxophone: 1,
  };
  private pitch: Record<Instrument, number> = {
    vocals: 65,
    guitar: 72,
    drums: 36,
    bass: 36,
    piano: 65,
    saxophone: 67,
  };
  private levels: Record<Instrument, number> = {
    vocals: 0.3,
    guitar: 0.22,
    drums: 0.24,
    bass: 0.4,
    piano: 0.45,
    saxophone: 0.28,
  };
  private energy = 0.28;
  private mode = "";
  private brightness: Partial<Record<Instrument, number>> = {};
  private spectra: Partial<Record<Instrument, number[]>> = {};
  private phase = 0;
  private bassPhase = 0;
  private width = 1;
  private height = 1;
  private options: RenderOptions = {};
  private state!: SessionState;
  private blend = 1;
  private measured = false;
  private measuredClock = 0;
  private measuredSample = -1;
  private measuredOnset = -Infinity;
  private inactiveSince = -1;
  private eventRelease = 1;
  private detailStrength = 1;
  private guitarPaths: Stroke[] = [];
  private guitarLights: Light[] = [];
  private pianoUse = [-Infinity, -Infinity, -Infinity];
  private pianoLastRegion = -1;
  private pianoEventIndex = 0;
  constructor(private source: MusicSource = new DemoSource()) {}
  get metrics() {
    return {
      pressures: this.pressures.length,
      chords: this.chords.length,
      pianoEvents: this.chords.map(({ time, x, y, region, intensity }) => ({
        time,
        x,
        y,
        region,
        intensity,
      })),
      history: this.histories.vocals.size,
      particles: this.frame.lightCount,
      paths: this.frame.pathCount,
    };
  }
  update(
    time: number,
    state: SessionState,
    width: number,
    height: number,
    options: RenderOptions = {},
    quality = 1,
  ): ScoreFrame {
    if (this.mode !== state.mode) {
      this.mode = state.mode;
      this.lastTime = -1;
      this.section = state.section;
      this.sectionOrigin = state.sectionStart;
      this.previousSection = undefined;
      this.sectionAge = time;
      for (const i of instruments) this.levels[i] = 0;
      this.energy = 0;
    }
    const previous = this.lastTime;
    const dt = previous < 0 ? 0 : clamp(time - previous, 0, 100);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.options = options;
    this.quality = quality;
    this.state = state;
    if (previous < 0 || time < previous) {
      this.pressures = [];
      this.chords = [];
      this.attacks = [];
      for (const i of instruments) this.histories[i].reset();
      this.sampled = time - 8000;
      this.lastTime = time - 3000;
    }
    if (this.section !== state.section) {
      this.previousSection = this.section;
      this.previousOrigin = this.sectionOrigin;
      this.sectionOrigin = state.sectionStart;
      this.section = state.section;
      this.sectionAge = time;
      this.blend = 0;
    }
    this.blend = this.previousSection
      ? clamp((time - this.sectionAge) / 2000)
      : 1;
    const current = this.source.frame(time, state.section, state.sectionStart);
    const outgoing =
      this.previousSection && this.blend < 1
        ? this.source.frame(time, this.previousSection, this.previousOrigin)
        : current;
    const envelope = this.blend * this.blend * (3 - 2 * this.blend);
    const musicalDelta = previous < 0 ? 16 : dt;
    for (const i of instruments) {
      this.brightness[i] = current[i].bands?.[2];
      this.spectra[i] = current[i].spectrum;
      this.pitch[i] = mix(
        this.pitch[i],
        mix(outgoing[i].pitch, current[i].pitch, envelope),
        1 - Math.exp(-musicalDelta / 220),
      );
      this.levels[i] = mix(
        this.levels[i],
        mix(outgoing[i].intensity, current[i].intensity, envelope),
        1 - Math.exp(-musicalDelta / 280),
      );
    }
    // Sample once at30Hz, bounded even after long background gaps.
    const start = Math.max(
      this.sampled + 1000 / 30,
      time - 8000,
      state.sectionStart,
    );
    for (let sample = start; sample <= time; sample += 1000 / 30) {
      const value = this.source.frame(
        sample,
        state.section,
        state.sectionStart,
      );
      for (const i of instruments)
        this.histories[i].add(value[i].pitch, value[i].intensity);
      this.sampled = sample;
    }
    for (const event of this.source.events(
      this.lastTime,
      time,
      state.section,
      state.sectionStart,
    ))
      this.consume(event, state);
    this.lastTime = time;
    this.pressures = this.pressures
      .filter((p) => time - p.time < 2400)
      .slice(-LIMITS.pressures);
    this.chords = this.chords
      .filter((p) => time - p.time < 6000)
      .slice(-LIMITS.chords);
    this.attacks = this.attacks.filter((p) => time - p.time < 2400).slice(-8);
    const focus =
      state.scene === "Vocal Focus"
        ? "vocals"
        : state.scene === "Guitar Focus"
          ? "guitar"
          : state.scene === "Percussion Focus"
            ? "drums"
            : undefined;
    for (const i of instruments) {
      const target = !visibleChannel(state, i)
        ? 0
        : options.instrument
          ? options.instrument === i
            ? 1
            : 0
          : focus
            ? focus === i
              ? 1
              : 0.28
            : 1;
      this.weights[i] = mix(
        this.weights[i],
        target,
        1 - Math.exp(-(state.playing ? Math.max(16, dt) : 16) / 400),
      );
      if (
        !visibleChannel(state, i) ||
        (options.instrument && i !== options.instrument)
      )
        this.weights[i] = 0;
    }
    const mean =
      instruments.reduce((n, i) => n + this.levels[i] * this.weights[i], 0) /
      Math.max(1, instruments.filter((i) => this.weights[i] > 0.05).length);
    this.energy = mix(this.energy, mean, 1 - Math.exp(-musicalDelta / 650));
    const calm = state.scene === "Calm Mode";
    const motion = state.reduced ? 0 : state.motion * (calm ? 0.18 : 1);
    this.phase += (dt / 1000) * motion;
    this.bassPhase += (dt / 1000) * motion * (0.2 + this.levels.bass * 0.25);
    return this.geometry(time, quality, calm);
  }

  /** Original geometry controlled by one measured mix, without instrument simulation. */
  updateMeasured(
    time: number,
    state: SessionState,
    width: number,
    height: number,
    options: RenderOptions,
    quality: number,
    input: { feature: MixFeature; events: MixEvent[] } | null,
  ): ScoreFrame {
    const reset =
      !this.measured ||
      time < this.lastTime ||
      time - this.lastTime > 1000 ||
      (this.mode !== state.mode && state.mode === "live");
    const dt = reset ? 16 : clamp(time - this.lastTime, 0, 100);
    this.measured = true;
    this.mode = state.mode;
    this.lastTime = time;
    this.state = state;
    this.options = options;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.quality = quality;
    if (reset) {
      this.pressures = [];
      this.chords = [];
      this.attacks = [];
      this.measuredClock = 0;
      this.measuredSample = -1;
      this.measuredOnset = -Infinity;
      this.resetPianoPlacement();
      this.inactiveSince = -1;
      this.energy = this.phase = this.bassPhase = this.detailStrength = 0;
      for (const i of instruments) {
        this.histories[i].reset();
        this.levels[i] = this.weights[i] = 0;
      }
    }
    const f = input?.feature;
    const active = state.mode === "live" && !!f?.active;
    // Lift accepted quiet audio without changing capture gain or the activity gate.
    const sensitive = (value: number) => 1 - Math.pow(1 - clamp(value), 1.5);
    const inputEnergy = active ? sensitive(f!.intensity) : 0;
    const follow = (value: number, target: number) =>
      mix(value, target, 1 - Math.exp(-dt / (target > value ? 120 : 800)));
    this.energy = follow(this.energy, inputEnergy);
    const low = active ? sensitive(f!.bands[0] ?? 0) : 0;
    const mid = active ? sensitive(f!.bands[1] ?? 0) : 0;
    const high = active ? sensitive(f!.bands[2] ?? 0) : 0;
    const registers = {
      bass: low,
      drums: low,
      vocals: mid,
      guitar: mid,
      saxophone: mid,
      piano: inputEnergy,
    };
    const refs = {
      bass: 36,
      drums: 36,
      vocals: 65,
      guitar: 72,
      piano: 65,
      saxophone: 67,
    };
    const verticalTracking = !state.reduced && state.motion > 0;
    const verticalScale =
      clamp(state.motion / 0.65) * (state.scene === "Calm Mode" ? 0.18 : 1);
    const verticalSmoothing = 90 / Math.max(0.1, verticalScale);
    for (const i of instruments) {
      const level = active
        ? clamp(inputEnergy * 0.35 + registers[i] * 0.65)
        : 0;
      const weightTarget = active ? 0.12 + Math.pow(level, 0.6) * 0.88 : 0.04;
      this.weights[i] =
        (i === "drums" || i === "piano") && weightTarget > this.weights[i]
          ? mix(this.weights[i], weightTarget, 1 - Math.exp(-dt / 90))
          : follow(this.weights[i], weightTarget);
      // Reduced Motion fixes the contours while their opacity follows the music.
      this.levels[i] = state.reduced ? 0.4 : follow(this.levels[i], level);
      const targetPitch =
        refs[i] +
        (active
          ? (clamp(f!.centroid / 12000) - 0.25) * 24 + clamp(f!.flux) * 3
          : 0);
      this.pitch[i] = state.reduced
        ? refs[i]
        : verticalTracking &&
            (i === "vocals" ||
              i === "guitar" ||
              i === "bass" ||
              i === "saxophone")
          ? mix(
              this.pitch[i],
              targetPitch,
              1 - Math.exp(-dt / verticalSmoothing),
            )
          : follow(this.pitch[i], targetPitch);
      this.brightness[i] = state.reduced
        ? 0.2
        : follow(this.brightness[i] ?? 0, high);
      this.spectra[i] = state.reduced ? undefined : f?.spectrum;
    }
    this.detailStrength = follow(this.detailStrength, high);
    const calm = state.scene === "Calm Mode";
    if (active) {
      if (this.inactiveSince >= 0) {
        this.pressures = [];
        this.chords = [];
        this.attacks = [];
        this.resetPianoPlacement();
        for (const i of instruments) this.histories[i].reset();
        this.measuredSample = -1;
      }
      this.inactiveSince = -1;
      this.eventRelease = 1;
      this.measuredClock += dt;
      const motion = state.reduced ? 0 : state.motion * (calm ? 0.18 : 1);
      this.phase += (dt / 1000) * motion;
      this.bassPhase += (dt / 1000) * motion * (0.2 + this.levels.bass * 0.25);
      if (
        this.measuredSample < 0 ||
        this.measuredClock - this.measuredSample >= 1000 / 30
      ) {
        const sampleMs =
          this.measuredSample < 0
            ? 1000 / 30
            : this.measuredClock - this.measuredSample;
        for (const i of instruments) {
          if (
            verticalTracking &&
            (i === "vocals" ||
              i === "guitar" ||
              i === "bass" ||
              i === "saxophone")
          )
            this.histories[i].add(
              this.pitch[i],
              this.levels[i],
              verticalSmoothing,
              sampleMs,
            );
          else this.histories[i].add(this.pitch[i], this.levels[i]);
        }
        this.measuredSample = this.measuredClock;
      }
      for (const event of input!.events) {
        if (
          reset ||
          event.timestamp <= this.measuredOnset ||
          event.timestamp > time ||
          time - event.timestamp > 300 ||
          event.timestamp - this.measuredOnset < 300 ||
          event.intensity < 0.3
        )
          continue;
        this.measuredOnset = event.timestamp;
        const timestamp = this.measuredClock;
        const intensity = sensitive(event.intensity);
        this.consume(
          {
            instrument: "drums",
            timestamp,
            intensity: clamp(intensity * 1.25) * (0.4 + low * 0.6),
            articulation: low >= high ? "kick" : "hat",
          },
          state,
        );
        this.consume(
          {
            instrument: "guitar",
            timestamp,
            intensity,
            onset: true,
            pitch: this.pitch.guitar,
          },
          state,
        );
        this.consume(
          {
            instrument: "piano",
            timestamp,
            intensity: clamp(intensity * 1.25),
            pitch: this.pitch.piano,
          },
          state,
        );
      }
    } else {
      if (this.inactiveSince < 0) this.inactiveSince = time;
      this.eventRelease = 1 - clamp((time - this.inactiveSince) / 600);
      if (!this.eventRelease) {
        this.pressures = [];
        this.chords = [];
        this.attacks = [];
      }
    }
    this.pressures = this.pressures.filter(
      (p) => this.measuredClock - p.time < 2400,
    );
    this.attacks = this.attacks.filter(
      (p) => this.measuredClock - p.time < 2400,
    );
    this.chords = this.chords.filter((p) => this.measuredClock - p.time < 6000);
    return this.geometry(this.measuredClock, quality, calm);
  }

  private geometry(time: number, quality: number, calm: boolean): ScoreFrame {
    this.frame.pathCount = 0;
    this.frame.lightCount = 0;
    this.guitarPaths.length = this.guitarLights.length = 0;
    this.frame.energy = this.energy;
    this.frame.time = time;
    this.bass();
    this.melody("vocals");
    this.melody("guitar");
    this.saxophone();
    this.constellations(time);
    this.percussion(time);
    this.filaments(time);
    this.particles(time, quality, calm);
    if (this.measured) {
      const centerY = this.height * 0.5;
      for (const path of this.guitarPaths) {
        for (let j = 0; j < path.count; j++) {
          path.points[j * 2 + 1] =
            centerY + (path.points[j * 2 + 1] - centerY) * 0.9;
        }
        path.width *= 0.9;
      }
      for (const light of this.guitarLights) {
        light.y = centerY + (light.y - centerY) * 0.9;
        light.size *= 0.9;
      }
    }
    return this.frame;
  }
  private resetPianoPlacement() {
    this.pianoUse.fill(-Infinity);
    this.pianoLastRegion = -1;
    this.pianoEventIndex = 0;
  }
  private pianoAnchor(time: number) {
    const anchors =
      this.width / this.height >= 1.8 ? [0.18, 0.5, 0.82] : [0.28, 0.72];
    const retained = this.chords.filter((c) => time - c.time < 6000).slice(-3);
    const candidates = anchors.map((_, region) => ({
      region,
      count: retained.filter((c) => c.region === region).length,
      used: this.pianoUse[region],
    }));
    candidates.sort(
      (a, b) =>
        a.count - b.count ||
        (a.used === b.used ? a.region - b.region : a.used - b.used),
    );
    const region = candidates.find(
      (c) => c.region !== this.pianoLastRegion,
    )!.region;
    const seed = this.pianoEventIndex++;
    this.pianoUse[region] = time;
    this.pianoLastRegion = region;
    return {
      region,
      x: anchors[region] + (hash(seed + 122) - 0.5) * 0.04,
      y: 0.34 + hash(seed + 51) * 0.2,
    };
  }
  private consume(e: MusicEvent, s: SessionState) {
    const n = e.beat ?? e.timestamp / 625;
    if (e.instrument === "drums")
      this.pressures.push({
        time: e.timestamp,
        x: 0.26 + hash(Math.floor(n / 4)) * 0.53,
        y: 0.5 + hash(n + 4) * 0.13,
        intensity: e.intensity,
        kind: e.articulation ?? "kick",
      });
    if (e.instrument === "piano") {
      const last = this.chords[this.chords.length - 1];
      if (last && Math.abs(last.time - e.timestamp) < 40) {
        last.pitches.push(e.pitch ?? 60);
        last.pitches = last.pitches.slice(0, 8);
      } else {
        const anchor = this.measured
          ? this.pianoAnchor(e.timestamp)
          : {
              x: 0.55 + hash(Math.floor(n / 8)) * 0.22,
              y: 0.37 + hash(n + 8) * 0.13,
            };
        this.chords.push({
          time: e.timestamp,
          ...anchor,
          intensity: e.intensity,
          pitches: [e.pitch ?? 60],
          visualNotes: this.measured
            ? Math.max(
                1,
                Math.min(
                  8,
                  this.spectra.piano?.filter((v) => v > 0.025).length ?? 1,
                ),
              )
            : undefined,
          section: s.section,
        });
      }
    }
    if (e.instrument === "guitar" && e.onset && e.intensity > 0.4)
      this.attacks.push({
        time: e.timestamp,
        pitch: e.pitch ?? 72,
        intensity: e.intensity,
      });
    this.pressures = this.pressures.slice(-LIMITS.pressures);
    this.chords = this.chords.slice(-LIMITS.chords);
    this.attacks = this.attacks.slice(-8);
  }
  private path(
    count: number,
    width: number,
    color: number,
    alpha: number,
    soft = false,
  ): Stroke | undefined {
    if (this.frame.pathCount >= LIMITS.paths || alpha < 0.002) return;
    const index = this.frame.pathCount++;
    let p = this.frame.paths[index];
    if (!p) {
      p = {
        points: new Float32Array(LIMITS.points * 2),
        count: 0,
        width: 0,
        color: 0,
        alpha: 0,
        soft: false,
      };
      this.frame.paths[index] = p;
    }
    p.count = Math.min(count, LIMITS.points);
    // Combined changes light treatment only: the original point arrays and clocks
    // are shared, including reduced-motion geometry and event lifetimes.
    const combined =
      this.measured && this.state.liveChoreography === "combined";
    const body = combined
      ? (soft ? 1.25 : 1.55) * (0.85 + this.energy * 0.25)
      : 1;
    const readable = 0.012 + Math.pow(this.energy, 0.28) * 0.95;
    const luminosity = combined
      ? (0.4 + readable * 1.2) * (soft ? 1.15 : 1)
      : 1;
    p.width = Math.max(0.3, width * body);
    p.color = this.options.highContrast ? 0xffffff : color;
    p.alpha = clamp(alpha * luminosity);
    p.soft = soft && !this.options.highContrast;
    // Track the source color even when High Contrast replaces the render color.
    if (this.measured && color === palette.guitar) this.guitarPaths.push(p);
    return p;
  }
  private light(
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
  ) {
    const cap = this.measured
      ? this.options.profile === "preview"
        ? 60
        : 180
      : this.options.profile === "companion" || this.width < 600
        ? LIMITS.mobileParticles
        : LIMITS.particles;
    if (this.frame.lightCount >= cap || alpha < 0.005) return;
    const index = this.frame.lightCount++;
    let p = this.frame.lights[index];
    if (!p) {
      p = { x: 0, y: 0, size: 0, color: 0, alpha: 0 };
      this.frame.lights[index] = p;
    }
    Object.assign(p, {
      x,
      y,
      size:
        this.measured && this.state.liveChoreography === "combined"
          ? size * (1.15 + this.energy * 0.2)
          : size,
      color: this.options.highContrast ? 0xffffff : color,
      alpha: clamp(
        alpha *
          (this.measured && this.state.liveChoreography === "combined"
            ? 0.4 + (0.012 + Math.pow(this.energy, 0.28) * 0.95) * 1.2
            : 1),
      ),
    });
    if (this.measured && color === palette.guitar) this.guitarLights.push(p);
  }
  private strength(i: Instrument) {
    return (
      this.weights[i] *
      (this.measured
        ? i === "bass"
          ? this.state.layers.currents
          : i === "piano" || i === "drums"
            ? this.state.layers.blooms * this.eventRelease
            : this.state.layers.lines
        : 1) *
      // Quiet but valid live inputs stay legible at projection distance.
      // Amplitude continues to control geometry; opacity uses a perceptual curve.
      (this.state.mode === "demo"
        ? 1
        : 0.04 + 0.96 * Math.min(1, Math.pow(this.levels[i] / 0.05, 0.4))) *
      (0.35 + this.state.intensity * 0.65) *
      (this.state.scene === "Calm Mode" ? 0.62 : 1)
    );
  }
  private displacement(x: number, y: number): number {
    if (
      this.state.reduced ||
      this.weights.drums < 0.01 ||
      (this.measured && (!this.state.layers.blooms || !this.eventRelease))
    )
      return 0;
    let total = 0;
    for (const p of this.pressures) {
      if (p.kind !== "kick") continue;
      const age = (this.frame.time - p.time) / 1000;
      const dx = ((x / this.width - p.x) * this.width) / this.height,
        dy = y / this.height - p.y;
      const distance = Math.hypot(dx, dy);
      const radius = 0.05 + age * 0.24 * this.state.motion;
      const envelope =
        Math.exp(-(((distance - radius) * 12) ** 2)) * Math.exp(-age * 1.3);
      total +=
        Math.sin(distance * 19 - age * 7) *
        envelope *
        p.intensity *
        0.022 *
        this.height *
        this.weights.drums *
        (this.measured ? this.state.layers.blooms * this.eventRelease : 1) *
        this.state.motion;
    }
    return clamp(total, -this.height * 0.055, this.height * 0.055);
  }
  private bass() {
    const w = this.width,
      h = this.height,
      strength = this.strength("bass");
    if (strength < 0.005) return;
    const level = this.levels.bass;
    const pitch = (this.pitch.bass - 36) / 14;
    const layers = this.state.reduced || this.quality < 0.7 ? 4 : 7;
    for (let k = layers - 1; k >= 0; k--) {
      const soft = k >= 2;
      const p = this.path(
        128,
        (((soft ? 14 + k * 8 : 1.5) * h) / 550) *
          (this.measured && !soft ? 1.4 : 1),
        palette.bass,
        strength *
          (soft ? 0.14 : 0.75) *
          (this.measured ? (soft ? 1.6 : 1.8) : 1),
        soft,
      );
      if (!p) continue;
      for (let j = 0; j < p.count; j++) {
        const u = j / (p.count - 1),
          x = u * w;
        const arch =
          Math.sin(u * Math.PI * 2 + this.bassPhase) *
          (0.035 + level * 0.045) *
          h;
        const y =
          h * (0.84 - pitch * 0.035) +
          arch +
          Math.sin(u * Math.PI * 3.5 - this.bassPhase) * h * 0.016 +
          k * h * 0.014;
        p.points[j * 2] = x;
        if (this.measured && !this.state.reduced && this.state.motion > 0) {
          const gain =
            1 +
            0.5 *
              clamp(this.state.motion / 0.65) *
              (this.state.scene === "Calm Mode" ? 0.18 : 1);
          const dynamic =
            -pitch * h * 0.035 +
            Math.sin(u * Math.PI * 2 + this.bassPhase) * level * 0.045 * h;
          const rest = y - dynamic;
          const delta =
            dynamic * gain + this.displacement(x, rest + dynamic * gain) * 0.65;
          const room = Math.max(
            1,
            delta < 0 ? rest - h * 0.62 : h * 0.98 - rest,
          );
          p.points[j * 2 + 1] = clamp(
            rest + room * Math.tanh(delta / room),
            h * 0.62,
            h * 0.98,
          );
        } else p.points[j * 2 + 1] = y + this.displacement(x, y) * 0.65;
      }
    }
  }
  private melody(i: "vocals" | "guitar") {
    const w = this.width,
      h = this.height,
      strength = this.strength(i);
    if (strength < 0.005) return;
    const voice = i === "vocals";
    const history = this.histories[i];
    const layers =
      this.state.reduced || this.quality < 0.7 ? 4 : voice ? 12 : 7;
    const base = voice ? 0.4 : 0.5;
    const ref = voice ? 65 : 72;
    const level = this.levels[i];
    const density = this.state.scene === "Calm Mode" ? 0.5 : 1;
    const verticalTracking =
      this.measured && !this.state.reduced && this.state.motion > 0;
    const verticalGain =
      1 +
      0.5 *
        clamp(this.state.motion / 0.65) *
        (this.state.scene === "Calm Mode" ? 0.18 : 1);
    for (let k = layers - 1; k >= 0; k--) {
      const soft = k >= layers - 3;
      const width = soft
        ? (voice ? 16 + level * 35 : 7 + level * 14) * (k - layers + 4)
        : k === 0
          ? 2.3
          : 1;
      const p = this.path(
        voice ? 160 : 80,
        (width * h) / 600,
        palette[i],
        strength * (soft ? 0.24 : k === 0 ? 1 : 0.48) * density,
        soft,
      );
      if (!p) continue;
      for (let j = 0; j < p.count; j++) {
        const u = j / (p.count - 1),
          x = u * w;
        const hp = this.state.reduced ? this.pitch[i] : history.read(u);
        const pitch = clamp((hp - ref) / 17, -1, 1);
        const phraseArc =
          Math.sin(u * Math.PI * 1.65 + (voice ? -0.7 : 0.9)) *
          h *
          (voice ? 0.15 : 0.12);
        const braid =
          Math.sin(
            u * Math.PI * (voice ? 4 : 7) +
              this.phase * (voice ? 0.65 : 1.1) +
              k * 0.28,
          ) *
          h *
          0.025 *
          (0.3 + level);
        const strand = (k - layers / 2) * h * 0.0035 * Math.sin(u * Math.PI);
        let y =
          h * base -
          pitch * h * (voice ? 0.19 : 0.14) +
          phraseArc +
          braid +
          strand;
        if (!voice)
          y +=
            Math.sin(j * 1.74 + this.phase) *
            h *
            0.007 *
            level *
            (this.brightness[i] === undefined
              ? 1
              : 0.5 + this.brightness[i]! * 2);
        const spectrum = this.spectra[i];
        if (spectrum)
          y +=
            (spectrum[Math.min(31, Math.floor(u * 32))] ?? 0) *
            h *
            0.012 *
            level;
        if (this.weights.bass > 0.01 && !(this.measured && this.state.reduced))
          y +=
            Math.sin(u * Math.PI * 2 + this.bassPhase) *
            h *
            0.012 *
            this.levels.bass *
            this.weights.bass;
        p.points[j * 2] = x;
        if (verticalTracking) {
          // Amplify only the sound-driven vertical component. Ease into available
          // headroom instead of clipping the primary contours at the artwork edge.
          const vertical = -pitch * h * (voice ? 0.19 : 0.14);
          const rest = y - vertical;
          const delta =
            vertical * verticalGain +
            this.displacement(x, rest + vertical * verticalGain);
          const margin = h * 0.1;
          const headroom = Math.max(
            1,
            delta < 0 ? rest - margin : h - margin - rest,
          );
          p.points[j * 2 + 1] = clamp(
            rest + headroom * Math.tanh(delta / headroom),
            margin,
            h - margin,
          );
        } else p.points[j * 2 + 1] = y + this.displacement(x, y);
      }
    }
  }
  private saxophone() {
    const strength = this.strength("saxophone");
    if (strength < 0.005) return;
    const level = this.levels.saxophone;
    const layers = this.state.reduced || this.quality < 0.7 ? 2 : 4;
    for (let k = layers - 1; k >= 0; k--) {
      const p = this.path(
        160,
        ((1.5 + level * 5 + k * 2) * this.height) / 600,
        palette.saxophone,
        strength * (k === 0 ? 1 : 0.18),
        k > 0,
      );
      if (!p) continue;
      for (let j = 0; j < p.count; j++) {
        const u = j / (p.count - 1);
        const pitch = this.state.reduced
          ? this.pitch.saxophone
          : this.histories.saxophone.read(u);
        const angle = u * Math.PI * 8 + this.phase * 0.55;
        const envelope = Math.sin(u * Math.PI);
        // Backtracking curves form open loops, distinct from the vocal ribbon.
        const x = (u + Math.sin(angle) * 0.075 * envelope) * this.width;
        const y =
          (0.64 -
            clamp((pitch - 67) / 17, -1, 1) * 0.16 +
            Math.cos(angle) * 0.075 * envelope +
            k * 0.004) *
          this.height;
        p.points[j * 2] = x;
        if (this.measured && !this.state.reduced && this.state.motion > 0) {
          const gain =
            1 +
            0.5 *
              clamp(this.state.motion / 0.65) *
              (this.state.scene === "Calm Mode" ? 0.18 : 1);
          const dynamic = -clamp((pitch - 67) / 17, -1, 1) * 0.16 * this.height;
          const rest = y - dynamic;
          const delta =
            dynamic * gain + this.displacement(x, rest + dynamic * gain);
          const room = Math.max(
            1,
            delta < 0 ? rest - this.height * 0.1 : this.height * 0.9 - rest,
          );
          p.points[j * 2 + 1] = clamp(
            rest + room * Math.tanh(delta / room),
            this.height * 0.1,
            this.height * 0.9,
          );
        } else p.points[j * 2 + 1] = y + this.displacement(x, y);
      }
    }
  }
  private constellations(time: number) {
    const w = this.width,
      h = this.height,
      strength = this.strength("piano");
    if (!this.measured && strength < 0.005) return;
    if (
      this.measured &&
      (this.state.layers.blooms <= 0 || this.eventRelease <= 0)
    )
      return;
    const chords = this.chords.slice(-4);
    if (!chords.length) {
      if (this.measured) return;
      this.flower(
        w * 0.65,
        h * 0.4,
        h * 0.12,
        0.3,
        0,
        palette.piano,
        strength * 0.3,
        8,
      );
      return;
    }
    for (const chord of chords) {
      const age = (time - chord.time) / 1000;
      const fade = clamp(1 - age / 6);
      const stationary =
        this.state.reduced || (this.measured && this.state.motion === 0);
      const openingMs =
        ((this.measured ? 240 : 320) -
          chord.intensity * (this.measured ? 100 : 140)) *
        (0.65 / Math.max(0.1, this.state.motion));
      const opening = 1 - Math.pow(1 - clamp((age * 1000) / openingMs), 3);
      const unfurl = stationary
        ? 1
        : this.measured
          ? opening
          : 1 - Math.exp(-age * 1.8 * this.state.motion);
      const attackAlpha = this.measured ? clamp((age * 1000) / 90) : 1;
      const eventFloor =
        chord.intensity *
        0.65 *
        this.state.layers.blooms *
        this.eventRelease *
        (0.35 + this.state.intensity * 0.65) *
        (this.state.scene === "Calm Mode" ? 0.62 : 1);
      const presence = this.measured
        ? Math.min(1, Math.max(strength, eventFloor) * 1.6)
        : strength;
      const alpha = presence * fade * attackAlpha;
      const glyphScale = this.measured ? Math.max(0.4, h / 550) : 1;
      const x = chord.x * w,
        y = chord.y * h;
      const chorus = chord.section === "Chorus";
      let radius =
        h *
        (chorus ? 0.44 : 0.19) *
        (0.35 + chord.intensity * 0.65) *
        (this.state.scene === "Calm Mode" ? 0.5 : 1);
      if (this.measured) {
        radius *= 1.15;
        const aspect = Math.min(2.1, Math.max(1, w / h / 3));
        radius = Math.min(
          radius,
          (Math.min(x, w - x) / aspect) * 0.9,
          y * 0.9,
          (h - y) * 0.9,
        );
      }
      this.flower(
        x,
        y,
        radius,
        unfurl,
        age * 0.05 * (stationary ? 0 : this.state.motion),
        palette.piano,
        alpha * (chorus ? 1.2 : 0.75),
        chorus ? 32 : 16,
      );
      const notes = chord.pitches;
      // In Live, spectral groups describe register activity, not recognized notes.
      const spectralGroups = this.spectra.piano?.filter(
        (v) => v > 0.025,
      ).length;
      const noteCount =
        this.measured && stationary
          ? (chord.visualNotes ?? 1)
          : this.state.mode === "live"
            ? Math.max(1, Math.min(8, spectralGroups ?? 1))
            : notes.length;
      let lastX = x,
        lastY = y;
      for (let n = 0; n < noteCount; n++) {
        const a = -Math.PI * 0.5 + (n / noteCount) * Math.PI * 2;
        const nx = x + Math.cos(a) * radius * 0.5 * unfurl,
          ny = y + Math.sin(a) * radius * 0.5 * unfurl;
        const size = this.measured
          ? Math.max(2, (5 + chord.intensity * 6) * glyphScale)
          : 5 + chord.intensity * 6;
        const p = this.path(
          5,
          Math.max(0.8, 1.6 * glyphScale),
          palette.piano,
          alpha,
        );
        if (p) {
          p.points.set([
            nx,
            ny - size,
            nx + size,
            ny,
            nx,
            ny + size,
            nx - size,
            ny,
            nx,
            ny - size,
          ]);
        }
        const stem = this.path(
          2,
          Math.max(0.6, glyphScale),
          palette.piano,
          alpha * (this.measured ? 0.65 : 0.5),
        );
        if (stem)
          stem.points.set([
            nx,
            ny + size + 4 * glyphScale,
            nx,
            ny + size + 22 * glyphScale,
          ]);
        const link = this.path(
          2,
          Math.max(0.6, glyphScale),
          palette.piano,
          alpha * (this.measured ? 0.35 : 0.2),
        );
        if (link) link.points.set([lastX, lastY, nx, ny]);
        this.light(nx, ny, 9 * glyphScale, palette.piano, alpha * 0.6);
        lastX = nx;
        lastY = ny;
      }
    }
  }
  private flower(
    x: number,
    y: number,
    radius: number,
    unfurl: number,
    rotation: number,
    color: number,
    alpha: number,
    petals: number,
  ) {
    const aspect = Math.min(2.1, Math.max(1, this.width / this.height / 3));
    const detail =
      this.options.profile === "companion" || this.quality < 0.7
        ? Math.ceil(petals / 2)
        : petals;
    const reduce = this.state.reduced;
    const core = radius * 0.12;
    const strokeScale = this.measured
      ? Math.max(0.65, this.height / 550) * 1.4
      : 1;
    const lightScale = this.measured ? Math.max(0.65, this.height / 550) : 1;
    for (let n = 0; n < detail; n++) {
      const a = (n / detail) * Math.PI * 2 + rotation;
      const p = this.path(
        28,
        (n % 5 === 0 ? 1.4 : 0.8) * strokeScale,
        color,
        alpha * (n % 3 === 0 ? 0.85 : 0.45),
      );
      if (!p) continue;
      for (let j = 0; j < p.count; j++) {
        const t = j / (p.count - 1);
        const r = core + (radius - core) * Math.sin(t * Math.PI) * unfurl;
        const angle = a + Math.sin(t * Math.PI * 2) * (0.18 + 0.15 * unfurl);
        p.points[j * 2] = x + Math.cos(angle) * r * aspect;
        p.points[j * 2 + 1] = y + Math.sin(angle) * r;
      }
      if (n % 3 === 0) {
        const tx = x + Math.cos(a) * radius * unfurl * aspect,
          ty = y + Math.sin(a) * radius * unfurl;
        this.light(
          tx,
          ty,
          (reduce ? 2.5 : 4) * lightScale,
          color,
          alpha * 0.65,
        );
      }
    }
    for (let ring = 0; ring < 2; ring++) {
      const p = this.path(
        64,
        (ring === 0 ? 1.3 : 0.6) * strokeScale,
        color,
        alpha * 0.45,
      );
      if (p)
        for (let j = 0; j < p.count; j++) {
          const a = (j / (p.count - 1)) * Math.PI * 2;
          p.points[j * 2] = x + Math.cos(a) * core * (1 + ring * 0.7) * aspect;
          p.points[j * 2 + 1] = y + Math.sin(a) * core * (1 + ring * 0.7);
        }
    }
    this.light(x, y, 10 * lightScale, color, alpha * 0.4);
  }
  private percussion(time: number) {
    const strength = this.strength("drums");
    if (strength < 0.005) return;
    const w = this.width,
      h = this.height;
    for (const pressure of this.pressures.slice(-8)) {
      const age = (time - pressure.time) / 1000;
      const fade = Math.exp(-age * 1.7);
      const kick = pressure.kind === "kick",
        hat = pressure.kind === "hat";
      const expansion = this.state.reduced ? 0 : age * 0.2 * this.state.motion;
      let radius =
        h *
        ((kick ? 0.065 : hat ? 0.014 : 0.035) + expansion) *
        (this.state.mode === "demo"
          ? 1
          : 0.65 + 0.35 * Math.sqrt(pressure.intensity));
      const x = pressure.x * w,
        y = pressure.y * h;
      if (this.measured)
        radius = Math.min(
          radius * 1.25,
          Math.max(0, Math.min(x, w - x, y, h - y) - h * 0.04),
        );
      const attackVisibility =
        this.state.mode === "demo"
          ? pressure.intensity
          : Math.min(1, Math.pow(pressure.intensity / 0.05, 0.4));
      const alpha = strength * attackVisibility * fade * 1.4;
      const p = this.path(64, kick ? 2.4 : 1.2, palette.drums, alpha);
      if (p)
        for (let j = 0; j < p.count; j++) {
          const a = (j / (p.count - 1)) * Math.PI * 2;
          const deformation = kick
            ? Math.sin(a * 6 + (this.state.reduced ? 0 : age * 3)) *
              h *
              0.006 *
              (this.measured && this.state.reduced ? 1 : fade)
            : 0;
          p.points[j * 2] = x + Math.cos(a) * (radius + deformation);
          p.points[j * 2 + 1] = y + Math.sin(a) * (radius + deformation);
        }
      if (kick) {
        const q = this.path(64, 10, palette.drums, alpha * 0.14, true);
        if (q && p) q.points.set(p.points);
      }
      const petals = hat ? 4 : kick ? 8 : 6;
      for (let n = 0; n < petals; n++) {
        const a = (n / petals) * Math.PI * 2;
        const q = this.path(3, hat ? 1 : 1.5, palette.drums, alpha * 0.7);
        if (q) {
          const end =
            radius +
            h *
              (kick ? 0.026 : 0.017) *
              (this.measured && this.state.reduced ? 1 : fade);
          q.points.set([
            x + Math.cos(a) * radius,
            y + Math.sin(a) * radius,
            x + Math.cos(a + 0.09) * (end * 0.96),
            y + Math.sin(a + 0.09) * (end * 0.96),
            x + Math.cos(a) * end,
            y + Math.sin(a) * end,
          ]);
        }
      }
    }
  }
  private filaments(time: number) {
    const strength = this.measured
      ? this.weights.guitar *
        (0.35 + this.state.intensity * 0.65) *
        (this.state.scene === "Calm Mode" ? 0.62 : 1) *
        this.state.layers.filaments *
        this.detailStrength *
        this.eventRelease
      : this.strength("guitar");
    if (strength < 0.005 || this.state.reduced) return;
    for (const attack of this.attacks.slice(-3)) {
      const age = (time - attack.time) / 1000,
        fade = Math.exp(-age * 1.8);
      const x = this.width * (0.48 + hash(attack.time) * 0.3),
        y = this.height * (0.47 - (attack.pitch - 72) / 36);
      for (let n = 0; n < 4; n++) {
        const p = this.path(
          12,
          1,
          palette.guitar,
          strength * attack.intensity * fade * 0.45,
        );
        if (!p) continue;
        for (let j = 0; j < p.count; j++) {
          const u = j / (p.count - 1);
          p.points[j * 2] =
            x + u * this.width * 0.12 * (0.3 + age) * (n % 2 ? 1 : -1);
          p.points[j * 2 + 1] =
            y +
            Math.sin(u * 4 + n) * this.height * 0.03 +
            u * (n - 1.5) * this.height * 0.08;
        }
      }
    }
  }
  private particles(time: number, quality: number, calm: boolean) {
    if (this.state.reduced) return;
    const mobile = this.options.profile === "companion" || this.width < 600;
    const cap = mobile
      ? LIMITS.mobileParticles
      : this.options.profile === "preview"
        ? 240
        : LIMITS.particles;
    const count = Math.floor(
      cap *
        this.state.particles *
        (this.measured
          ? this.state.layers.filaments * this.detailStrength * 0.15
          : 1) *
        quality *
        (0.15 + this.energy * 0.85) *
        (calm ? 0.15 : 1),
    );
    for (let n = 0; n < count; n++) {
      const i = instruments[n % instruments.length];
      const strength = this.measured
        ? this.weights[i] * (0.35 + this.state.intensity * 0.65)
        : this.strength(i);
      if (strength < 0.01) continue;
      const u = hash(n + 8),
        depth = hash(n + 90);
      let x = ((u + this.phase * 0.004 * (0.3 + depth)) % 1) * this.width;
      let y =
        this.height * (0.15 + hash(n + 5) * 0.69) +
        Math.sin(this.phase * 0.25 + n) * this.height * 0.012;
      y += this.displacement(x, y);
      if (i === "bass") y = mix(y, this.height * 0.82, 0.5);
      const size = (n % 23 === 0 ? 3 : 1.1 + depth * 1.4) * (mobile ? 0.75 : 1);
      this.light(
        x,
        y,
        size,
        palette[i],
        strength * (0.12 + depth * 0.3) * (0.4 + this.levels[i]),
      );
    }
  }
}

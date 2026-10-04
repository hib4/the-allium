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
  add(pitch: number, level: number) {
    const previous = this.size
      ? this.values[(this.cursor - 1 + LIMITS.history) % LIMITS.history]
      : pitch;
    this.values[this.cursor] = mix(
      previous,
      pitch,
      1 - Math.exp(-(1000 / 30) / 180),
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
  };
  private pitch: Record<Instrument, number> = {
    vocals: 65,
    guitar: 72,
    drums: 36,
    bass: 36,
    piano: 65,
  };
  private levels: Record<Instrument, number> = {
    vocals: 0.3,
    guitar: 0.22,
    drums: 0.24,
    bass: 0.4,
    piano: 0.45,
  };
  private energy = 0.28;
  private phase = 0;
  private bassPhase = 0;
  private width = 1;
  private height = 1;
  private options: RenderOptions = {};
  private state!: SessionState;
  private blend = 1;
  constructor(private source: MusicSource = new DemoSource()) {}
  get metrics() {
    return {
      pressures: this.pressures.length,
      chords: this.chords.length,
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
    this.frame.pathCount = 0;
    this.frame.lightCount = 0;
    this.frame.energy = this.energy;
    this.frame.time = time;
    this.bass();
    this.melody("vocals");
    this.melody("guitar");
    this.constellations(time);
    this.percussion(time);
    this.filaments(time);
    this.particles(time, quality, calm);
    return this.frame;
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
      } else
        this.chords.push({
          time: e.timestamp,
          x: 0.55 + hash(Math.floor(n / 8)) * 0.22,
          y: 0.37 + hash(n + 8) * 0.13,
          intensity: e.intensity,
          pitches: [e.pitch ?? 60],
          section: s.section,
        });
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
    p.width = Math.max(0.3, width);
    p.color = this.options.highContrast ? 0xffffff : color;
    p.alpha = clamp(alpha);
    p.soft = soft && !this.options.highContrast;
    return p;
  }
  private light(
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
  ) {
    const cap =
      this.options.profile === "companion" || this.width < 600
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
      size,
      color: this.options.highContrast ? 0xffffff : color,
      alpha: clamp(alpha),
    });
  }
  private strength(i: Instrument) {
    return (
      this.weights[i] *
      (0.35 + this.state.intensity * 0.65) *
      (this.state.scene === "Calm Mode" ? 0.62 : 1)
    );
  }
  private displacement(x: number, y: number): number {
    if (this.state.reduced || this.weights.drums < 0.01) return 0;
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
        ((soft ? 14 + k * 8 : 1.5) * h) / 550,
        palette.bass,
        strength * (soft ? 0.14 : 0.75),
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
        p.points[j * 2 + 1] = y + this.displacement(x, y) * 0.65;
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
        if (!voice) y += Math.sin(j * 1.74 + this.phase) * h * 0.007 * level;
        if (this.weights.bass > 0.01)
          y +=
            Math.sin(u * Math.PI * 2 + this.bassPhase) *
            h *
            0.012 *
            this.levels.bass *
            this.weights.bass;
        p.points[j * 2] = x;
        p.points[j * 2 + 1] = y + this.displacement(x, y);
      }
    }
  }
  private constellations(time: number) {
    const w = this.width,
      h = this.height,
      strength = this.strength("piano");
    if (strength < 0.005) return;
    const chords = this.chords.slice(-4);
    if (!chords.length) {
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
      const unfurl = this.state.reduced
        ? 1
        : 1 - Math.exp(-age * 1.8 * this.state.motion);
      const x = chord.x * w,
        y = chord.y * h;
      const chorus = chord.section === "Chorus";
      const radius =
        h *
        (chorus ? 0.44 : 0.19) *
        (0.35 + chord.intensity * 0.65) *
        (this.state.scene === "Calm Mode" ? 0.5 : 1);
      this.flower(
        x,
        y,
        radius,
        unfurl,
        age * 0.05 * (this.state.reduced ? 0 : this.state.motion),
        palette.piano,
        strength * fade * (chorus ? 1.2 : 0.75),
        chorus ? 32 : 16,
      );
      const notes = chord.pitches;
      let lastX = x,
        lastY = y;
      for (let n = 0; n < notes.length; n++) {
        const a = -Math.PI * 0.5 + (n / notes.length) * Math.PI * 2;
        const nx = x + Math.cos(a) * radius * 0.5 * unfurl,
          ny = y + Math.sin(a) * radius * 0.5 * unfurl;
        const size = 5 + chord.intensity * 6;
        const p = this.path(5, 1.6, palette.piano, strength * fade);
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
        const stem = this.path(2, 1, palette.piano, strength * fade * 0.5);
        if (stem) stem.points.set([nx, ny + size + 4, nx, ny + size + 22]);
        const link = this.path(2, 1, palette.piano, strength * fade * 0.2);
        if (link) link.points.set([lastX, lastY, nx, ny]);
        this.light(nx, ny, 9, palette.piano, strength * fade * 0.6);
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
    for (let n = 0; n < detail; n++) {
      const a = (n / detail) * Math.PI * 2 + rotation;
      const p = this.path(
        28,
        n % 5 === 0 ? 1.4 : 0.8,
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
        this.light(tx, ty, reduce ? 2.5 : 4, color, alpha * 0.65);
      }
    }
    for (let ring = 0; ring < 2; ring++) {
      const p = this.path(64, ring === 0 ? 1.3 : 0.6, color, alpha * 0.45);
      if (p)
        for (let j = 0; j < p.count; j++) {
          const a = (j / (p.count - 1)) * Math.PI * 2;
          p.points[j * 2] = x + Math.cos(a) * core * (1 + ring * 0.7) * aspect;
          p.points[j * 2 + 1] = y + Math.sin(a) * core * (1 + ring * 0.7);
        }
    }
    this.light(x, y, 10, color, alpha * 0.4);
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
      const radius = h * ((kick ? 0.065 : hat ? 0.014 : 0.035) + expansion);
      const x = pressure.x * w,
        y = pressure.y * h;
      const alpha = strength * pressure.intensity * fade * 1.4;
      const p = this.path(64, kick ? 2.4 : 1.2, palette.drums, alpha);
      if (p)
        for (let j = 0; j < p.count; j++) {
          const a = (j / (p.count - 1)) * Math.PI * 2;
          const deformation = kick
            ? Math.sin(a * 6 + (this.state.reduced ? 0 : age * 3)) *
              h *
              0.006 *
              fade
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
          const end = radius + h * (kick ? 0.026 : 0.017) * fade;
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
    const strength = this.strength("guitar");
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
        quality *
        (0.15 + this.energy * 0.85) *
        (calm ? 0.15 : 1),
    );
    for (let n = 0; n < count; n++) {
      const i = instruments[n % 5];
      const strength = this.strength(i);
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

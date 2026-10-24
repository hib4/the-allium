import { OriginalChoreography } from "./original";
import { LivingComposition } from "./living";
import {
  LIMITS,
  type ScoreFrame,
  type Stroke,
  type RenderOptions,
} from "./choreography";
import type { MusicSource } from "./source";
import type { SessionState } from "./types";

const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
interface Accent {
  time: number;
  strength: number;
  slot: number;
  route: number;
  origin: number;
  clock: number;
}
interface BloomEvent {
  slot: number;
  role: "primary" | "secondary";
  time: number;
  strength: number;
  target: number;
  activation: number;
  attackMs: number;
  pulseTime: number;
  pulseStrength: number;
  birthEnergy: number;
  birthBands: number[];
  birthMorph: number;
  anchor?: { x: number; y: number };
  releaseTime?: number;
  releaseValue?: number;
}
interface Trace {
  time: number;
  energy: number;
  width: number;
  height: number;
  points: Float32Array;
}

/** One measured mix, one continuous canvas. No inferred instruments or synthetic activity. */
export class MixedChoreography {
  private frame: ScoreFrame = {
    paths: [],
    pathCount: 0,
    lights: [],
    lightCount: 0,
    energy: 0,
    time: 0,
  };
  private original?: OriginalChoreography;
  private living = new LivingComposition();
  private variant = "current";
  private last = -1;
  private phase = 0;
  private mode = "";
  private levels = [0, 0, 0];
  private spectrum = new Float32Array(32);
  private energy = 0;
  private brightness = 0;
  private change = 0;
  private dynamics = 0;
  private bloomEnergy = 0;
  private bloomBands = [0, 0, 0];
  private bloomMorph = 0;
  private bloomOpen = [0, 0, 0];
  private blooms: BloomEvent[] = [];
  private bloomRest = [-Infinity, -Infinity, -Infinity];
  private nextBloom = 0;
  private growthArmed = false;
  private accents: Accent[] = [];
  private traces: Trace[] = [];
  private tracePool: Trace[] = [];
  private history = new Float32Array(64 * 6);
  private historyCursor = 0;
  private historySize = 0;
  private historySampled = -1;
  private activityClock = 0;
  private spines = Array.from(
    { length: 3 },
    () => new Float32Array(LIMITS.points * 2),
  );
  get metrics() {
    return {
      original:
        this.variant === "original" || this.variant === "combined"
          ? this.original?.metrics
          : undefined,
      composition: { ...this.living.value },
      history: this.historySize,
      accents: this.accents.length,
      trails: this.traces.length,
      blooms: [...this.bloomOpen],
      bloomEvents: this.blooms.map((b) => ({
        slot: b.slot,
        role: b.role,
        time: b.time,
        expires: b.time + 2800,
        envelope: this.bloomOpen[b.slot],
        pulse: this.bloomPulse(b, this.last),
        openingMs: this.bloomAttack(b),
        strength: b.strength,
      })),
    };
  }
  private sampled = -1;
  private lastAccent = -Infinity;
  private count = 0;
  constructor(private source?: MusicSource) {}

  private bloomAttack(b: BloomEvent) {
    return b.attackMs;
  }
  private bloomPulse(b: BloomEvent, time: number) {
    const age = time - b.pulseTime;
    if (age < 0 || age >= 570 || b.releaseTime !== undefined) return 0;
    const attack = clamp(age / 120);
    return (
      attack *
      attack *
      (3 - 2 * attack) *
      (1 - clamp((age - 120) / 450)) ** 2 *
      b.pulseStrength
    );
  }
  private bloomEnvelope(b: BloomEvent, time: number) {
    const age = Math.max(0, time - b.time);
    const attack = clamp(age / this.bloomAttack(b));
    const release = 1 - clamp((age - 550) / 2250);
    const value = attack * attack * (3 - 2 * attack) * release * release;
    return b.releaseTime === undefined
      ? value
      : Math.min(
          value,
          (b.releaseValue ?? 0) *
            (1 - clamp((time - b.releaseTime) / 600)) ** 2,
        );
  }
  private activateBloom(
    time: number,
    strength: number,
    regions: number,
    onset = false,
  ) {
    const primary = this.blooms.find((b) => b.role === "primary");
    const role = primary ? "secondary" : "primary";
    if (
      onset &&
      primary &&
      primary.releaseTime === undefined &&
      time - primary.pulseTime >= 400 &&
      time - primary.time >= 400
    ) {
      primary.pulseTime = time;
      primary.pulseStrength = strength;
    }
    // One musical change can supply both an onset and a growth edge; treat it as one event.
    const recent = this.blooms.some(
      (b) => time >= b.time && time - b.time < 250,
    );
    if (!recent && !this.blooms.some((b) => b.role === role)) {
      for (let n = 0; n < regions; n++) {
        const preferred =
          this.variant === "living"
            ? Math.round(this.living.value.focus * (regions - 1))
            : this.nextBloom;
        const slot = (preferred + n) % regions;
        if (
          time < this.bloomRest[slot] ||
          this.blooms.some((b) => b.slot === slot)
        )
          continue;
        this.blooms.push({
          slot,
          role,
          time,
          strength,
          target: strength,
          activation: 0,
          attackMs: 320 - 140 * strength,
          pulseTime: time,
          pulseStrength: 0,
          birthEnergy: this.bloomEnergy,
          birthBands: [...this.bloomBands],
          birthMorph: this.bloomMorph,
        });
        this.nextBloom = (slot + 1) % regions;
        return;
      }
    }
    // Reinforcement never changes the event's start, expiry or role.
    if (primary && primary.releaseTime === undefined)
      primary.target = Math.min(
        1,
        Math.max(primary.target, strength) + strength * 0.08,
      );
  }

  update(
    time: number,
    state: SessionState,
    width: number,
    height: number,
    options: RenderOptions,
    quality: number,
  ): ScoreFrame {
    if (
      state.liveChoreography === "original" ||
      state.liveChoreography === "combined"
    ) {
      if (this.variant !== state.liveChoreography) {
        this.original = new OriginalChoreography(this.source);
        this.variant = state.liveChoreography;
      }
      return this.original!.update(
        time,
        state,
        width,
        height,
        options,
        quality,
      );
    }
    const discontinuity =
      this.mode === "" ||
      time < this.last ||
      (this.last >= 0 && time - this.last > 1000);
    const experimental = state.liveChoreography === "living";
    const variantChanged = this.variant !== state.liveChoreography;
    this.variant = state.liveChoreography;
    const reset = this.mode !== state.mode || discontinuity || variantChanged;
    if (reset) {
      this.mode = state.mode;
      this.living.reset();
      this.accents.length = 0;
      this.growthArmed = false;
      if (discontinuity || variantChanged || state.mode === "live") {
        this.bloomOpen.fill(0);
        this.blooms.length = 0;
        this.bloomRest.fill(-Infinity);
      }
      this.tracePool.push(...this.traces);
      this.traces.length = 0;
      this.historySize = this.historyCursor = 0;
      this.historySampled = -1;
      if (discontinuity) {
        this.bloomEnergy = this.bloomMorph = 0;
        this.bloomBands.fill(0);
        this.levels.fill(0);
        this.spectrum.fill(0);
        this.energy = this.brightness = this.change = this.dynamics = 0;
      }
      this.lastAccent = -Infinity;
      this.sampled = -1;
    }
    const dt =
      this.last >= 0 && !discontinuity
        ? Math.min(100, Math.max(0, time - this.last))
        : 16;
    const input = this.source?.mixed?.(time, reset ? time : this.last);
    this.last = time;
    const f = input?.feature;
    const active = state.mode === "live" && !!f?.active;
    const follow = (v: number, target: number) =>
      Math.abs(target - v) < 0.0001
        ? target
        : v + (target - v) * (1 - Math.exp(-dt / (target > v ? 180 : 800)));
    for (let i = 0; i < 3; i++)
      this.levels[i] = follow(this.levels[i], active ? clamp(f!.bands[i]) : 0);
    for (let i = 0; i < 32; i++)
      this.spectrum[i] = follow(
        this.spectrum[i],
        active ? clamp(f!.spectrum[i] ?? 0) : 0,
      );
    this.energy = follow(this.energy, active ? clamp(f!.intensity) : 0);
    this.brightness = follow(
      this.brightness,
      active ? clamp(f!.centroid / 12000) : 0,
    );
    this.change = follow(this.change, active ? clamp(f!.flux) : 0);
    this.dynamics = follow(
      this.dynamics,
      active
        ? clamp(
            Math.max(0, f!.dynamics) +
              Math.max(0, f!.shortEnergy - f!.longEnergy),
          )
        : 0,
    );
    const bloomEnergyTarget = active ? clamp(f!.intensity) : 0;
    this.bloomEnergy +=
      (bloomEnergyTarget - this.bloomEnergy) *
      (1 - Math.exp(-dt / (bloomEnergyTarget > this.bloomEnergy ? 120 : 650)));
    const bandSum = active
      ? f!.bands.reduce((n, v) => n + Math.max(0, v), 0)
      : 0;
    for (let i = 0; i < 3; i++) {
      const target = bandSum > 0.0001 ? clamp(f!.bands[i] / bandSum) : 0;
      this.bloomBands[i] +=
        (target - this.bloomBands[i]) * (1 - Math.exp(-dt / 500));
    }
    this.bloomMorph +=
      ((active ? clamp(f!.flux) : 0) - this.bloomMorph) *
      (1 - Math.exp(-dt / 500));
    const calm = state.scene === "Calm Mode";
    const motion = state.reduced ? 0 : state.motion * (calm ? 0.18 : 1);
    // Decay can alter brightness after input stops, but never advances procedural motion.
    if (active)
      this.phase += (dt / 1000) * motion * (0.12 + this.energy * 0.65);
    if (active) {
      this.activityClock += dt;
      if (this.historySampled < 0 || time - this.historySampled >= 50) {
        this.history.set(
          [this.energy, ...this.levels, this.brightness, this.change],
          this.historyCursor * 6,
        );
        this.historyCursor = (this.historyCursor + 1) % 64;
        this.historySize = Math.min(64, this.historySize + 1);
        this.historySampled = time;
      }
    } else {
      this.historySize = this.historyCursor = 0;
      this.historySampled = -1;
    }
    if (!active || state.reduced) {
      this.tracePool.push(...this.traces);
      this.traces.length = 0;
    }
    const regions = width / height >= 3 ? 3 : 2;
    this.blooms = this.blooms.filter((b) => {
      const done =
        time >= b.time + 2800 ||
        (b.releaseTime !== undefined && time >= b.releaseTime + 600) ||
        b.slot >= regions;
      if (done)
        this.bloomRest[b.slot] =
          Math.min(b.time + 2800, (b.releaseTime ?? Infinity) + 600) + 450;
      return !done;
    });
    if (state.layers.blooms <= 0) this.blooms.length = 0;
    if (!active) {
      this.growthArmed = false;
      for (const b of this.blooms)
        if (b.releaseTime === undefined) {
          b.releaseValue = this.bloomEnvelope(b, time);
          b.releaseTime = time;
        }
    }
    if (active && Object.values(state.layers).some((v) => v > 0))
      for (const e of input?.events ?? []) {
        if (
          e.timestamp <= time &&
          time - e.timestamp < 500 &&
          e.timestamp - this.lastAccent >= 300
        ) {
          this.accents.push({
            time: e.timestamp,
            strength: clamp(e.intensity),
            slot: this.count % (width / height >= 3 ? 3 : 2),
            route: this.count % 3,
            origin:
              (width / height >= 3 ? [0.18, 0.51, 0.82] : [0.27, 0.73])[
                this.count % (width / height >= 3 ? 3 : 2)
              ] +
              (hash(this.count++ + 10) - 0.5) * 0.04,
            clock: this.activityClock,
          });
          this.lastAccent = e.timestamp;
          if (state.layers.blooms > 0 && e.intensity >= 0.45)
            this.activateBloom(e.timestamp, clamp(e.intensity), regions, true);
        }
      }
    this.accents = this.accents.filter((a) => time - a.time < 2800).slice(-6);
    const composition = this.living.update(
      time,
      dt,
      active ? f : null,
      this.accents.map((a) => ({ timestamp: a.time, intensity: a.strength })),
      state.reduced,
      motion,
      calm,
    );
    const living = experimental ? composition : null;
    // Scenic development follows measured energy, never a free-running show clock.
    const fullness = clamp(
      this.energy * 0.65 +
        (active && !state.reduced ? composition.fast : this.energy) * 0.35,
    );
    const spatial =
      living && !state.reduced ? motion * (0.3 + this.energy * 0.7) : 0;
    const frame = this.frame;
    frame.pathCount = frame.lightCount = 0;
    frame.time = time;
    frame.energy = this.energy;
    const strength = state.intensity * (calm ? 0.62 : 1);
    const q = Math.max(0.35, Math.min(1, quality));
    const tint = (v: number) => (options.highContrast ? 0xffffff : v);
    const path = (
      points: number,
      lineWidth: number,
      color: number,
      alpha: number,
      soft = false,
      tapered = false,
    ): Stroke | null => {
      if (frame.pathCount >= LIMITS.paths || alpha <= 0.0001) return null;
      const n = frame.pathCount++;
      const p =
        frame.paths[n] ??
        (frame.paths[n] = {
          points: new Float32Array(LIMITS.points * 2),
          count: 0,
          width: 1,
          color: 0,
          alpha: 0,
          soft: false,
        });
      p.count = Math.min(points, LIMITS.points);
      p.width = lineWidth;
      p.color = tint(color);
      p.alpha = clamp(alpha);
      p.soft = soft;
      if (tapered && !p.widths) p.widths = new Float32Array(LIMITS.points);
      p.variableWidth = tapered;
      return p;
    };
    const lightBudget = options.profile === "preview" ? 60 : 180;
    const light = (
      x: number,
      y: number,
      size: number,
      color: number,
      alpha: number,
    ) => {
      if (frame.lightCount >= lightBudget || alpha <= 0.001) return;
      const n = frame.lightCount++;
      const l =
        frame.lights[n] ??
        (frame.lights[n] = { x: 0, y: 0, size: 1, color: 0, alpha: 0 });
      l.x = x;
      l.y = y;
      l.size = size;
      l.color = tint(color);
      l.alpha = clamp(alpha);
    };
    const centers = Array.from({ length: regions }, (_, i) => ({
      x: width * (regions === 3 ? [0.18, 0.51, 0.82][i] : [0.27, 0.73][i]),
      y: height * (regions === 3 ? [0.35, 0.59, 0.32][i] : [0.36, 0.62][i]),
    }));
    // Growth is edge-triggered; steady energy can never hold a flower open.
    const growth = clamp((this.dynamics - 0.08) * 2.6);
    if (active) {
      if (growth < 0.2) this.growthArmed = true;
      if (this.growthArmed && growth >= 0.45) {
        if (state.layers.blooms > 0) this.activateBloom(time, growth, regions);
        this.growthArmed = false;
      }
    }
    this.bloomOpen.fill(0);
    for (const b of this.blooms) {
      b.strength += (b.target - b.strength) * (1 - Math.exp(-dt / 180));
      const target = this.bloomEnvelope(b, time) * b.strength;
      b.activation += Math.max(
        -dt / 250,
        Math.min(dt / 250, (target - b.activation) * (1 - Math.exp(-dt / 90))),
      );
      this.bloomOpen[b.slot] = b.activation;
    }
    const bloomAt = (slot: number) => this.blooms.find((b) => b.slot === slot);
    const points = LIMITS.points;
    const readHistory = (u: number, channel: number) => {
      if (!this.historySize || state.reduced)
        return channel === 0
          ? this.energy
          : channel <= 3
            ? this.levels[channel - 1]
            : channel === 4
              ? this.brightness
              : this.change;
      const lag = Math.min(this.historySize - 1, (1 - u) * 60);
      const a = Math.floor(lag),
        b = Math.min(this.historySize - 1, a + 1);
      const at = (n: number) =>
        this.history[((this.historyCursor - 1 - n + 64) % 64) * 6 + channel];
      // Catmull–Rom interpolation avoids corners between 20 Hz feature samples.
      const p0 = at(Math.max(0, a - 1)),
        p1 = at(a),
        p2 = at(b),
        p3 = at(Math.min(this.historySize - 1, b + 1)),
        t = lag - a;
      return clamp(
        0.5 *
          (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t),
      );
    };
    const accentPosition = (a: Accent) =>
      state.reduced
        ? a.origin
        : clamp(
            a.origin +
              ((this.activityClock - a.clock) / 1000) *
                0.16 *
                motion *
                (a.route % 2 ? -1 : 1),
          );
    for (let route = 0; route < 3; route++) {
      const spine = this.spines[route];
      for (let j = 0; j < points; j++) {
        const u = j / (points - 1);
        // Related organic treatments share measured mix features. No pitch or source labels.
        const contour = (v: number) =>
          (readHistory(v, 0) - 0.35) * -0.2 +
          (readHistory(v, 4) - 0.2) * -0.24 +
          (readHistory(v, 2) - readHistory(v, 1)) * 0.13;
        const low = readHistory(u, 1),
          mid = readHistory(u, 2);
        const foldA = Math.exp(-(((u - 0.24) / 0.16) ** 2));
        const foldB = Math.exp(-(((u - 0.7) / 0.19) ** 2));
        const bend = Math.sin(
          u * TAU * (route === 0 ? 1.8 : 1.25) -
            this.phase * 0.24 +
            route * 1.9,
        );
        const scenic = state.reduced ? 0 : motion * fullness;
        const y =
          route === 2
            ? 0.78 + Math.sin(u * TAU * 1.1 + 0.7) * (0.045 + low * 0.04)
            : 0.49 +
              (route === 0
                ? -foldA * (0.16 + low * 0.08) + foldB * 0.15
                : foldA * 0.16 - foldB * (0.15 + low * 0.065)) +
              bend * (0.055 + mid * 0.075) +
              contour(u) * 0.45 +
              Math.sin(u * TAU * 0.85 + route * 2.3 - this.phase * 0.09) *
                scenic *
                (0.035 + low * 0.055) +
              Math.sin(u * TAU * 2.2 + route * 1.6 - this.phase * 0.11) *
                this.change *
                0.025;
        const envelope = Math.sin(u * Math.PI);
        let displacement = 0;
        if (!state.reduced)
          for (const e of this.accents)
            if (e.route === route) {
              const distance = ((u - accentPosition(e)) * width) / height;
              const age = Math.max(0, (time - e.time) / 1000);
              displacement +=
                Math.sin(distance * 22) *
                Math.exp(-((distance / 0.17) ** 2)) *
                (1 - Math.exp(-age * 12)) *
                Math.exp(-age * 1.6) *
                e.strength *
                0.035 *
                motion;
            }
        spine[j * 2] =
          width * (-0.025 + u * 1.05) +
          height *
            Math.sin(u * TAU * 2 + this.phase * 0.23 + route) *
            0.035 *
            envelope;
        const focusEnvelope = living
          ? Math.exp(-(((u - living.focus) / 0.22) ** 2))
          : 0;
        // Converge only near the shared focal region; let the outer field breathe apart.
        const convergence = living
          ? (0.5 - y) * focusEnvelope * living.gather * 0.55
          : 0;
        const separation = living
          ? (route - 1) * (1 - focusEnvelope) * living.expansion * 0.055
          : 0;
        const memoryFold = living
          ? Math.sin(u * TAU * 0.8 + route * 1.7 - this.phase * 0.16) *
            living.memory *
            0.065
          : 0;
        spine[j * 2 + 1] =
          height *
          (y +
            spatial * (convergence + separation + memoryFold) +
            envelope *
              Math.sin(u * TAU * 3 - this.phase * 0.4 + route) *
              (route === 2
                ? 0.003 + low * 0.008
                : route === 0
                  ? 0.003 + mid * 0.01
                  : 0) +
            displacement);
      }
    }
    const sample = (route: number, u: number) => {
      const p = this.spines[route],
        v = clamp(u) * (points - 1),
        a = Math.floor(v),
        b = Math.min(points - 1, a + 1),
        t = v - a;
      return {
        x: p[a * 2] + (p[b * 2] - p[a * 2]) * t,
        y: p[a * 2 + 1] + (p[b * 2 + 1] - p[a * 2 + 1]) * t,
      };
    };
    // Blooms grow from the space between converging spines, with visible connecting stems.
    for (let i = 0; i < regions; i++) {
      const u = regions === 3 ? [0.18, 0.51, 0.82][i] : [0.27, 0.73][i];
      const a = sample(0, u),
        b = sample(1, u);
      centers[i].x = (a.x + b.x) * 0.5;
      centers[i].y = Math.max(
        height * 0.34,
        Math.min(
          height * 0.66,
          (a.y + b.y) * 0.5 + height * (i === 1 ? 0.12 : -0.12),
        ),
      );
    }
    if (state.reduced)
      for (const event of this.blooms) {
        event.anchor ??= { ...centers[event.slot] };
        centers[event.slot] = event.anchor;
      }
    if (!state.reduced)
      for (const event of this.blooms) {
        const center = centers[event.slot];
        const u = center.x / width;
        const a = sample(0, u),
          b = sample(1, u);
        const opening = clamp(
          ((event.releaseTime ?? time) - event.time) / this.bloomAttack(event),
        );
        const unfold = opening * opening * (3 - 2 * opening);
        center.y = (a.y + b.y) * 0.5 * (1 - unfold) + center.y * unfold;
      }
    const bloomShape = (slot: number) => {
      const event = bloomAt(slot),
        center = centers[slot];
      const secondary = event?.role === "secondary";
      const envelope = this.bloomOpen[slot];
      const open = state.reduced
        ? 0.55
        : clamp(
            ((event?.releaseTime ?? time) - (event?.time ?? time)) /
              (event ? this.bloomAttack(event) : 320),
          );
      const energy = state.reduced
        ? (event?.birthEnergy ?? 0)
        : this.bloomEnergy;
      const bands = state.reduced
        ? (event?.birthBands ?? [0, 0, 0])
        : this.bloomBands;
      const morph = state.reduced ? (event?.birthMorph ?? 0) : this.bloomMorph;
      const pulse =
        !state.reduced && event
          ? this.bloomPulse(event, time) * (calm ? 0.35 : 1)
          : 0;
      // The former 30% size reduction remains a hard ceiling, including onset expansion.
      const cap =
        0.7 *
        (secondary ? 0.65 : 1) *
        Math.min(
          height * 0.32,
          width / (regions * 3.2),
          Math.min(center.x, width - center.x, center.y, height - center.y) /
            1.16,
        );
      const radius = Math.min(
        cap,
        cap *
          (0.48 + Math.sqrt(energy) * 0.52) *
          (0.9 + bands[0] * 0.1) *
          (0.82 + (event?.strength ?? 0) * 0.18) *
          (state.reduced ? 1 : 0.2 + open * 0.8) *
          (1 + pulse * 0.12),
      );
      return { event, open, radius, envelope, secondary, pulse, bands, morph };
    };
    const palette = [0xff3ebb, 0x6eb4ff, 0x00b3a7];
    const ribbon = (
      route: number,
      kind: "outer" | "middle" | "inner" | "halo" | "core" | "strand",
      strand = 0,
      opacity = 1,
    ) => {
      const gain =
        state.layers[route === 2 ? "currents" : "lines"] *
        (route === 2 ? 0.45 : 1) *
        (living
          ? 0.85 +
            living.depth * (route === 0 ? 0.3 : route === 1 ? 0.12 : -0.2)
          : 1);
      const level = route === 2 ? this.levels[0] : this.levels[1];
      const readable =
        0.012 +
        Math.pow(this.energy, 0.28) * 0.95 * (0.8 + Math.sqrt(level) * 0.2);
      const soft = kind !== "core" && kind !== "strand";
      const contourCount =
        route === 0 ? (q < 0.5 ? 6 : 9) : route === 1 ? (q < 0.5 ? 5 : 6) : 4;
      const spread =
        (living && !state.reduced ? 0.75 + living.expansion * 0.35 : 1) *
        height *
        (route === 2 ? 0.045 : 0.15 + fullness * 0.12 + this.levels[1] * 0.035);
      const width = Math.max(
        soft ? 0 : kind === "core" ? 1 : 0.75,
        height *
          {
            outer: 0.13,
            middle: 0.075,
            inner: 0.035,
            halo: 0.009,
            core: 0.0065,
            strand: 0.0032,
          }[kind] *
          (0.85 + this.energy * 0.25),
      );
      const alpha =
        gain *
        strength *
        readable *
        opacity *
        {
          outer: 0.26,
          middle: 0.34,
          inner: 0.4,
          halo: 0.46,
          core: 1,
          strand: 0.9,
        }[kind];
      const p = path(points, width, palette[route], alpha, soft, true);
      if (!p) return;
      const base = this.spines[route];
      for (let j = 0; j < p.count; j++) {
        const u = j / (p.count - 1);
        // Related strands fan and reconverge without collapsing into one luminous stroke.
        const fan =
          0.28 +
          0.72 * (0.5 + 0.5 * Math.sin(u * TAU * 1.35 + route * 1.7)) ** 0.7;
        const available = Math.max(
          0,
          Math.min(
            base[j * 2 + 1] - height * 0.05,
            height * 0.95 - base[j * 2 + 1],
          ) * 1.65,
        );
        const band = Math.min(spread * fan, available);
        const fraction =
          kind === "strand"
            ? strand / (contourCount - 1) - 0.5
            : kind === "core" || kind === "halo"
              ? -0.5
              : 0;
        // Different contours within one measured stream, not independent voices.
        const strandFold =
          kind === "strand"
            ? Math.sin(
                u * TAU * (0.8 + strand * 0.085) +
                  strand * 1.4 +
                  route -
                  this.phase * 0.12,
              ) *
              Math.sin(u * Math.PI) *
              band *
              (0.12 + this.levels[1] * 0.24)
            : 0;
        const texture =
          kind === "strand"
            ? readHistory(u, 3) *
              height *
              0.0007 *
              Math.sin(u * TAU * 12 + this.phase * 0.3)
            : 0;
        p.points[j * 2] = base[j * 2];
        p.points[j * 2 + 1] =
          base[j * 2 + 1] +
          band * fraction +
          texture +
          strandFold +
          (kind === "strand"
            ? Math.sin(u * TAU * 2.6 + strand * 0.4 - this.phase * 0.2) *
              height *
              this.levels[1] *
              0.002 *
              Math.sin(u * Math.PI)
            : 0);
        const highlight = Math.exp(
          -(
            ((u -
              (living?.focus ?? 0.22 + route * 0.28) -
              Math.sin(this.phase * 0.45 + route) * 0.14) /
              0.1) **
            2
          ),
        );
        const edge = clamp(u / 0.065) * clamp((1 - u) / 0.065);
        p.widths![j] = Math.max(
          0.015,
          edge *
            (0.5 + 0.5 * Math.sin(u * 8 + route + strand * 0.2) ** 2) *
            (0.85 +
              highlight * fullness * (living ? 0.8 + living.luminosity : 1)),
        );
      }
    };
    // A small pool of real previous spine geometry supplies fading motion trails.
    if (
      active &&
      !state.reduced &&
      q > 0.6 &&
      (this.sampled < 0 || time - this.sampled >= 180)
    ) {
      const trace = this.tracePool.pop() ?? {
        time: 0,
        energy: 0,
        width: 0,
        height: 0,
        points: new Float32Array(3 * LIMITS.points * 2),
      };
      trace.time = time;
      trace.energy = this.energy;
      trace.width = width;
      trace.height = height;
      for (let route = 0; route < 3; route++)
        trace.points.set(this.spines[route], route * LIMITS.points * 2);
      this.traces.push(trace);
      this.sampled = time;
      if (this.traces.length > 8) this.tracePool.push(this.traces.shift()!);
    }
    if (q > 0.6 && !state.reduced && active)
      for (let n = 0; n < this.traces.length; n += 3) {
        const trace = this.traces[n],
          age = time - trace.time;
        if (
          age < 160 ||
          age > 1400 ||
          trace.width !== width ||
          trace.height !== height
        )
          continue;
        for (let route = 0; route < 2; route++) {
          const p = path(
            points,
            height * 0.001,
            palette[route],
            state.layers.lines *
              strength *
              trace.energy *
              Math.exp(-age / 600) *
              (0.2 + fullness * 0.14),
            false,
            true,
          );
          if (p)
            for (let j = 0; j < p.count; j++) {
              const u = j / (p.count - 1);
              p.points[j * 2] = trace.points[route * points * 2 + j * 2];
              p.points[j * 2 + 1] =
                trace.points[route * points * 2 + j * 2 + 1];
              p.widths![j] = Math.max(0.01, Math.sin(u * Math.PI));
            }
        }
      }
    // Distant contours occupy a wider depth field. Their roots and folds belong
    // to the same spines; the low opacity keeps foreground crossings legible.
    if (q > 0.5 && this.energy > 0.001)
      for (let route = 0; route < 3; route++)
        for (let side = -1; side <= 1; side += 2) {
          const gain = state.layers[route === 2 ? "currents" : "lines"];
          const p = path(
            96,
            height * 0.0012,
            palette[route],
            gain * strength * Math.sqrt(this.energy) * (0.12 + fullness * 0.12),
            false,
            true,
          );
          if (!p) continue;
          for (let j = 0; j < p.count; j++) {
            const u = j / (p.count - 1),
              edge = Math.sin(u * Math.PI);
            const root = sample(route, u);
            p.points[j * 2] = root.x;
            p.points[j * 2 + 1] = Math.max(
              height * 0.06,
              Math.min(
                height * 0.94,
                root.y +
                  side *
                    height *
                    edge *
                    (0.09 + fullness * 0.1) *
                    (0.55 + 0.45 * Math.sin(u * TAU + route * 1.8) ** 2),
              ),
            );
            p.widths![j] = Math.max(0.01, edge * edge);
          }
        }
    // Translucent folded sheets add luminous mass between the fine strands.
    // Four short meshes, rather than more primary systems or a full-screen wash.
    if (q > 0.6 && !calm && this.energy > 0.001)
      for (let route = 0; route < 2; route++)
        for (let n = 0; n < 2; n++) {
          const p = path(
            128,
            height * (0.026 + fullness * 0.02),
            palette[route],
            state.layers.lines * strength * Math.sqrt(this.energy) * 0.38,
            true,
            true,
          );
          if (!p) continue;
          for (let j = 0; j < p.count; j++) {
            const u = j / (p.count - 1),
              root = sample(route, u),
              edge = Math.sin(u * Math.PI);
            p.points[j * 2] = root.x;
            p.points[j * 2 + 1] =
              root.y +
              height *
                edge *
                Math.sin(
                  u * TAU * (1.2 + n * 0.3) +
                    route * 2 +
                    n * 2.1 -
                    this.phase * 0.12,
                ) *
                (0.028 + this.levels[1] * 0.055);
            p.widths![j] = Math.max(
              0.01,
              edge * (0.3 + 0.7 * Math.sin(u * TAU * 1.6 + n + route) ** 2),
            );
          }
        }
    // Soft diffusion surrounds the bodies; sharp strands remain readable above it.
    for (const kind of ["outer", "middle", "inner", "halo"] as const)
      for (const route of [2, 0, 1]) ribbon(route, kind);
    for (let route = 0; route < 3; route++) {
      const count =
        route === 0 ? (q < 0.5 ? 6 : 9) : route === 1 ? (q < 0.5 ? 5 : 6) : 4;
      for (let n = count - 1; n >= 1; n--)
        ribbon(route, "strand", n, 1 - (n / (count - 1)) * 0.3);
      ribbon(route, "core");
    }
    // Continuous highlights reveal the ribbon surface; only onsets make events.
    if (active && !state.reduced && q > 0.5)
      for (let route = 0; route < 2; route++) {
        const u = clamp(
          (living?.focus ?? 0.3 + route * 0.4) +
            Math.sin(this.phase * 0.38 + route * 2) * 0.18,
        );
        for (let halo = 0; halo < 2; halo++) {
          const p = path(
            40,
            height * (halo ? 0.0035 : 0.03),
            halo ? (route ? 0xe3d1ff : 0xffc6e8) : palette[route],
            state.layers.lines *
              strength *
              Math.sqrt(this.energy) *
              (halo ? 0.62 : 0.48),
            !halo,
            true,
          );
          if (!p) continue;
          for (let j = 0; j < p.count; j++) {
            const t = j / (p.count - 1),
              point = sample(route, u + (t - 0.5) * 0.18);
            p.points[j * 2] = point.x;
            p.points[j * 2 + 1] = point.y;
            p.widths![j] = Math.max(0.01, Math.sin(t * Math.PI) ** 2);
          }
        }
      }
    // An accepted onset is one coordinated local pulse, not a global brightness flash.
    for (const e of this.accents) {
      const age = Math.max(0, (time - e.time) / 1000),
        u = accentPosition(e);
      const envelope =
        (1 - Math.exp(-age * 10)) * Math.exp(-age * 1.35) * e.strength;
      const gain = state.layers[e.route === 2 ? "currents" : "lines"];
      for (let glow = 0; glow < 2; glow++) {
        const p = path(
          32,
          height * (glow ? 0.0028 : 0.026),
          glow ? 0xe3d1ff : palette[e.route],
          envelope * gain * strength * (glow ? 0.72 : 0.27),
          !glow,
          true,
        );
        if (p)
          for (let j = 0; j < p.count; j++) {
            const t = j / (p.count - 1),
              v = u + (t - 0.5) * Math.min(0.12, (height / width) * 0.7),
              point = sample(e.route, v);
            p.points[j * 2] = point.x;
            p.points[j * 2 + 1] = point.y;
            p.widths![j] = Math.max(0.01, Math.sin(t * Math.PI) ** 1.6);
          }
      }
    }
    if (state.layers.blooms > 0)
      for (let i = 0; i < regions; i++)
        for (let route = 0; route < 2; route++) {
          const u = regions === 3 ? [0.18, 0.51, 0.82][i] : [0.27, 0.73][i];
          const root = sample(route, u),
            center = centers[i];
          const p = path(
            32,
            height * 0.0012,
            0xc4a5ff,
            state.layers.blooms *
              strength *
              this.bloomOpen[i] *
              0.22 *
              (bloomAt(i)?.role === "secondary" ? 0.5 : 1),
            false,
            true,
          );
          if (p)
            for (let j = 0; j < p.count; j++) {
              const t = j / (p.count - 1),
                bend = Math.sin(t * Math.PI) * height * 0.03;
              p.points[j * 2] =
                root.x + (center.x - root.x) * t + bend * (route ? 1 : -1);
              p.points[j * 2 + 1] = root.y + (center.y - root.y) * t;
              p.widths![j] = 0.1 + Math.sin(t * Math.PI) * 0.9;
            }
        }

    // Projected spherical allium heads: rear stems, body, then foreground florets.
    // Three florets share each pooled path; zero-width joins never draw connecting diagonals.
    if (state.layers.blooms > 0)
      for (let i = 0; i < regions; i++) {
        const center = centers[i];
        const {
          event,
          open,
          radius,
          envelope,
          secondary,
          pulse,
          bands,
          morph,
        } = bloomShape(i);
        if (!event || envelope <= 0) continue;
        const alpha =
          state.layers.blooms *
          strength *
          envelope *
          (secondary ? 0.5 : 1) *
          (0.2 + Math.sqrt(this.bloomEnergy) * 0.8) *
          (1 + pulse * 0.25) *
          1.15;
        const turn = this.phase * 0.025 * (i % 2 ? -1 : 1);
        const unfurl = 0.2 + 0.8 * clamp(open / 0.75);
        const florets = 108;
        // Diffuse head atmosphere behind its silhouette, with a softly illuminated heart.
        for (let shell = 0; shell < 2; shell++) {
          const halo = path(
            64,
            radius * (shell ? 0.2 : 0.32),
            0xc4a5ff,
            alpha * (shell ? 0.18 : 0.12),
            true,
          );
          if (halo)
            for (let j = 0; j < halo.count; j++) {
              const a = (j / (halo.count - 1)) * TAU;
              const r = radius * unfurl * (shell ? 0.72 : 0.42);
              halo.points[j * 2] = center.x + Math.cos(a) * r;
              halo.points[j * 2 + 1] = center.y + Math.sin(a) * r;
            }
        }
        light(
          center.x,
          center.y,
          Math.max(2, radius * unfurl * 0.12),
          0xc4a5ff,
          alpha * 0.26,
        );
        for (let depth = 0; depth < 3; depth++) {
          const color = [0xc4a5ff, 0xc4a5ff, 0xe3d1ff][depth];
          const bandAlpha =
            alpha *
            [0.25, 0.65, 1][depth] *
            (depth < 2 ? 0.55 + bands[1] * 0.45 : 1);
          // Stable sphere samples, ordered back to front. Quality removes rear detail first.
          const counts = secondary
            ? q < 0.5
              ? [0, 6, 12]
              : q < 0.75
                ? [0, 9, 15]
                : [0, 12, 18]
            : q < 0.5
              ? [0, 9, 18]
              : q < 0.75
                ? [3, 12, 24]
                : [6, 18, 30];
          const perBand = counts[depth];
          for (let group = 0; group < Math.ceil(perBand / 3); group++) {
            const count = Math.min(3, perBand - group * 3);
            const p = path(
              count * 48,
              Math.max(0.8, height * (0.0016 + depth * 0.00045)),
              color,
              bandAlpha,
              false,
              true,
            );
            if (!p) continue;
            for (let item = 0; item < count; item++) {
              const n =
                depth * 36 + Math.floor(((group * 3 + item) * 36) / perBand);
              const z = -1 + (2 * (n + 0.5)) / florets;
              const shell = Math.sqrt(Math.max(0, 1 - z * z));
              const angle = n * 2.399963229728653 + turn + i * 0.8;
              // Outer stems follow inner ones during unfolding; no geometry animation in Reduced Motion.
              const progress = clamp((open - shell * 0.12) / 0.65);
              const reveal =
                0.2 + 0.8 * progress * progress * (3 - 2 * progress);
              const scale = radius * reveal;
              const tipX = center.x + Math.cos(angle) * shell * scale;
              const tipY =
                center.y +
                Math.sin(angle) * shell * scale * (0.93 + morph * 0.06);
              const tipSize = Math.max(
                0.8,
                radius * reveal * (0.035 + (z + 1) * 0.017),
              );
              const orientation = angle + Math.PI * 0.5 + morph * 0.14;
              const bend =
                scale * (0.025 + hash(n + i * 80) * 0.025 + morph * 0.025);
              const base = item * 48;
              for (let j = 0; j < 48; j++) {
                let x = tipX,
                  y = tipY,
                  weight = 0;
                if (j <= 13) {
                  const t = clamp((j - 1) / 11);
                  x =
                    center.x +
                    (tipX - center.x) * t -
                    Math.sin(angle) * Math.sin(t * Math.PI) * bend;
                  y =
                    center.y +
                    (tipY - center.y) * t +
                    Math.cos(angle) * Math.sin(t * Math.PI) * bend;
                  weight = j > 0 && j < 13 ? 0.18 + t * 0.12 : 0;
                } else {
                  const a = clamp((j - 15) / 30) * TAU;
                  const petal =
                    tipSize *
                    (0.38 + 0.62 * Math.cos(a * 3) ** 2) *
                    (1 + bands[2] * 0.16 * Math.cos(a * 3) ** 2);
                  const dx = Math.cos(a) * petal,
                    dy = Math.sin(a) * petal * (0.4 + Math.abs(z) * 0.6);
                  x += Math.cos(orientation) * dx - Math.sin(orientation) * dy;
                  y += Math.sin(orientation) * dx + Math.cos(orientation) * dy;
                  weight =
                    j >= 15 && j <= 45 ? 0.75 + 0.25 * Math.sin(a * 3) ** 2 : 0;
                }
                p.points[(base + j) * 2] = x;
                p.points[(base + j) * 2 + 1] = y;
                p.widths![base + j] = weight;
              }
              if (depth === 2 && item === 0)
                light(
                  tipX,
                  tipY,
                  Math.max(0.8, tipSize * 0.7),
                  0xe3d1ff,
                  alpha *
                    (0.12 + bands[2] * 0.48) *
                    Math.min(1, this.bloomEnergy * 30),
                );
            }
          }
        }
        const markers = q > 0.6 ? 5 : 3;
        const markerAlpha =
          state.layers.blooms *
          strength *
          envelope *
          (secondary ? 0.5 : 1) *
          0.35;
        if (markerAlpha <= 0.001) continue;
        let lastX = center.x,
          lastY = center.y;
        for (let n = 0; n < markers; n++) {
          const a = -Math.PI * 0.5 + (n / markers) * TAU;
          const x = center.x + Math.cos(a) * radius * 0.5 * unfurl,
            y = center.y + Math.sin(a) * radius * 0.5 * unfurl;
          const size = Math.max(
            1,
            height *
              (0.008 + this.energy * 0.008) *
              0.7 *
              (secondary ? 0.65 : 1),
          );
          const diamond = path(
            5,
            Math.max(1, height * 0.002),
            0xc4a5ff,
            markerAlpha,
          );
          if (diamond)
            diamond.points.set([
              x,
              y - size,
              x + size,
              y,
              x,
              y + size,
              x - size,
              y,
              x,
              y - size,
            ]);
          const stem = path(
            2,
            Math.max(0.7, height * 0.0014),
            0xc4a5ff,
            markerAlpha * 0.5,
          );
          if (stem)
            stem.points.set([
              x,
              y + size + height * 0.004,
              x,
              y + size + height * 0.02,
            ]);
          const link = path(
            2,
            Math.max(0.6, height * 0.001),
            0xc4a5ff,
            markerAlpha * 0.2,
          );
          if (link) link.points.set([lastX, lastY, x, y]);
          light(x, y, height * 0.01, 0xc4a5ff, markerAlpha * 0.6);
          lastX = x;
          lastY = y;
        }
      }

    if (state.layers.blooms > 0)
      for (const a of this.accents) {
        const age = Math.max(0, (time - a.time) / 2800),
          center = sample(a.route, accentPosition(a));
        const opacity =
          (1 - Math.exp(-age * 20)) *
          (1 - age) ** 2 *
          a.strength *
          state.layers.blooms *
          strength;
        const radius = Math.min(
          height * (0.035 + (state.reduced ? 0.02 : age * motion * 0.13)),
          Math.min(center.x, width - center.x, center.y, height - center.y) /
            1.08,
        );
        const p = path(
          72,
          Math.max(0.75, height * 0.0015),
          0xc4a5ff,
          opacity * 0.45,
        );
        if (p)
          for (let j = 0; j < p.count; j++) {
            const angle = (j / (p.count - 1)) * TAU;
            const r = radius * (1 + 0.045 * Math.sin(angle * 5));
            p.points[j * 2] = center.x + Math.cos(angle) * r;
            p.points[j * 2 + 1] = center.y + Math.sin(angle) * r;
          }
      }
    const filamentGain = state.layers.filaments * strength;
    const branches = Math.floor((calm ? 6 : 18) * q);
    const detail = clamp(
      (0.18 + Math.sqrt(Math.max(this.levels[2], this.change)) * 0.82) *
        (0.35 + fullness * 0.65) *
        (living ? 0.7 + living.expansion * 0.3 : 1),
    );
    if (filamentGain > 0 && this.energy > 0.001)
      for (let n = 0; n < branches; n++) {
        // Fixed candidates reveal smoothly instead of popping at integer counts.
        const reveal = clamp(detail * branches - n);
        const detailGain = reveal * reveal * (3 - 2 * reveal);
        if (detailGain <= 0.001) continue;
        const bloom = living
          ? this.blooms[Math.floor(n / 3) % this.blooms.length]
          : bloomAt(n % regions);
        const releasing =
          bloom && active && !state.reduced
            ? clamp((time - bloom.time - 1900) / 900)
            : 0;
        const attached = n % 3 !== 0 || !bloom;
        let center = attached
          ? sample(n % 3, 0.12 + hash(n + 42) * 0.76)
          : centers[bloom!.slot];
        const rootU =
          living && !attached
            ? clamp(center.x / width + (hash(n + 42) - 0.5) * 0.07)
            : 0.12 + hash(n + 42) * 0.76;
        const before = sample(n % 3, rootU - 0.015),
          after = sample(n % 3, rootU + 0.015);
        let angle = attached
          ? Math.atan2(after.y - before.y, after.x - before.x) +
            (n % 2 ? -0.35 : 0.35)
          : hash(n + 90) * TAU + this.phase * 0.035;
        let radius = attached ? 0 : bloomShape(bloom!.slot).radius;
        if (!attached && releasing > 0) {
          const ribbon = sample(n % 3, rootU);
          center = {
            x: center.x + (ribbon.x - center.x) * releasing,
            y: center.y + (ribbon.y - center.y) * releasing,
          };
          const tangent = Math.atan2(after.y - before.y, after.x - before.x);
          angle +=
            Math.atan2(Math.sin(tangent - angle), Math.cos(tangent - angle)) *
            releasing;
          radius *= 1 - releasing;
        }
        const reach = Math.min(
          Math.max(
            0,
            Math.min(center.x, width - center.x, center.y, height - center.y) -
              radius -
              height * 0.01,
          ),
          width / (regions * 8),
          height * (0.06 + this.levels[2] * 0.16 + this.change * 0.04),
        );
        const p = path(
          24,
          Math.max(0.6, height * 0.0009),
          0x6eb4ff,
          filamentGain *
            detailGain *
            (0.05 + Math.sqrt(this.levels[2]) * 0.4 + this.change * 0.12),
        );
        if (!p) continue;
        for (let j = 0; j < p.count; j++) {
          const t = j / (p.count - 1),
            a = angle + Math.sin(t * 4 + this.brightness) * 0.45;
          p.points[j * 2] = center.x + Math.cos(a) * (radius + reach * t);
          p.points[j * 2 + 1] = center.y + Math.sin(a) * (radius + reach * t);
        }
        if (n % 3 === 0 && q > 0.6) {
          const fork = path(
            12,
            Math.max(0.6, height * 0.0008),
            0x6eb4ff,
            filamentGain * detailGain * Math.sqrt(this.levels[2]) * 0.25,
          );
          if (fork)
            for (let j = 0; j < fork.count; j++) {
              const t = j / (fork.count - 1),
                base = angle + Math.sin(0.55 * 3 + this.brightness) * 0.25;
              const x = center.x + Math.cos(base) * (radius + reach * 0.55);
              const y = center.y + Math.sin(base) * (radius + reach * 0.55);
              fork.points[j * 2] = x + Math.cos(base + 0.55) * reach * t * 0.5;
              fork.points[j * 2 + 1] =
                y + Math.sin(base + 0.55) * reach * t * 0.5;
            }
        }
        if (!state.reduced) {
          const particles = Math.floor(
            4 * state.particles * q * this.levels[2] * (calm ? 0.15 : 1),
          );
          for (let k = 0; k < particles; k++) {
            const t = (hash(n * 9 + k) + this.phase * 0.055) % 1,
              a = angle + Math.sin(t * 4 + this.brightness) * 0.45;
            light(
              center.x + Math.cos(a) * (radius + reach * t),
              center.y + Math.sin(a) * (radius + reach * t),
              height * 0.0025,
              0xe3d1ff,
              filamentGain *
                detailGain *
                this.energy *
                Math.sin(t * Math.PI) *
                0.4,
            );
          }
        }
      }
    // A sparse, wide field of ribbon-related light dust provides scale without
    // creating musical events. Blooms have already claimed their light budget.
    if (active && !state.reduced && q > 0.6 && filamentGain > 0) {
      const dust = Math.floor(48 * q);
      for (let n = 0; n < dust; n++) {
        const u = (n + 0.5) / dust;
        const route = n % 3,
          root = sample(route, u);
        const drift = Math.sin(this.phase * 0.1 + n * 2.4);
        const y =
          root.y +
          height * (hash(n + 810) - 0.5) * (0.22 + fullness * 0.28) +
          drift * height * 0.015;
        const visibility = clamp(detail * 1.4 - hash(n + 920));
        const alpha =
          visibility *
          visibility *
          this.energy *
          filamentGain *
          state.particles *
          (calm ? 0.15 : 1) *
          (0.25 + this.levels[2] * 0.35) *
          (0.65 + 0.35 * Math.sin(n + this.phase * 0.22) ** 2);
        if (y > height * 0.04 && y < height * 0.96)
          light(
            root.x,
            y,
            height * (0.0012 + hash(n + 300) * 0.0018),
            n % 4 ? palette[route] : 0xe3d1ff,
            alpha,
          );
      }
    }
    return frame;
  }
}

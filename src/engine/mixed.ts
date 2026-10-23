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
  private last = -1;
  private phase = 0;
  private mode = "";
  private levels = [0, 0, 0];
  private spectrum = new Float32Array(32);
  private energy = 0;
  private brightness = 0;
  private change = 0;
  private dynamics = 0;
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
      history: this.historySize,
      accents: this.accents.length,
      trails: this.traces.length,
    };
  }
  private sampled = -1;
  private lastAccent = -Infinity;
  private count = 0;
  constructor(private source?: MusicSource) {}

  update(
    time: number,
    state: SessionState,
    width: number,
    height: number,
    options: RenderOptions,
    quality: number,
  ): ScoreFrame {
    const discontinuity =
      this.mode === "" ||
      time < this.last ||
      (this.last >= 0 && time - this.last > 1000);
    const reset = this.mode !== state.mode || discontinuity;
    if (reset) {
      this.mode = state.mode;
      this.accents.length = 0;
      this.tracePool.push(...this.traces);
      this.traces.length = 0;
      this.historySize = this.historyCursor = 0;
      this.historySampled = -1;
      if (discontinuity) {
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
        }
      }
    this.accents = this.accents.filter((a) => time - a.time < 2800).slice(-6);
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
    const regions = width / height >= 3 ? 3 : 2;
    const centers = Array.from({ length: regions }, (_, i) => ({
      x: width * (regions === 3 ? [0.18, 0.51, 0.82][i] : [0.27, 0.73][i]),
      y: height * (regions === 3 ? [0.35, 0.59, 0.32][i] : [0.36, 0.62][i]),
    }));
    const pulse = (slot: number) =>
      this.accents.reduce((sum, a) => {
        const age = Math.max(0, time - a.time);
        return (
          sum +
          (a.slot === slot
            ? a.strength * (1 - Math.exp(-age / 150)) * Math.exp(-age / 800)
            : 0)
        );
      }, 0);

    // All routes read one measured feature history, never independent instrument voices.
    const routes = [
      [0.77, 0.64, 0.25, 0.46, 0.77, 0.53, 0.26],
      [0.35, 0.17, 0.48, 0.71, 0.44, 0.21, 0.5],
      [0.85, 0.74, 0.84, 0.42, 0.37, 0.72, 0.82],
    ];
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
      const lag = Math.min(this.historySize - 1, u * 45);
      const a = Math.floor(lag),
        b = Math.min(this.historySize - 1, a + 1);
      const at = (n: number) =>
        this.history[((this.historyCursor - 1 - n + 64) % 64) * 6 + channel];
      return at(a) + (at(b) - at(a)) * (lag - a);
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
        const u = j / (points - 1),
          v = u * 6,
          k = Math.min(5, Math.floor(v)),
          t = v - k;
        const low = readHistory(u, 1),
          mid = readHistory(u, 2),
          change = readHistory(u, 5);
        const at = (index: number) => {
          const n = Math.max(0, Math.min(6, index));
          return (
            routes[route][n] +
            Math.sin(this.phase * (0.4 + route * 0.09) + n * 1.9 + route) *
              (0.018 + low * 0.065 + change * 0.035) *
              Math.sin((n / 6) * Math.PI)
          );
        };
        const a = at(k - 1),
          b = at(k),
          c = at(k + 1),
          d = at(k + 2);
        const y =
          0.5 *
          (2 * b +
            (-a + c) * t +
            (2 * a - 5 * b + 4 * c - d) * t * t +
            (-a + 3 * b - 3 * c + d) * t * t * t);
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
        spine[j * 2 + 1] =
          height *
          (y +
            envelope *
              Math.sin(u * TAU * 3 - this.phase * 0.4 + route) *
              (0.006 + mid * 0.018) +
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
      centers[i].y = (a.y + b.y) * 0.5;
    }
    const palette = [0xc4a5ff, 0x6eb4ff, 0x00b3a7];
    const ribbon = (
      route: number,
      kind: "outer" | "inner" | "core" | "strand",
      strand = 0,
      opacity = 1,
    ) => {
      const gain = state.layers[route === 2 ? "currents" : "lines"];
      const level = route === 2 ? this.levels[0] : this.levels[1];
      const readable =
        0.012 +
        Math.pow(this.energy, 0.35) * 0.95 * (0.8 + Math.sqrt(level) * 0.2);
      const soft = kind === "outer" || kind === "inner";
      const width =
        height *
        { outer: 0.12, inner: 0.021, core: 0.0019, strand: 0.001 }[kind] *
        (0.7 + this.energy * 0.65 + level * 0.3);
      const alpha =
        gain *
        strength *
        readable *
        opacity *
        { outer: 0.44, inner: 0.78, core: 1, strand: 0.6 }[kind];
      const p = path(
        points,
        width,
        kind === "core" ? (route === 2 ? 0x6eb4ff : 0xe3d1ff) : palette[route],
        alpha,
        soft,
        true,
      );
      if (!p) return;
      const base = this.spines[route];
      for (let j = 0; j < p.count; j++) {
        const u = j / (p.count - 1),
          before = Math.max(0, j - 1),
          after = Math.min(p.count - 1, j + 1);
        const dx = base[after * 2] - base[before * 2],
          dy = base[after * 2 + 1] - base[before * 2 + 1],
          length = Math.max(0.001, Math.hypot(dx, dy));
        const envelope = Math.sin(u * Math.PI);
        const historyMid = readHistory(u, 2),
          high = readHistory(u, 3);
        const braid =
          kind === "strand"
            ? height *
              envelope *
              (Math.sin(
                u * TAU * (2.1 + this.brightness) +
                  this.phase * 0.65 +
                  strand * 0.9,
              ) *
                (0.008 + historyMid * 0.028) +
                (strand - 3.5) * 0.0035 * (0.4 + historyMid))
            : 0;
        const detail =
          kind === "strand"
            ? height *
              high *
              0.0018 *
              Math.sin(u * TAU * 19 + strand + this.phase * 0.4) *
              envelope
            : 0;
        p.points[j * 2] = base[j * 2] - (dy / length) * (braid + detail);
        p.points[j * 2 + 1] =
          base[j * 2 + 1] + (dx / length) * (braid + detail);
        p.widths![j] = Math.max(
          0.015,
          envelope ** 0.7 *
            (0.6 + 0.4 * Math.sin(u * 8 + route + this.phase * 0.25) ** 2),
        );
      }
    };
    // Render diffusion behind every core, then braid the foreground across the shared field.
    for (const kind of ["outer", "inner", "core"] as const)
      for (let route = 0; route < 3; route++) ribbon(route, kind);
    const detail = (calm ? 0.35 : 1) * q;
    for (let route = 0; route < 3; route++)
      for (let n = 0; n < (q > 0.6 ? 8 : 4); n++) {
        const visibility =
          n < 4 ? 1 : clamp((this.levels[1] * 4 - (n - 4)) * 1.3);
        ribbon(route, "strand", n, visibility * detail);
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
            state.layers.blooms * strength * (0.008 + this.energy * 0.22),
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

    // Open curled ribbons bring a second scale of curvature around the focal regions.
    // Their expansion follows mids/dynamics; they are not autonomous orbiting decorations.
    if (state.layers.lines > 0)
      for (let i = 0; i < regions; i++) {
        const center = centers[i];
        const radius = Math.min(
          height * (0.19 + this.levels[1] * 0.085 + this.dynamics * 0.035),
          width / (regions * 3),
        );
        const alpha =
          state.layers.lines *
          strength *
          (0.006 + Math.sqrt(this.levels[1]) * 0.28);
        for (let glow = 0; glow < 2; glow++) {
          const p = path(
            100,
            height * (glow ? 0.0018 : 0.018),
            i === 1 ? 0xffc6e8 : 0xc4a5ff,
            alpha * (glow ? 1 : 0.28),
            !glow,
            true,
          );
          if (!p) continue;
          for (let j = 0; j < p.count; j++) {
            const t = j / (p.count - 1),
              angle = -2.7 + t * 5.6 + i * 1.3 + this.phase * 0.04;
            const r =
              radius *
              (0.65 + t * 0.5) *
              (1 + this.change * 0.07 * Math.sin(t * 9));
            p.points[j * 2] = center.x + Math.cos(angle) * r;
            p.points[j * 2 + 1] =
              center.y +
              Math.sin(angle) *
                r *
                (0.83 + 0.08 * Math.sin(i + this.phase * 0.1));
            p.widths![j] = Math.max(0.015, Math.sin(t * Math.PI) ** 1.3);
          }
        }
      }

    // Focal flowers keep a recognizable radial crown even without onset events.
    if (state.layers.blooms > 0)
      for (let i = 0; i < regions; i++) {
        const center = centers[i],
          accent = clamp(pulse(i));
        const spectral = this.spectrum[4 + i * 8];
        const radius = Math.min(
          height *
            (0.18 +
              this.energy * 0.075 +
              this.dynamics * 0.015 +
              (state.reduced ? 0 : accent) * 0.035),
          width / (regions * 3.2),
          Math.min(center.y, height - center.y) / 1.22,
        );
        const alpha =
          state.layers.blooms *
          strength *
          (0.018 + Math.pow(this.energy, 0.55) * 0.55);
        const petals = Math.round(12 + q * 10);
        const turn = this.phase * 0.045 * (i % 2 ? -1 : 1);
        for (let n = 0; n < petals; n++) {
          const direction = (n / petals) * TAU + turn + i * 0.7;
          const length =
            radius * (0.72 + hash(n + i * 31) * 0.3 + spectral * 0.12);
          const p = path(
            36,
            Math.max(0.65, height * 0.00125),
            i === 1 ? 0xffc6e8 : 0xe3d1ff,
            alpha * (n % 3 === 0 ? 0.85 : 0.48),
          );
          if (!p) continue;
          for (let j = 0; j < p.count; j++) {
            const t = j / (p.count - 1),
              r = length * (0.09 + Math.sin(t * Math.PI) * 0.91);
            const a =
              direction +
              Math.sin(t * TAU) *
                (0.12 +
                  this.brightness * 0.08 +
                  (state.reduced ? 0 : accent) * 0.05);
            p.points[j * 2] = center.x + Math.cos(a) * r;
            p.points[j * 2 + 1] = center.y + Math.sin(a) * r;
          }
          const tx = center.x + Math.cos(direction) * length,
            ty = center.y + Math.sin(direction) * length;
          light(tx, ty, height * 0.004, 0xffc6e8, alpha * 0.7);
          // Small floret crowns distinguish an allium head from a generic radial pulse.
          if (n % 2 === 0 && q > 0.5) {
            const crown = path(
              25,
              Math.max(0.6, height * 0.001),
              0xffc6e8,
              alpha * 0.65,
            );
            if (crown)
              for (let j = 0; j < crown.count; j++) {
                const a = (j / (crown.count - 1)) * TAU,
                  r =
                    height *
                    (0.009 + this.levels[2] * 0.009) *
                    (0.72 + 0.28 * Math.cos(a * 5));
                crown.points[j * 2] = tx + Math.cos(a) * r;
                crown.points[j * 2 + 1] = ty + Math.sin(a) * r;
              }
          }
        }
        for (let ring = 0; ring < 2; ring++) {
          const p = path(
            48,
            height * (ring ? 0.001 : 0.028),
            0xc4a5ff,
            alpha * (ring ? 0.5 : 0.2),
            !ring,
          );
          if (p)
            for (let j = 0; j < p.count; j++) {
              const a = (j / (p.count - 1)) * TAU,
                r = radius * (ring ? 0.12 : 0.16);
              p.points[j * 2] = center.x + Math.cos(a) * r;
              p.points[j * 2 + 1] = center.y + Math.sin(a) * r;
            }
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
          0xffc6e8,
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
              Math.exp(-age / 420) *
              0.18,
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
    const filamentGain = state.layers.filaments * strength;
    const branches = Math.floor(
      (calm ? 6 : 18) *
        q *
        Math.sqrt(Math.max(this.levels[2], this.change)) *
        (0.3 + this.energy * 0.7),
    );
    if (filamentGain > 0 && this.energy > 0.001)
      for (let n = 0; n < branches; n++) {
        const attached = n % 2 === 1;
        const center = attached
          ? sample(n % 3, 0.12 + hash(n + 42) * 0.76)
          : centers[n % regions];
        const angle = hash(n + 90) * TAU + this.phase * 0.035;
        const radius = attached
            ? 0
            : Math.min(
                height * (0.17 + this.energy * 0.06),
                width / (regions * 3.8),
              ),
          reach = Math.min(
            Math.max(
              0,
              Math.min(
                center.x,
                width - center.x,
                center.y,
                height - center.y,
              ) -
                radius -
                height * 0.01,
            ),
            width / (regions * 8),
            height * (0.035 + this.levels[2] * 0.12 + this.change * 0.035),
          );
        const p = path(
          24,
          Math.max(0.6, height * 0.0009),
          0x6eb4ff,
          filamentGain *
            (Math.sqrt(this.levels[2]) * 0.35 + this.change * 0.12),
        );
        if (!p) continue;
        for (let j = 0; j < p.count; j++) {
          const t = j / (p.count - 1),
            a = angle + Math.sin(t * 3 + this.brightness) * 0.25;
          p.points[j * 2] = center.x + Math.cos(a) * (radius + reach * t);
          p.points[j * 2 + 1] = center.y + Math.sin(a) * (radius + reach * t);
        }
        if (n % 3 === 0 && q > 0.6) {
          const fork = path(
            12,
            Math.max(0.6, height * 0.0008),
            0x6eb4ff,
            filamentGain * Math.sqrt(this.levels[2]) * 0.2,
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
              a = angle + Math.sin(t * 3 + this.brightness) * 0.25;
            light(
              center.x + Math.cos(a) * (radius + reach * t),
              center.y + Math.sin(a) * (radius + reach * t),
              height * 0.0025,
              0xe3d1ff,
              filamentGain * this.energy * Math.sin(t * Math.PI) * 0.4,
            );
          }
        }
      }
    return frame;
  }
}

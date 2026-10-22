import {
  LIMITS,
  type ScoreFrame,
  type Stroke,
  type RenderOptions,
} from "./choreography";
import type { MusicSource } from "./source";
import type { SessionState } from "./types";

const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** Mixed music geometry: no inferred instruments, notes or chords. Shared by both backends. */
export class MixedChoreography {
  private frame: ScoreFrame = {
    paths: [],
    pathCount: 0,
    lights: [],
    lightCount: 0,
    energy: 0,
    time: 0,
  };
  private last = 0;
  private phase = 0;
  private mode = "";
  private levels = [0, 0, 0];
  private energy = 0;
  private brightness = 0;
  private change = 0;
  private dynamics = 0;
  private blooms: { time: number; strength: number; x: number; y: number }[] =
    [];
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
    const dt = this.last ? Math.min(100, Math.max(0, time - this.last)) : 16;
    if (this.mode !== state.mode) {
      this.mode = state.mode;
      this.blooms = [];
      this.levels = [0, 0, 0];
      this.energy = this.brightness = this.change = this.dynamics = 0;
      this.last = time;
    }
    const input = this.source?.mixed?.(time, this.last);
    this.last = time;
    const f = input?.feature;
    const active = state.mode === "live" && !!f?.active;
    const smooth = 1 - Math.exp(-dt / (active ? 180 : 100));
    this.levels = this.levels.map(
      (v, i) => v + ((active ? f!.bands[i] : 0) - v) * smooth,
    );
    this.energy += ((active ? f!.intensity : 0) - this.energy) * smooth;
    this.brightness +=
      ((active ? f!.centroid / 12000 : 0) - this.brightness) * smooth;
    this.change += ((active ? f!.flux : 0) - this.change) * smooth;
    this.dynamics += ((active ? f!.dynamics : 0) - this.dynamics) * smooth;
    const calm = state.scene === "Calm Mode";
    const motion = state.reduced ? 0 : state.motion * (calm ? 0.18 : 1);
    // Motion stops with absent/silent audio; a faint static field remains.
    this.phase += (dt / 1000) * motion * this.energy;
    if (!active) this.blooms = [];
    if (active && state.layers.blooms > 0)
      for (const e of input?.events ?? []) {
        if (
          this.blooms.length &&
          e.timestamp - this.blooms[this.blooms.length - 1].time < 240
        )
          continue;
        const slot = this.count++ % 7;
        this.blooms.push({
          time: e.timestamp,
          strength: e.intensity,
          x: (slot + 0.5) / 7,
          y: 0.42 + 0.12 * Math.sin(slot * 2.4),
        });
      }
    this.blooms = this.blooms.filter((b) => time - b.time < 2400).slice(-8);
    const frame = this.frame;
    frame.pathCount = frame.lightCount = 0;
    frame.time = time;
    frame.energy = this.energy;
    const strength = state.intensity * (calm ? 0.62 : 1);
    const color = (normal: number) =>
      options.highContrast ? 0xffffff : normal;
    const path = (
      points: number,
      lineWidth: number,
      tint: number,
      alpha: number,
      soft = false,
    ): Stroke | null => {
      if (frame.pathCount >= LIMITS.paths) return null;
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
      p.color = color(tint);
      p.alpha = clamp(alpha);
      p.soft = soft;
      return p;
    };
    const strokes = Math.max(2, Math.round(4 * quality));
    for (let layer = 0; layer < 3; layer++) {
      const gain =
        state.layers[(["currents", "lines", "filaments"] as const)[layer]];
      if (gain <= 0) continue;
      const level = this.levels[layer];
      const tint = [0x00b3a7, 0xc4a5ff, 0x6eb4ff][layer];
      for (let strand = 0; strand < strokes; strand++) {
        const alpha = gain * (0.018 + Math.sqrt(level) * 0.95) * strength;
        const w =
          Math.max(1, height * [0.009, 0.004, 0.0018][layer]) *
          (1 + level * 0.5);
        for (let glow = 0; glow < 2; glow++) {
          const p = path(
            160,
            w * (glow ? 1 : 7),
            tint,
            alpha * (glow ? 1 : 0.45),
            !glow,
          );
          if (!p) continue;
          for (let j = 0; j < p.count; j++) {
            const u = j / (p.count - 1);
            const base =
              [0.67, 0.43, 0.26][layer] + (strand - (strokes - 1) / 2) * 0.025;
            const amplitude =
              (0.015 + level * 0.12 + Math.max(0, this.dynamics) * 0.025) *
              height;
            const detail =
              layer === 2
                ? this.change *
                  0.012 *
                  Math.sin(u * 74 + this.brightness * 2) *
                  height
                : 0;
            p.points[j * 2] = u * width;
            p.points[j * 2 + 1] =
              base * height +
              Math.sin(
                u * Math.PI * (3 + layer) +
                  this.phase * (1 + layer * 0.3) +
                  strand * 0.18,
              ) *
                amplitude +
              detail;
          }
        }
      }
    }
    if (state.layers.blooms > 0)
      for (const b of this.blooms) {
        const age = Math.max(0, (time - b.time) / 2400);
        const radius =
          Math.min(height * 0.22, width / 16) *
          (0.45 + (state.reduced ? 0 : age * motion) + b.strength * 0.35);
        const alpha =
          (1 - Math.exp(-age * 24)) *
          Math.pow(1 - age, 1.4) *
          b.strength *
          state.layers.blooms *
          strength;
        const petals = Math.round(8 + quality * 8);
        for (let petal = 0; petal < petals; petal++) {
          const p = path(
            40,
            Math.max(1, height * 0.002),
            0xffc6e8,
            alpha * 0.5,
          );
          if (!p) continue;
          const direction = (petal / petals) * Math.PI * 2;
          for (let j = 0; j < p.count; j++) {
            const t = (j / (p.count - 1)) * Math.PI * 2;
            const r = radius * Math.sin(t / 2);
            const a = direction + Math.sin(t) * 0.2;
            p.points[j * 2] = b.x * width + Math.cos(a) * r;
            p.points[j * 2 + 1] = b.y * height + Math.sin(a) * r;
          }
        }
      }
    const budget =
      options.profile === "preview" ? 100 : width < 600 ? 100 : 320;
    const particles = Math.floor(
      budget *
        state.particles *
        quality *
        this.levels[2] *
        (calm ? 0.15 : 1) *
        state.layers.filaments,
    );
    for (let n = 0; n < particles; n++) {
      const light =
        frame.lights[n] ??
        (frame.lights[n] = { x: 0, y: 0, size: 1, color: 0, alpha: 0 });
      light.x = ((n * 0.6180339 + this.phase * 0.006) % 1) * width;
      light.y = (0.2 + 0.58 * ((n * 0.381966) % 1)) * height;
      light.size = Math.max(0.7, height * 0.0015);
      light.color = color(0xe3d1ff);
      light.alpha = this.energy * strength * 0.35;
      frame.lightCount++;
    }
    return frame;
  }
}

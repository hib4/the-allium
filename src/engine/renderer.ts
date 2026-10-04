import {
  colors,
  instruments,
  visibleChannel,
  type Instrument,
  type MusicEvent,
  type SessionState,
} from "./types";
import { DemoSource, type MusicSource } from "./source";
import type { Session } from "./session";
interface Impact {
  event: MusicEvent;
  x: number;
  y: number;
}
export interface RenderOptions {
  instrument?: Instrument;
  highContrast?: boolean;
  preview?: boolean;
}
export class ScoreRenderer {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private lastTime = -1;
  private section = "";
  private impacts: Impact[] = [];
  private weights: Record<Instrument, number> = {
    vocals: 1,
    guitar: 1,
    drums: 1,
    bass: 1,
    piano: 1,
  };
  private observer: ResizeObserver;
  private previousFrame = 0;
  private slow = 0;
  private quality = 1;
  private smoothed: Record<Instrument, { pitch: number; intensity: number }> = {
    vocals: { pitch: 65, intensity: 0.3 },
    guitar: { pitch: 72, intensity: 0.22 },
    drums: { pitch: 36, intensity: 0.24 },
    bass: { pitch: 39, intensity: 0.4 },
    piano: { pitch: 65, intensity: 0.45 },
  };
  private opts: RenderOptions;
  private stopped = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private session: Session,
    opts: RenderOptions = {},
    private source: MusicSource = new DemoSource(),
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
    this.opts = opts;
    this.observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      this.width = rect.width;
      this.height = rect.height;
      this.dpr = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
      canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    });
    this.observer.observe(canvas);
    this.raf = requestAnimationFrame(this.frame);
  }
  options(opts: RenderOptions) {
    this.opts = opts;
  }
  private frame = (now: number) => {
    if (this.stopped) return;
    const delta = this.previousFrame
      ? Math.min(64, now - this.previousFrame)
      : 16;
    this.previousFrame = now;
    if (delta > 24) this.slow++;
    else this.slow = Math.max(0, this.slow - 1);
    if (this.slow > 90) {
      this.quality = Math.max(0.4, this.quality - 0.1);
      this.slow = 0;
    }
    this.draw(this.session.time(), delta);
    this.raf = requestAnimationFrame(this.frame);
  };
  private draw(time: number, delta: number) {
    const { ctx: c, width: w, height: h } = this;
    const s = this.session.state;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = "#05091C";
    c.fillRect(0, 0, w, h);
    if (this.section !== s.section || time < this.lastTime) {
      this.impacts = [];
      this.lastTime = time - 2000;
      this.section = s.section;
    }
    if (time > this.lastTime) {
      for (const event of this.source.events(
        this.lastTime,
        time,
        s.section,
        s.sectionStart,
      )) {
        if (event.instrument === "drums" || event.instrument === "piano")
          this.impacts.push({
            event,
            x:
              event.instrument === "drums"
                ? 0.24 + ((Math.floor(event.beat ?? 0) * 0.173) % 0.57)
                : 0.22 +
                  ((Math.floor(event.timestamp / 5000) * 0.17) % 0.5) +
                  ((event.pitch ?? 60) % 12) * 0.012,
            y:
              event.instrument === "drums"
                ? 0.58 + Math.sin((event.beat ?? 0) * 0.8) * 0.12
                : 0.24 + (((event.pitch ?? 60) % 12) / 12) * 0.34,
          });
      }
      this.lastTime = time;
    }
    this.impacts = this.impacts
      .filter((p) => time - p.event.timestamp < 3000)
      .slice(-128);
    const calm = s.scene === "Calm Mode";
    const motion = s.reduced ? 0 : s.motion * (calm ? 0.2 : 1);
    const t = time / 1000;
    const targetFrame = this.source.frame(time, s.section);
    for (const i of instruments) {
      this.smoothed[i].pitch +=
        (targetFrame[i].pitch - this.smoothed[i].pitch) *
        (1 - Math.exp(-delta / 250));
      this.smoothed[i].intensity +=
        (targetFrame[i].intensity - this.smoothed[i].intensity) *
        (1 - Math.exp(-delta / 180));
    }
    const live = this.smoothed;
    for (const i of instruments) {
      let target = 1;
      if (s.scene === "Vocal Focus") target = i === "vocals" ? 1.3 : 0.28;
      if (s.scene === "Guitar Focus") target = i === "guitar" ? 1.3 : 0.28;
      if (s.scene === "Percussion Focus") target = i === "drums" ? 1.3 : 0.28;
      if (this.opts.instrument) target = i === this.opts.instrument ? 1.25 : 0;
      if (!visibleChannel(s, i)) target = 0;
      this.weights[i] +=
        (target - this.weights[i]) * (1 - Math.exp(-delta / 400));
    }
    // Staff-like reference paths are musical structure, not a measuring grid.
    c.strokeStyle = "#1D2A50";
    c.lineWidth = 1;
    c.globalAlpha = Math.max(0, Math.min(1, 0.42));
    for (let line = 0; line < 4; line++) {
      c.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y =
          h * (0.39 + line * 0.025) + Math.sin((x / w) * 5 - 1) * h * 0.09;
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = Math.max(0, Math.min(1, 1));
    const energy = (0.35 + s.intensity * 0.65) * (calm ? 0.65 : 1);
    this.ribbon(
      "bass",
      0.8,
      0.09,
      t * 0.35 * motion,
      live.bass.intensity,
      energy,
      false,
      s,
    );
    this.ribbon(
      "vocals",
      0.39,
      0.2,
      t * 0.45 * motion,
      live.vocals.intensity,
      energy,
      false,
      s,
    );
    this.ribbon(
      "guitar",
      0.49,
      0.15,
      t * 0.68 * motion + 1.8,
      live.guitar.intensity,
      energy,
      true,
      s,
    );
    for (const impact of this.impacts) {
      const e = impact.event;
      const weight = this.weights[e.instrument];
      if (weight < 0.01) continue;
      const age = Math.max(0, time - e.timestamp) / 1000;
      const fade = Math.max(0, 1 - age / 2.8);
      const x = impact.x * w,
        y = impact.y * h;
      c.globalAlpha = Math.max(0, Math.min(1, fade * weight * energy));
      c.strokeStyle = this.opts.highContrast ? "#FFFFFF" : colors[e.instrument];
      c.fillStyle = c.strokeStyle;
      if (e.instrument === "drums") {
        const kick = e.articulation === "kick";
        const hat = e.articulation === "hat";
        const base = Math.min(w, h) * (kick ? 0.06 : hat ? 0.011 : 0.027);
        const radius = base + (s.reduced ? 0 : age * base * 2.7 * motion);
        c.lineWidth = kick ? 3 : hat ? 1 : 2;
        c.beginPath();
        c.arc(x, y, radius, 0, Math.PI * 2);
        c.stroke();
        if (kick) {
          c.globalAlpha *= 0.4;
          c.beginPath();
          c.arc(x, y, radius * 0.72, 0, Math.PI * 2);
          c.stroke();
        }
        const petals = kick ? 20 : hat ? 4 : 8;
        for (let n = 0; n < petals; n++) {
          const a = (n / petals) * Math.PI * 2;
          const length = base * (kick ? 0.7 : 0.45) * fade;
          c.beginPath();
          c.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
          c.lineTo(
            x + Math.cos(a) * (radius + length),
            y + Math.sin(a) * (radius + length),
          );
          c.stroke();
        }
      } else {
        const y2 = y - (s.reduced ? 0 : age * 12 * motion);
        const size = (4 + e.intensity * 6) * Math.min(1.5, h / 450);
        c.beginPath();
        c.moveTo(x, y2 - size);
        c.lineTo(x + size, y2);
        c.lineTo(x, y2 + size);
        c.lineTo(x - size, y2);
        c.closePath();
        c.fill();
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y2 + size + 5);
        c.lineTo(x, y2 + size + 22);
        c.stroke();
      }
    }
    // A small, bounded harmonic field persists in quiet and paused passages.
    for (const i of ["piano", "drums"] as Instrument[]) {
      const weight = this.weights[i];
      const count = i === "piano" ? 7 : 1;
      c.fillStyle = this.opts.highContrast ? "#FFFFFF" : colors[i];
      c.strokeStyle = c.fillStyle;
      for (let j = 0; j < count; j++) {
        const x = w * (0.18 + j * 0.105),
          y = h * (i === "piano" ? 0.24 + (j % 3) * 0.055 : 0.6);
        c.globalAlpha = Math.max(
          0,
          Math.min(1, (i === "piano" ? 0.45 : 0.22) * weight * energy),
        );
        c.lineWidth = 1;
        if (i === "piano") {
          const size = 3 + live.piano.intensity * 3;
          c.beginPath();
          c.moveTo(x, y - size);
          c.lineTo(x + size, y);
          c.lineTo(x, y + size);
          c.lineTo(x - size, y);
          c.closePath();
          c.stroke();
        } else {
          c.beginPath();
          c.arc(w * 0.71, y, Math.min(w, h) * 0.09, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }
    const particleCount = Math.floor(
      42 * s.particles * this.quality * (calm ? 0.2 : 1),
    );
    if (!s.reduced)
      for (let n = 0; n < particleCount; n++) {
        const i = instruments[n % 5];
        if (this.weights[i] < 0.05) continue;
        const x = ((n * 0.137 + t * 0.008 * motion) % 1) * w;
        const y =
          (0.18 + ((n * 0.271) % 0.58)) * h +
          Math.sin(t * 0.8 + n) * 5 * motion;
        c.fillStyle = this.opts.highContrast ? "#FFFFFF" : colors[i];
        c.globalAlpha = Math.max(
          0,
          Math.min(1, 0.24 * this.weights[i] * energy),
        );
        c.beginPath();
        c.arc(x, y, n % 4 === 0 ? 2 : 1, 0, Math.PI * 2);
        c.fill();
      }
    c.globalAlpha = Math.max(0, Math.min(1, 1));
  }
  private ribbon(
    i: Instrument,
    baseline: number,
    amplitude: number,
    phase: number,
    intensity: number,
    energy: number,
    angular: boolean,
    s: SessionState,
  ) {
    const { ctx: c, width: w, height: h } = this;
    const weight = this.weights[i];
    if (weight < 0.005) return;
    const points = angular ? 36 : 110;
    const thick =
      (i === "bass" ? h * 0.045 : i === "vocals" ? h * 0.018 : h * 0.005) *
      (0.5 + intensity) *
      energy;
    const amplitudeScale =
      (0.6 + intensity * 0.6) * (s.scene === "Calm Mode" ? 0.65 : 1);
    const pitchOffset =
      ((this.smoothed[i].pitch -
        (i === "bass" ? 39 : i === "guitar" ? 72 : 65)) /
        30) *
      h *
      0.1;
    const curve = (x: number, offset: number) =>
      h * baseline -
      pitchOffset +
      Math.sin((x / w) * Math.PI * 2.0 + phase) *
        h *
        amplitude *
        amplitudeScale +
      Math.sin((x / w) * Math.PI * 4 - phase * 0.6) * h * amplitude * 0.25 +
      offset;
    const color = this.opts.highContrast ? "#FFFFFF" : colors[i];
    if (!angular) {
      for (let layer = 3; layer >= 0; layer--) {
        c.globalAlpha =
          weight * energy * (i === "bass" ? 0.08 : 0.09) * (4 - layer);
        c.fillStyle = color;
        c.beginPath();
        for (let p = 0; p <= points; p++) {
          const x = (p / points) * w;
          const y = curve(
            x,
            -thick * (1 + layer * 0.55) * Math.sin((p / points) * Math.PI),
          );
          p === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        for (let p = points; p >= 0; p--) {
          const x = (p / points) * w;
          c.lineTo(
            x,
            curve(
              x,
              thick * (1 + layer * 0.55) * Math.sin((p / points) * Math.PI),
            ),
          );
        }
        c.closePath();
        c.fill();
      }
    }
    const lines = i === "bass" ? 4 : angular ? 2 : 3;
    for (let l = 0; l < lines; l++) {
      c.strokeStyle =
        l === 0 && i === "vocals" && !this.opts.highContrast
          ? "#FFC6E8"
          : color;
      c.lineWidth = angular ? 2.5 : l === 0 ? 2 : 1;
      c.globalAlpha = Math.max(
        0,
        Math.min(1, weight * energy * (l === 0 ? 0.95 : 0.48)),
      );
      c.beginPath();
      for (let p = 0; p <= points; p++) {
        const x = (p / points) * w;
        let y = curve(x, (l - (lines - 1) / 2) * thick * 0.7);
        if (angular) y += Math.sin(p * 1.8 + phase) * h * 0.04 * intensity;
        p === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = Math.max(0, Math.min(1, 1));
  }
  dispose() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.impacts = [];
  }
}

import type { ScoreFrame, Stroke } from "./choreography";
export interface RenderBackend {
  readonly name: "webgl" | "canvas";
  resize(width: number, height: number, resolution: number): void;
  render(frame: ScoreFrame): void;
  dispose(): void;
}
const cssColor = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
export class CanvasBackend implements RenderBackend {
  readonly name = "canvas";
  private context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private resolution = 1;
  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas unavailable");
    this.context = ctx;
  }
  resize(width: number, height: number, resolution: number) {
    this.width = width;
    this.height = height;
    this.resolution = resolution;
    this.canvas.width = Math.round(width * resolution);
    this.canvas.height = Math.round(height * resolution);
  }
  render(frame: ScoreFrame) {
    const c = this.context;
    c.setTransform(this.resolution, 0, 0, this.resolution, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.fillStyle = "#05091C";
    c.fillRect(0, 0, this.width, this.height);
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let n = 0; n < frame.pathCount; n++) {
      const p = frame.paths[n];
      c.strokeStyle = cssColor(p.color);
      c.globalCompositeOperation = p.soft ? "lighter" : "source-over";
      // Integrate a Gaussian cross-section with bounded nested strokes.
      // The widest strokes carry almost no opacity; the core accumulates light
      // continuously instead of leaving three opaque contour bands.
      const passes = p.soft ? 24 : 1;
      for (let pass = 0; pass < passes; pass++) {
        const outer = 1 - pass / passes;
        const inner = 1 - (pass + 1) / passes;
        const feather = p.soft
          ? (Math.exp(-((inner / 0.34) ** 2)) -
              Math.exp(-((outer / 0.34) ** 2))) *
            0.85
          : 1;
        c.globalAlpha = Math.min(1, p.alpha * feather);
        c.lineWidth = p.width * (p.soft ? (outer + inner) * 0.5 : 1);
        c.beginPath();
        for (let j = 0; j < p.count; j++) {
          const x = p.points[j * 2],
            y = p.points[j * 2 + 1];
          j === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    c.globalCompositeOperation = "lighter";
    for (let n = 0; n < frame.lightCount; n++) {
      const p = frame.lights[n];
      c.fillStyle = cssColor(p.color);
      c.globalAlpha = p.alpha * 0.14;
      c.beginPath();
      c.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = p.alpha;
      c.beginPath();
      c.arc(p.x, p.y, Math.max(0.6, p.size * 0.36), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }
  dispose() {
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}

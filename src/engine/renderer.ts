import { Choreography, type RenderOptions } from "./choreography";
import { CanvasBackend, type RenderBackend } from "./backends";
import type { MusicSource } from "./source";
import type { Session } from "./session";
export type { RenderOptions } from "./choreography";
export interface Renderer {
  initialize(): Promise<void>;
  options(options: RenderOptions): void;
  dispose(): void;
}
/** Owns one loop. A fresh canvas makes context loss/fallback safe. */
export class ScoreRenderer implements Renderer {
  private backend?: RenderBackend;
  private model: Choreography;
  private canvas?: HTMLCanvasElement;
  private observer?: ResizeObserver;
  private raf = 0;
  private previous = 0;
  private stopped = false;
  private slow = 0;
  private quality = 1;
  private width = 1;
  private height = 1;
  private generation = 0;
  constructor(
    private host: HTMLElement,
    private session: Session,
    private opts: RenderOptions = {},
    source?: MusicSource,
  ) {
    this.model = new Choreography(source);
  }
  async initialize() {
    const token = ++this.generation;
    this.canvas = this.newCanvas();
    const forceCanvas =
      new URLSearchParams(location.search).get("renderer") === "canvas";
    if (!forceCanvas) {
      try {
        const { WebGLBackend } = await import("./webgl");
        if (this.stopped || token !== this.generation) return;
        const backend = new WebGLBackend();
        this.backend = backend;
        await backend.initialize(this.canvas);
        if (this.stopped || token !== this.generation) {
          backend.dispose();
          return;
        }
        this.canvas.addEventListener("webglcontextlost", this.contextLost);
      } catch {
        this.backend?.dispose();
        if (this.stopped) return;
        this.canvas = this.newCanvas();
        this.backend = new CanvasBackend(this.canvas);
      }
    } else this.backend = new CanvasBackend(this.canvas);
    if (this.stopped) return;
    this.host.dataset.renderer = this.backend!.name;
    this.observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.resize();
    });
    this.observer.observe(this.host);
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }
  private newCanvas() {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "score-canvas";
    this.host.replaceChildren(canvas);
    return canvas;
  }
  private resize() {
    const resolution = Math.min(
      devicePixelRatio || 1,
      this.quality > 0.6 ? 1.5 : 1,
    );
    this.backend?.resize(this.width, this.height, resolution);
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(this.raf);
    this.canvas?.removeEventListener("webglcontextlost", this.contextLost);
    this.backend?.dispose();
    if (this.stopped) return;
    try {
      this.canvas = this.newCanvas();
      this.backend = new CanvasBackend(this.canvas);
      this.host.dataset.renderer = "canvas";
      this.resize();
      this.previous = 0;
      this.raf = requestAnimationFrame(this.tick);
    } catch {
      this.host.dataset.renderer = "failed";
      this.host.dispatchEvent(new CustomEvent("scorefailure"));
    }
  };
  options(opts: RenderOptions) {
    this.opts = opts;
  }
  private tick = (now: number) => {
    if (this.stopped) return;
    const delta = this.previous ? now - this.previous : 16;
    this.previous = now;
    if (delta > 24) this.slow++;
    else this.slow = Math.max(0, this.slow - 1);
    if (this.slow > 60) {
      this.quality = Math.max(0.35, this.quality - 0.15);
      this.slow = 0;
      this.resize();
    }
    const frame = this.model.update(
      this.session.time(),
      this.session.state,
      this.width,
      this.height,
      this.opts,
      this.quality,
    );
    this.backend?.render(frame);
    this.host.dataset.quality = String(this.quality);
    this.raf = requestAnimationFrame(this.tick);
  };
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.generation++;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.canvas?.removeEventListener("webglcontextlost", this.contextLost);
    this.backend?.dispose();
    this.host.replaceChildren();
  }
}

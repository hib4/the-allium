import {
  Application,
  MeshSimple,
  Texture,
  ParticleContainer,
  Particle,
  RendererType,
} from "pixi.js";
import { LIMITS, clamp, type ScoreFrame, type Stroke } from "./choreography";
import type { RenderBackend } from "./backends";
interface Strand {
  mesh: MeshSimple;
  vertices: Float32Array;
  soft: boolean;
}
/** Geometry-only GPU renderer: bounded meshes and a single batched light field. */
export class WebGLBackend implements RenderBackend {
  readonly name = "webgl";
  private app = new Application();
  private strands: Strand[] = [];
  private glow!: Texture;
  private point!: Texture;
  private lights!: ParticleContainer;
  private particles: Particle[] = [];
  private destroyed = false;
  async initialize(canvas: HTMLCanvasElement) {
    await this.app.init({
      canvas,
      preference: "webgl",
      autoStart: false,
      sharedTicker: false,
      background: 0x05091c,
      antialias: true,
      resolution: 1,
      width: 1,
      height: 1,
      powerPreference: "high-performance",
      manageImports: true,
    });
    if (this.destroyed) {
      this.app.destroy(false, { children: true });
      throw new Error("Renderer disposed during initialization");
    }
    if (this.app.renderer.type !== RendererType.WEBGL)
      throw new Error("WebGL unavailable");
    this.glow = this.texture("ribbon");
    this.point = this.texture("point");
    this.lights = new ParticleContainer({
      dynamicProperties: {
        position: true,
        vertex: true,
        color: true,
        rotation: false,
      },
      blendMode: "add",
    });
    for (let n = 0; n < LIMITS.particles; n++) {
      const particle = new Particle({
        texture: this.point,
        anchorX: 0.5,
        anchorY: 0.5,
        alpha: 0,
      });
      this.particles.push(particle);
      this.lights.addParticle(particle);
    }
    this.app.stage.addChild(this.lights);
  }
  private texture(kind: "ribbon" | "point") {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Texture initialization failed");
    const gradient =
      kind === "ribbon"
        ? ctx.createLinearGradient(0, 0, 0, 64)
        : ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (kind === "ribbon") {
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.35, "rgba(255,255,255,.18)");
      gradient.addColorStop(0.5, "rgba(255,255,255,.85)");
      gradient.addColorStop(0.65, "rgba(255,255,255,.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
    } else {
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.12, "rgba(255,255,255,.85)");
      gradient.addColorStop(0.4, "rgba(255,255,255,.2)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return Texture.from(canvas);
  }
  resize(width: number, height: number, resolution: number) {
    if (this.destroyed) return;
    this.app.renderer.resolution = resolution;
    this.app.renderer.resize(width, height);
  }
  private createStrand(soft: boolean): Strand {
    const vertices = new Float32Array(LIMITS.points * 4),
      uvs = new Float32Array(LIMITS.points * 4),
      indices = new Uint32Array((LIMITS.points - 1) * 6);
    for (let n = 0; n < LIMITS.points; n++) {
      uvs.set([n / (LIMITS.points - 1), 0, n / (LIMITS.points - 1), 1], n * 4);
      if (n < LIMITS.points - 1) {
        const v = n * 2;
        indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], n * 6);
      }
    }
    const mesh = new MeshSimple({
      texture: soft ? this.glow : Texture.WHITE,
      vertices,
      uvs,
      indices,
    });
    mesh.blendMode = soft ? "add" : "normal";
    mesh.autoUpdate = true;
    this.app.stage.addChildAt(mesh, this.app.stage.children.length - 1);
    return { mesh, vertices, soft };
  }
  private updateStrand(strand: Strand, p: Stroke) {
    const { mesh, vertices } = strand;
    mesh.visible = true;
    mesh.tint = p.color;
    mesh.alpha = clamp(p.alpha);
    if (strand.soft !== p.soft) {
      strand.soft = p.soft;
      mesh.texture = p.soft ? this.glow : Texture.WHITE;
      mesh.blendMode = p.soft ? "add" : "normal";
    }
    let x = 0,
      y = 0;
    for (let n = 0; n < LIMITS.points; n++) {
      if (n < p.count) {
        x = p.points[n * 2];
        y = p.points[n * 2 + 1];
        const before = Math.max(0, n - 1),
          after = Math.min(p.count - 1, n + 1);
        const dx = p.points[after * 2] - p.points[before * 2],
          dy = p.points[after * 2 + 1] - p.points[before * 2 + 1];
        const length = Math.max(0.001, Math.hypot(dx, dy));
        const normalX = (-dy / length) * p.width * 0.5,
          normalY = (dx / length) * p.width * 0.5;
        vertices.set(
          [x + normalX, y + normalY, x - normalX, y - normalY],
          n * 4,
        );
      } else vertices.set([x, y, x, y], n * 4);
    }
  }
  render(frame: ScoreFrame) {
    if (this.destroyed) return;
    for (let n = 0; n < frame.pathCount; n++) {
      const strand =
        this.strands[n] ??
        (this.strands[n] = this.createStrand(frame.paths[n].soft));
      this.updateStrand(strand, frame.paths[n]);
    }
    for (let n = frame.pathCount; n < this.strands.length; n++)
      this.strands[n].mesh.visible = false;
    for (let n = 0; n < this.particles.length; n++) {
      const particle = this.particles[n];
      if (n >= frame.lightCount) {
        particle.alpha = 0;
        continue;
      }
      const p = frame.lights[n];
      particle.x = p.x;
      particle.y = p.y;
      particle.scaleX = particle.scaleY = p.size / 16;
      particle.tint = p.color;
      particle.alpha = clamp(p.alpha);
    }
    this.app.render();
  }
  dispose() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.app.renderer) {
      this.app.destroy(false, { children: true });
      this.glow?.destroy(true);
      this.point?.destroy(true);
    }
    this.strands = [];
    this.particles = [];
  }
}

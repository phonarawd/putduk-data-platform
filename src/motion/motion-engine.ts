/** WebGL2 파티클 + Canvas/SVG 폴백. 워커 경로와 컨텍스트 손실 복구를 담당한다. */
import { detectQuality, clampDpr, readBrowserQualityHints, type QualityProfile } from './motion-quality.ts';
import { resolveMotion } from './motion-registry.ts';
import { hashSeed, phaseLocalProgress, resolvePhase, resolveProgress, type MotionFrame } from './motion-timeline.ts';
import {
  applyWorkCamera,
  drawWorkCinematic,
  readPrincipal,
  readStipend,
  readWorkCut,
  readWorkLocal
} from './work-phase.ts';
import { drawScene as drawRoad } from './scenes/road-logistics.scene.ts';
import { drawScene as drawAir } from './scenes/air-cargo.scene.ts';
import { drawScene as drawOcean } from './scenes/ocean-vessel.scene.ts';
import { drawScene as drawWarehouse } from './scenes/warehouse-edge.scene.ts';
import { drawScene as drawCatalog } from './scenes/commerce-catalog.scene.ts';
import { drawScene as drawSatellite } from './scenes/satellite-network.scene.ts';

const VERT = `#version 300 es
in vec2 a_pos;
in float a_size;
in vec3 a_color;
uniform vec2 u_res;
out vec3 v_color;
void main() {
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float glow = exp(-d * 2.8);
  outColor = vec4(v_color, glow);
}`;

type Packet = { x: number; y: number; size: number; alpha: number; color: string };

type EngineInput = Record<string, unknown> & {
  progress?: number;
  started_at?: string | number | null;
  expected_completed_at?: string | number | null;
  motion_seed?: string | number | null;
  work_cut?: string | null;
  workCut?: string | null;
  work_local?: number;
  workLocal?: number;
  principal?: number;
  stipend?: number;
};

const scenes = {
  road_logistics: drawRoad,
  air_cargo: drawAir,
  ocean_vessel: drawOcean,
  warehouse_edge: drawWarehouse,
  commerce_catalog: drawCatalog,
  satellite_network: drawSatellite
};

export class MotionEngine {
  readonly canvas: HTMLCanvasElement;
  private glCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffers: WebGLBuffer[] = [];
  private lost = false;
  private worker: Worker | null = null;
  private packets: Packet[] = [];
  private bitmap: ImageBitmap | null = null;
  private observer: IntersectionObserver | null = null;
  visible = true;
  private lastDraw = 0;
  private lastRect = { width: 0, height: 0, ts: 0 };
  private lastQualityKey = '';
  private quality: QualityProfile;

  constructor(canvas: HTMLCanvasElement, workerUrl?: string) {
    this.canvas = canvas;
    this.quality = this.refreshQuality();
    this.bindContextEvents();
    this.initGl();
    this.initWorker(workerUrl);
    this.initObserver();
  }

  frame(input: EngineInput): void {
    const hints = readBrowserQualityHints();
    const qualityKey = `${hints.hidden ? 1 : 0}:${hints.saveData ? 1 : 0}:${hints.reducedMotion ? 1 : 0}:${this.lost ? 1 : 0}`;
    if (qualityKey !== this.lastQualityKey) {
      this.quality = this.refreshQuality();
      this.lastQualityKey = qualityKey;
    }
    const workCut = readWorkCut(input);
    if (hints.hidden || !this.visible) return;

    const now = performance.now();
    const minDelta = 1000 / Math.max(1, this.quality.targetFps);
    if (now - this.lastDraw < minDelta && this.quality.level !== 'static' && !workCut) return;
    this.lastDraw = now;

    const rect = now - this.lastRect.ts < 250 && this.lastRect.width
      ? this.lastRect
      : (() => {
          const box = this.canvas.getBoundingClientRect();
          this.lastRect = { width: box.width, height: box.height, ts: now };
          return this.lastRect;
        })();
    const dpr = clampDpr(this.quality.dpr * (typeof devicePixelRatio === 'number' ? Math.min(devicePixelRatio, 1.5) / (devicePixelRatio || 1) : 1) * (devicePixelRatio || 1));
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const descriptor = resolveMotion(input);
    const progress = resolveProgress(input);
    const frame: MotionFrame = {
      width: rect.width,
      height: rect.height,
      progress,
      phase: resolvePhase(progress),
      phaseLocal: phaseLocalProgress(progress),
      seed: hashSeed(input.motion_seed || input.motionSeed || descriptor.scene_theme),
      reduced: this.quality.level === 'static',
      color: descriptor.accent,
      theme: descriptor.scene_theme,
      vehicle: descriptor.vehicle_type,
      route: descriptor.route_type,
      particle: descriptor.particle_style,
      completion: descriptor.completion_effect,
      workCut,
      workLocal: readWorkLocal(input),
      principal: readPrincipal(input),
      stipend: readStipend(input),
      clock: (typeof performance !== 'undefined' ? performance.now() : 0) / 1000
    };

    this.requestWorker(frame, descriptor.motion_profile);
    if (this.quality.useWebGL && !this.lost) this.drawWebgl(frame);
    this.drawCanvas(frame, descriptor.motion_profile);
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.worker?.terminate();
    this.worker = null;
    this.bitmap?.close?.();
    this.bitmap = null;
    this.releaseGl();
  }

  private refreshQuality(): QualityProfile {
    const hints = readBrowserQualityHints();
    return detectQuality({
      ...hints,
      webgl2: !this.lost && !!this.canvas.getContext
    });
  }

  private bindContextEvents(): void {
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
      this.releaseGl();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.initGl();
    });
  }

  private initObserver(): void {
    if (typeof IntersectionObserver !== 'function') return;
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
    }, { threshold: 0.05 });
    this.observer.observe(this.canvas);
  }

  private initWorker(workerUrl?: string): void {
    if (!this.quality.useWorker || typeof Worker === 'undefined') return;
    const url = workerUrl || resolveWorkerUrl();
    try {
      this.worker = new Worker(url);
      this.worker.onmessage = (event: MessageEvent<{ packets?: Packet[]; bitmap?: ImageBitmap | null }>) => {
        this.packets = Array.isArray(event.data?.packets) ? event.data.packets : [];
        if (this.bitmap && this.bitmap !== event.data?.bitmap) this.bitmap.close?.();
        this.bitmap = event.data?.bitmap || null;
      };
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  private requestWorker(frame: MotionFrame, profile: string): void {
    if (!this.worker || frame.reduced || this.quality.particleCount <= 0) return;
    this.worker.postMessage({
      type: 'simulate',
      width: frame.width,
      height: frame.height,
      progress: frame.progress,
      seed: frame.seed,
      count: this.quality.particleCount,
      profile,
      phase: frame.phase,
      workCut: frame.workCut,
      workLocal: frame.workLocal
    });
  }

  private initGl(): void {
    this.releaseGl();
    try {
      this.glCanvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(Math.max(2, this.canvas.width), Math.max(2, this.canvas.height))
        : document.createElement('canvas');
      const gl = this.glCanvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true
      }) as WebGL2RenderingContext | null;
      if (!gl) return;
      this.glCanvas.addEventListener?.('webglcontextlost', (event: Event) => {
        event.preventDefault();
        this.lost = true;
      });
      this.glCanvas.addEventListener?.('webglcontextrestored', () => {
        this.lost = false;
        this.initGl();
      });
      const program = buildProgram(gl, VERT, FRAG);
      if (!program) return;
      this.gl = gl;
      this.program = program;
      this.lost = false;
    } catch {
      this.gl = null;
    }
  }

  private releaseGl(): void {
    const gl = this.gl;
    if (gl) {
      this.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      if (this.program) gl.deleteProgram(this.program);
    }
    this.buffers = [];
    this.program = null;
    this.gl = null;
    this.glCanvas = null;
  }

  private drawWebgl(frame: MotionFrame): boolean {
    const gl = this.gl;
    const program = this.program;
    const target = this.glCanvas;
    if (!gl || !program || !target || this.packets.length === 0) return false;
    const width = Math.max(2, this.canvas.width);
    const height = Math.max(2, this.canvas.height);
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(program);

    const count = this.packets.length;
    const pos = new Float32Array(count * 2);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    this.packets.forEach((packet, index) => {
      pos[index * 2] = packet.x;
      pos[index * 2 + 1] = packet.y;
      size[index] = packet.size * 6;
      const gold = packet.color === '#f3cd6b';
      color[index * 3] = gold ? 0.95 : 0.5;
      color[index * 3 + 1] = gold ? 0.8 : 0.94;
      color[index * 3 + 2] = gold ? 0.42 : 0.76;
    });

    bindAttrib(gl, program, 'a_pos', pos, 2, this.buffers, 0);
    bindAttrib(gl, program, 'a_size', size, 1, this.buffers, 1);
    bindAttrib(gl, program, 'a_color', color, 3, this.buffers, 2);
    gl.uniform2f(gl.getUniformLocation(program, 'u_res'), frame.width, frame.height);
    gl.drawArrays(gl.POINTS, 0, count);
    return true;
  }

  private drawCanvas(frame: MotionFrame, profile: keyof typeof scenes): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = this.canvas.width / Math.max(1, frame.width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frame.width, frame.height);
    if (this.glCanvas && this.packets.length) ctx.drawImage(this.glCanvas as CanvasImageSource, 0, 0, frame.width, frame.height);
    else if (this.bitmap) ctx.drawImage(this.bitmap, 0, 0, frame.width, frame.height);
    ctx.save();
    applyWorkCamera(ctx, frame);
    scenes[profile](ctx, frame);
    if (frame.workCut === 'lock' || frame.workCut === 'submit') {
      drawWorkCinematic(ctx, frame);
    }
    ctx.restore();
    if (frame.workCut === 'approve' || frame.workCut === 'pwa_home' || frame.workCut === 'demote') {
      drawWorkCinematic(ctx, frame);
    }
    if (frame.phase === 'sync' && frame.completion === 'gold_sync' && !frame.workCut) {
      ctx.fillStyle = `rgba(243, 205, 107, ${0.08 + frame.phaseLocal * 0.12})`;
      ctx.fillRect(0, 0, frame.width, frame.height);
    }
  }
}

function resolveWorkerUrl(): string {
  const admin = typeof document !== 'undefined' && document.documentElement.dataset.mode === 'admin';
  return admin ? '../assets/motion.worker.js' : './assets/motion.worker.js';
}

function buildProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function bindAttrib(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  data: Float32Array,
  size: number,
  store: WebGLBuffer[],
  index = 0
): void {
  const loc = gl.getAttribLocation(program, name);
  if (loc < 0) return;
  let buffer = store[index];
  if (!buffer) {
    buffer = gl.createBuffer();
    if (!buffer) return;
    store[index] = buffer;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}

export function createMotionEngine(canvas: HTMLCanvasElement, workerUrl?: string): MotionEngine {
  return new MotionEngine(canvas, workerUrl);
}

/** 회원·운영자 화면에 올리는 PutdukMotion 브라우저 API. */
import { createMotionEngine } from './motion-engine.ts';
import { detectQuality, readBrowserQualityHints } from './motion-quality.ts';
import { resolveMotion } from './motion-registry.ts';
import {
  WORK_PHASES,
  buildWorkTickInput,
  defaultWorkDuration,
  normalizeWorkPhase,
  type WorkPhaseExtras
} from './work-phase.ts';

declare global {
  interface Window {
    PutdukMotion?: PutdukMotionApi;
  }
}

type PutdukMotionApi = {
  resolve: typeof resolveMotion;
  detectQuality: typeof detectQuality;
  WORK_PHASES: typeof WORK_PHASES;
  normalizeWorkPhase: typeof normalizeWorkPhase;
  playWorkPhase: typeof playWorkPhase;
  stopWorkPhase: typeof stopWorkPhase;
  tick: (canvas: HTMLCanvasElement, input: Record<string, unknown>) => void;
  release: (canvas: HTMLCanvasElement) => void;
};

const engines = typeof WeakMap === 'function' ? new WeakMap<HTMLCanvasElement, ReturnType<typeof createMotionEngine>>() : null;
const fallbackEngines: ReturnType<typeof createMotionEngine>[] = [];
const workLoops = typeof WeakMap === 'function' ? new WeakMap<HTMLCanvasElement, { canvas: HTMLCanvasElement; raf: number; stopped: boolean }>() : null;
let fallbackLoops: Array<{ canvas: HTMLCanvasElement; raf: number; stopped: boolean }> = [];
let lastCanvas: HTMLCanvasElement | null = null;

function engineFor(canvas: HTMLCanvasElement) {
  if (engines) {
    let current = engines.get(canvas);
    if (!current) {
      current = createMotionEngine(canvas);
      engines.set(canvas, current);
    }
    return current;
  }
  let found = fallbackEngines.find((item) => item.canvas === canvas);
  if (!found) {
    found = createMotionEngine(canvas);
    fallbackEngines.push(found);
  }
  return found;
}

function isCanvas(value: unknown): value is HTMLCanvasElement {
  return !!(value && typeof (value as HTMLCanvasElement).getContext === 'function');
}

function getLoop(canvas: HTMLCanvasElement) {
  if (workLoops) return workLoops.get(canvas) || null;
  return fallbackLoops.find((item) => item.canvas === canvas) || null;
}

function setLoop(canvas: HTMLCanvasElement, token: { canvas: HTMLCanvasElement; raf: number; stopped: boolean }) {
  if (workLoops) {
    workLoops.set(canvas, token);
    return;
  }
  fallbackLoops = fallbackLoops.filter((item) => item.canvas !== canvas);
  fallbackLoops.push(token);
}

function clearLoop(canvas: HTMLCanvasElement) {
  const token = getLoop(canvas);
  if (token) {
    token.stopped = true;
    if (token.raf) cancelAnimationFrame(token.raf);
  }
  if (workLoops) workLoops.delete(canvas);
  else fallbackLoops = fallbackLoops.filter((item) => item.canvas !== canvas);
}

function resolvePlayCanvas(candidate: unknown): HTMLCanvasElement | null {
  if (isCanvas(candidate)) return candidate;
  if (typeof document === 'undefined') return null;
  return document.getElementById('motionCanvas') as HTMLCanvasElement | null;
}

function parsePlayArgs(a: unknown, b: unknown, c: unknown, d: unknown) {
  if (isCanvas(a)) return { canvas: a, partner: b, phase: c, extras: (d || {}) as WorkPhaseExtras };
  const extras = (c && typeof c === 'object' && !isCanvas(c) ? c : {}) as WorkPhaseExtras;
  return {
    canvas: resolvePlayCanvas(extras.canvas || lastCanvas),
    partner: a,
    phase: b,
    extras
  };
}

export function stopWorkPhase(canvas?: HTMLCanvasElement | null): void {
  const target = canvas || lastCanvas;
  if (!target) return;
  clearLoop(target);
}

export function playWorkPhase(a: unknown, b?: unknown, c?: unknown, d?: unknown): { stop: () => void } {
  const parsed = parsePlayArgs(a, b, c, d);
  const canvas = parsed.canvas;
  const partner = parsed.partner;
  const phase = parsed.phase;
  const extras = parsed.extras || {};
  const cut = normalizeWorkPhase(phase);
  const noop = { stop() {} };
  if (!canvas || !cut) return noop;
  lastCanvas = canvas;
  stopWorkPhase(canvas);
  const duration = Number(extras.durationMs) > 0 ? Number(extras.durationMs) : defaultWorkDuration(cut);
  const engine = engineFor(canvas);
  engine.visible = true;
  if (detectQuality(readBrowserQualityHints()).level === 'static') {
    engine.frame(buildWorkTickInput(partner, cut, extras, 1));
    extras.onDone?.();
    return noop;
  }
  const token = { canvas, raf: 0, stopped: false };
  const start = performance.now();
  const step = (now: number) => {
    if (token.stopped) return;
    const local = Math.min(1, (now - start) / duration);
    engine.frame(buildWorkTickInput(partner, cut, extras, local));
    if (local < 1) token.raf = requestAnimationFrame(step);
    else {
      clearLoop(canvas);
      extras.onDone?.();
    }
  };
  setLoop(canvas, token);
  token.raf = requestAnimationFrame(step);
  return { stop() { stopWorkPhase(canvas); } };
}

const api: PutdukMotionApi = {
  resolve: resolveMotion,
  detectQuality,
  WORK_PHASES,
  normalizeWorkPhase,
  playWorkPhase,
  stopWorkPhase,
  tick(canvas, input) {
    if (!canvas) return;
    lastCanvas = canvas;
    if (getLoop(canvas)) return;
    engineFor(canvas).frame(input || {});
  },
  release(canvas) {
    if (!canvas) return;
    stopWorkPhase(canvas);
    if (engines && engines.has(canvas)) {
      engines.get(canvas)?.dispose();
      engines.delete(canvas);
      return;
    }
    for (let i = fallbackEngines.length - 1; i >= 0; i -= 1) {
      if (fallbackEngines[i].canvas !== canvas) continue;
      fallbackEngines[i].dispose();
      fallbackEngines.splice(i, 1);
    }
  }
};

if (typeof window !== 'undefined') window.PutdukMotion = api;

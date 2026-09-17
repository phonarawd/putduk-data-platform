/** 서버 시각·진행률을 0~15 / 15~35 / 35~50 / 50~60 비율 연출로 맞춘다. */

export type MotionPhase = 'connect' | 'travel' | 'inspect' | 'sync';

export type MotionFrame = {
  width: number;
  height: number;
  progress: number;
  phase: MotionPhase;
  phaseLocal: number;
  seed: number;
  reduced: boolean;
  color: string;
  theme: string;
  vehicle: string;
  route: string;
  particle: string;
  completion: string;
};

const CONNECT_END = 15 / 60;
const TRAVEL_END = 35 / 60;
const INSPECT_END = 50 / 60;

export function resolveProgress(input: {
  progress?: number;
  started_at?: string | number | null;
  expected_completed_at?: string | number | null;
  now?: number;
}): number {
  const started = parseTime(input.started_at);
  const expected = parseTime(input.expected_completed_at);
  const now = Number(input.now || Date.now());

  if (started && expected && expected > started) {
    return clamp01((now - started) / (expected - started));
  }

  return clamp01(Number(input.progress || 0));
}

export function resolvePhase(progress: number): MotionPhase {
  const value = clamp01(progress);
  if (value < CONNECT_END) return 'connect';
  if (value < TRAVEL_END) return 'travel';
  if (value < INSPECT_END) return 'inspect';
  return 'sync';
}

export function phaseLocalProgress(progress: number): number {
  const value = clamp01(progress);
  if (value < CONNECT_END) return value / CONNECT_END;
  if (value < TRAVEL_END) return (value - CONNECT_END) / (TRAVEL_END - CONNECT_END);
  if (value < INSPECT_END) return (value - TRAVEL_END) / (INSPECT_END - TRAVEL_END);
  return (value - INSPECT_END) / (1 - INSPECT_END);
}

export function hashSeed(value: unknown): number {
  const text = String(value || 'putduk');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function parseTime(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

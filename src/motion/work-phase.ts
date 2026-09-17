/** 근무 플로우 시네마틱 컷. 이모지·폭죽 없이 카메라·물류 기하만. */
import {
  drawIdBadge,
  drawPhoneShell,
  hexAlpha,
  mixHex,
  roundPoly,
  shade
} from './cinematic-draw.ts';
import type { MotionFrame, WorkCut } from './motion-timeline.ts';

export const WORK_PHASES = {
  lock: 'lock',
  submit: 'submit',
  approve: 'approve',
  pwa_home: 'pwa_home',
  demote: 'demote'
} as const;

const PHASE_ALIASES: Record<string, WorkCut> = {
  start: 'lock',
  lock: 'lock',
  lock_in: 'lock',
  work_start: 'lock',
  begin: 'lock',
  submit: 'submit',
  route: 'submit',
  correct_path: 'submit',
  path: 'submit',
  approve: 'approve',
  approval: 'approve',
  settle: 'approve',
  payout: 'approve',
  credit: 'approve',
  pwa_home: 'pwa_home',
  pwa: 'pwa_home',
  onboarding_pwa: 'pwa_home',
  badge_home: 'pwa_home',
  home_badge: 'pwa_home',
  demote: 'demote',
  principal_withdraw: 'demote',
  badge_down: 'demote',
  rank_down: 'demote',
  stripe_down: 'demote'
};

export type WorkPhaseExtras = {
  canvas?: HTMLCanvasElement | null;
  principal?: number;
  stipend?: number;
  lock_amount?: number;
  allowance?: number;
  durationMs?: number;
  motion_seed?: string | number | null;
  onDone?: () => void;
};

export function normalizeWorkPhase(phase: unknown): WorkCut | null {
  const key = String(phase || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PHASE_ALIASES[key] || null;
}

export function defaultWorkDuration(cut: WorkCut): number {
  if (cut === 'approve') return 2800;
  if (cut === 'pwa_home') return 2600;
  if (cut === 'demote') return 2400;
  if (cut === 'submit') return 2400;
  return 2200;
}

/** 컷별 물류 타임라인 위치. 잠금=연결, 제출=이동, 승인=동기. */
export function workCutProgress(cut: WorkCut, local: number): number {
  const t = clamp01(local);
  if (cut === 'lock') return t * 0.22;
  if (cut === 'submit') return 0.26 + t * 0.32;
  if (cut === 'approve') return 0.84 + t * 0.16;
  if (cut === 'pwa_home') return 0.48 + t * 0.22;
  return 0.18 + (1 - t) * 0.16;
}

export function easeWork(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function partnerToInput(partner: unknown): Record<string, unknown> {
  if (partner && typeof partner === 'object') {
    return { ...(partner as Record<string, unknown>) };
  }
  const name = String(partner || '').trim();
  return {
    company: name,
    partner_name: name,
    slug: name,
    name,
    title: name
  };
}

export function readWorkCut(input: Record<string, unknown> | null | undefined): WorkCut | null {
  const source = input || {};
  return normalizeWorkPhase(source.work_cut || source.workCut || source.work_phase || source.workPhase);
}

export function readWorkLocal(input: Record<string, unknown> | null | undefined): number {
  const source = input || {};
  const raw = source.work_local ?? source.workLocal;
  if (raw == null || raw === '') return 0;
  return clamp01(Number(raw));
}

export function readPrincipal(input: Record<string, unknown> | null | undefined): number {
  const source = input || {};
  return finiteMoney(source.principal ?? source.lock_amount ?? source.lockAmount);
}

export function readStipend(input: Record<string, unknown> | null | undefined): number {
  const source = input || {};
  return finiteMoney(source.stipend ?? source.allowance ?? source.pay);
}

export function applyWorkCamera(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const cut = frame.workCut;
  if (!cut || frame.reduced) return;
  const w = frame.width;
  const h = frame.height;
  const t = easeWork(frame.workLocal);
  const zoom = cut === 'lock'
    ? 1.02 + t * 0.05
    : cut === 'submit'
      ? 1.01 + t * 0.04
      : cut === 'demote'
        ? 1.02 + t * 0.03
        : 1.02;
  const panX = cut === 'submit' ? w * 0.018 * Math.sin(t * Math.PI) : 0;
  const panY = cut === 'lock' ? -h * 0.02 * t : cut === 'demote' ? h * 0.025 * t : 0;
  ctx.translate(w / 2 + panX, h / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);
}

export function drawWorkCinematic(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  if (!frame.workCut) return;
  if (frame.workCut === 'lock') drawLockCut(ctx, frame);
  else if (frame.workCut === 'submit') drawSubmitCut(ctx, frame);
  else if (frame.workCut === 'approve') drawApproveCut(ctx, frame);
  else if (frame.workCut === 'pwa_home') drawPwaHomeCut(ctx, frame);
  else drawDemoteCut(ctx, frame);
}

export function buildWorkTickInput(
  partner: unknown,
  phase: unknown,
  extras: WorkPhaseExtras | undefined,
  local: number
): Record<string, unknown> {
  const cut = normalizeWorkPhase(phase);
  const payload = partnerToInput(partner);
  const principal = finiteMoney(extras?.principal ?? extras?.lock_amount);
  const stipend = finiteMoney(extras?.stipend ?? extras?.allowance);
  return {
    ...payload,
    progress: cut ? workCutProgress(cut, local) : 0,
    work_cut: cut,
    work_local: easeWork(local),
    principal,
    stipend,
    motion_seed: extras?.motion_seed ?? payload.motion_seed
  };
}

export function runWorkPhasePlayback(args: {
  tick: (input: Record<string, unknown>) => void;
  partner: unknown;
  phase: unknown;
  extras?: WorkPhaseExtras;
  reduced?: boolean;
  raf?: (cb: (time: number) => void) => number;
  caf?: (id: number) => void;
  now?: () => number;
}): { stop: () => void } {
  const cut = normalizeWorkPhase(args.phase);
  const extras = args.extras || {};
  if (!cut) return { stop() {} };
  const duration = Number(extras.durationMs) > 0 ? Number(extras.durationMs) : defaultWorkDuration(cut);
  const raf = args.raf || ((cb) => requestAnimationFrame(cb as FrameRequestCallback));
  const caf = args.caf || ((id) => cancelAnimationFrame(id));
  const nowFn = args.now || (() => performance.now());
  if (args.reduced) {
    args.tick(buildWorkTickInput(args.partner, cut, extras, 1));
    extras.onDone?.();
    return { stop() {} };
  }
  let rafId = 0;
  let stopped = false;
  const start = nowFn();
  const step = (time: number) => {
    if (stopped) return;
    const local = Math.min(1, (time - start) / duration);
    args.tick(buildWorkTickInput(args.partner, cut, extras, local));
    if (local < 1) rafId = raf(step);
    else extras.onDone?.();
  };
  rafId = raf(step);
  return {
    stop() {
      stopped = true;
      caf(rafId);
    }
  };
}

function drawLockCut(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, workLocal: t } = frame;
  const dockX = w * 0.84;
  const dockY = h * 0.28;
  for (let i = 0; i < 5; i += 1) {
    const delay = i * 0.1;
    const u = easeWork(clamp01((t - delay) / 0.55));
    const sx = w * (0.72 + (i % 3) * 0.05);
    const sy = h * (0.18 + i * 0.05);
    drawBox3d(
      ctx,
      sx + (dockX - 28 - sx) * u,
      sy + (dockY - sy) * u,
      16 - u * 3,
      10 - u * 2,
      5 + (1 - u) * 6,
      i % 2 ? '#f3cd6b' : '#e7c56a'
    );
  }
}

function drawSubmitCut(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, workLocal: t } = frame;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(243,205,107,0)');
  g.addColorStop(0.5, `rgba(243,205,107,${0.08 + t * 0.12})`);
  g.addColorStop(1, 'rgba(243,205,107,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.42, w, h * 0.18);
}

function drawApproveCut(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, workLocal: t, principal, stipend } = frame;
  const inset = Math.max(22, Math.min(w, h) * 0.07);
  ctx.fillStyle = `rgba(243,205,107,${0.05 + t * 0.08})`;
  ctx.fillRect(0, 0, w, h);
  const trayY = h - inset - h * 0.12;
  drawBox3d(ctx, inset, trayY, w - inset * 2, h * 0.1, 10, '#1c2a36');
  ctx.fillStyle = 'rgba(128,239,193,0.28)';
  ctx.fillRect(inset + 8, trayY + 6, (w - inset * 2 - 16) * t, 7);
  const slabH = Math.max(28, Math.min(40, h * 0.12));
  const slabW = (w - inset * 3) / 2;
  drawValueSlab(ctx, inset, inset, slabW, slabH, principal, '#80efc1', 0.95);
  drawValueSlab(ctx, inset * 2 + slabW, inset, slabW, slabH, stipend, '#f3cd6b', 0.95);
}

function drawPwaHomeCut(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, workLocal: t, color } = frame;
  ctx.fillStyle = `rgba(4,10,14,${0.35 + t * 0.2})`;
  ctx.fillRect(0, 0, w, h);
  const phoneW = Math.min(w * 0.36, 158);
  const phoneH = Math.min(h * 0.82, phoneW * 2.05);
  const phoneX = w * 0.56;
  const phoneY = (h - phoneH) / 2;
  const slot = drawPhoneShell(ctx, phoneX, phoneY, phoneW, phoneH);
  const start = { x: Math.max(18, w * 0.07), y: Math.max(18, h * 0.1), bw: w * 0.38, bh: h * 0.64 };
  const bw = start.bw + (slot.cell - start.bw) * t;
  const bh = start.bh + (slot.cell - start.bh) * t;
  const x = start.x + (slot.slotX - start.x) * t;
  const y = start.y + (slot.slotY - start.y) * t;
  ctx.save();
  ctx.shadowColor = 'rgba(243,205,107,0.45)';
  ctx.shadowBlur = 18 * (1 - t);
  drawIdBadge(ctx, x, y, bw, bh, '#243442', 0.12 * bh, color, (1 - t) * 0.08);
  ctx.restore();
}

function drawDemoteCut(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, workLocal: t, color } = frame;
  ctx.fillStyle = `rgba(4,10,14,${0.28 + t * 0.25})`;
  ctx.fillRect(0, 0, w, h);
  const bw = w * 0.36;
  const bh = h * 0.52;
  const x = (w - bw) / 2;
  const y = Math.max(20, h * 0.12) + t * h * 0.18;
  drawIdBadge(ctx, x, y, bw, bh, '#1a2430', (0.1 + t * 0.62) * bh, mixHex(color, '#6b7280', t), 0.08 * t);
}

function drawValueSlab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  amount: number,
  color: string,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0.2, alpha);
  roundPoly(ctx, x, y, w, h, 8, hexAlpha(color, 0.2));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (amount > 0) {
    ctx.fillStyle = color;
    ctx.font = `600 ${Math.max(13, h * 0.4)}px Pretendard, "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(amount).toLocaleString('ko-KR'), x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function drawBox3d(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, 0.72);
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + depth, y - depth * 0.6);
  ctx.lineTo(x + w + depth, y + h - depth * 0.6);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 1.12);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + depth, y - depth * 0.6);
  ctx.lineTo(x + w + depth, y - depth * 0.6);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
}

function finiteMoney(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

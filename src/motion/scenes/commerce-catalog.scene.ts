/** 알리바바·이베이 상품 카드·컨베이어. */
import type { MotionFrame } from '../motion-timeline.ts';

export const id = 'commerce_catalog';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, progress: t, color } = frame;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.72);
  ctx.lineTo(w * 0.92, h * 0.72);
  ctx.stroke();

  for (let i = 0; i < 5; i += 1) {
    const x = w * 0.18 + i * (w * 0.15);
    const y = h * 0.35 + Math.sin(t * 4 + i) * 10;
    ctx.fillStyle = i % 2 ? color : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, 54, 72);
    ctx.fillStyle = '#f3cd6b';
    ctx.fillRect(x + 8, y + 10, 38, 8);
    if (frame.route === 'field_match' && frame.phase === 'inspect') {
      ctx.strokeStyle = '#80efc1';
      ctx.strokeRect(x + 4, y + 28, 46, 10);
    }
  }
}

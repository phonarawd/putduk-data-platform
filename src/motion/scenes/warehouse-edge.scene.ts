/** GXO 창고. 랙·조명·지게차가 실제 물류 장면으로 움직인다. */
import type { MotionFrame } from '../motion-timeline.ts';
import { clockOf, drawForklift, drawWarehouseWorld, travelOf } from '../cinematic-draw.ts';

export const id = 'warehouse_edge';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, color } = frame;
  const t = travelOf(frame);
  const clock = clockOf(frame);
  drawWarehouseWorld(ctx, frame);
  const x = w * (0.14 + t * 0.62);
  const y = h * 0.78;
  const scale = Math.min(w, h) / 82;
  drawForklift(ctx, x, y, scale, color, clock);
  ctx.fillStyle = '#f3cd6b';
  ctx.fillRect(x + 16 * scale, y - 28 * scale + Math.sin(clock * 2) * 3, 22 * scale, 14 * scale);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 16 * scale, y - 28 * scale + Math.sin(clock * 2) * 3, 22 * scale, 3);
}

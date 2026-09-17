/** GXO 창고 격자·재고 분산. */
import type { MotionFrame } from '../motion-timeline.ts';

export const id = 'warehouse_edge';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, progress: t, color } = frame;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const x = w * 0.12 + col * (w * 0.1);
      const y = h * 0.28 + row * 38;
      const lit = ((col + row + Math.floor(t * 12)) % 4) === 0;
      ctx.strokeStyle = lit ? color : 'rgba(255,255,255,0.16)';
      ctx.strokeRect(x, y, 28, 22);
      if (lit && frame.phase !== 'connect') {
        ctx.fillStyle = 'rgba(243, 205, 107, 0.28)';
        ctx.fillRect(x, y, 28, 22);
      }
    }
  }
}

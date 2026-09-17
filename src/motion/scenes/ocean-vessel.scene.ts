/** Maersk 컨테이너선·해상 항로. */
import type { MotionFrame } from '../motion-timeline.ts';

export const id = 'ocean_vessel';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, progress: t, color } = frame;
  for (let i = 0; i < 6; i += 1) {
    const y = h * 0.42 + i * 18;
    ctx.strokeStyle = `rgba(120, 220, 230, ${0.08 + i * 0.03})`;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      ctx.lineTo(x, y + Math.sin(x / 40 + t * 8 + i) * 6);
    }
    ctx.stroke();
  }

  const shipX = w * (0.15 + t * 0.7);
  const shipY = h * 0.5 + Math.sin(t * 6) * 8;
  const nextX = w * (0.15 + Math.min(1, t + 0.02) * 0.7);
  const angle = Math.atan2(Math.sin((t + 0.02) * 6) * 8 - Math.sin(t * 6) * 8, nextX - shipX);

  ctx.save();
  ctx.translate(shipX, shipY);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(32, -4);
  ctx.lineTo(20, 12);
  ctx.lineTo(-24, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.fillStyle = '#f3cd6b';
  ctx.arc(shipX + 36, shipY - 10, 3, 0, Math.PI * 2);
  ctx.fill();
}

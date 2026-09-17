/** Maersk 해상. 수평선·파도·컨테이너선이 움직인다. */
import type { MotionFrame } from '../motion-timeline.ts';
import { clockOf, drawOceanWorld, drawShip, travelOf } from '../cinematic-draw.ts';

export const id = 'ocean_vessel';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h } = frame;
  const t = travelOf(frame);
  const clock = clockOf(frame);
  drawOceanWorld(ctx, frame);

  const farX = w * (0.62 + Math.sin(clock * 0.35) * 0.04);
  const farY = h * 0.46 + Math.sin(clock * 0.9) * 3;
  drawShip(ctx, farX, farY, Math.min(w, h) / 520, Math.sin(clock * 0.9) * 0.03, '#c5d0d6', clock * 0.8);

  const x = w * (0.16 + t * 0.56);
  const y = h * 0.6 + Math.sin(clock * 1.4) * 7;
  const angle = Math.sin(clock * 1.4) * 0.045;
  const scale = Math.min(w, h) / 200;
  drawShip(ctx, x, y, scale, angle, frame.color, clock);

  ctx.strokeStyle = 'rgba(214,243,255,0.34)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x - 78 * scale, y + 20 * scale);
  for (let i = 1; i <= 12; i += 1) {
    ctx.lineTo(
      x - 78 * scale - i * 16,
      y + 20 * scale + Math.sin(clock * 3.2 + i) * (3.5 + i * 0.35)
    );
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(214,243,255,0.12)';
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      x - 50 * scale - i * 18,
      y + 22 * scale + Math.sin(clock * 4 + i) * 2,
      10 + i,
      2.4,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

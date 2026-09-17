/** FedEx 항공 항로·통관 문서 칩. */
import type { MotionFrame } from '../motion-timeline.ts';
import { poseOnPath } from './road-logistics.scene.ts';

export const id = 'air_cargo';

export function routePoints(frame: MotionFrame): Array<{ x: number; y: number }> {
  const { width: w, height: h } = frame;
  return [
    { x: w * 0.08, y: h * 0.7 },
    { x: w * 0.32, y: h * 0.38 },
    { x: w * 0.58, y: h * 0.28 },
    { x: w * 0.92, y: h * 0.42 }
  ];
}

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const points = routePoints(frame);
  ctx.strokeStyle = 'rgba(180, 170, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();

  const pose = poseOnPath(points, frame.phase === 'connect' ? frame.phaseLocal * 0.2 : frame.progress);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.fillStyle = frame.color;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-12, -8);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-12, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (frame.phase === 'inspect' || frame.phase === 'sync') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(frame.width * 0.72, frame.height * 0.62, 54, 36);
    ctx.fillStyle = '#f3cd6b';
    ctx.fillRect(frame.width * 0.74, frame.height * 0.65, 38, 6);
  }
}

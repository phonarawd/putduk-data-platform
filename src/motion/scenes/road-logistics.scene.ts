/** DHL·UPS·CJ 도로 경로. 접선에 맞춰 차량을 회전한다. */
import type { MotionFrame } from '../motion-timeline.ts';

export const id = 'road_logistics';

export function routePoints(frame: MotionFrame): Array<{ x: number; y: number }> {
  const { width: w, height: h, route } = frame;
  if (route === 'branch_route') {
    return [
      { x: w * 0.08, y: h * 0.74 },
      { x: w * 0.3, y: h * 0.58 },
      { x: w * 0.48, y: h * 0.42 },
      { x: w * 0.62, y: h * 0.56 },
      { x: w * 0.88, y: h * 0.3 }
    ];
  }
  if (route === 'warehouse_scan') {
    return [
      { x: w * 0.1, y: h * 0.68 },
      { x: w * 0.28, y: h * 0.68 },
      { x: w * 0.28, y: h * 0.38 },
      { x: w * 0.72, y: h * 0.38 },
      { x: w * 0.72, y: h * 0.64 },
      { x: w * 0.9, y: h * 0.28 }
    ];
  }
  return [
    { x: w * 0.08, y: h * 0.72 },
    { x: w * 0.28, y: h * 0.58 },
    { x: w * 0.48, y: h * 0.62 },
    { x: w * 0.7, y: h * 0.4 },
    { x: w * 0.9, y: h * 0.32 }
  ];
}

export function poseOnPath(
  points: Array<{ x: number; y: number }>,
  t: number
): { x: number; y: number; angle: number } {
  if (points.length < 2) return { x: 0, y: 0, angle: 0 };
  const scaled = Math.min(0.999, Math.max(0, t)) * (points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  return {
    x: a.x + (b.x - a.x) * local,
    y: a.y + (b.y - a.y) * local,
    angle: Math.atan2(b.y - a.y, b.x - a.x)
  };
}

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const points = routePoints(frame);
  const travel = frame.phase === 'connect' ? frame.phaseLocal * 0.18 : frame.progress;
  ctx.strokeStyle = 'rgba(243, 205, 107, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();

  if (frame.route === 'branch_route') {
    ctx.strokeStyle = 'rgba(100, 167, 11, 0.28)';
    ctx.beginPath();
    ctx.moveTo(points[2].x, points[2].y);
    ctx.lineTo(frame.width * 0.86, frame.height * 0.7);
    ctx.stroke();
  }

  const pose = poseOnPath(points, travel);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.fillStyle = frame.color;
  ctx.fillRect(-14, -7, 28, 14);
  ctx.fillStyle = '#f3cd6b';
  ctx.fillRect(8, -4, 8, 8);
  ctx.restore();

  ctx.beginPath();
  ctx.fillStyle = '#80efc1';
  ctx.arc(points[points.length - 1].x, points[points.length - 1].y, 4, 0, Math.PI * 2);
  ctx.fill();
}

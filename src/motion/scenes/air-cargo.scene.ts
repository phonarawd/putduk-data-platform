/** FedEx 활주로·순항. 화물기가 실제로 이륙·비행한다. */
import type { MotionFrame } from '../motion-timeline.ts';
import { clockOf, drawCruiseSky, drawPlane, drawRunwayWorld, roadPose, travelOf } from '../cinematic-draw.ts';

export const id = 'air_cargo';

export function routePoints(frame: MotionFrame): Array<{ x: number; y: number }> {
  const { width: w, height: h } = frame;
  return [
    { x: w * 0.16, y: h * 0.78 },
    { x: w * 0.38, y: h * 0.52 },
    { x: w * 0.62, y: h * 0.36 },
    { x: w * 0.86, y: h * 0.3 }
  ];
}

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const travel = travelOf(frame);
  const clock = clockOf(frame);
  const cruise = frame.workCut === 'approve' || (frame.phase === 'sync' && !frame.workCut);
  if (cruise) {
    drawCruiseSky(ctx, frame);
    const x = frame.width * (0.2 + travel * 0.52);
    const y = frame.height * (0.4 + Math.sin(clock) * 0.028);
    drawPlane(ctx, x, y, 1.22, -0.14, frame.color, 0);
    ctx.strokeStyle = 'rgba(220,228,236,0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 86, y + 10);
    ctx.quadraticCurveTo(x - 160, y + 22, x - 240, y + 8);
    ctx.stroke();
    drawPlane(
      ctx,
      frame.width * 0.78,
      frame.height * 0.22,
      0.38,
      -0.08,
      '#c5ccd4',
      0
    );
    return;
  }

  drawRunwayWorld(ctx, frame);
  const gear = frame.workCut === 'lock' ? 1 : Math.max(0, 1 - travel * 1.35);
  const pose = roadPose(frame.width, frame.height, 0.2 + travel * 0.64, 0);
  const climb = frame.workCut === 'submit' ? -0.22 * frame.workLocal : frame.workCut === 'lock' ? 0 : -0.06;
  drawPlane(ctx, pose.x, pose.y + climb * 90, pose.scale * 1.12, climb, frame.color, gear);
}

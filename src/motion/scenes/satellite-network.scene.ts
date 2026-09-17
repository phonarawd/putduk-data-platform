/** 데이터센터·도시·위성 회선. 0~15초 연결 구간의 기본 장면. */
import type { MotionFrame } from '../motion-timeline.ts';

export const id = 'satellite_network';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, progress: t, color, phaseLocal } = frame;
  const hubs = [
    { x: w * 0.22, y: h * 0.62 },
    { x: w * 0.5, y: h * 0.7 },
    { x: w * 0.78, y: h * 0.58 },
    { x: w * 0.5, y: h * 0.22 }
  ];

  ctx.strokeStyle = 'rgba(13, 159, 118, 0.28)';
  hubs.forEach((hub, index) => {
    const next = hubs[(index + 1) % hubs.length];
    ctx.beginPath();
    ctx.moveTo(hub.x, hub.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
  });

  hubs.forEach((hub, index) => {
    const pulse = 3 + ((t * 8 + index) % 1) * 4;
    ctx.beginPath();
    ctx.fillStyle = index === 3 ? color : '#80efc1';
    ctx.arc(hub.x, hub.y, pulse, 0, Math.PI * 2);
    ctx.fill();
  });

  const beam = hubs[3];
  ctx.strokeStyle = `rgba(243, 205, 107, ${0.2 + phaseLocal * 0.5})`;
  ctx.beginPath();
  ctx.moveTo(beam.x, beam.y);
  ctx.lineTo(w * 0.5, h * 0.48);
  ctx.stroke();
}

/** 데이터센터·도시·위성. 세계 해안선 SVG 경로와 위성 기체가 돈다. */
import type { MotionFrame } from '../motion-timeline.ts';
import { drawGlobeWorld } from '../cinematic-draw.ts';

export const id = 'satellite_network';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  drawGlobeWorld(ctx, frame);
}

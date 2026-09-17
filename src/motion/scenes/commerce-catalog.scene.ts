/** 알리바바·이베이 카탈로그. 컨베이어 위 상품 카드가 원근으로 흐른다. */
import type { MotionFrame } from '../motion-timeline.ts';
import { drawCatalogWorld } from '../cinematic-draw.ts';

export const id = 'commerce_catalog';

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  drawCatalogWorld(ctx, frame);
}

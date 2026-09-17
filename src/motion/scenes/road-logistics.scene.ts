/** DHL·UPS·CJ 원근 도로. 승용·밴·트럭이 차선 위를 달린다. */
import type { MotionFrame } from '../motion-timeline.ts';
import {
  clockOf,
  drawLoadingDock,
  drawPerspectiveRoad,
  drawSedanRoad,
  drawTruckRoad,
  drawVanRoad,
  roadPose,
  travelOf,
  type RoadHeading
} from '../cinematic-draw.ts';

export const id = 'road_logistics';

type RoadActor = {
  u: number;
  lane: number;
  kind: 'sedan' | 'van' | 'truck';
  heading: RoadHeading;
  tint: string;
};

export function routePoints(frame: MotionFrame): Array<{ x: number; y: number }> {
  const { width: w, height: h } = frame;
  return [
    { x: w * 0.18, y: h * 0.86 },
    { x: w * 0.42, y: h * 0.62 },
    { x: w * 0.5, y: h * 0.48 },
    { x: w * 0.62, y: h * 0.4 }
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

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function drawScene(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const clock = clockOf(frame);
  const travel = travelOf(frame);
  drawPerspectiveRoad(ctx, frame);
  if (frame.workCut === 'lock') drawLoadingDock(ctx, frame);

  const heroLane = 0.38;
  const heroU = frame.workCut === 'lock'
    ? 0.58 + frame.workLocal * 0.14
    : frame.workCut === 'submit'
      ? 0.46 + frame.workLocal * 0.22
      : 0.68;

  const actors: RoadActor[] = [
    {
      u: heroU,
      lane: heroLane,
      kind: 'truck',
      heading: 'away',
      tint: frame.color
    },
    {
      u: 0.12 + wrapUnit(travel * 0.45) * 0.16,
      lane: 0.78,
      kind: 'van',
      heading: 'away',
      tint: shadePartner(frame.color)
    },
    {
      u: wrapUnit(0.18 + travel * 0.72),
      lane: -0.4,
      kind: 'sedan',
      heading: 'toward',
      tint: '#9aacb8'
    },
    {
      u: wrapUnit(0.52 + travel * 0.5),
      lane: -0.78,
      kind: 'van',
      heading: 'toward',
      tint: '#d8dee6'
    }
  ];

  actors
    .filter((car) => {
      if (car.kind === 'truck' && car.lane === heroLane) return true;
      const nearHero = Math.abs(car.u - heroU) < 0.16 && Math.abs(car.lane - heroLane) < 0.55;
      return !nearHero && car.u > 0.07 && car.u < 0.88;
    })
    .sort((a, b) => a.u - b.u)
    .forEach((car) => {
      const pose = roadPose(frame.width, frame.height, car.u, car.lane);
      const scale = pose.scale * (car.kind === 'truck' ? 1.05 : car.kind === 'van' ? 0.92 : 0.78);
      if (car.kind === 'truck') drawTruckRoad(ctx, pose.x, pose.y, scale, car.tint, clock, car.heading);
      else if (car.kind === 'van') drawVanRoad(ctx, pose.x, pose.y, scale, car.tint, clock, car.heading);
      else drawSedanRoad(ctx, pose.x, pose.y, scale, car.tint, clock, car.heading);
    });
}

function shadePartner(hex: string): string {
  const raw = String(hex || '#0d9f76').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 13;
  const g = parseInt(full.slice(2, 4), 16) || 159;
  const b = parseInt(full.slice(4, 6), 16) || 118;
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c * 0.72 + 40)));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

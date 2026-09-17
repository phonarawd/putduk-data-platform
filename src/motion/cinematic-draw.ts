/** 정밀 SVG 벡터를 Canvas Path2D로 그려 시네마틱 물류 컷을 만든다. */
import type { MotionFrame } from './motion-timeline.ts';

export function clockOf(frame: MotionFrame): number {
  return (frame.clock || 0) + frame.progress * 2.4 + frame.workLocal * 1.8 + (frame.seed % 97) * 0.01;
}

export function travelOf(frame: MotionFrame): number {
  if (frame.workCut === 'lock') return 0.22 + frame.workLocal * 0.18;
  if (frame.workCut === 'submit') return 0.18 + frame.workLocal * 0.7;
  if (frame.workCut === 'approve') return 0.62 + frame.workLocal * 0.22;
  return frame.phase === 'connect' ? frame.phaseLocal * 0.2 : clamp01(frame.progress);
}

export function fillSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  kind: 'dusk' | 'runway' | 'ocean' | 'night'
): void {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  if (kind === 'ocean') {
    g.addColorStop(0, '#071525');
    g.addColorStop(0.52, '#16344a');
    g.addColorStop(1, '#c4784a');
  } else if (kind === 'runway') {
    g.addColorStop(0, '#081018');
    g.addColorStop(0.45, '#152536');
    g.addColorStop(1, '#3a4a5a');
  } else if (kind === 'night') {
    g.addColorStop(0, '#050a10');
    g.addColorStop(1, '#12202a');
  } else {
    g.addColorStop(0, '#0b1c28');
    g.addColorStop(0.5, '#1a3a4a');
    g.addColorStop(1, '#c4784a');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, Math.max(1, horizon));
}

export function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2);
  glow.addColorStop(0, 'rgba(243,205,107,0.85)');
  glow.addColorStop(0.35, 'rgba(243,205,107,0.22)');
  glow.addColorStop(1, 'rgba(243,205,107,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f3cd6b';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawHills(ctx: CanvasRenderingContext2D, w: number, horizon: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.quadraticCurveTo(w * 0.18, horizon - 28, w * 0.34, horizon - 10);
  ctx.quadraticCurveTo(w * 0.52, horizon - 36, w * 0.7, horizon - 8);
  ctx.quadraticCurveTo(w * 0.86, horizon - 24, w, horizon - 6);
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fill();
}

export function drawCitySilhouette(ctx: CanvasRenderingContext2D, w: number, horizon: number, t: number): void {
  ctx.fillStyle = '#0a1418';
  for (let i = 0; i < 18; i += 1) {
    const x = (w / 18) * i + 4;
    const bw = 10 + (i % 3) * 6;
    const bh = 16 + ((i * 17) % 42);
    ctx.fillRect(x, horizon - bh, bw, bh);
    if ((i + Math.floor(t * 6)) % 3 === 0) {
      ctx.fillStyle = 'rgba(243,205,107,0.35)';
      ctx.fillRect(x + 3, horizon - bh + 6, 3, 4);
      ctx.fillStyle = '#0a1418';
    }
  }
}

export function drawWheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#121416';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(220,224,228,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  for (let i = 0; i < 5; i += 1) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.moveTo(r * 0.12, 0);
    ctx.lineTo(r * 0.52, 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#cfd3d7';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bodyPath(ctx: CanvasRenderingContext2D, d: string): void {
  const path = new Path2D(d);
  ctx.fill(path);
}

export function drawSedan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  angle: number,
  color: string,
  clock: number,
  flip = false
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(flip ? -scale : scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 42, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.55);
  ctx.fillRect(-40, 6, 80, 6);
  ctx.fillStyle = color;
  bodyPath(ctx, 'M-40 -2 C-32 -18 -18 -24 0 -24 C18 -24 30 -16 40 -2 L44 8 L-44 8 Z');
  ctx.fillStyle = shade(color, 1.18);
  ctx.fillRect(-36, -2, 72, 3);
  ctx.fillStyle = 'rgba(126,200,232,0.92)';
  bodyPath(ctx, 'M-18 -22 C-4 -26 12 -26 22 -16 L18 -4 H-20 Z');
  ctx.fillStyle = 'rgba(234,247,255,0.45)';
  bodyPath(ctx, 'M-18 -22 C-8 -24 2 -24 8 -18 L6 -4 H-20 Z');
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(-44, 0, 7, 5);
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(37, 0, 7, 5);
  const rot = clock * 9;
  drawWheel(ctx, -22, 12, 8.5, rot);
  drawWheel(ctx, 22, 12, 8.5, rot);
  ctx.restore();
}

export function drawVan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  angle: number,
  color: string,
  clock: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(2, 20, 48, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundPoly(ctx, -46, -22, 86, 36, 6);
  ctx.fillStyle = shade(color, 1.16);
  ctx.fillRect(-46, -22, 86, 8);
  ctx.fillStyle = shade(color, 0.72);
  ctx.fillRect(20, -18, 24, 28);
  ctx.fillStyle = 'rgba(126,200,232,0.9)';
  bodyPath(ctx, 'M-40 -16 H-8 L2 -2 V10 H-40 Z');
  ctx.fillStyle = 'rgba(234,247,255,0.4)';
  ctx.fillRect(-40, -16, 32, 8);
  ctx.fillStyle = 'rgba(20,24,28,0.28)';
  ctx.fillRect(-4, -10, 18, 14);
  ctx.fillStyle = '#11161b';
  ctx.fillRect(-48, 10, 94, 6);
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(-48, 0, 7, 6);
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(38, 0, 7, 6);
  const rot = clock * 8.2;
  drawWheel(ctx, -28, 16, 9, rot);
  drawWheel(ctx, 26, 16, 9, rot);
  ctx.restore();
}

export function drawTruck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  angle: number,
  color: string,
  clock: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(6, 22, 54, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundPoly(ctx, -18, -26, 78, 38, 5);
  ctx.fillStyle = shade(color, 1.2);
  ctx.fillRect(-18, -26, 78, 7);
  ctx.strokeStyle = shade(color, 0.55);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i += 1) {
    const rx = -10 + i * 10;
    ctx.beginPath();
    ctx.moveTo(rx, -18);
    ctx.lineTo(rx, 8);
    ctx.stroke();
  }
  ctx.fillStyle = '#1b2228';
  ctx.fillRect(50, -12, 7, 20);
  ctx.fillStyle = '#1c242c';
  bodyPath(ctx, 'M-54 -10 H-18 L-8 2 V18 H-54 V-4 C-54 -8 -54 -10 -50 -10 Z');
  ctx.fillStyle = 'rgba(126,200,232,0.92)';
  bodyPath(ctx, 'M-48 -6 H-22 L-12 6 V14 H-48 Z');
  ctx.fillStyle = 'rgba(234,247,255,0.45)';
  ctx.fillRect(-48, -6, 26, 6);
  ctx.fillStyle = '#11161b';
  ctx.fillRect(-54, 12, 114, 6);
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(-54, 2, 7, 6);
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(52, 2, 8, 6);
  ctx.fillStyle = '#f3cd6b';
  ctx.fillRect(-8, -30, 4, 4);
  ctx.fillRect(8, -30, 4, 4);
  const rot = clock * 7.4;
  drawWheel(ctx, -36, 18, 10, rot);
  drawWheel(ctx, 36, 18, 10, rot);
  ctx.restore();
}

export type RoadHeading = 'away' | 'toward';

function drawRoadWheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.72);
  drawWheel(ctx, 0, 0, r, rot);
  ctx.restore();
}

function fillTrapezoid(
  ctx: CanvasRenderingContext2D,
  topW: number,
  botW: number,
  topY: number,
  botY: number,
  fill: string
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-topW, topY);
  ctx.lineTo(topW, topY);
  ctx.lineTo(botW, botY);
  ctx.lineTo(-botW, botY);
  ctx.closePath();
  ctx.fill();
}

/** 원근 도로용 승용. 카메라 기준 후면 또는 전면. */
export function drawSedanRoad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  clock: number,
  heading: RoadHeading
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 24, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const rot = clock * 9;
  if (heading === 'away') {
    fillTrapezoid(ctx, 14, 24, -28, 2, shade(color, 0.78));
    fillTrapezoid(ctx, 12, 18, -26, -8, 'rgba(90,150,180,0.92)');
    fillTrapezoid(ctx, 8, 10, -26, -12, 'rgba(234,247,255,0.4)');
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(-20, -4, 8, 5);
    ctx.fillRect(12, -4, 8, 5);
    ctx.fillStyle = shade(color, 1.12);
    ctx.fillRect(-10, -6, 20, 3);
  } else {
    fillTrapezoid(ctx, 13, 24, -30, 2, shade(color, 0.92));
    fillTrapezoid(ctx, 11, 17, -28, -8, 'rgba(154,212,234,0.95)');
    fillTrapezoid(ctx, 7, 9, -28, -14, 'rgba(234,247,255,0.5)');
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(-22, -2, 9, 5);
    ctx.fillRect(13, -2, 9, 5);
    ctx.fillStyle = '#1a1c1e';
    ctx.fillRect(-8, 0, 16, 4);
    ctx.fillStyle = 'rgba(255,224,140,0.28)';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-36, 16);
    ctx.lineTo(-12, 16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(36, 16);
    ctx.lineTo(12, 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#11161b';
  ctx.fillRect(-22, 2, 44, 6);
  drawRoadWheel(ctx, -16, 10, 7.5, rot);
  drawRoadWheel(ctx, 16, 10, 7.5, rot);
  ctx.restore();
}

/** 원근 도로용 밴 후면. */
export function drawVanRoad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  clock: number,
  heading: RoadHeading
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 26, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  fillTrapezoid(ctx, 16, 26, heading === 'away' ? -42 : -38, 2, color);
  fillTrapezoid(ctx, 16, 22, heading === 'away' ? -42 : -38, -30, shade(color, 1.14));
  ctx.strokeStyle = shade(color, 0.45);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, heading === 'away' ? -40 : -36);
  ctx.lineTo(0, 2);
  ctx.stroke();
  if (heading === 'away') {
    ctx.fillStyle = 'rgba(126,200,232,0.28)';
    ctx.fillRect(-14, -34, 12, 18);
    ctx.fillRect(2, -34, 12, 18);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(-22, -2, 8, 5);
    ctx.fillRect(14, -2, 8, 5);
  } else {
    ctx.fillStyle = 'rgba(154,212,234,0.85)';
    fillTrapezoid(ctx, 10, 14, -36, -18, 'rgba(154,212,234,0.85)');
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(-24, 0, 9, 5);
    ctx.fillRect(15, 0, 9, 5);
  }
  ctx.fillStyle = '#11161b';
  ctx.fillRect(-24, 2, 48, 6);
  const rot = clock * 8.2;
  drawRoadWheel(ctx, -16, 11, 8, rot);
  drawRoadWheel(ctx, 16, 11, 8, rot);
  ctx.restore();
}

/** 원근 도로용 트럭 후면·전면. */
export function drawTruckRoad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  clock: number,
  heading: RoadHeading
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 30, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (heading === 'away') {
    fillTrapezoid(ctx, 14, 20, -56, -40, '#1c242c');
    ctx.fillStyle = '#f3cd6b';
    ctx.fillRect(-8, -58, 16, 6);
    ctx.fillRect(-16, -54, 6, 6);
    ctx.fillRect(10, -54, 6, 6);
    fillTrapezoid(ctx, 18, 28, -40, 2, color);
    fillTrapezoid(ctx, 18, 24, -40, -32, shade(color, 1.18));
    ctx.strokeStyle = shade(color, 0.5);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(0, 2);
    ctx.stroke();
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-16, -30 + i * 8);
      ctx.lineTo(16, -30 + i * 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(-24, -4, 10, 6);
    ctx.fillRect(14, -4, 10, 6);
  } else {
    fillTrapezoid(ctx, 16, 26, -36, 2, '#1c242c');
    fillTrapezoid(ctx, 12, 18, -34, -12, 'rgba(126,200,232,0.9)');
    fillTrapezoid(ctx, 18, 28, -12, 4, color);
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(-26, -2, 10, 6);
    ctx.fillRect(16, -2, 10, 6);
    ctx.fillStyle = 'rgba(255,224,140,0.22)';
    ctx.beginPath();
    ctx.moveTo(-26, 2);
    ctx.lineTo(-48, 22);
    ctx.lineTo(-8, 22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, 2);
    ctx.lineTo(48, 22);
    ctx.lineTo(8, 22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#11161b';
  ctx.fillRect(-26, 4, 52, 7);
  const rot = clock * 7.4;
  drawRoadWheel(ctx, -18, 13, 9, rot);
  drawRoadWheel(ctx, 18, 13, 9, rot);
  ctx.restore();
}

export function drawPlane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  angle: number,
  color: string,
  gear: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 18, 46, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c5ccd6';
  bodyPath(ctx, 'M-28 -18 L22 -6 L18 4 L-22 8 Z');
  ctx.fillStyle = shade('#c5ccd6', 0.82);
  bodyPath(ctx, 'M-28 18 L22 6 L18 -2 L-22 -6 Z');
  ctx.fillStyle = '#d8dee6';
  bodyPath(ctx, 'M-52 0 C-36 -10 -8 -12 28 -6 C48 -2 62 4 70 8 C48 14 10 16 -28 10 C-46 6 -54 4 -52 0 Z');
  ctx.fillStyle = color;
  roundPoly(ctx, -8, -5, 48, 10, 4);
  ctx.fillStyle = '#9aa3b0';
  bodyPath(ctx, 'M-52 0 C-46 -6 -40 -8 -32 -8 V8 C-42 6 -50 4 -52 0 Z');
  ctx.fillStyle = '#d8dee6';
  bodyPath(ctx, 'M52 -2 L76 -22 L76 -10 L62 6 Z');
  bodyPath(ctx, 'M52 4 L72 20 L72 10 L60 6 Z');
  ctx.fillStyle = '#c5ccd6';
  bodyPath(ctx, 'M-8 -16 L48 -4 L42 2 L-14 6 Z');
  ctx.fillStyle = shade('#c5ccd6', 0.82);
  bodyPath(ctx, 'M-8 16 L48 4 L42 -2 L-14 -6 Z');
  ctx.fillStyle = '#7ec8e8';
  ctx.beginPath();
  ctx.ellipse(-6, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(6, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(18, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(-54, -3, 8, 5);
  if (gear > 0.05) {
    ctx.globalAlpha = gear;
    ctx.fillStyle = '#2a3138';
    ctx.fillRect(-8, 8, 2.4, 12);
    ctx.fillRect(12, 8, 2.4, 12);
    ctx.fillStyle = '#1a1c1e';
    ctx.beginPath();
    ctx.arc(-7, 21, 3.2, 0, Math.PI * 2);
    ctx.arc(13, 21, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawShip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  angle: number,
  color: string,
  clock: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(6,32,40,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 22, 62, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b2430';
  bodyPath(ctx, 'M-70 6 C-50 22 -10 28 8 28 C40 28 70 22 78 8 L70 6 H-62 Z');
  ctx.fillStyle = color;
  bodyPath(ctx, 'M-62 6 H66 C72 -2 76 -10 78 -14 H-50 C-58 -6 -62 0 -62 6 Z');
  const boxes = ['#c0392b', '#f3cd6b', '#2ecc71', '#3498db', '#8e44ad', '#e67e22'];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      ctx.fillStyle = boxes[(col + row * 2) % boxes.length];
      ctx.fillRect(-48 + col * 16, -28 + row * 11, 15, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-48 + col * 16, -28 + row * 11, 15, 2);
    }
  }
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(48, -32, 14, 26);
  ctx.fillStyle = '#bdc3c7';
  ctx.fillRect(51, -42, 8, 10);
  ctx.fillStyle = '#7f8c8d';
  ctx.fillRect(53, -50, 4, 8);
  ctx.strokeStyle = 'rgba(214,243,255,0.4)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-66, 10);
  for (let i = 0; i < 8; i += 1) {
    ctx.lineTo(-50 + i * 16, 10 + Math.sin(clock * 3 + i) * 1.4);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawForklift(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  clock: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  roundPoly(ctx, -18, -14, 28, 20, 3);
  ctx.fillStyle = '#1c242c';
  ctx.fillRect(-8, -18, 12, 8);
  ctx.fillStyle = '#cfd3d7';
  ctx.fillRect(10, -6, 22, 2);
  ctx.fillRect(10, 2, 22, 2);
  drawWheel(ctx, -12, 10, 6, clock * 6);
  drawWheel(ctx, 8, 10, 6, clock * 6);
  ctx.restore();
}

export type RoadPose = { x: number; y: number; scale: number; u: number };

export function roadLayout(w: number, h: number): { horizon: number; vpX: number; nearHalf: number; farHalf: number } {
  return {
    horizon: h * 0.34,
    vpX: w * 0.5,
    nearHalf: w * 0.5,
    farHalf: w * 0.04
  };
}

export function roadPose(w: number, h: number, uRaw: number, lane: number): RoadPose {
  const { horizon, vpX, nearHalf, farHalf } = roadLayout(w, h);
  const u = clamp01(uRaw);
  const y = horizon + (h - horizon - 8) * u;
  const hw = farHalf + (nearHalf - farHalf) * u;
  return {
    x: vpX + lane * hw * 0.42,
    y,
    scale: 0.16 + 0.92 * u,
    u
  };
}

function roadEdge(
  w: number,
  h: number,
  u: number,
  side: number
): { x: number; y: number } {
  const { horizon, vpX, nearHalf, farHalf } = roadLayout(w, h);
  const y = horizon + (h - horizon) * clamp01(u);
  const hw = farHalf + (nearHalf - farHalf) * clamp01(u);
  return { x: vpX + side * hw, y };
}

function strokeRoadLine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lane: number,
  color: string,
  width: number
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i <= 18; i += 1) {
    const pose = roadPose(w, h, i / 18, lane);
    if (i === 0) ctx.moveTo(pose.x, pose.y);
    else ctx.lineTo(pose.x, pose.y);
  }
  ctx.stroke();
}

export function drawPerspectiveRoad(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h } = frame;
  const { horizon, vpX, nearHalf, farHalf } = roadLayout(w, h);
  const t = clockOf(frame);
  fillSky(ctx, w, h, horizon, 'dusk');
  drawSun(ctx, w * 0.78, horizon - 28, 16);
  drawHills(ctx, w, horizon, '#132018');
  drawCitySilhouette(ctx, w, horizon, t);
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#243028');
  ground.addColorStop(1, '#0c1410');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  ctx.beginPath();
  ctx.moveTo(vpX - farHalf, horizon + 1);
  ctx.lineTo(vpX + farHalf, horizon + 1);
  ctx.lineTo(vpX + nearHalf, h);
  ctx.lineTo(vpX - nearHalf, h);
  ctx.closePath();
  const road = ctx.createLinearGradient(0, horizon, 0, h);
  road.addColorStop(0, '#4a4e54');
  road.addColorStop(0.45, '#2a2d32');
  road.addColorStop(1, '#14161a');
  ctx.fillStyle = road;
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.moveTo(vpX - farHalf * 1.28, horizon);
  ctx.lineTo(vpX - farHalf, horizon);
  ctx.lineTo(vpX - nearHalf, h);
  ctx.lineTo(vpX - nearHalf * 1.08, h);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(vpX + farHalf, horizon);
  ctx.lineTo(vpX + farHalf * 1.28, horizon);
  ctx.lineTo(vpX + nearHalf * 1.08, h);
  ctx.lineTo(vpX + nearHalf, h);
  ctx.fill();

  strokeRoadLine(ctx, w, h, -1.02, 'rgba(232,232,234,0.78)', 2.2);
  strokeRoadLine(ctx, w, h, 1.02, 'rgba(232,232,234,0.78)', 2.2);
  strokeRoadLine(ctx, w, h, -0.08, 'rgba(240,220,140,0.85)', 1.6);
  strokeRoadLine(ctx, w, h, 0.08, 'rgba(240,220,140,0.85)', 1.6);

  const travel = (t * 1.85) % 1;
  const dashLanes = [-0.52, 0.52];
  dashLanes.forEach((lane) => {
    for (let i = 0; i < 18; i += 1) {
      const u = ((i / 18) + travel) % 1;
      const a = roadPose(w, h, u, lane);
      const b = roadPose(w, h, Math.min(1, u + 0.028), lane);
      ctx.strokeStyle = `rgba(236,236,238,${0.18 + 0.7 * u})`;
      ctx.lineWidth = 1.2 + 2.4 * u;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  });

  for (let i = 0; i < 14; i += 1) {
    const u = ((i / 14) + travel * 0.5) % 1;
    const left = roadEdge(w, h, u, -1);
    const right = roadEdge(w, h, u, 1);
    ctx.fillStyle = i % 2 ? '#fff7d6' : '#f3cd6b';
    ctx.beginPath();
    ctx.arc(left.x, left.y, 1.2 + 2.2 * u, 0, Math.PI * 2);
    ctx.arc(right.x, right.y, 1.2 + 2.2 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawLoadingDock(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, color, workLocal: t } = frame;
  const x = w * 0.78;
  const y = h * 0.08;
  const bw = w * 0.2;
  const bh = h * 0.26;
  ctx.fillStyle = '#1a2228';
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x + bw * 0.22, y);
  ctx.lineTo(x + bw, y + 8);
  ctx.lineTo(x + bw, y + bh);
  ctx.lineTo(x, y + bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 0.5);
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x + bw * 0.22, y);
  ctx.lineTo(x + bw, y + 8);
  ctx.lineTo(x + bw * 0.78, y + 18);
  ctx.closePath();
  ctx.fill();
  const open = 10 + t * 28;
  ctx.fillStyle = '#0b1014';
  ctx.fillRect(x + 14, y + 28, 36, open);
  ctx.fillStyle = 'rgba(243,205,107,0.22)';
  ctx.fillRect(x + 14, y + 28, 36, 6);
}

export function drawOceanWorld(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h } = frame;
  const horizon = h * 0.4;
  const t = clockOf(frame);
  fillSky(ctx, w, h, horizon, 'ocean');
  drawSun(ctx, w * 0.8, horizon - 22, 14);
  drawHills(ctx, w, horizon, 'rgba(18,40,36,0.85)');
  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, '#1a5a6e');
  sea.addColorStop(0.45, '#0d3a48');
  sea.addColorStop(1, '#062028');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, h - horizon);

  const bounce = ctx.createLinearGradient(0, horizon, 0, horizon + 40);
  bounce.addColorStop(0, 'rgba(243,205,107,0.28)');
  bounce.addColorStop(1, 'rgba(243,205,107,0)');
  ctx.fillStyle = bounce;
  ctx.fillRect(w * 0.72, horizon, w * 0.16, 36);

  ctx.strokeStyle = 'rgba(214,243,255,0.22)';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 10; i += 1) {
    const y = horizon + 8 + i * ((h - horizon) / 11);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      ctx.lineTo(x, y + Math.sin(x / 24 + t * 2.4 + i * 0.55) * (2.4 + i * 0.85));
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(214,243,255,0.08)';
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 0.11 + t * 0.08) % 1) * w;
    const y = horizon + 18 + ((i * 37) % (h - horizon - 24));
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + (i % 4), 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(8,20,24,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(w, horizon);
  ctx.stroke();
}

export function drawRunwayWorld(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h } = frame;
  const horizon = h * 0.32;
  const t = clockOf(frame);
  fillSky(ctx, w, h, horizon, 'runway');
  drawHills(ctx, w, horizon, '#101820');
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#1a2a22');
  ground.addColorStop(1, '#0a1210');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  const vpX = w * 0.5;
  const far = w * 0.05;
  const near = w * 0.46;
  ctx.beginPath();
  ctx.moveTo(vpX - far, horizon + 2);
  ctx.lineTo(vpX + far, horizon + 2);
  ctx.lineTo(vpX + near, h);
  ctx.lineTo(vpX - near, h);
  ctx.closePath();
  ctx.fillStyle = '#2a2d32';
  ctx.fill();

  ctx.strokeStyle = 'rgba(232,232,234,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(vpX - far * 0.7, horizon + 4);
  ctx.lineTo(vpX - near * 0.86, h);
  ctx.moveTo(vpX + far * 0.7, horizon + 4);
  ctx.lineTo(vpX + near * 0.86, h);
  ctx.stroke();

  const travel = (t * 1.4) % 1;
  for (let i = 0; i < 14; i += 1) {
    const u = ((i / 14) + travel) % 1;
    const y = horizon + (h - horizon) * u;
    const dashW = 2 + 8 * u;
    const dashH = 4 + 18 * u;
    ctx.fillStyle = `rgba(243,205,107,${0.25 + 0.6 * u})`;
    ctx.fillRect(vpX - dashW / 2, y, dashW, dashH);
  }

  for (let i = 0; i < 10; i += 1) {
    const u = 0.2 + i * 0.08;
    const left = roadPose(w, h, u, -1.05);
    const right = roadPose(w, h, u, 1.05);
    ctx.fillStyle = i % 2 ? '#fff' : '#f3cd6b';
    ctx.beginPath();
    ctx.arc(left.x, left.y, 1.6 + 2.4 * u, 0, Math.PI * 2);
    ctx.arc(right.x, right.y, 1.6 + 2.4 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawCruiseSky(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h } = frame;
  const t = clockOf(frame);
  fillSky(ctx, w, h, h * 0.72, 'runway');
  const earth = ctx.createLinearGradient(0, h * 0.62, 0, h);
  earth.addColorStop(0, 'rgba(18, 48, 58, 0.0)');
  earth.addColorStop(0.28, '#16384a');
  earth.addColorStop(1, '#0b1c24');
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  ctx.quadraticCurveTo(w * 0.5, h * 0.58, w, h * 0.72);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 6; i += 1) {
    const x = ((i * 0.23 + t * 0.04) % 1.2) * w - w * 0.1;
    const y = h * (0.16 + (i % 3) * 0.1);
    ctx.fillStyle = 'rgba(220,228,236,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y, 52 + i * 10, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 28, y + 4, 38, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawWarehouseWorld(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, color } = frame;
  const t = clockOf(frame);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#101820');
  g.addColorStop(1, '#070c10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#151c22';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  for (let i = 0; i < 7; i += 1) {
    const x = w * (0.08 + i * 0.13);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, h * 0.12, 8, h * 0.6);
    for (let r = 0; r < 4; r += 1) {
      const y = h * (0.18 + r * 0.13);
      const lit = ((i + r + Math.floor(t * 5)) % 3) === 0;
      ctx.fillStyle = lit ? hexAlpha(color, 0.55) : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - 18, y, 44, 22);
      ctx.fillStyle = lit ? '#f3cd6b' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - 14, y + 4, 12, 8);
      ctx.fillRect(x + 2, y + 4, 12, 8);
    }
  }
  ctx.fillStyle = 'rgba(243,205,107,0.08)';
  ctx.fillRect(0, h * 0.08, w, 6);
}

export function drawCatalogWorld(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, color } = frame;
  const t = clockOf(frame);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#16120c');
  g.addColorStop(1, '#0a0c10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a2e34';
  ctx.beginPath();
  ctx.moveTo(w * 0.04, h * 0.78);
  ctx.lineTo(w * 0.96, h * 0.7);
  ctx.lineTo(w * 0.96, h * 0.86);
  ctx.lineTo(w * 0.04, h * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(243,205,107,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.8);
  ctx.lineTo(w * 0.94, h * 0.72);
  ctx.stroke();
  for (let i = 0; i < 5; i += 1) {
    const u = ((i / 5) + t * 0.08) % 1;
    const x = w * (0.1 + u * 0.72);
    const y = h * (0.34 + Math.sin(t + i) * 0.02);
    const s = 0.7 + u * 0.45;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = i % 2 ? color : '#1c242c';
    roundPoly(ctx, -28, -40, 56, 72, 6);
    ctx.fillStyle = '#f3cd6b';
    ctx.fillRect(-18, -28, 36, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-18, -12, 36, 28);
    ctx.restore();
  }
}

export function drawGlobeWorld(ctx: CanvasRenderingContext2D, frame: MotionFrame): void {
  const { width: w, height: h, color } = frame;
  const t = clockOf(frame);
  fillSky(ctx, w, h, h, 'night');
  const cx = w * 0.5;
  const cy = h * 0.56;
  const r = Math.min(w, h) * 0.32;
  const globe = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  globe.addColorStop(0, '#1b5c68');
  globe.addColorStop(1, '#062028');
  ctx.fillStyle = globe;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = hexAlpha(color, 0.55);
  ctx.lineWidth = 1.3;
  const coasts = [
    'M118 86l28-22 36 6 22 24-8 28-34 16-30-8-18-22z',
    'M214 64l52-16 48 10 36 28-6 36-28 22-54 8-44-18-16-32z',
    'M352 78l70-18 64 8 48 26-10 42-36 24-72 10-58-14-18-34z',
    'M548 70l86 8 48 22 18 34-28 28-62 12-70-10-22-30z',
    'M236 210l46 4 28 22 8 36-24 28-40 6-32-16-10-34z',
    'M538 214l64 2 36 18 10 34-22 26-48 8-46-14-12-28z'
  ];
  ctx.translate(cx - r, cy - r * 0.55);
  ctx.scale((r * 2) / 800, (r * 1.4) / 400);
  coasts.forEach((d) => ctx.stroke(new Path2D(d)));
  ctx.restore();
  ctx.strokeStyle = 'rgba(128,239,193,0.25)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const ang = t * 0.7;
  const sx = cx + Math.cos(ang) * r * 1.18;
  const sy = cy + Math.sin(ang) * r * 0.42;
  ctx.strokeStyle = 'rgba(243,205,107,0.45)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.2);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  ctx.fillStyle = '#d8dee6';
  ctx.beginPath();
  ctx.rect(sx - 8, sy - 3, 16, 6);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(sx - 18, sy - 2, 10, 4);
  ctx.fillRect(sx + 8, sy - 2, 10, 4);
}

export function drawIdBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bw: number,
  bh: number,
  color: string,
  bandY: number,
  band: string,
  tilt: number
): void {
  ctx.save();
  ctx.translate(x + bw / 2, y + bh / 2);
  ctx.rotate(tilt);
  ctx.translate(-bw / 2, -bh / 2);
  roundPoly(ctx, 0, 0, bw, bh, Math.max(6, bw * 0.06), '#243444');
  ctx.strokeStyle = 'rgba(243,205,107,0.7)';
  ctx.lineWidth = Math.max(1.5, bw * 0.012);
  ctx.stroke();
  ctx.fillStyle = band;
  ctx.fillRect(0, Math.max(0, Math.min(bh - bh * 0.12, bandY)), bw, bh * 0.12);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, bw, Math.max(6, bh * 0.08));
  ctx.fillStyle = 'rgba(128,239,193,0.9)';
  ctx.beginPath();
  ctx.arc(bw * 0.22, bh * 0.42, Math.max(7, bw * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(243,205,107,0.9)';
  ctx.fillRect(bw * 0.42, bh * 0.34, bw * 0.42, Math.max(4, bh * 0.06));
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(bw * 0.42, bh * 0.46, bw * 0.36, Math.max(3, bh * 0.04));
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(bw * 0.42, bh * 0.56, bw * 0.28, Math.max(3, bh * 0.03));
  ctx.restore();
}

export function drawPhoneShell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pw: number,
  ph: number
): { slotX: number; slotY: number; cell: number } {
  roundPoly(ctx, x, y, pw, ph, 18, '#101820');
  roundPoly(ctx, x + 8, y + 16, pw - 16, ph - 32, 10, '#18222c');
  const cols = 3;
  const rows = 4;
  const cell = Math.min((pw - 28) / cols, (ph - 70) / rows);
  let slot = { x: x + 14, y: y + 36 };
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const ix = x + 14 + col * (cell + 6);
      const iy = y + 36 + row * (cell + 8);
      if (col === 1 && row === 1) slot = { x: ix, y: iy };
      else roundPoly(ctx, ix, iy, cell, cell, 8, 'rgba(255,255,255,0.08)');
    }
  }
  return { slotX: slot.x, slotY: slot.y, cell };
}

export function drawHeadlightBeam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(0, 0, 80 * scale, 0);
  g.addColorStop(0, 'rgba(255,224,140,0.35)');
  g.addColorStop(1, 'rgba(255,224,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -4 * scale);
  ctx.lineTo(90 * scale, -22 * scale);
  ctx.lineTo(90 * scale, 22 * scale);
  ctx.lineTo(0, 4 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function hexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function shade(hex: string, factor: number): string {
  const { r, g, b } = rgb(hex);
  return `rgb(${clampByte(r * factor)}, ${clampByte(g * factor)}, ${clampByte(b * factor)})`;
}

export function mixHex(a: string, b: string, t: number): string {
  const left = rgb(a);
  const right = rgb(b);
  const u = clamp01(t);
  return `rgb(${Math.round(left.r + (right.r - left.r) * u)}, ${Math.round(left.g + (right.g - left.g) * u)}, ${Math.round(left.b + (right.b - left.b) * u)})`;
}

export function roundPoly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  } else {
    ctx.fill();
  }
}

function rgb(hex: string): { r: number; g: number; b: number } {
  const raw = String(hex || '#80efc1').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0
  };
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

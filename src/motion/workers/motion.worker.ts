/** 경로 파티클을 워커에서 계산하고, 가능하면 OffscreenCanvas로 버퍼를 그린다. */

type SimulateRequest = {
  type: 'simulate';
  width: number;
  height: number;
  progress: number;
  seed: number;
  count: number;
  profile: string;
  phase: string;
  workCut?: string | null;
  workLocal?: number;
};

function hash(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt, 2246822519)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed: number, salt: number): number {
  return hash(seed, salt) / 4294967295;
}

function simulatePackets(request: SimulateRequest) {
  const { width, height, progress, seed, count, profile, phase } = request;
  const workCut = request.workCut || '';
  const workLocal = Number.isFinite(request.workLocal) ? Number(request.workLocal) : 0;
  const packets = [];
  for (let index = 0; index < count; index += 1) {
    const offset = (unit(seed, index + 3) + progress * (0.8 + unit(seed, index + 9))) % 1;
    const lane = unit(seed, index + 17);
    let x = width * offset;
    let y = height * (0.28 + lane * 0.48);
    if (profile === 'road_logistics') {
      const u = offset;
      y = height * (0.36 + u * 0.58);
      x = width * (0.5 + (lane - 0.5) * (0.08 + u * 0.72));
    } else if (profile === 'ocean_vessel') {
      y = height * (0.46 + lane * 0.28) + Math.sin(offset * 8 + index) * 6;
    } else if (profile === 'air_cargo') {
      y = height * (0.28 + lane * 0.22) - Math.sin(offset * Math.PI) * 36;
    } else if (profile === 'warehouse_edge') {
      x = width * (0.14 + (index % 8) * 0.1);
      y = height * (0.3 + Math.floor(index / 8) * 0.12);
    } else if (profile === 'commerce_catalog') {
      x = width * (0.16 + (index % 5) * 0.15);
      y = height * (0.38 + ((index + Math.floor(progress * 10)) % 3) * 0.08);
    } else if (profile === 'satellite_network') {
      const angle = offset * Math.PI * 2;
      x = width * 0.5 + Math.cos(angle) * width * 0.28;
      y = height * 0.48 + Math.sin(angle) * height * 0.22;
    }

    let alpha = phase === 'sync' ? 0.9 : 0.35 + unit(seed, index + 27) * 0.45;
    let color = phase === 'sync' ? '#f3cd6b' : '#80efc1';
    if (workCut === 'lock') {
      const tx = width * 0.34;
      const ty = height * 0.6;
      x += (tx - x) * workLocal;
      y += (ty - y) * workLocal;
      color = '#f3cd6b';
      alpha = 0.45 + workLocal * 0.45;
    } else if (workCut === 'submit') {
      color = '#f3cd6b';
      alpha = 0.4 + workLocal * 0.4;
    } else if (workCut === 'approve') {
      const tx = width * 0.5;
      const ty = height * 0.78;
      x += (tx - x) * workLocal;
      y += (ty - y) * workLocal;
      color = index % 2 ? '#f3cd6b' : '#80efc1';
      alpha = 0.5 + workLocal * 0.4;
    } else if (workCut === 'pwa_home') {
      const tx = width * 0.7;
      const ty = height * 0.42;
      x += (tx - x) * workLocal;
      y += (ty - y) * workLocal;
      color = '#f3cd6b';
    } else if (workCut === 'demote') {
      y += workLocal * height * 0.14;
      color = '#8a9098';
      alpha = 0.5 - workLocal * 0.2;
    }

    packets.push({
      x,
      y,
      size: 2 + unit(seed, index + 21) * 3,
      alpha,
      color
    });
  }
  return packets;
}

self.onmessage = (event: MessageEvent<SimulateRequest>) => {
  const data = event.data;
  if (!data || data.type !== 'simulate') return;

  const packets = simulatePackets(data);
  let bitmap: ImageBitmap | null = null;

  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(Math.max(1, data.width), Math.max(1, data.height));
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, data.width, data.height);
      packets.forEach((packet) => {
        ctx.globalAlpha = packet.alpha;
        ctx.fillStyle = packet.color;
        ctx.beginPath();
        ctx.arc(packet.x, packet.y, packet.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      bitmap = offscreen.transferToImageBitmap();
    }
  }

  if (bitmap) {
    self.postMessage({ packets, bitmap }, [bitmap]);
    return;
  }
  self.postMessage({ packets, bitmap: null });
};

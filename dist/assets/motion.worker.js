/* 경로 파티클 계산 + OffscreenCanvas 버퍼 */
function hash(seed, salt) {
  var value = (seed ^ Math.imul(salt, 2246822519)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, salt) {
  return hash(seed, salt) / 4294967295;
}

function simulatePackets(request) {
  var width = request.width;
  var height = request.height;
  var progress = request.progress;
  var seed = request.seed;
  var count = request.count;
  var profile = request.profile;
  var phase = request.phase;
  var packets = [];
  for (var index = 0; index < count; index += 1) {
    var offset = (unit(seed, index + 3) + progress * (0.8 + unit(seed, index + 9))) % 1;
    var lane = unit(seed, index + 17);
    var x = width * offset;
    var y = height * (0.28 + lane * 0.48);
    if (profile === 'ocean_vessel') {
      y = height * (0.4 + lane * 0.28) + Math.sin(offset * 8 + index) * 8;
    } else if (profile === 'air_cargo') {
      y = height * (0.22 + lane * 0.36) - Math.sin(offset * Math.PI) * 40;
    } else if (profile === 'warehouse_edge') {
      x = width * (0.14 + (index % 8) * 0.1);
      y = height * (0.3 + Math.floor(index / 8) * 0.12);
    } else if (profile === 'commerce_catalog') {
      x = width * (0.16 + (index % 5) * 0.15);
      y = height * (0.38 + ((index + Math.floor(progress * 10)) % 3) * 0.08);
    } else if (profile === 'satellite_network') {
      var angle = offset * Math.PI * 2;
      x = width * 0.5 + Math.cos(angle) * width * 0.28;
      y = height * 0.48 + Math.sin(angle) * height * 0.22;
    }
    packets.push({
      x: x,
      y: y,
      size: 2 + unit(seed, index + 21) * 3,
      alpha: phase === 'sync' ? 0.9 : 0.35 + unit(seed, index + 27) * 0.45,
      color: phase === 'sync' ? '#f3cd6b' : '#80efc1'
    });
  }
  return packets;
}

self.onmessage = function (event) {
  var data = event.data;
  if (!data || data.type !== 'simulate') return;
  var packets = simulatePackets(data);
  var bitmap = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    var offscreen = new OffscreenCanvas(Math.max(1, data.width), Math.max(1, data.height));
    var ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, data.width, data.height);
      packets.forEach(function (packet) {
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
  if (bitmap) self.postMessage({ packets: packets, bitmap: bitmap }, [bitmap]);
  else self.postMessage({ packets: packets, bitmap: null });
};

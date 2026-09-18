// 접속 주소(IP) 헤더 정리. Edge http.ts 와 같은 규칙을 쓴다.

export const CLIENT_IP_HEADERS = Object.freeze([
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'x-client-ip',
  'fly-client-ip',
  'x-forwarded-for'
]);

export function sanitizeClientIp(raw) {
  let value = String(raw ?? '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'unknown' || lower === 'undefined' || lower === 'null' || lower === '-') return null;
  if (value.includes(',')) value = value.split(',')[0].trim();
  value = value.replace(/^"+|"+$/g, '').trim();
  const bracket = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) value = bracket[1];
  const zone = value.indexOf('%');
  if (zone > 0) value = value.slice(0, zone);
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.replace(/:\d+$/, '');
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) value = mapped[1];
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split('.').map((part) => Number(part));
    if (parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return value;
    return null;
  }
  if (value.includes(':') && /^[0-9a-f:]+$/i.test(value)) return value.toLowerCase();
  return null;
}

export function isPrivateClientIp(ip) {
  const value = String(ip || '').toLowerCase();
  if (!value) return true;
  if (value === '127.0.0.1' || value === '0.0.0.0' || value === '::1' || value === '::') return true;
  if (value.startsWith('10.')) return true;
  if (value.startsWith('192.168.')) return true;
  if (value.startsWith('169.254.')) return true;
  const lan = value.match(/^172\.(\d+)\./);
  if (lan) {
    const octet = Number(lan[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  return false;
}

export function pickClientIp(headerMap = {}, remoteHostname = '') {
  const candidates = [];
  const seen = new Set();
  const push = (raw) => {
    const ip = sanitizeClientIp(raw);
    if (!ip || seen.has(ip)) return;
    seen.add(ip);
    candidates.push(ip);
  };
  for (const key of CLIENT_IP_HEADERS) {
    const value = headerMap?.[key] ?? headerMap?.[key.toLowerCase()];
    if (!value) continue;
    String(value).split(',').forEach(push);
  }
  push(remoteHostname);
  return candidates.find((ip) => !isPrivateClientIp(ip)) || candidates[0] || null;
}

// 운영자 목록용 개인정보 마스킹. 상세 전체 열람은 최고 운영자만.

export function maskEmail(value) {
  const email = String(value || '').trim();
  if (!email) return '';
  if (email.includes('*')) return email;
  const at = email.indexOf('@');
  if (at < 1 || at === email.length - 1) return email ? '***' : '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}***@${domain}`;
}

export function maskPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('*')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 11) {
    const local = digits.startsWith('82') ? `0${digits.slice(2)}` : digits;
    if (local.length === 11) return `${local.slice(0, 3)}-****-${local.slice(-4)}`;
  }
  if (digits.length >= 8) return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  return '****';
}

export function maskPersonName(value) {
  const name = String(value || '').trim();
  if (!name) return '';
  if (name.includes('*')) return name;
  const chars = [...name];
  if (chars.length === 1) return '*';
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

export function maskBirthDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8) return `${digits.slice(0, 4)}-**-**`;
  if (digits.length === 6) return `${digits.slice(0, 2)}****`;
  return '****';
}

export function maskIp(value) {
  const ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.includes('*')) return ip;
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    if (parts.length < 2) return '****';
    return `${parts[0]}:****:****`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return '****';
  return `${parts[0]}.***.***.${parts[3]}`;
}

export function canRevealMemberPii(roles) {
  const list = Array.isArray(roles) ? roles : [roles];
  return list.includes('super_admin');
}

export function maskMemberListPii(row) {
  const item = row && typeof row === 'object' ? { ...row } : {};
  item.email = maskEmail(item.email);
  item.phone = maskPhone(item.phone || item.phone_e164);
  item.phone_e164 = item.phone;
  item.legal_name = maskPersonName(item.legal_name);
  item.last_login_ip = maskIp(item.last_login_ip);
  item.birth_date = maskBirthDate(item.birth_date);
  item.pii_masked = true;
  return item;
}

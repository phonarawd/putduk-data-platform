import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const index = trimmed.indexOf('=');
  if (index <= 0) continue;
  env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
}

const url = env.SUPABASE_URL;
const anon = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const email = env.PUTDUK_ADMIN_EMAIL;
const password = env.PUTDUK_ADMIN_PASSWORD;
if (!url || !anon || !email || !password) {
  console.error('missing-env');
  process.exit(1);
}

const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const auth = await authRes.json();
if (!authRes.ok || !auth.access_token) {
  console.error('admin-login-failed', authRes.status);
  process.exit(1);
}

const settings = { bot_enabled: true, crowd_min: 8, crowd_max: 24, burn_per_minute: 2 };
const saveRes = await fetch(`${url}/functions/v1/admin-control`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${auth.access_token}`,
    apikey: anon,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ action: 'save_motion_settings', ...settings })
});
const saved = await saveRes.json();
console.log(JSON.stringify({
  save_status: saveRes.status,
  stored: saved.settings?.stored || saved.stored,
  crowd_min: saved.settings?.crowd_min,
  crowd_max: saved.settings?.crowd_max,
  burn: saved.settings?.burn_per_minute,
  bot: saved.settings?.bot_enabled,
  error: saved.error || null
}));

const getRes = await fetch(`${url}/functions/v1/admin-control`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${auth.access_token}`,
    apikey: anon,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ action: 'get_motion_settings' })
});
const got = await getRes.json();
console.log(JSON.stringify({
  get_status: getRes.status,
  stored: got.settings?.stored,
  crowd_min: got.settings?.crowd_min,
  crowd_max: got.settings?.crowd_max,
  burn: got.settings?.burn_per_minute
}));

const pulseUrl = new URL('/rest/v1/crew_pulse', url);
pulseUrl.searchParams.set('id', 'eq.1');
pulseUrl.searchParams.set('select', 'live,crowd_min,crowd_max,burn_per_minute');
const pulseRes = await fetch(pulseUrl, {
  headers: { apikey: anon, Authorization: `Bearer ${anon}` }
});
const pulse = await pulseRes.json();
console.log(JSON.stringify({ pulse_status: pulseRes.status, pulse }));

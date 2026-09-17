import { appendFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const envPath = new URL('../../.env', import.meta.url);
const env = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const index = trimmed.indexOf('=');
  if (index <= 0) continue;
  env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
}

const url = env.SUPABASE_URL || env.VITE_PUTDUK_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('missing-env');
  process.exit(1);
}

const origins = env.PUTDUK_ALLOWED_ORIGINS || '';
console.log(JSON.stringify({
  has4173: origins.includes('4173'),
  has127: origins.includes('127.0.0.1'),
  hasTrialEmail: Boolean(env.PUTDUK_TRIAL_EMAIL)
}));

const email = env.PUTDUK_TRIAL_EMAIL || 'crew.trial@putduk.local';
const password = env.PUTDUK_TRIAL_PASSWORD || (`Pd${randomBytes(9).toString('base64url')}9!`);
const pin = env.PUTDUK_TRIAL_PIN || '147258';

const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
  'Content-Type': 'application/json'
};

const listRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers });
const listJson = await listRes.json();
const users = Array.isArray(listJson?.users) ? listJson.users : [];
let user = users.find((item) => String(item.email || '').toLowerCase() === email.toLowerCase());

if (!user) {
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: '체험 크루', legal_name: '체험 크루' }
    })
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error('create-failed', createRes.status);
    process.exit(1);
  }
  user = created;
  if (!env.PUTDUK_TRIAL_EMAIL) {
    appendFileSync(envPath, `\nPUTDUK_TRIAL_EMAIL=${email}\nPUTDUK_TRIAL_PASSWORD=${password}\nPUTDUK_TRIAL_PIN=${pin}\n`);
  }
  console.log('trial-user-created');
} else {
  const updateRes = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true })
  });
  if (!updateRes.ok) {
    console.error('update-failed', updateRes.status);
    process.exit(1);
  }
  if (!env.PUTDUK_TRIAL_EMAIL) {
    appendFileSync(envPath, `\nPUTDUK_TRIAL_EMAIL=${email}\nPUTDUK_TRIAL_PASSWORD=${password}\nPUTDUK_TRIAL_PIN=${pin}\n`);
  }
  console.log('trial-user-updated');
}

console.log(JSON.stringify({
  idPrefix: String(user.id || '').slice(0, 8),
  confirmed: Boolean(user.email_confirmed_at || true)
}));

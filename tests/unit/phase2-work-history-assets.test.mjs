import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const photos = ['alibaba','cj','dhl','ebay','fedex','gxo','maersk','ups'];

test('phase2 partner photos are copied byte-for-byte into dist', () => {
  for (const slug of photos) {
    const src = fs.readFileSync(path.join(root, `assets/brand-logos/${slug}-photo.png`));
    const dist = fs.readFileSync(path.join(root, `dist/assets/brand-logos/${slug}-photo.png`));
    assert.deepEqual(dist, src, `${slug} photo must match source blob`);
  }
});

test('member task detail enforces run ownership and does not select correct choice', () => {
  const source = read('supabase/functions/member-task-detail/index.ts');
  assert.match(source, /\.eq\("id", runId\)/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /isOwnStoragePath\(userId, raw\)/);
  assert.match(source, /createSignedUrl\(raw, SIGNED_URL_SECONDS\)/);
  assert.doesNotMatch(source, /select\([^\n]*correct_choice/i);
  assert.match(source, /BLOCKED_KEYS/);
});

test('admin private asset endpoint requires admin role and validates member-owned path', () => {
  const source = read('supabase/functions/admin-work-asset/index.ts');
  assert.match(source, /putduk_admin_has_role/);
  assert.match(source, /isOwnStoragePath\(ownerId, path\)/);
  assert.match(source, /createSignedUrl\(path, SIGNED_URL_SECONDS\)/);
});

test('member history runtime exposes accessible click action and task detail call', () => {
  const source = read('dist/assets/phase2-work-history.js');
  assert.match(source, /open-work-history/);
  assert.match(source, /action: 'task_detail'/);
  assert.match(source, /data-run-id|dataset\.runId/);
  assert.match(source, /role', 'button'/);
  assert.match(source, /phase2-image-fallback/);
  new Function(source);
});

test('admin asset runtime normalizes brand photos and provides broken-image fallback', () => {
  const source = read('dist/admin/phase2-work-assets.js');
  assert.match(source, /brand-logos\//);
  assert.match(source, /admin-work-asset/);
  assert.match(source, /phase2-admin-image-fallback/);
  new Function(source);
});

test('html and supabase config wire phase2 modules without production deployment', () => {
  const member = read('dist/index.html');
  const admin = read('dist/admin/index.html');
  const config = read('supabase/config.toml');
  assert.match(member, /phase2-work-history\.css/);
  assert.match(member, /phase2-work-history\.js/);
  assert.match(admin, /phase2-work-assets\.js/);
  assert.match(config, /\[functions\.member-task-detail\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(config, /\[functions\.admin-work-asset\][\s\S]*?verify_jwt\s*=\s*true/);
});

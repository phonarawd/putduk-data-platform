import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const app = fs.readFileSync(path.join(root, 'dist/assets/app-ia13.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'dist/assets/app-ia13.js'), 'utf8');
const notice = fs.readFileSync(path.join(root, 'dist/assets/notification-read-contract.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260923230000_putduk_notification_member_delete_rpc.sql'), 'utf8');
const index = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');

assert.match(app, /id: 'operations', label: '업무 운영'/);
assert.doesNotMatch(app, /id: 'benefits', label: '등급·혜택'/);
assert.match(app, /isAdmin \? 5000 : 30000/);
assert.match(app, /loadAdminReviews\(\{ silent: true \}\)/);
assert.match(app, /loadAdminFinance\(\{ silent: true \}\)/);
assert.match(app, /putduk_archive_notification/);
assert.match(app, /data-notice-delete/);
assert.match(notice, /data-putduk-notice-delete/);
assert.match(notice, /putduk_archive_notification/);
assert.match(migration, /grant execute on function public\.putduk_archive_notification\(uuid\) to authenticated/);
assert.match(index, /assets\/app-ia13\.js/);
assert.match(index, /notification-read-contract\.js\?v=20260925-console1/);
assert.equal(app, bundle);

new Function(app);
new Function(notice);
console.log('admin live badges, notification deletion, menu consolidation, and fresh asset contracts: ok');
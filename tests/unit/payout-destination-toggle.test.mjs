import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

test('운영자 입금 안내 목록에서 회원 표시를 바로 켜고 끌 수 있다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const listSql = await readRepo('supabase', 'migrations', '20260918080000_putduk_deposit_pin_gate.sql');
  const toggleSql = await readRepo('supabase', 'migrations', '20260918073257_putduk_payout_destination_visibility.sql');
  assert.match(adminJs, /data-action="toggle-payout-destination"/);
  assert.match(adminJs, /aria-label="\$\{label\}"/);
  assert.match(adminJs, /회원에게 숨기기/);
  assert.match(adminJs, /회원에게 보이기/);
  assert.match(adminJs, /숨김 처리했어요\. 입금 안내에서 바로 빠져요/);
  assert.match(adminJs, /set_payout_destination_enabled/);
  assert.match(adminOps, /putduk_admin_payout_destination_set_enabled/);
  assert.match(toggleSql, /putduk_admin_payout_destination_set_enabled/);
  assert.match(listSql, /where d\.enabled = true/);
  const fullSql = await readRepo('supabase', 'migrations', '20260918090000_putduk_deposit_pin_rpc.sql');
  assert.match(fullSql, /where d\.enabled = true/);
});

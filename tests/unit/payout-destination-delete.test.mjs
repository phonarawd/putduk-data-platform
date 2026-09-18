import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('운영자 입금 안내는 숨김과 별개로 실제로 지울 수 있다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const deleteSql = await readRepo('supabase', 'migrations', '20260918075042_putduk_payout_destination_delete.sql');
  const listSql = await readRepo('supabase', 'migrations', '20260918080000_putduk_deposit_pin_gate.sql');
  const schemaSql = await readRepo('supabase', 'migrations', '20260916233653_putduk_ops_finance_schema.sql');
  const pinSql = await readRepo('supabase', 'migrations', '20260918090000_putduk_deposit_pin_rpc.sql');

  assert.match(adminJs, /data-action="delete-payout-destination"/);
  assert.match(adminJs, /aria-label="입금 안내 삭제"/);
  assert.match(adminJs, />삭제<\/button>/);
  assert.match(adminJs, /이 입금 안내를 지울까요\? 회원 화면에서 바로 사라져요 🗑️/);
  assert.match(adminJs, /data-action="confirm-payout-destination-delete"/);
  assert.match(adminJs, />확인<\/button>/);
  assert.match(adminJs, />취소<\/button>/);
  assert.match(adminJs, /입금 안내를 지웠어요\. 회원 화면에서 바로 빠져요 🗑️/);
  assert.match(adminJs, /delete_payout_destination/);
  assert.match(adminJs, /회원에게 숨기기/);
  assert.equal(adminJs.includes('Failed to delete'), false);
  assert.equal(adminJs.includes('invalid payload'), false);

  assert.match(adminOps, /putduk_admin_payout_destination_delete/);
  assert.match(adminOps, /action === "delete_payout_destination"/);
  assert.match(adminOps, /입금 안내 삭제/);
  const deleteStart = adminOps.indexOf('export async function deletePayoutDestination');
  const deleteEnd = adminOps.indexOf('\nexport async function', deleteStart + 1);
  const deleteFn = adminOps.slice(deleteStart, deleteEnd > deleteStart ? deleteEnd : undefined);
  assert.match(deleteFn, /appendAudit/);
  assert.equal(deleteFn.includes('account_number'), false);
  assert.equal(deleteFn.includes('usdt_address'), false);
  assert.equal(deleteFn.includes('encrypted_value'), false);

  assert.match(deleteSql, /putduk_admin_payout_destination_delete/);
  assert.match(deleteSql, /revoke all on function public\.putduk_admin_payout_destination_delete\(uuid, uuid, text\)/);
  assert.match(deleteSql, /from public, anon, authenticated/);
  assert.match(deleteSql, /grant execute on function public\.putduk_admin_payout_destination_delete\(uuid, uuid, text\)/);
  assert.match(deleteSql, /to service_role/);
  assert.match(deleteSql, /delete from private\.payout_destinations where id = p_destination_id/);
  assert.match(deleteSql, /catalog_version/);
  assert.match(deleteSql, /deposit_info_reveal_tokens/);
  assert.equal(deleteSql.includes('account_number'), false);
  assert.equal(deleteSql.includes('usdt_address'), false);

  assert.match(schemaSql, /destination_id uuid references private\.payout_destinations\(id\) on delete set null/);
  assert.match(listSql, /where d\.enabled = true/);
  assert.match(pinSql, /where d\.enabled = true/);
});

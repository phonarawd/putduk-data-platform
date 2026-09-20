import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../../dist/assets/member-experience-p4.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../dist/assets/member-experience-p4.css', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../../supabase/functions/member-experience/index.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../supabase/migrations/20260921133000_putduk_member_experience_snapshot.sql', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../../dist/assets/trial-flow-guard.js', import.meta.url), 'utf8');
const ci = fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('member snapshot uses real daily runs and actual capacity', () => {
  assert.match(migration, /from public\.task_runs tr/i);
  assert.match(migration, /created_at >= v_day_start/i);
  assert.match(migration, /status <> 'cancelled'/i);
  assert.match(migration, /status = 'approved'/i);
  assert.match(migration, /daily_cap/i);
  assert.match(migration, /daily_capacity/i);
  assert.match(migration, /remaining_slots/i);
});

test('verified budget is member-visible only after operator verification and publication', () => {
  assert.match(migration, /private\.partner_budget_allocations/i);
  assert.match(migration, /private\.partner_funding_pools/i);
  assert.match(migration, /verification_status = 'verified'/i);
  assert.match(migration, /public_visible = true/i);
  assert.match(migration, /sum\(a\.remaining_amount\)/i);
  assert.doesNotMatch(ui, /total_budget|secured_amount|operator_note/);
});

test('MAX BALANCE FIT sorts instead of hiding published work by amount', () => {
  assert.match(ui, /function balanceFitComparator/);
  assert.match(ui, /affordA && stakeA !== stakeB/);
  assert.match(ui, /!affordA && stakeA !== stakeB/);
  assert.match(ui, /for \(const item of sortedEligibleNodes\(\)\)/);
  assert.match(migration, /when coalesce\(n\.requires_assign, false\) then asg\.node_id is not null/i);
});

test('card-level synthetic slot hook is removed without modifying protected FOMO storage', () => {
  assert.match(ui, /removeAttribute\('data-fomo-slot'\)/);
  for (const protectedName of ['crew_pulse','crowd_min','crowd_max','burn_per_minute']) {
    assert.doesNotMatch(ui, new RegExp(protectedName, 'i'));
    assert.doesNotMatch(migration, new RegExp(`(?:insert|update|delete|alter)[\\s\\S]{0,80}${protectedName}`, 'i'));
  }
});

test('trial reward is celebrated before balance explanation and insufficient balance is contextual', () => {
  assert.match(ui, /첫 업무의 수당이 실제 출금 가능 금액에 반영됐어요/);
  assert.match(ui, /업무잔액이 더 필요한 업무는 그 업무를 선택했을 때만 설명/);
  assert.match(ui, /function openBalanceGuide/);
  assert.match(ui, /업무 보증금은 진행 중에만 잠기며 정상 승인되면 업무잔액으로 전액 돌아옵니다/);
});

test('real settlement/unlock motion respects reduced motion', () => {
  assert.match(ui, /업무 보증금 → 업무잔액 복귀/);
  assert.match(ui, /완료 수당 → 출금가능 이동/);
  assert.match(ui, /급 업무가 열렸어요/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /animation:none!important/);
});

test('member experience edge is JWT-gated and service-role snapshot is not client callable', () => {
  assert.match(edge, /authorization/i);
  assert.match(edge, /putduk_member_experience_snapshot/);
  assert.match(migration, /revoke all on function public\.putduk_member_experience_snapshot\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.putduk_member_experience_snapshot\(uuid\) to service_role/i);
});

test('member shell loads the P4 layer and CI automatically runs the full quality gate', () => {
  assert.match(guard, /member-experience-p4\.css/);
  assert.match(guard, /member-experience-p4\.js/);
  assert.match(ci, /pull_request:/);
  assert.match(ci, /push:/);
  assert.match(ci, /pnpm quality:local/);
});

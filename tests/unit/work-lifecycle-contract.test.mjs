import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const start = read('supabase/migrations/20260918160000_putduk_task_start_events_after_insert.sql');
const submit = read('supabase/migrations/20260918061600_putduk_catalog_checkpoint_submit.sql');
const ledger = read('supabase/migrations/20260917210000_putduk_three_bucket_ledger.sql');
const lifecycle = read('supabase/migrations/20260920041000_putduk_work_lifecycle_rework_and_timing_guard.sql');
const memberEdge = read('supabase/functions/member-finance/index.ts');
const adminEdge = read('supabase/functions/admin-control/index.ts');
const appJs = read('dist/assets/app.js');

// 시작: run 행이 생긴 뒤 AFTER INSERT에서만 시작 이벤트를 남겨 FK 오류를 막는다.
assert.match(start, /create trigger record_putduk_task_run_started\s+after insert on public\.task_runs/i);
assert.match(start, /new\.status := 'in_progress'/);
assert.match(start, /private\.putduk_lock_stake\(/);
assert.match(start, /status in \('reserved', 'in_progress', 'checkpointed', 'submitted', 'review_pending'\)/);

// 제출: 본인 run만 받고, 실제 답/카탈로그 값을 검증하며 금액은 직접 바꾸지 않는다.
assert.match(submit, /where r\.id = p_task_run_id\s+and r\.user_id = p_user_id/i);
assert.match(submit, /v_run\.status not in \('in_progress', 'checkpointed'\)/);
assert.match(submit, /jsonb_array_length\(v_answers\) <> 5/);
assert.match(submit, /상품명·가격·옵션·배송을 모두 입력해 주세요/);
assert.doesNotMatch(submit, /putduk_apply_bucket_delta\(/, 'submit RPC must not settle money');

// Edge는 인증된 user.id만 RPC의 p_user_id로 전달한다.
assert.match(memberEdge, /p_user_id:\s*userId/);
assert.match(memberEdge, /action === "submit_work"/);
assert.match(memberEdge, /putduk_member_submit_work/);

// 최소 처리시간은 DB 레벨에서 service-role 경로에도 강제한다.
assert.match(lifecycle, /before update of status on public\.task_runs/i);
assert.match(lifecycle, /now\(\) < old\.expected_completed_at/);
assert.match(lifecycle, /예상 처리 시간이 지나면 제출할 수 있습니다/);

// rework는 검수 기록을 남긴 뒤 checkpointed로 복귀해 같은 run을 재제출할 수 있어야 한다.
assert.match(lifecycle, /new\.status = 'rework'/);
assert.match(lifecycle, /set status = 'checkpointed'/);
assert.match(lifecycle, /reward_status = 'held'/);
assert.match(lifecycle, /completed_at = null/);

// 회원 UI는 checkpointed run을 활성 업무로 복원하고 저장된 초안을 다시 주입한다.
assert.match(appJs, /const ACTIVE_RUN_STATUSES = \['reserved', 'in_progress', 'checkpointed'\]/);
assert.match(appJs, /const active = runResult\.data\.find\(\(row\) => isActiveRunStatus\(row\.status\)\)/);
assert.match(appJs, /\.from\('task_checkpoints'\)/);
assert.match(appJs, /\.eq\('checkpoint_key', 'work-draft'\)/);
assert.match(appJs, /if \(draft\.listing\) state\.player\.listing = readCatalogListing\(draft\.listing\)/);
assert.match(appJs, /state\.player\.bundle\.answers = draft\.answers\.slice\(0, INSPECT_TOTAL\)/);

// 승인 정산은 원금 반환과 수당 지급을 분리하고 idempotency key로 중복 반영을 막는다.
assert.match(ledger, /if v_run\.status = 'approved' and v_run\.reward_status = 'posted' then\s+return v_run;/i);
assert.match(ledger, /'stake-release:' \|\| v_run\.id::text/);
assert.match(ledger, /'stipend-posted:' \|\| v_run\.id::text/);
assert.match(ledger, /perform private\.putduk_release_stake\(v_run\.id, p_reviewer_id\)/);
assert.match(ledger, /perform private\.putduk_grant_stipend\(v_run\.id, p_reviewer_id\)/);
assert.match(ledger, /status = 'rejected', reward_status = 'reversed'/);

// 운영자 Edge는 승인 전에 제출 증거를 검사하고 DB 정산 RPC만 호출한다.
assert.match(adminEdge, /if \(decision === "approved"\)/);
assert.match(adminEdge, /문제 사진도 제출 보기도 없으면 승인할 수 없어요/);
assert.match(adminEdge, /admin\.rpc\("putduk_admin_review_task"/);

console.log('work-lifecycle-contract: 통과');

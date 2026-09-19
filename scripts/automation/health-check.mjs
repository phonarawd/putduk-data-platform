// 출시 파일과 백엔드 필수 경로를 확인하고, 환경이 있으면 Edge Function만 호출한다.
// 키·비밀번호·KYC 경로는 출력하지 않는다.

import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "dist/index.html",
  "dist/admin/index.html",
  "dist/manifest.webmanifest",
  "dist/sw.js",
  "supabase/functions/admin-control/index.ts",
  "supabase/functions/admin-phase5/index.ts",
  "supabase/functions/member-finance/index.ts",
  "supabase/migrations/20260916233653_putduk_ops_finance_schema.sql",
  "supabase/migrations/20260916233710_putduk_ops_finance_rpc_member.sql",
  "supabase/migrations/20260916233907_putduk_task_assignment_guard.sql",
  "supabase/migrations/20260917115001_seed_published_work_ladder_cards_v2.sql",
  "supabase/migrations/20260917115028_trial_ops_withdraw_and_activate_confirmed.sql",
  "supabase/migrations/20260917120157_task_events_after_start.sql",
  "supabase/migrations/20260917120956_trial_ops_withdraw.sql",
  "supabase/migrations/20260917144749_putduk_member_submit_work.sql",
  "supabase/migrations/20260918033000_putduk_inspect_bundle_submit.sql",
  "supabase/migrations/20260918061600_putduk_catalog_checkpoint_submit.sql",
  "supabase/migrations/20260918160000_putduk_task_start_events_after_insert.sql",
  "supabase/migrations/20260919120000_putduk_phase5_kyc_payout_security.sql",
  "supabase/migrations/20260920041000_putduk_work_lifecycle_rework_and_timing_guard.sql",
  "supabase/migrations/20260920054000_putduk_assignment_rls_unify.sql",
  "supabase/migrations/20260920054500_putduk_assignment_rls_recursion_fix.sql",
  "supabase/migrations/20260920055000_putduk_member_payout_ciphertext_cleanup.sql"
];

const missing = required.filter((file) => !existsSync(path.join(root, file)));
if (missing.length) {
  console.error("필수 파일이 없습니다.");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUTDUK_SUPABASE_URL;
if (!supabaseUrl) {
  console.log("로컬 헬스체크: 통과");
  process.exit(0);
}

const origin = supabaseUrl.replace(/\/$/, "");
const targets = [
  `${origin}/functions/v1/admin-control`,
  `${origin}/functions/v1/admin-phase5`,
  `${origin}/functions/v1/member-finance`
];

const results = await Promise.all(targets.map(async (url) => {
  const response = await fetch(url, { method: "OPTIONS" });
  return { ok: response.ok || response.status === 204 };
}));

if (results.some((row) => !row.ok)) {
  console.error("Edge Function 응답을 확인하지 못했습니다.");
  process.exit(1);
}

console.log("백엔드 헬스체크: 통과");

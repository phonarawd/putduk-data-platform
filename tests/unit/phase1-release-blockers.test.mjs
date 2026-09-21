import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('업무별 공급량과 회원 횟수는 같은 KST 경계를 사용한다', () => {
  const sql = read('supabase/migrations/20260921102905_phase1_kst_day_boundary.sql');
  assert.equal(sql.includes("created_at >= date_trunc('day', v_now)"), false);
  assert.equal((sql.match(/created_at >= v_kst_day_start/g) || []).length, 2);
  assert.match(sql, /Asia\/Seoul/);
});

test('회원 화면은 서버 reset 시각에 KST 일일 상태를 다시 불러온다', () => {
  const app = read('dist/assets/app.js');
  const experience = read('dist/assets/member-experience-p4.js');
  assert.match(app, /scheduleKstQuotaReset\(state\.dailyTaskQuota\?\.resets_at\)/);
  assert.match(app, /putduk:kst-day-changed/);
  assert.match(experience, /putduk:kst-day-changed/);
});

test('로그인은 인증 원인을 분류하고 로그아웃은 클라이언트 상태를 제거한다', () => {
  const app = read('dist/assets/app.js');
  for (const code of ['email_not_confirmed', 'user_banned', 'over_request_rate_limit', 'invalid_credentials']) {
    assert.match(app, new RegExp(code));
  }
  assert.match(app, /event === 'SIGNED_OUT'/);
  assert.match(app, /localStorage\.removeItem\(previousStorageKey\)/);
  assert.match(app, /history\.replaceState\(null, '', '\/'\)/);
});

test('관리자 회원 상세는 내부 스크롤과 PII 열람 감사를 갖는다', () => {
  const css = read('dist/admin/admin.css');
  const adminUi = read('dist/admin/admin.js');
  const adminOps = read('supabase/functions/_shared/admin-ops.ts');
  assert.match(css, /max-height: min\(92dvh, 920px\)/);
  assert.match(css, /\.member-detail-modal \.modal-body[\s\S]*overflow-y: auto/);
  assert.match(adminUi, /전체 휴대폰 번호 표시 중/);
  assert.match(adminOps, /회원 개인정보 열람/);
  assert.match(adminOps, /fields: \["phone_e164", "email", "legal_name", "birth_date", "last_login_ip"\]/);
});

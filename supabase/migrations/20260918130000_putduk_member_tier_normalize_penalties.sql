-- 원금 출금 강등 로직의 등급 표기 불일치·미정의 값 버그 수정.
--
-- 발견 경위(2026-09-18 야간 조사): profiles.member_tier에는 가입 기본값인 구 표기
-- ('일반 파트너'/'인증 파트너'/'우수 파트너'/'글로벌 디렉터')와, admin.js "사원증 등급
-- 변경" 폼이 그대로 저장하는 배지 라벨('라인'/'크루'/'선임'/'전담')이 섞여 들어갈 수
-- 있다. 그런데 원금 출금 완료 시 등급을 한 단계 강등하는
-- private.putduk_apply_principal_penalties()는 '전담'/'선임'/'주임'/'라인'을 기준으로
-- case 분기하는데, '주임'은 이 코드베이스 어디에도 정의된 적 없는 값이다. 실제 저장된
-- 값이 배지 라벨('선임' 등)이어도 '주임'으로 잘못 내려가거나, '인증 파트너'(=크루)처럼
-- case에 아예 없는 값이면 곧장 else '라인'으로 두 단계 이상 떨어질 수 있었다.
--
-- 이 마이그레이션은 private.putduk_normalize_member_tier()(하루 한도 마이그레이션에서
-- 이미 만든 정규화 함수)를 재사용해 분기 전에 항상 4개 배지 라벨로 정규화하고,
-- 강등 순서를 전담→선임→크루→라인으로 고정한다(라인이 바닥, 체험으로 내려가지 않음 —
-- 체험은 trial_consumed_at으로 관리하는 1회성 온보딩이라 강등 목적지가 될 수 없다).
-- 나머지 로직(work_balance 조회, line_open/line_closed_at, 우선권 플래그 초기화 등)은
-- 그대로 유지한다.

begin;

create or replace function private.putduk_apply_principal_penalties(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tier text;
  v_tier_label text;
  v_next text;
  v_work numeric(18,2) := 0;
  v_close boolean := false;
begin
  select member_tier into v_tier from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '회원 정보를 찾을 수 없습니다.';
  end if;

  v_tier_label := private.putduk_normalize_member_tier(v_tier);

  v_next := case v_tier_label
    when '전담' then '선임'
    when '선임' then '크루'
    when '크루' then '라인'
    when '라인' then '라인'
    else '라인'
  end;

  select coalesce(available_amount, 0) + coalesce(held_amount, 0)
    into v_work
  from public.wallet_accounts
  where user_id = p_user_id and bucket = 'work_balance' and currency = 'KRW';

  v_close := coalesce(v_work, 0) <= 0;

  update public.profiles
  set member_tier = v_next,
      line_open = case when v_close then false else line_open end,
      line_closed_at = case when v_close then now() else line_closed_at end,
      priority_pick = false,
      dedicated_queue = false,
      weekly_volume_boost = false,
      high_value_notice = false,
      principal_withdraw_count = principal_withdraw_count + 1,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'previous_tier', v_tier_label,
    'new_tier', v_next,
    'line_closed', v_close
  );
end;
$$;

revoke all on function private.putduk_apply_principal_penalties(uuid) from public, anon, authenticated;
grant execute on function private.putduk_apply_principal_penalties(uuid) to service_role;

comment on function private.putduk_apply_principal_penalties(uuid) is
  '원금 출금 완료 시 강등(전담→선임→크루→라인, 라인이 바닥)·우선권 회수·라인 닫힘을 적용한다. 분기 전 반드시 putduk_normalize_member_tier로 정규화한다.';

commit;

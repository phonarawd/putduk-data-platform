-- 회원 화면 하루 한도 fallback용 RPC 실행 권한.
-- 함수 내부에서 auth.uid()와 대상 회원 ID를 비교하고 live auth 상태도 확인하므로
-- authenticated 역할에 이 함수 하나만 제한적으로 노출한다.
revoke execute on function public.putduk_member_daily_task_quota(uuid) from public;
grant execute on function public.putduk_member_daily_task_quota(uuid) to authenticated;

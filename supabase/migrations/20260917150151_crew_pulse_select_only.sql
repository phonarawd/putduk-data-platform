-- 회원·익명은 집계 숫자만 읽게 한다. 쓰기는 서비스 역할과 트리거만.

begin;

revoke all on table public.crew_pulse from public, anon, authenticated;
grant select on table public.crew_pulse to anon, authenticated;
grant select, insert, update, delete on table public.crew_pulse to service_role;
notify pgrst, 'reload schema';

commit;

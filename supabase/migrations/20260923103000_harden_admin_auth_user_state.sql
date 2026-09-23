-- 관리자 역할 검사를 Supabase Auth 계정 상태와 묶는다.
-- role 행이 남아 있어도 미확인/삭제/밴 계정의 기존 유효 JWT가 관리자 권한을 통과하지 않도록 한다.

begin;

create or replace function public.putduk_admin_has_role(
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    p_user_id is not null
    and coalesce(cardinality(p_roles), 0) > 0
    and exists (
      select 1
      from private.admin_roles ar
      join auth.users u on u.id = ar.user_id
      where ar.user_id = p_user_id
        and ar.role = any(p_roles)
        and u.email_confirmed_at is not null
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
    );
$$;

create or replace function private.putduk_assert_admin(
  p_user_id uuid,
  p_roles text[]
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_user_id is null or coalesce(cardinality(p_roles), 0) = 0 then
    raise exception using errcode = '22023', message = '운영자 정보가 필요합니다.';
  end if;

  if not public.putduk_admin_has_role(p_user_id, p_roles) then
    raise exception using errcode = '42501', message = '이 메뉴를 사용할 권한이 없습니다.';
  end if;
end;
$$;

comment on function public.putduk_admin_has_role(uuid, text[]) is
  '관리자 role뿐 아니라 Supabase Auth 계정의 email confirmation, deletion, ban 상태를 함께 검증';

comment on function private.putduk_assert_admin(uuid, text[]) is
  '관리자 role과 Supabase Auth 계정 상태를 함께 검증';

commit;

-- 회원/운영자 본인이 받은 알림을 자신의 알림함에서 삭제(숨김)할 수 있게 한다.
-- 원본 행은 운영 증빙 보존을 위해 삭제하지 않는다.

begin;

create or replace function public.putduk_archive_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;

  perform private.putduk_assert_live_member(auth.uid());

  update public.notifications
  set
    member_hidden_at = now(),
    member_hidden_reason = 'user_deleted'
  where id = p_notification_id
    and user_id = auth.uid()
    and member_hidden_at is null;

  return found;
end;
$function$;

revoke execute on function public.putduk_archive_notification(uuid) from public;
grant execute on function public.putduk_archive_notification(uuid) to authenticated;

comment on function public.putduk_archive_notification(uuid) is
  '회원 또는 운영자 본인이 받은 알림을 본인 화면에서만 숨긴다. 원본 행은 운영 증빙 보존을 위해 삭제하지 않는다.';

commit;
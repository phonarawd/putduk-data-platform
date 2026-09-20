-- P0 알림 정화: 테스트/검증 알림을 삭제하지 않고 회원 화면에서 비노출할 수 있게 보관 상태를 추가한다.

begin;

alter table public.notifications
  add column if not exists member_hidden_at timestamptz;

alter table public.notifications
  add column if not exists member_hidden_reason text;

comment on column public.notifications.member_hidden_at is
  '회원 알림함에서 숨긴 시각. 운영 증빙 보존을 위해 원본 알림 행은 삭제하지 않는다.';
comment on column public.notifications.member_hidden_reason is
  '회원 비노출 사유. 운영 정리 근거만 기록하며 회원 화면에는 노출하지 않는다.';

-- 회원은 알림 본문/종류/숨김 상태를 바꿀 필요가 없다. 읽음 시각만 갱신하도록 권한을 축소한다.
revoke update on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications
for select
to authenticated
using (
  member_hidden_at is null
  and (
    user_id is null
    or (select auth.uid()) = user_id
  )
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications
for update
to authenticated
using (
  member_hidden_at is null
  and (select auth.uid()) = user_id
)
with check (
  member_hidden_at is null
  and (select auth.uid()) = user_id
);

create index if not exists notifications_member_visible_idx
  on public.notifications (user_id, created_at desc)
  where member_hidden_at is null;

comment on policy notifications_select_own on public.notifications is
  '회원 본인 알림과 전체 공지 중 회원 비노출 처리되지 않은 알림만 읽을 수 있다.';
comment on policy notifications_update_own on public.notifications is
  '회원은 회원 비노출되지 않은 본인 알림의 허용된 열(read_at)만 갱신할 수 있다.';

commit;

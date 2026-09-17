-- 운영자 연출 슬라이더(인원·분당 소진·켜기)를 DB에 저장한다.
-- 회원은 공개 집계 한 줄만 읽는다. 봇·가짜라는 말은 회원 쪽에 두지 않는다.

begin;

create table if not exists private.ops_motion_settings (
  id smallint primary key default 1 check (id = 1),
  bot_enabled boolean not null default true,
  crowd_min integer not null default 8 check (crowd_min >= 0 and crowd_min <= 10000),
  crowd_max integer not null default 24 check (crowd_max >= 0 and crowd_max <= 10000),
  burn_per_minute integer not null default 2 check (burn_per_minute >= 0 and burn_per_minute <= 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (crowd_max >= crowd_min)
);

comment on table private.ops_motion_settings is
  '운영자 연출 슬라이더 진실. 서비스 역할만 읽고 쓴다.';

alter table private.ops_motion_settings enable row level security;

drop policy if exists private_service_role_full_access on private.ops_motion_settings;
create policy private_service_role_full_access
  on private.ops_motion_settings for all to service_role
  using (true) with check (true);

revoke all on table private.ops_motion_settings from public, anon, authenticated;
grant select, insert, update, delete on table private.ops_motion_settings to service_role;

create table if not exists public.crew_pulse (
  id smallint primary key default 1 check (id = 1),
  live boolean not null default true,
  crowd_min integer not null default 8 check (crowd_min >= 0 and crowd_min <= 10000),
  crowd_max integer not null default 24 check (crowd_max >= 0 and crowd_max <= 10000),
  burn_per_minute integer not null default 2 check (burn_per_minute >= 0 and burn_per_minute <= 100000),
  updated_at timestamptz not null default now(),
  check (crowd_max >= crowd_min)
);

comment on table public.crew_pulse is
  '작업실·라인 찾기에 보여주는 지금 활동·자리 소진 집계. 켜짐 여부만 있고 봇이라는 말은 없다.';

alter table public.crew_pulse enable row level security;

drop policy if exists crew_pulse_select_anyone on public.crew_pulse;
create policy crew_pulse_select_anyone
  on public.crew_pulse for select to anon, authenticated
  using (true);

revoke all on table public.crew_pulse from public, anon, authenticated;
grant select on table public.crew_pulse to anon, authenticated;
grant select, insert, update, delete on table public.crew_pulse to service_role;

create or replace function private.sync_crew_pulse()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.crew_pulse (id, live, crowd_min, crowd_max, burn_per_minute, updated_at)
  values (1, new.bot_enabled, new.crowd_min, new.crowd_max, new.burn_per_minute, now())
  on conflict (id) do update
    set live = excluded.live,
        crowd_min = excluded.crowd_min,
        crowd_max = excluded.crowd_max,
        burn_per_minute = excluded.burn_per_minute,
        updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_crew_pulse() from public, anon, authenticated;
grant execute on function private.sync_crew_pulse() to service_role;

drop trigger if exists sync_crew_pulse on private.ops_motion_settings;
create trigger sync_crew_pulse
after insert or update on private.ops_motion_settings
for each row
execute function private.sync_crew_pulse();

insert into private.ops_motion_settings (id, bot_enabled, crowd_min, crowd_max, burn_per_minute)
values (1, true, 8, 24, 2)
on conflict (id) do nothing;

commit;

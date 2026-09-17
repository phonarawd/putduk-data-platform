-- 연출 설정은 private 테이블이 진실이다. Data API에 private가 없어 서비스 역할 RPC로만 읽고 쓴다.

begin;

create or replace function public.putduk_admin_motion_settings_get()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'bot_enabled', s.bot_enabled,
        'crowd_min', s.crowd_min,
        'crowd_max', s.crowd_max,
        'burn_per_minute', s.burn_per_minute
      )
      from private.ops_motion_settings s
      where s.id = 1
    ),
    jsonb_build_object(
      'bot_enabled', true,
      'crowd_min', 8,
      'crowd_max', 24,
      'burn_per_minute', 2
    )
  );
$$;

revoke all on function public.putduk_admin_motion_settings_get() from public, anon, authenticated;
grant execute on function public.putduk_admin_motion_settings_get() to service_role;

comment on function public.putduk_admin_motion_settings_get() is
  '운영자 연출 슬라이더를 읽는 service_role 전용 함수.';

create or replace function public.putduk_admin_motion_settings_save(
  p_admin_id uuid,
  p_bot_enabled boolean,
  p_crowd_min integer,
  p_crowd_max integer,
  p_burn_per_minute integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_min integer;
  v_max integer;
  v_burn integer;
  v_on boolean;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'content']);
  v_on := coalesce(p_bot_enabled, true);
  v_min := least(greatest(coalesce(p_crowd_min, 8), 0), 10000);
  v_max := least(greatest(coalesce(p_crowd_max, 24), v_min), 10000);
  v_burn := least(greatest(coalesce(p_burn_per_minute, 2), 0), 100000);

  insert into private.ops_motion_settings (
    id, bot_enabled, crowd_min, crowd_max, burn_per_minute, updated_at, updated_by
  )
  values (1, v_on, v_min, v_max, v_burn, now(), p_admin_id)
  on conflict (id) do update
    set bot_enabled = excluded.bot_enabled,
        crowd_min = excluded.crowd_min,
        crowd_max = excluded.crowd_max,
        burn_per_minute = excluded.burn_per_minute,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return jsonb_build_object(
    'bot_enabled', v_on,
    'crowd_min', v_min,
    'crowd_max', v_max,
    'burn_per_minute', v_burn
  );
end;
$$;

revoke all on function public.putduk_admin_motion_settings_save(uuid, boolean, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_motion_settings_save(uuid, boolean, integer, integer, integer)
  to service_role;

comment on function public.putduk_admin_motion_settings_save(uuid, boolean, integer, integer, integer) is
  '운영자 연출 슬라이더를 저장하는 service_role 전용 함수. 회원 집계는 crew_pulse로 따라간다.';

notify pgrst, 'reload schema';

commit;

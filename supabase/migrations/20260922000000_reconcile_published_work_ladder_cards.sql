-- Canonical production bootstrap: published work ladder cards 13종.
--
-- 이 migration은 migration 27(20260917115001)의 원래 시드 결과를
-- dependency 순서 문제 없이 보장한다.
--
-- migration 27은 putduk_admin_upsert_node 함수(migration 40에서 정의)와
-- super_admin 데이터에 의존하여 로컬 db reset에서 skip될 수 있다.
-- 이 migration은 모든 dependency가 준비된 이후에 실행되므로
-- 안전하게 13종 카드를 생성·갱신한다.
--
-- putduk_admin_upsert_node RPC를 사용하지 않고 직접 INSERT/UPDATE한다.
-- 운영자 계정 인증에 의존하지 않는다.
-- public_id 기준 idempotent: 재실행해도 중복 생성하지 않는다.
--
-- 기존 production에 13종이 이미 존재하면 on conflict do nothing으로
-- 운영자 수정값을 덮어쓰지 않는다.
-- fresh DB(로컬 dev)에서는 카드가 없으므로 정상적으로 insert된다.
-- production에서는 migration 27이 이미 실행되어 카드가 있으므로 no-op.

begin;

-- 기존 published 카드 중 stake/stipend가 0인 것을 paused로 전환
-- (migration 27의 원래 side-effect 재현)
update public.nodes
set catalog_status = 'paused', enabled = false
where public_id = 'PDK-NODE-150126A7'
   or (coalesce(stake_krw, 0) = 0 and coalesce(stipend_krw, 0) = 0 and catalog_status = 'published');

-- 13종 카드를 직접 upsert. public_id(unique) 기준.
-- putduk_admin_upsert_node가 설정하는 모든 필드를 동일하게 설정한다.

insert into public.nodes (
  public_id,
  partner_brand_id,
  title_ko,
  description_ko,
  node_family,
  difficulty,
  estimated_seconds,
  reward_min,
  reward_max,
  daily_capacity,
  enabled,
  motion_profile,
  motion_version,
  allowed_tiers,
  scene_theme,
  vehicle_type,
  route_type,
  particle_style,
  completion_effect,
  supply_source,
  catalog_status,
  stake_krw,
  stipend_krw,
  tier_band,
  partner_slug,
  question_prompt_ko,
  question_image_path,
  choice_a_ko,
  choice_b_ko,
  daily_cap,
  requires_assign,
  is_trial
)
select
  v.public_id,
  b.id,
  v.title_ko,
  v.description_ko,
  v.node_family,
  v.difficulty,
  v.estimated_seconds::integer,
  v.stipend_krw::numeric,
  v.stipend_krw::numeric,
  v.daily_cap::integer,
  true,
  v.motion_profile,
  '2.0.0',
  '{}'::text[],
  null,
  null,
  null,
  null,
  null,
  'operator',
  'published',
  v.stake_krw::numeric,
  v.stipend_krw::numeric,
  v.tier_band,
  v.partner_slug,
  '이 사진의 협력사 표시가 근무 라벨과 같나요?',
  'brand-logos/' || v.partner_slug || '-photo.png',
  '맞아요',
  '달라요',
  v.daily_cap::integer,
  (v.requires_assign)::boolean,
  (v.is_trial)::boolean
from (
  values
    ('PDK-NODE-TRIAL-DHL',     'dhl',     'DHL 첫 출근 확인',          '오늘 배정된 DHL 라인 사진을 한 장 보고 맞아요/달라요만 고르면 돼요.',     '근무 확인', '빠른 확인', 30, 10000,    3000,      24, 'air_cargo',       '체험', true,  false),
    ('PDK-NODE-SMALL-30-UPS',  'ups',     'UPS 라벨 한 장 확인',       '오늘 배정된 UPS 라인 라벨을 한 장 보고 출근을 마쳐요.',                '근무 확인', '빠른 확인', 30, 30000,    3000,      12, 'road_logistics',  '소액', false, false),
    ('PDK-NODE-SMALL-50-FDX',  'fedex',   'FedEx 항공 서류 확인',      'FedEx 라인 서류 사진이 근무 라벨과 같은지 한 번만 봐 주세요.',          '근무 확인', '빠른 확인', 30, 50000,    5000,      12, 'air_cargo',       '소액', false, false),
    ('PDK-NODE-SMALL-70-CJ',   'cj',      'CJ대한통운 창고 칸 확인',    '창고 칸 사진을 보고 오늘 배정된 라인이 맞는지 확인해 주세요.',          '근무 확인', '빠른 확인', 30, 70000,    7000,      12, 'warehouse_edge',  '소액', false, false),
    ('PDK-NODE-SMALL-100-MSK', 'maersk',  'Maersk 컨테이너 표시 확인', '선박 컨테이너 표시가 근무 라벨과 같은지 한 장만 확인해 주세요.',        '근무 확인', '빠른 확인', 30, 100000,   10000,     12, 'ocean_vessel',    '소액', false, false),
    ('PDK-NODE-MID-300-ALI',   'alibaba', '알리바바 상품 사진 확인',    '상품 사진과 근무 라벨이 같은지 한 번만 보고 제출해 주세요.',           '근무 확인', '일반 처리', 45, 300000,   30000,     6,  'commerce_catalog','중간', false, false),
    ('PDK-NODE-MID-500-EBY',   'ebay',    '이베이 카탈로그 확인',       '오늘 배정된 이베이 라인 상품 표시를 한 장 확인해 주세요.',             '근무 확인', '일반 처리', 45, 500000,   50000,     6,  'commerce_catalog','중간', false, false),
    ('PDK-NODE-MID-1000-GXO',  'gxo',     'GXO 재고 위치 확인',         '창고 위치 사진을 보고 근무 라벨과 같은지 확인해 주세요.',               '근무 확인', '일반 처리', 45, 1000000,  100000,    6,  'warehouse_edge',  '중간', false, false),
    ('PDK-NODE-HIGH-3000-UPS', 'ups',     'UPS 고액 라인 확인',         '고액 구간 UPS 라인 사진을 한 장 확인해 주세요.',                        '근무 확인', '집중 처리', 60, 3000000,  300000,    3,  'road_logistics',  '고액', false, false),
    ('PDK-NODE-HIGH-5000-FDX', 'fedex',   'FedEx 고액 항공 확인',       '고액 구간 FedEx 라인 서류를 한 장 확인해 주세요.',                      '근무 확인', '집중 처리', 60, 5000000,  500000,    3,  'air_cargo',       '고액', false, false),
    ('PDK-NODE-HIGH-10000-CJ', 'cj',      'CJ대한통운 고액 라인 확인',   '고액 구간 창고 라인을 한 장 확인해 주세요.',                            '근무 확인', '집중 처리', 60, 10000000, 1000000,   3,  'warehouse_edge',  '고액', false, false),
    ('PDK-NODE-ULTRA-3KW-MSK', 'maersk',  'Maersk 초고액 항로 확인',    '이 금액 구간은 운영자 확인 후 열립니다.',                               '근무 확인', '전문 검수', 90, 30000000, 3000000,   1,  'ocean_vessel',    '초고액', false, true),
    ('PDK-NODE-ULTRA-1UK-GXO', 'gxo',     'GXO 초고액 창고 확인',       '이 금액 구간은 운영자 확인 후 열립니다.',                               '근무 확인', '전문 검수', 90, 100000000,10000000,  1,  'warehouse_edge',  '초고액', false, true)
) as v(public_id, partner_slug, title_ko, description_ko, node_family, difficulty, estimated_seconds, stake_krw, stipend_krw, daily_cap, motion_profile, tier_band, is_trial, requires_assign)
cross join lateral (
  select id from public.partner_brands where slug = v.partner_slug limit 1
) as b
on conflict (public_id) do nothing;

-- 정답 키: 모든 카드 정답은 'a' (맞아요)
-- putduk_admin_upsert_node가 생성하는 private.node_answer_keys를 동일하게 보장.
insert into private.node_answer_keys (node_id, correct_choice, updated_at)
select n.id, 'a', now()
from public.nodes n
where n.public_id in (
  'PDK-NODE-TRIAL-DHL',
  'PDK-NODE-SMALL-30-UPS',
  'PDK-NODE-SMALL-50-FDX',
  'PDK-NODE-SMALL-70-CJ',
  'PDK-NODE-SMALL-100-MSK',
  'PDK-NODE-MID-300-ALI',
  'PDK-NODE-MID-500-EBY',
  'PDK-NODE-MID-1000-GXO',
  'PDK-NODE-HIGH-3000-UPS',
  'PDK-NODE-HIGH-5000-FDX',
  'PDK-NODE-HIGH-10000-CJ',
  'PDK-NODE-ULTRA-3KW-MSK',
  'PDK-NODE-ULTRA-1UK-GXO'
)
on conflict (node_id) do nothing;

commit;

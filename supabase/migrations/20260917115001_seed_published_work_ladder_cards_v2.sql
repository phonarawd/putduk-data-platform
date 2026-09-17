do $$
declare
  v_admin uuid;
  v_card jsonb;
  v_id uuid;
  v_row public.nodes%rowtype;
  v_brands jsonb;
begin
  select user_id into v_admin
  from private.admin_roles
  where role = 'super_admin'
  order by created_at nulls last
  limit 1;
  if v_admin is null then
    raise exception '운영자 계정이 필요합니다.';
  end if;

  select jsonb_object_agg(slug, id::text) into v_brands from public.partner_brands;

  update public.nodes
  set catalog_status = 'paused', enabled = false
  where public_id = 'PDK-NODE-150126A7'
     or (coalesce(stake_krw, 0) = 0 and coalesce(stipend_krw, 0) = 0 and catalog_status = 'published');

  for v_card in
    select value from jsonb_array_elements($cards$[
      {"public_id":"PDK-NODE-TRIAL-DHL","partner_slug":"dhl","title_ko":"DHL 첫 출근 확인","description_ko":"오늘 배정된 DHL 라인 사진을 한 장 보고 맞아요/달라요만 고르면 돼요.","node_family":"근무 확인","difficulty":"빠른 확인","estimated_seconds":30,"stake_krw":10000,"stipend_krw":3000,"tier_band":"체험","daily_cap":24,"motion_profile":"air_cargo","is_trial":true,"requires_assign":false},
      {"public_id":"PDK-NODE-SMALL-30-UPS","partner_slug":"ups","title_ko":"UPS 라벨 한 장 확인","description_ko":"오늘 배정된 UPS 라인 라벨을 한 장 보고 출근을 마쳐요.","node_family":"근무 확인","difficulty":"빠른 확인","estimated_seconds":30,"stake_krw":30000,"stipend_krw":3000,"tier_band":"소액","daily_cap":12,"motion_profile":"road_logistics","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-SMALL-50-FDX","partner_slug":"fedex","title_ko":"FedEx 항공 서류 확인","description_ko":"FedEx 라인 서류 사진이 근무 라벨과 같은지 한 번만 봐 주세요.","node_family":"근무 확인","difficulty":"빠른 확인","estimated_seconds":30,"stake_krw":50000,"stipend_krw":5000,"tier_band":"소액","daily_cap":12,"motion_profile":"air_cargo","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-SMALL-70-CJ","partner_slug":"cj","title_ko":"CJ대한통운 창고 칸 확인","description_ko":"창고 칸 사진을 보고 오늘 배정된 라인이 맞는지 확인해 주세요.","node_family":"근무 확인","difficulty":"빠른 확인","estimated_seconds":30,"stake_krw":70000,"stipend_krw":7000,"tier_band":"소액","daily_cap":12,"motion_profile":"warehouse_edge","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-SMALL-100-MSK","partner_slug":"maersk","title_ko":"Maersk 컨테이너 표시 확인","description_ko":"선박 컨테이너 표시가 근무 라벨과 같은지 한 장만 확인해 주세요.","node_family":"근무 확인","difficulty":"빠른 확인","estimated_seconds":30,"stake_krw":100000,"stipend_krw":10000,"tier_band":"소액","daily_cap":12,"motion_profile":"ocean_vessel","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-MID-300-ALI","partner_slug":"alibaba","title_ko":"알리바바 상품 사진 확인","description_ko":"상품 사진과 근무 라벨이 같은지 한 번만 보고 제출해 주세요.","node_family":"근무 확인","difficulty":"일반 처리","estimated_seconds":45,"stake_krw":300000,"stipend_krw":30000,"tier_band":"중간","daily_cap":6,"motion_profile":"commerce_catalog","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-MID-500-EBY","partner_slug":"ebay","title_ko":"이베이 카탈로그 확인","description_ko":"오늘 배정된 이베이 라인 상품 표시를 한 장 확인해 주세요.","node_family":"근무 확인","difficulty":"일반 처리","estimated_seconds":45,"stake_krw":500000,"stipend_krw":50000,"tier_band":"중간","daily_cap":6,"motion_profile":"commerce_catalog","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-MID-1000-GXO","partner_slug":"gxo","title_ko":"GXO 재고 위치 확인","description_ko":"창고 위치 사진을 보고 근무 라벨과 같은지 확인해 주세요.","node_family":"근무 확인","difficulty":"일반 처리","estimated_seconds":45,"stake_krw":1000000,"stipend_krw":100000,"tier_band":"중간","daily_cap":6,"motion_profile":"warehouse_edge","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-HIGH-3000-UPS","partner_slug":"ups","title_ko":"UPS 고액 라인 확인","description_ko":"고액 구간 UPS 라인 사진을 한 장 확인해 주세요.","node_family":"근무 확인","difficulty":"집중 처리","estimated_seconds":60,"stake_krw":3000000,"stipend_krw":300000,"tier_band":"고액","daily_cap":3,"motion_profile":"road_logistics","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-HIGH-5000-FDX","partner_slug":"fedex","title_ko":"FedEx 고액 항공 확인","description_ko":"고액 구간 FedEx 라인 서류를 한 장 확인해 주세요.","node_family":"근무 확인","difficulty":"집중 처리","estimated_seconds":60,"stake_krw":5000000,"stipend_krw":500000,"tier_band":"고액","daily_cap":3,"motion_profile":"air_cargo","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-HIGH-10000-CJ","partner_slug":"cj","title_ko":"CJ대한통운 고액 라인 확인","description_ko":"고액 구간 창고 라인을 한 장 확인해 주세요.","node_family":"근무 확인","difficulty":"집중 처리","estimated_seconds":60,"stake_krw":10000000,"stipend_krw":1000000,"tier_band":"고액","daily_cap":3,"motion_profile":"warehouse_edge","is_trial":false,"requires_assign":false},
      {"public_id":"PDK-NODE-ULTRA-3KW-MSK","partner_slug":"maersk","title_ko":"Maersk 초고액 항로 확인","description_ko":"이 금액 구간은 운영자 확인 후 열립니다.","node_family":"근무 확인","difficulty":"전문 검수","estimated_seconds":90,"stake_krw":30000000,"stipend_krw":3000000,"tier_band":"초고액","daily_cap":1,"motion_profile":"ocean_vessel","is_trial":false,"requires_assign":true},
      {"public_id":"PDK-NODE-ULTRA-1UK-GXO","partner_slug":"gxo","title_ko":"GXO 초고액 창고 확인","description_ko":"이 금액 구간은 운영자 확인 후 열립니다.","node_family":"근무 확인","difficulty":"전문 검수","estimated_seconds":90,"stake_krw":100000000,"stipend_krw":10000000,"tier_band":"초고액","daily_cap":1,"motion_profile":"warehouse_edge","is_trial":false,"requires_assign":true}
    ]$cards$)
  loop
    v_card := v_card || jsonb_build_object(
      'partner_brand_id', v_brands ->> (v_card->>'partner_slug'),
      'question_prompt_ko', '이 사진의 협력사 표시가 근무 라벨과 같나요?',
      'choice_a_ko', '맞아요',
      'choice_b_ko', '달라요',
      'correct_choice', 'a',
      'question_image_path', 'brand-logos/' || (v_card->>'partner_slug') || '-photo.png',
      'catalog_status', 'published',
      'reward_min', (v_card->>'stipend_krw')::numeric,
      'reward_max', (v_card->>'stipend_krw')::numeric,
      'daily_capacity', (v_card->>'daily_cap')::integer,
      'motion_version', '2.0.0'
    );
    select id into v_id from public.nodes where public_id = v_card->>'public_id';
    v_row := public.putduk_admin_upsert_node(v_admin, v_id, v_card);
    update public.nodes
    set catalog_status = 'published',
        enabled = true,
        published_by = v_admin,
        question_image_path = v_card->>'question_image_path',
        question_prompt_ko = v_card->>'question_prompt_ko',
        choice_a_ko = v_card->>'choice_a_ko',
        choice_b_ko = v_card->>'choice_b_ko'
    where id = v_row.id;
  end loop;
end $$;

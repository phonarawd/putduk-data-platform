-- Stage 4: deterministic metadata helpers for the 120-work catalog.
begin;

create or replace function private.putduk_catalog_component_type(p_archetype text)
returns text language sql immutable set search_path = pg_catalog
as $$
  select case p_archetype
    when 'normalize_text' then 'text'
    when 'quantity_delta' then 'integer'
    when 'calculate_value' then 'integer'
    when 'unit_conversion' then 'integer'
    when 'boolean_presence' then 'boolean'
    else 'choice'
  end;
$$;

create or replace function private.putduk_catalog_input_kind(p_archetype text)
returns text language sql immutable set search_path = pg_catalog
as $$
  select case p_archetype
    when 'format_check' then 'format_check:sample'
    when 'pair_match' then 'pair_match:left,right'
    when 'missing_field' then 'missing_field:required_fields,present_fields'
    when 'quality_class' then 'quality_class:observed'
    when 'category_class' then 'category_class:case_text,categories'
    when 'sequence_check' then 'sequence_check:sequence'
    when 'normalize_text' then 'normalize_text:raw'
    when 'duplicate_check' then 'duplicate_check:record_a,record_b'
    when 'link_match' then 'link_match:source,target'
    when 'quantity_delta' then 'quantity_delta:planned,actual'
    when 'calculate_value' then 'calculate_value:operands,formula'
    when 'date_status' then 'date_status:dates,rule'
    when 'unit_conversion' then 'unit_conversion:source,factor'
    when 'numeric_range' then 'numeric_range:value,min,max'
    when 'evidence_sufficient' then 'evidence_sufficient:required,observed'
    when 'select_best' then 'select_best:candidates'
    when 'restricted_terms' then 'restricted_terms:text,blocked_terms'
    when 'boolean_presence' then 'boolean_presence:target,observed'
    when 'translation_match' then 'translation_match:source,translation'
    else 'unknown'
  end;
$$;

create or replace function private.putduk_catalog_evidence_policy(p_archetype text)
returns text language sql immutable set search_path = pg_catalog
as $$
  select case p_archetype
    when 'format_check' then 'format_decision_snapshot.v1'
    when 'pair_match' then 'comparison_snapshot.v1'
    when 'missing_field' then 'completeness_snapshot.v1'
    when 'quality_class' then 'quality_decision_snapshot.v1'
    when 'category_class' then 'classification_snapshot.v1'
    when 'sequence_check' then 'sequence_snapshot.v1'
    when 'normalize_text' then 'normalized_text_snapshot.v1'
    when 'duplicate_check' then 'duplicate_decision_snapshot.v1'
    when 'link_match' then 'linkage_snapshot.v1'
    when 'quantity_delta' then 'quantity_calculation_snapshot.v1'
    when 'calculate_value' then 'calculation_snapshot.v1'
    when 'date_status' then 'date_decision_snapshot.v1'
    when 'unit_conversion' then 'conversion_snapshot.v1'
    when 'numeric_range' then 'threshold_decision_snapshot.v1'
    when 'evidence_sufficient' then 'evidence_check_snapshot.v1'
    when 'select_best' then 'selection_snapshot.v1'
    when 'restricted_terms' then 'policy_decision_snapshot.v1'
    when 'boolean_presence' then 'presence_snapshot.v1'
    when 'translation_match' then 'translation_review_snapshot.v1'
    else 'answer_snapshot.v1'
  end;
$$;

create or replace function private.putduk_catalog_review_mode(p_archetype text)
returns text language sql immutable set search_path = pg_catalog
as $$
  select case
    when p_archetype in ('duplicate_check','restricted_terms','translation_match') then 'dual_review'
    when p_archetype in ('missing_field','quality_class','category_class','normalize_text','evidence_sufficient','select_best','boolean_presence') then 'operator_spot_check'
    else 'auto_exact'
  end;
$$;

create or replace function private.putduk_catalog_validation_rule(p_ordinal integer, p_purpose text)
returns text language sql immutable set search_path = pg_catalog
as $$
  select case p_ordinal
    when 1 then '영문/숫자 조합의 내부 송장번호 규칙을 만족하는지 확인'
    when 6 then '상태 시각은 집하→이동→배달 순으로 같거나 늦어야 함'
    when 7 then '숫자를 추출해 국내 연락처 표준 형식으로 정리'
    when 12 then '실제 입고 수량 - 발주 수량의 차이를 계산'
    when 13 then '실제 출고 수량 - 주문 수량의 차이를 계산'
    when 14 then '기초재고 + 입고 - 출고로 잔여 재고를 계산'
    when 16 then '남은 일수에 따라 정상/임박/경과 기준 적용'
    when 19 then '이동 전 총수량과 이동 후 총수량의 차이를 계산'
    when 20 then '실사수량 - 장부수량의 차이를 계산'
    when 21 then '3자리 항공사 prefix + 8자리 일련번호 형식을 확인'
    when 23 then '도착 시각이 출발 시각보다 늦어야 함'
    when 24 then 'kg/lb 환산계수와 반올림 기준으로 계산'
    when 25 then '인보이스 포장 수 - 운송장 포장 수 차이를 계산'
    when 28 then '신고금액 - 인보이스 금액 차이를 계산'
    when 31 then '영문 4자 + 숫자 7자의 컨테이너 번호 형식을 확인'
    when 35 then 'VGM과 화물중량 차이율이 허용치 이내인지 판정'
    when 36 then '예정/실제 출항 시각 차이로 정시·지연·오류를 판정'
    when 38 then '설정온도 대비 기록온도 절대 편차가 허용치 이내인지 판정'
    when 39 then 'Packing List 수량 - B/L 수량 차이를 계산'
    when 40 then '사용일수가 무료 장치기간을 넘는지 판정'
    when 41 then '상품명 요소가 브랜드→모델→규격 순서인지 확인'
    when 52 then '정가 대비 판매가 할인율을 정수 퍼센트로 계산'
    when 53 then '판매가에서 적용 쿠폰액을 차감해 최종 가격 계산'
    when 54 then '묶음 총액을 구성 수량으로 나눠 개당 가격 계산'
    when 55 then '주문금액이 무료배송 기준 이상인지 판정'
    when 56 then '기준일이 프로모션 시작일~종료일 범위에 있는지 판정'
    when 57 then '이전 가격 대비 변동률이 허용치 이내인지 판정'
    when 58 then '선택 옵션 가격 - 기본 옵션 가격으로 추가금 계산'
    when 59 then '외화 금액 × 내부 기준환율로 원화 환산값 계산'
    when 60 then '자사 가격이 비교대상 최저가 이하인지 판정'
    when 62 then '배송 완료일부터 허용일 이내 신청인지 판정'
    when 63 then '상품가 - 배분 쿠폰 + 환불 가능 배송비로 환불액 계산'
    when 64 then '반품수량이 0 이상 주문수량 이하인지 판정'
    when 68 then '회수 송장에 완료 기준 이벤트가 존재하는지 판정'
    when 74 then '날짜를 YYYY-MM-DD 형식으로 정규화'
    when 75 then '주소 줄바꿈을 공백으로 합치고 연속 공백을 정리'
    when 90 then '사진 순서는 작업 전→작업 후여야 함'
    when 109 then 'AI 탐지 가격 편차율이 내부 허용치 이내인지 재검수'
    when 113 then '국가별 필수 주소 필드와 배치 규칙을 확인'
    when 114 then '국가코드와 전화번호 형식 조합을 확인'
    when 115 then '국가·통화 코드에 맞는 통화기호와 숫자 형식을 확인'
    when 116 then 'cm/inch 또는 kg/lb 기준 변환계수로 환산값 계산'
    when 117 then '국가별 지정 날짜 형식을 확인'
    else p_purpose
  end;
$$;

create or replace function private.putduk_catalog_component_options(p_ordinal integer, p_archetype text)
returns jsonb language sql immutable set search_path = pg_catalog
as $$
  select case p_ordinal
    when 5 then '[{"value":"door","label_ko":"문앞"},{"value":"guard","label_ko":"경비실"},{"value":"other","label_ko":"기타"}]'::jsonb
    when 9 then '[{"value":"undelivered","label_ko":"미배송"},{"value":"bad_address","label_ko":"주소불명"},{"value":"refused","label_ko":"수취거부"},{"value":"damage","label_ko":"파손"}]'::jsonb
    when 16 then '[{"value":"normal","label_ko":"정상"},{"value":"near","label_ko":"임박"},{"value":"expired","label_ko":"경과"}]'::jsonb
    when 36 then '[{"value":"on_time","label_ko":"정시"},{"value":"delayed","label_ko":"지연"},{"value":"invalid","label_ko":"일정 오류"}]'::jsonb
    when 40 then '[{"value":"within","label_ko":"무료기간 내"},{"value":"over","label_ko":"초과"}]'::jsonb
    when 46 then '[{"value":"electronics","label_ko":"전자기기"},{"value":"living","label_ko":"생활용품"},{"value":"fashion","label_ko":"패션"}]'::jsonb
    when 56 then '[{"value":"active","label_ko":"노출 가능"},{"value":"before","label_ko":"시작 전"},{"value":"ended","label_ko":"종료"}]'::jsonb
    when 61 then '[{"value":"defect","label_ko":"상품불량"},{"value":"change_mind","label_ko":"단순변심"},{"value":"wrong_item","label_ko":"오배송"},{"value":"size","label_ko":"사이즈"}]'::jsonb
    when 62 then '[{"value":"eligible","label_ko":"반품 가능"},{"value":"expired","label_ko":"기간 초과"}]'::jsonb
    when 68 then '[{"value":"completed","label_ko":"회수 완료"},{"value":"moving","label_ko":"회수 중"},{"value":"not_started","label_ko":"미회수"}]'::jsonb
    when 70 then '[{"value":"seller","label_ko":"판매자"},{"value":"buyer","label_ko":"구매자"},{"value":"carrier","label_ko":"배송사"}]'::jsonb
    when 86 then '[{"value":"allowed","label_ko":"일반"},{"value":"restricted","label_ko":"제한"},{"value":"review","label_ko":"운영검토"}]'::jsonb
    when 91 then '[{"value":"tracking","label_ko":"배송조회"},{"value":"delay","label_ko":"배송지연"},{"value":"lost","label_ko":"분실"},{"value":"address","label_ko":"주소변경"}]'::jsonb
    when 92 then '[{"value":"status","label_ko":"환불상태"},{"value":"amount","label_ko":"환불금액"},{"value":"method","label_ko":"환불수단"},{"value":"cancel","label_ko":"환불취소"}]'::jsonb
    when 93 then '[{"value":"size","label_ko":"사이즈"},{"value":"stock","label_ko":"재고"},{"value":"compat","label_ko":"호환성"},{"value":"usage","label_ko":"사용법"}]'::jsonb
    when 99 then '[{"value":"normal","label_ko":"일반"},{"value":"complaint","label_ko":"불만"},{"value":"strong","label_ko":"강한 불만"}]'::jsonb
    when 100 then '[{"value":"delivery","label_ko":"배송"},{"value":"product","label_ko":"상품"},{"value":"payment","label_ko":"결제"},{"value":"return","label_ko":"반품"}]'::jsonb
    else case p_archetype
      when 'format_check' then '[{"value":"valid","label_ko":"형식 정상"},{"value":"invalid","label_ko":"형식 오류"}]'::jsonb
      when 'pair_match' then '[{"value":"match","label_ko":"일치"},{"value":"mismatch","label_ko":"불일치"}]'::jsonb
      when 'missing_field' then '[{"value":"complete","label_ko":"누락 없음"},{"value":"missing","label_ko":"누락 있음"}]'::jsonb
      when 'quality_class' then '[{"value":"pass","label_ko":"사용 가능"},{"value":"review","label_ko":"재확인 필요"},{"value":"fail","label_ko":"사용 불가"}]'::jsonb
      when 'category_class' then '[{"value":"class_a","label_ko":"유형 A"},{"value":"class_b","label_ko":"유형 B"},{"value":"class_c","label_ko":"유형 C"}]'::jsonb
      when 'sequence_check' then '[{"value":"normal","label_ko":"순서 정상"},{"value":"error","label_ko":"순서 오류"}]'::jsonb
      when 'duplicate_check' then '[{"value":"duplicate","label_ko":"중복"},{"value":"distinct","label_ko":"별개"}]'::jsonb
      when 'link_match' then '[{"value":"connected","label_ko":"연결 가능"},{"value":"not_connected","label_ko":"연결 불가"}]'::jsonb
      when 'date_status' then '[{"value":"within","label_ko":"기간 내"},{"value":"near","label_ko":"임박"},{"value":"expired","label_ko":"기간 초과"}]'::jsonb
      when 'numeric_range' then '[{"value":"within","label_ko":"기준 충족"},{"value":"outside","label_ko":"기준 이탈"}]'::jsonb
      when 'evidence_sufficient' then '[{"value":"sufficient","label_ko":"증빙 충분"},{"value":"insufficient","label_ko":"증빙 부족"}]'::jsonb
      when 'select_best' then '[{"value":"a","label_ko":"후보 A"},{"value":"b","label_ko":"후보 B"},{"value":"c","label_ko":"후보 C"}]'::jsonb
      when 'restricted_terms' then '[{"value":"clear","label_ko":"문제 없음"},{"value":"restricted","label_ko":"제한 표현 있음"}]'::jsonb
      when 'translation_match' then '[{"value":"match","label_ko":"의미 일치"},{"value":"missing","label_ko":"의미 누락"}]'::jsonb
      else '[]'::jsonb
    end
  end;
$$;

create or replace function private.putduk_catalog_output_type(p_ordinal integer, p_archetype text)
returns text
language plpgsql immutable set search_path = pg_catalog, private
as $$
declare
  v_type text := private.putduk_catalog_component_type(p_archetype);
  v_options jsonb;
  v_values text;
begin
  if v_type <> 'choice' then return v_type; end if;
  v_options := private.putduk_catalog_component_options(p_ordinal, p_archetype);
  select string_agg(value ->> 'value', '|' order by ordinality)
    into v_values
  from jsonb_array_elements(v_options) with ordinality;
  return 'choice:' || coalesce(v_values, '');
end;
$$;

create or replace function private.putduk_catalog_estimated_seconds(p_ordinal integer, p_archetype text)
returns integer language sql immutable set search_path = pg_catalog
as $$
  select (case
    when p_archetype in ('format_check','pair_match','boolean_presence') then 120
    when p_archetype in ('missing_field','quality_class','category_class','sequence_check','normalize_text','link_match','quantity_delta','date_status','numeric_range') then 300
    when p_archetype in ('duplicate_check','calculate_value','unit_conversion','evidence_sufficient','select_best','restricted_terms') then 480
    else 660
  end) + p_ordinal;
$$;

revoke all on function private.putduk_catalog_component_type(text) from public, anon, authenticated;
revoke all on function private.putduk_catalog_input_kind(text) from public, anon, authenticated;
revoke all on function private.putduk_catalog_evidence_policy(text) from public, anon, authenticated;
revoke all on function private.putduk_catalog_review_mode(text) from public, anon, authenticated;
revoke all on function private.putduk_catalog_validation_rule(integer,text) from public, anon, authenticated;
revoke all on function private.putduk_catalog_component_options(integer,text) from public, anon, authenticated;
revoke all on function private.putduk_catalog_output_type(integer,text) from public, anon, authenticated;
revoke all on function private.putduk_catalog_estimated_seconds(integer,text) from public, anon, authenticated;
grant execute on function private.putduk_catalog_component_type(text) to service_role;
grant execute on function private.putduk_catalog_input_kind(text) to service_role;
grant execute on function private.putduk_catalog_evidence_policy(text) to service_role;
grant execute on function private.putduk_catalog_review_mode(text) to service_role;
grant execute on function private.putduk_catalog_validation_rule(integer,text) to service_role;
grant execute on function private.putduk_catalog_component_options(integer,text) to service_role;
grant execute on function private.putduk_catalog_output_type(integer,text) to service_role;
grant execute on function private.putduk_catalog_estimated_seconds(integer,text) to service_role;

commit;

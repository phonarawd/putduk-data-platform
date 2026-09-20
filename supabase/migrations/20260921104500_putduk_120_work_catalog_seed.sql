-- Stage 4: seed MASTER 120 distinct tasks into the generic work engine.
-- Depends on the Stage 4 catalog foundation migration. All nodes stay draft/disabled.

begin;

create temporary table putduk_stage4_baseline as
select
  (select count(*) from public.nodes where public_id !~ '^PDK-CATALOG-[0-9]{3}$' and catalog_status='published' and enabled=true) as published_enabled_nodes,
  (select count(*) from public.partner_brands where slug <> 'putduk-internal-catalog') as external_brands;

create temporary table putduk_catalog_120 (
  ordinal integer primary key,
  title_ko text not null unique,
  purpose_ko text not null,
  archetype text not null
) on commit drop;

insert into putduk_catalog_120 values
(1,'택배 송장번호 형식 확인','송장번호 자릿수와 문자 규칙을 검수한다.','format_check'),
(2,'배송지 우편번호 일치 확인','주소와 우편번호가 맞는지 대조한다.','pair_match'),
(3,'주소 동·호수 누락 찾기','배송주소에서 동·호수 누락 여부를 표시한다.','missing_field'),
(4,'배송완료 사진 품질 확인','흐림·가림·오배송 징후를 판정한다.','quality_class'),
(5,'문앞·경비실 배송 위치 분류','메모와 사진으로 실제 전달 위치를 분류한다.','category_class'),
(6,'배송상태 순서 오류 찾기','집하→이동→배달 시간 순서 이상을 찾는다.','sequence_check'),
(7,'수취인 연락처 형식 정리','전화번호를 국내 표준 형식으로 정리한다.','normalize_text'),
(8,'배송지 중복 주문 찾기','주문번호·주소·수취인을 비교해 중복 후보를 판정한다.','duplicate_check'),
(9,'배송 예외 사유 분류','미배송·주소불명·수취거부·파손 등을 구분한다.','category_class'),
(10,'반품 송장 원주문 연결','반품 송장을 원주문 번호와 매칭한다.','link_match'),
(11,'창고 로케이션 코드 대조','지정 로케이션과 스캔 위치를 비교한다.','pair_match'),
(12,'입고 수량 차이 확인','발주 수량과 실제 입고 수량 차이를 확인한다.','quantity_delta'),
(13,'출고 수량 차이 확인','피킹 수량과 주문 수량 불일치를 판정한다.','quantity_delta'),
(14,'재고 음수 이상 찾기','기초·입고·출고 수치에서 이상 재고를 찾는다.','calculate_value'),
(15,'바코드 상품 일치 확인','바코드와 상품명·규격이 같은지 대조한다.','pair_match'),
(16,'유통기한 임박 분류','정상·임박·경과 상태로 분류한다.','date_status'),
(17,'파렛트 적재 라벨 확인','파렛트 라벨과 포함 SKU 목록을 비교한다.','pair_match'),
(18,'피킹 순서 검토','창고 위치 기준 피킹 순서가 적절한지 판정한다.','sequence_check'),
(19,'재고 이동 전후 대조','이동 전후 위치와 수량 보존 여부를 확인한다.','quantity_delta'),
(20,'사이클카운트 차이 기록','장부수량과 실사수량 차이를 기록·분류한다.','quantity_delta'),
(21,'항공운송장 번호 확인','항공운송장 번호 형식을 검수한다.','format_check'),
(22,'출발·도착 공항 코드 대조','공항 코드와 도시 정보를 비교한다.','pair_match'),
(23,'항공편 일자 이상 확인','출발일·도착일 순서와 누락을 확인한다.','sequence_check'),
(24,'화물 중량 단위 확인','kg/lb 단위와 환산값 이상을 판정한다.','unit_conversion'),
(25,'포장 개수 문서 대조','운송장과 인보이스의 포장 수를 비교한다.','quantity_delta'),
(26,'통관 품목명 정리','품목명을 지정된 분류명으로 정리한다.','normalize_text'),
(27,'HS 코드 후보 대조','품목 설명과 코드 후보의 적합성을 판단한다.','pair_match'),
(28,'신고금액 문서 대조','인보이스와 신고 자료 금액을 비교한다.','quantity_delta'),
(29,'위험물 표시 확인','라벨과 설명에서 위험물 표기 누락을 판정한다.','missing_field'),
(30,'통관 서류 누락 확인','필수 서류 목록에서 빠진 문서를 체크한다.','missing_field'),
(31,'컨테이너 번호 형식 확인','컨테이너 번호 규칙을 검수한다.','format_check'),
(32,'선하증권 번호 대조','관련 문서의 B/L 번호를 비교한다.','pair_match'),
(33,'선적항·양하항 대조','항구 코드와 운송 경로를 확인한다.','pair_match'),
(34,'컨테이너 봉인번호 대조','사진과 문서의 Seal 번호를 비교한다.','pair_match'),
(35,'VGM 중량 이상 확인','신고 VGM과 화물중량 차이를 판정한다.','numeric_range'),
(36,'선박 출항 일정 확인','예정·실제 출항 시간으로 지연을 분류한다.','date_status'),
(37,'컨테이너 상태 사진 분류','정상·찌그러짐·녹·파손 상태를 판정한다.','quality_class'),
(38,'냉동 컨테이너 온도 확인','설정온도와 기록온도 차이를 확인한다.','numeric_range'),
(39,'선적 문서 수량 대조','Packing List와 B/L 수량을 비교한다.','quantity_delta'),
(40,'무료 장치기간 초과 확인','반출입 일자를 기준으로 초과 여부를 판정한다.','date_status'),
(41,'상품명 규칙 검수','브랜드·모델·규격 순서가 맞는지 확인한다.','sequence_check'),
(42,'브랜드명 표준화','여러 브랜드 표기를 표준명으로 정리한다.','normalize_text'),
(43,'모델번호 대조','상품 페이지와 제조사 모델번호를 비교한다.','pair_match'),
(44,'색상 옵션 표준화','다양한 색상 표현을 지정 옵션명으로 정리한다.','normalize_text'),
(45,'사이즈 옵션 표준화','사이즈 표현을 공통 규격으로 정리한다.','normalize_text'),
(46,'상품 카테고리 분류','상품 정보를 보고 가장 맞는 분류를 선택한다.','category_class'),
(47,'중복 상품 후보 판정','이미지·모델·옵션을 비교해 중복 여부를 판단한다.','duplicate_check'),
(48,'대표 이미지 적합성 확인','상품·배경·비율 기준 충족 여부를 판정한다.','quality_class'),
(49,'필수 속성 누락 찾기','카테고리별 필수 속성 누락을 찾는다.','missing_field'),
(50,'상품 설명 금칙어 확인','설명에서 금지 표현·오정보를 찾는다.','restricted_terms'),
(51,'판매가·정가 관계 확인','판매가와 정가 관계의 이상을 판정한다.','numeric_range'),
(52,'할인율 계산 검수','정가·판매가 계산값과 표시 할인율을 비교한다.','calculate_value'),
(53,'쿠폰 적용가 확인','쿠폰 조건을 적용한 최종 가격을 계산한다.','calculate_value'),
(54,'묶음상품 단가 확인','총액과 수량으로 개당 가격을 검수한다.','calculate_value'),
(55,'배송비 조건 확인','무료배송 기준과 주문금액을 비교한다.','numeric_range'),
(56,'프로모션 기간 확인','시작·종료일과 현재 노출 상태를 확인한다.','date_status'),
(57,'가격 급변 이상 찾기','이전 가격과 현재 가격 변동 이상을 판단한다.','numeric_range'),
(58,'옵션별 추가금 확인','옵션 선택에 따른 추가금 오류를 찾는다.','calculate_value'),
(59,'통화 환산 가격 확인','기준 환율로 원화 환산값을 검수한다.','unit_conversion'),
(60,'최저가 배지 조건 확인','비교 가격으로 최저가 표시 가능 여부를 판단한다.','numeric_range'),
(61,'반품 사유 표준 분류','자유입력 반품 사유를 표준 사유로 분류한다.','category_class'),
(62,'반품 가능기간 확인','구매일·배송일·신청일로 가능기간을 판정한다.','date_status'),
(63,'환불 금액 계산 확인','상품가·쿠폰·배송비를 반영한 환불액을 검수한다.','calculate_value'),
(64,'부분 반품 수량 확인','주문수량과 반품수량 범위 오류를 찾는다.','numeric_range'),
(65,'교환 옵션 매칭','기존 옵션과 요청 옵션의 교환 가능 여부를 확인한다.','pair_match'),
(66,'파손 증빙 사진 확인','판정에 필요한 파손 정보가 사진에 있는지 확인한다.','evidence_sufficient'),
(67,'오배송 증빙 대조','주문 상품과 수령 사진을 비교한다.','pair_match'),
(68,'회수 완료 상태 확인','회수 송장과 물류 상태로 완료 여부를 판단한다.','date_status'),
(69,'환불 중복 요청 찾기','동일 주문의 중복 환불 요청을 찾는다.','duplicate_check'),
(70,'반품비 부담 주체 분류','반품 사유에 따라 부담 주체를 분류한다.','category_class'),
(71,'영수증 금액 OCR 대조','이미지 금액과 추출 결과를 비교해 수정한다.','pair_match'),
(72,'사업자번호 OCR 대조','사업자등록번호 이미지와 추출값을 비교한다.','pair_match'),
(73,'계좌번호 OCR 대조','문서 계좌번호와 추출값을 확인한다.','pair_match'),
(74,'날짜 OCR 정규화','다양한 날짜 표기를 표준 날짜로 정리한다.','normalize_text'),
(75,'주소 OCR 줄 합치기','여러 줄 주소 결과를 정상 주소로 정리한다.','normalize_text'),
(76,'송장 품목 OCR 대조','송장 이미지의 품목명과 추출 결과를 비교한다.','pair_match'),
(77,'수량 OCR 대조','문서 수량과 추출 숫자를 비교한다.','pair_match'),
(78,'문서 페이지 방향 확인','회전·뒤집힘·잘림 여부를 판정한다.','quality_class'),
(79,'서명·도장 존재 확인','지정 위치의 서명/도장 유무를 확인한다.','boolean_presence'),
(80,'문서 중복 페이지 찾기','페이지들을 비교해 중복 페이지를 찾는다.','duplicate_check'),
(81,'상품 이미지 배경 확인','배경 기준 위반 여부를 판정한다.','quality_class'),
(82,'이미지 흐림 여부 판정','초점 상태로 사용 가능 여부를 결정한다.','quality_class'),
(83,'이미지 잘림 여부 판정','상품 핵심 부분의 잘림 여부를 확인한다.','quality_class'),
(84,'워터마크 존재 확인','외부 워터마크 유무를 확인한다.','boolean_presence'),
(85,'이미지-상품명 일치 확인','이미지 내용과 상품명을 대조한다.','pair_match'),
(86,'제한 콘텐츠 이미지 분류','운영 기준상 제한 대상인지 분류한다.','category_class'),
(87,'문자 가독성 판정','이미지 속 라벨·문구 가독성을 판단한다.','quality_class'),
(88,'색상 대표성 확인','대표 이미지 색상과 선택 옵션을 비교한다.','pair_match'),
(89,'대표컷 선택','여러 사진 중 대표 이미지로 적합한 한 장을 고른다.','select_best'),
(90,'작업 전후 사진 순서 확인','전·후 이미지 순서가 맞는지 판정한다.','sequence_check'),
(91,'배송 문의 유형 분류','조회·지연·분실 등으로 분류한다.','category_class'),
(92,'환불 문의 유형 분류','환불 관련 문의를 표준 유형으로 나눈다.','category_class'),
(93,'상품 문의 유형 분류','사이즈·재고·호환성·사용법 등으로 분류한다.','category_class'),
(94,'긴급 문의 표시','즉시 대응이 필요한 문의인지 판정한다.','boolean_presence'),
(95,'중복 문의 묶기','같은 고객의 유사 문의를 묶을지 판단한다.','duplicate_check'),
(96,'문의 핵심문장 선택','긴 문의에서 처리에 필요한 문장을 선택한다.','select_best'),
(97,'답변 유형 후보 선택','문의 유형에 맞는 답변 유형을 고른다.','select_best'),
(98,'개인정보 포함 여부 확인','노출되면 안 되는 개인정보가 있는지 판정한다.','boolean_presence'),
(99,'감정 강도 분류','일반·불만·강한 불만으로 분류한다.','category_class'),
(100,'처리 담당 분류','배송·상품·결제·반품 담당으로 분류한다.','category_class'),
(101,'AI 상품 카테고리 결과 검수','자동 분류값과 상품 정보를 비교한다.','pair_match'),
(102,'AI 상품명 정리 결과 검수','자동 정리 결과가 원문을 훼손했는지 확인한다.','pair_match'),
(103,'AI OCR 결과 검수','자동 추출값과 원본 문서를 비교한다.','pair_match'),
(104,'AI 주소 정규화 결과 검수','정리된 주소의 누락·오류를 확인한다.','pair_match'),
(105,'AI 문의 분류 결과 검수','자동 문의 분류의 적합성을 판정한다.','pair_match'),
(106,'AI 번역 결과 검수','원문과 번역문 의미 누락을 확인한다.','translation_match'),
(107,'AI 이미지 태그 결과 검수','이미지와 자동 태그를 비교한다.','pair_match'),
(108,'AI 중복상품 판정 검수','중복 후보가 실제 같은 상품인지 판단한다.','duplicate_check'),
(109,'AI 이상가격 탐지 검수','자동 탐지된 가격 이상이 실제 오류인지 확인한다.','numeric_range'),
(110,'AI 배송예외 분류 검수','자동 분류된 배송예외 사유를 최종 확인한다.','pair_match'),
(111,'영문 상품명 한글 표기 검수','브랜드·모델을 보존한 한글 표기를 확인한다.','normalize_text'),
(112,'한글 상품명 영문 표기 검수','자연스러운 영문 표기를 검수한다.','normalize_text'),
(113,'국가별 주소 형식 확인','국가에 맞는 주소 필드 배치를 확인한다.','format_check'),
(114,'국가코드·전화번호 대조','국가코드와 전화번호 형식을 비교한다.','pair_match'),
(115,'통화기호 표기 확인','국가·통화에 맞는 기호와 숫자 형식을 확인한다.','format_check'),
(116,'단위 변환 결과 확인','cm/inch, kg/lb 변환 결과를 검수한다.','unit_conversion'),
(117,'현지 날짜 형식 확인','국가별 날짜 표기 오류를 찾는다.','format_check'),
(118,'현지 금칙 표현 검수','현지 언어의 부적절·금지 표현을 판정한다.','restricted_terms'),
(119,'번역 누락 문장 찾기','원문 대비 빠진 번역 문장을 체크한다.','missing_field'),
(120,'다국어 옵션명 일치 확인','한국어·영어 옵션명이 같은 의미인지 대조한다.','pair_match');

do $$
begin
  if (select count(*) from putduk_catalog_120) <> 120 then raise exception 'Stage 4 catalog must contain 120 tasks'; end if;
  if exists (
    select 1 from generate_series(0,11) g
    where (select count(*) from putduk_catalog_120 c where c.ordinal between g*10+1 and g*10+10) <> 10
  ) then raise exception 'Each MASTER category must contain 10 tasks'; end if;
end;
$$;

insert into public.nodes (
  public_id,partner_brand_id,title_ko,description_ko,node_family,difficulty,estimated_seconds,
  reward_min,reward_max,daily_capacity,enabled,motion_profile,motion_version,supply_source,catalog_status,
  allowed_tiers,scene_theme,stake_krw,stipend_krw,tier_band,partner_slug,question_prompt_ko,daily_cap,requires_assign,is_trial
)
select
  'PDK-CATALOG-'||lpad(c.ordinal::text,3,'0'),
  b.id,c.title_ko,c.purpose_ko,
  (array['택배·배송 운영','창고·재고 운영','항공·통관','해상·컨테이너','상품 카탈로그','가격·프로모션','반품·환불','문서·OCR','이미지·콘텐츠 품질','고객문의 데이터','AI 결과 검수','글로벌·현지화'])[ceil(c.ordinal/10.0)::integer],
  case when (3000+c.ordinal*500)*10 < 300000 then '기초 처리' when (3000+c.ordinal*500)*10 < 1000000 then '표준 처리' else '정밀 검수' end,
  private.putduk_catalog_estimated_seconds(c.ordinal,c.archetype),
  3000+c.ordinal*500,3000+c.ordinal*500,0,false,
  case ceil(c.ordinal/10.0)::integer when 1 then 'road_logistics' when 2 then 'warehouse_edge' when 3 then 'air_cargo' when 4 then 'ocean_vessel' when 5 then 'commerce_catalog' when 6 then 'commerce_catalog' when 7 then 'commerce_catalog' else 'default' end,
  '2.0.0','operator','draft','{}'::text[],'catalog-'||lpad(c.ordinal::text,3,'0'),
  (3000+c.ordinal*500)*10,3000+c.ordinal*500,
  case when (3000+c.ordinal*500)*10 < 300000 then '소액' when (3000+c.ordinal*500)*10 < 1000000 then '중간' else '고액' end,
  b.slug,c.purpose_ko,0,c.ordinal>=111,false
from putduk_catalog_120 c
cross join lateral (select id,slug from public.partner_brands where slug='putduk-internal-catalog' limit 1) b
on conflict (public_id) do update
set partner_brand_id=excluded.partner_brand_id,title_ko=excluded.title_ko,description_ko=excluded.description_ko,
    node_family=excluded.node_family,difficulty=excluded.difficulty,estimated_seconds=excluded.estimated_seconds,
    reward_min=excluded.reward_min,reward_max=excluded.reward_max,daily_capacity=0,enabled=false,
    motion_profile=excluded.motion_profile,motion_version=excluded.motion_version,catalog_status='draft',
    allowed_tiers='{}'::text[],scene_theme=excluded.scene_theme,stake_krw=excluded.stake_krw,
    stipend_krw=excluded.stipend_krw,tier_band=excluded.tier_band,partner_slug=excluded.partner_slug,
    question_prompt_ko=excluded.question_prompt_ko,daily_cap=0,requires_assign=excluded.requires_assign,updated_at=now();

insert into private.work_templates (template_key,title_ko,purpose_ko,status)
select 'catalog_'||lpad(ordinal::text,3,'0'),title_ko,purpose_ko,'published'
from putduk_catalog_120
on conflict (template_key) do update
set title_ko=excluded.title_ko,purpose_ko=excluded.purpose_ko,status='published',updated_at=now();

insert into private.work_template_versions (work_template_id,version,schema_version,definition,status,published_at)
select
  t.id,1,'putduk.work/1.0',
  jsonb_build_object(
    'schema_version','putduk.work/1.0',
    'template_key',t.template_key,
    'template_version',1,
    'title_ko',c.title_ko,
    'purpose_ko',c.purpose_ko,
    'components',jsonb_build_array(
      jsonb_build_object(
        'key','answer',
        'type',private.putduk_catalog_component_type(c.archetype),
        'label_ko',c.title_ko||' 결과',
        'required',true,
        'validation',jsonb_build_object('mode','equals_expected','rule',private.putduk_catalog_validation_rule(c.ordinal,c.purpose_ko)),
        'evidence',jsonb_build_object('capture','value','type',private.putduk_catalog_evidence_policy(c.archetype),'policy_key',private.putduk_catalog_evidence_policy(c.archetype))
      ) ||
      case
        when private.putduk_catalog_component_type(c.archetype)='choice' then jsonb_build_object('options',private.putduk_catalog_component_options(c.ordinal,c.archetype))
        when private.putduk_catalog_component_type(c.archetype)='text' then '{"min_length":1,"max_length":200}'::jsonb
        when private.putduk_catalog_component_type(c.archetype)='integer' then '{"min":-1000000000,"max":1000000000}'::jsonb
        else '{}'::jsonb
      end
    ),
    'workflow',jsonb_build_object('mode','linear','profile','linear.items.answer.'||c.archetype,'steps',jsonb_build_array(jsonb_build_object('key','work','title_ko',c.title_ko,'repeat','items','component_keys',jsonb_build_array('answer')))),
    'evidence',jsonb_build_object('model','answer_snapshot.v1','retain_with_submission',true,'policy_key',private.putduk_catalog_evidence_policy(c.archetype)),
    'submission',jsonb_build_object('contract','putduk.work_submission/1.0','mode','all_required_valid'),
    'review',jsonb_build_object('contract','putduk.review/1.0','mode',private.putduk_catalog_review_mode(c.archetype),'policy_key',private.putduk_catalog_review_mode(c.archetype)||'.'||c.archetype||'.v1','validation_rule',private.putduk_catalog_validation_rule(c.ordinal,c.purpose_ko),'decisions',jsonb_build_array('approved','rework','rejected')),
    'settlement',jsonb_build_object('contract','putduk.stake_stipend/1.0','trigger','review_approved','release_stake',true,'post_stipend',true),
    'catalog_meta',jsonb_build_object(
      'catalog_schema','putduk.catalog/1.0','ordinal',c.ordinal,
      'category_code',substring('ABCDEFGHIJKL' from ceil(c.ordinal/10.0)::integer for 1),
      'category_name',(array['택배·배송 운영','창고·재고 운영','항공·통관','해상·컨테이너','상품 카탈로그','가격·프로모션','반품·환불','문서·OCR','이미지·콘텐츠 품질','고객문의 데이터','AI 결과 검수','글로벌·현지화'])[ceil(c.ordinal/10.0)::integer],
      'archetype',c.archetype,'input_kind',private.putduk_catalog_input_kind(c.archetype),
      'output_type',private.putduk_catalog_output_type(c.ordinal,c.archetype),
      'validation_rule',private.putduk_catalog_validation_rule(c.ordinal,c.purpose_ko),
      'evidence_policy_key',private.putduk_catalog_evidence_policy(c.archetype),
      'review_policy_key',private.putduk_catalog_review_mode(c.archetype)||'.'||c.archetype||'.v1',
      'workflow_profile','linear.items.answer.'||c.archetype,
      'estimated_seconds',private.putduk_catalog_estimated_seconds(c.ordinal,c.archetype),
      'stake_krw',(3000+c.ordinal*500)*10,'reward_krw',3000+c.ordinal*500,'publication_state','draft'
    )
  ),
  'published',now()
from putduk_catalog_120 c
join private.work_templates t on t.template_key='catalog_'||lpad(c.ordinal::text,3,'0')
on conflict (work_template_id,version) do update
set schema_version=excluded.schema_version,definition=excluded.definition,status=excluded.status,
    published_at=coalesce(private.work_template_versions.published_at,excluded.published_at);

insert into private.work_orders (
  order_key,node_id,work_template_version_id,source_mode,input_payload,validation_payload,status
)
select
  'catalog120:'||lpad(c.ordinal::text,3,'0'),n.id,v.id,'static',
  jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
    'item_key','case-1','step_key','work','payload',f.fixture->'member',
    'evidence_policy',jsonb_build_object('answer',jsonb_build_object('capture','value','type',private.putduk_catalog_evidence_policy(c.archetype),'policy_key',private.putduk_catalog_evidence_policy(c.archetype)))
  ))),
  jsonb_build_object('items',jsonb_build_array(jsonb_build_object('item_key','case-1','expected',f.fixture->'expected'))),
  'active'
from putduk_catalog_120 c
join public.nodes n on n.public_id='PDK-CATALOG-'||lpad(c.ordinal::text,3,'0')
join private.work_templates t on t.template_key='catalog_'||lpad(c.ordinal::text,3,'0')
join private.work_template_versions v on v.work_template_id=t.id and v.version=1
cross join lateral (select private.putduk_catalog_fixture(c.ordinal,c.title_ko,c.purpose_ko,c.archetype) fixture) f
on conflict (order_key) do update
set node_id=excluded.node_id,work_template_version_id=excluded.work_template_version_id,source_mode='static',
    input_payload=excluded.input_payload,validation_payload=excluded.validation_payload,status='active',updated_at=now();

do $$
declare
  v_templates integer; v_versions integer; v_nodes integer; v_orders integer; v_fp integer;
  v_before_nodes bigint; v_after_nodes bigint; v_before_brands bigint; v_after_brands bigint;
begin
  select published_enabled_nodes,external_brands into v_before_nodes,v_before_brands from putduk_stage4_baseline;
  select count(*) into v_after_nodes from public.nodes where public_id !~ '^PDK-CATALOG-[0-9]{3}$' and catalog_status='published' and enabled=true;
  select count(*) into v_after_brands from public.partner_brands where slug <> 'putduk-internal-catalog';
  select count(*) into v_templates from private.work_templates where template_key ~ '^catalog_[0-9]{3}$';
  select count(*) into v_versions from private.work_template_versions v join private.work_templates t on t.id=v.work_template_id where t.template_key ~ '^catalog_[0-9]{3}$' and v.version=1 and v.status='published';
  select count(*) into v_nodes from public.nodes where public_id ~ '^PDK-CATALOG-[0-9]{3}$' and catalog_status='draft' and enabled=false;
  select count(*) into v_orders from private.work_orders where order_key ~ '^catalog120:[0-9]{3}$' and status='active';
  select count(distinct v.semantic_fingerprint) into v_fp from private.work_template_versions v join private.work_templates t on t.id=v.work_template_id where t.template_key ~ '^catalog_[0-9]{3}$' and v.version=1;

  if v_templates<>120 or v_versions<>120 or v_nodes<>120 or v_orders<>120 or v_fp<>120 then
    raise exception 'Stage 4 invariant failed templates %, versions %, nodes %, orders %, fingerprints %',v_templates,v_versions,v_nodes,v_orders,v_fp;
  end if;
  if v_before_nodes<>v_after_nodes or v_before_brands<>v_after_brands then
    raise exception 'Stage 4 changed non-catalog production rows';
  end if;
  if exists (select 1 from public.partner_brands where slug='putduk-internal-catalog' and published=true) then
    raise exception 'Internal catalog source must remain unpublished';
  end if;
end;
$$;

commit;

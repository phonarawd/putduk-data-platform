// MASTER 120개 업무의 public-safe catalog metadata.
// 합성 fixture/expected answer는 서버 migration에만 둔다.
export const CATALOG_120_SCHEMA = 'putduk.catalog/1.0';

const TASK_ROWS = [["택배 송장번호 형식 확인","송장번호 자릿수와 문자 규칙을 검수한다.","format_check"],["배송지 우편번호 일치 확인","주소와 우편번호가 맞는지 대조한다.","pair_match"],["주소 동·호수 누락 찾기","배송주소에서 동·호수 누락 여부를 표시한다.","missing_field"],["배송완료 사진 품질 확인","흐림·가림·오배송 징후를 판정한다.","quality_class"],["문앞·경비실 배송 위치 분류","메모와 사진으로 실제 전달 위치를 분류한다.","category_class"],["배송상태 순서 오류 찾기","집하→이동→배달 시간 순서 이상을 찾는다.","sequence_check"],["수취인 연락처 형식 정리","전화번호를 국내 표준 형식으로 정리한다.","normalize_text"],["배송지 중복 주문 찾기","주문번호·주소·수취인을 비교해 중복 후보를 판정한다.","duplicate_check"],["배송 예외 사유 분류","미배송·주소불명·수취거부·파손 등을 구분한다.","category_class"],["반품 송장 원주문 연결","반품 송장을 원주문 번호와 매칭한다.","link_match"],["창고 로케이션 코드 대조","지정 로케이션과 스캔 위치를 비교한다.","pair_match"],["입고 수량 차이 확인","발주 수량과 실제 입고 수량 차이를 확인한다.","quantity_delta"],["출고 수량 차이 확인","피킹 수량과 주문 수량 불일치를 판정한다.","quantity_delta"],["재고 음수 이상 찾기","기초·입고·출고 수치에서 이상 재고를 찾는다.","calculate_value"],["바코드 상품 일치 확인","바코드와 상품명·규격이 같은지 대조한다.","pair_match"],["유통기한 임박 분류","정상·임박·경과 상태로 분류한다.","date_status"],["파렛트 적재 라벨 확인","파렛트 라벨과 포함 SKU 목록을 비교한다.","pair_match"],["피킹 순서 검토","창고 위치 기준 피킹 순서가 적절한지 판정한다.","sequence_check"],["재고 이동 전후 대조","이동 전후 위치와 수량 보존 여부를 확인한다.","quantity_delta"],["사이클카운트 차이 기록","장부수량과 실사수량 차이를 기록·분류한다.","quantity_delta"],["항공운송장 번호 확인","항공운송장 번호 형식을 검수한다.","format_check"],["출발·도착 공항 코드 대조","공항 코드와 도시 정보를 비교한다.","pair_match"],["항공편 일자 이상 확인","출발일·도착일 순서와 누락을 확인한다.","sequence_check"],["화물 중량 단위 확인","kg/lb 단위와 환산값 이상을 판정한다.","unit_conversion"],["포장 개수 문서 대조","운송장과 인보이스의 포장 수를 비교한다.","quantity_delta"],["통관 품목명 정리","품목명을 지정된 분류명으로 정리한다.","normalize_text"],["HS 코드 후보 대조","품목 설명과 코드 후보의 적합성을 판단한다.","pair_match"],["신고금액 문서 대조","인보이스와 신고 자료 금액을 비교한다.","quantity_delta"],["위험물 표시 확인","라벨과 설명에서 위험물 표기 누락을 판정한다.","missing_field"],["통관 서류 누락 확인","필수 서류 목록에서 빠진 문서를 체크한다.","missing_field"],["컨테이너 번호 형식 확인","컨테이너 번호 규칙을 검수한다.","format_check"],["선하증권 번호 대조","관련 문서의 B/L 번호를 비교한다.","pair_match"],["선적항·양하항 대조","항구 코드와 운송 경로를 확인한다.","pair_match"],["컨테이너 봉인번호 대조","사진과 문서의 Seal 번호를 비교한다.","pair_match"],["VGM 중량 이상 확인","신고 VGM과 화물중량 차이를 판정한다.","numeric_range"],["선박 출항 일정 확인","예정·실제 출항 시간으로 지연을 분류한다.","date_status"],["컨테이너 상태 사진 분류","정상·찌그러짐·녹·파손 상태를 판정한다.","quality_class"],["냉동 컨테이너 온도 확인","설정온도와 기록온도 차이를 확인한다.","numeric_range"],["선적 문서 수량 대조","Packing List와 B/L 수량을 비교한다.","quantity_delta"],["무료 장치기간 초과 확인","반출입 일자를 기준으로 초과 여부를 판정한다.","date_status"],["상품명 규칙 검수","브랜드·모델·규격 순서가 맞는지 확인한다.","sequence_check"],["브랜드명 표준화","여러 브랜드 표기를 표준명으로 정리한다.","normalize_text"],["모델번호 대조","상품 페이지와 제조사 모델번호를 비교한다.","pair_match"],["색상 옵션 표준화","다양한 색상 표현을 지정 옵션명으로 정리한다.","normalize_text"],["사이즈 옵션 표준화","사이즈 표현을 공통 규격으로 정리한다.","normalize_text"],["상품 카테고리 분류","상품 정보를 보고 가장 맞는 분류를 선택한다.","category_class"],["중복 상품 후보 판정","이미지·모델·옵션을 비교해 중복 여부를 판단한다.","duplicate_check"],["대표 이미지 적합성 확인","상품·배경·비율 기준 충족 여부를 판정한다.","quality_class"],["필수 속성 누락 찾기","카테고리별 필수 속성 누락을 찾는다.","missing_field"],["상품 설명 금칙어 확인","설명에서 금지 표현·오정보를 찾는다.","restricted_terms"],["판매가·정가 관계 확인","판매가와 정가 관계의 이상을 판정한다.","numeric_range"],["할인율 계산 검수","정가·판매가 계산값과 표시 할인율을 비교한다.","calculate_value"],["쿠폰 적용가 확인","쿠폰 조건을 적용한 최종 가격을 계산한다.","calculate_value"],["묶음상품 단가 확인","총액과 수량으로 개당 가격을 검수한다.","calculate_value"],["배송비 조건 확인","무료배송 기준과 주문금액을 비교한다.","numeric_range"],["프로모션 기간 확인","시작·종료일과 현재 노출 상태를 확인한다.","date_status"],["가격 급변 이상 찾기","이전 가격과 현재 가격 변동 이상을 판단한다.","numeric_range"],["옵션별 추가금 확인","옵션 선택에 따른 추가금 오류를 찾는다.","calculate_value"],["통화 환산 가격 확인","기준 환율로 원화 환산값을 검수한다.","unit_conversion"],["최저가 배지 조건 확인","비교 가격으로 최저가 표시 가능 여부를 판단한다.","numeric_range"],["반품 사유 표준 분류","자유입력 반품 사유를 표준 사유로 분류한다.","category_class"],["반품 가능기간 확인","구매일·배송일·신청일로 가능기간을 판정한다.","date_status"],["환불 금액 계산 확인","상품가·쿠폰·배송비를 반영한 환불액을 검수한다.","calculate_value"],["부분 반품 수량 확인","주문수량과 반품수량 범위 오류를 찾는다.","numeric_range"],["교환 옵션 매칭","기존 옵션과 요청 옵션의 교환 가능 여부를 확인한다.","pair_match"],["파손 증빙 사진 확인","판정에 필요한 파손 정보가 사진에 있는지 확인한다.","evidence_sufficient"],["오배송 증빙 대조","주문 상품과 수령 사진을 비교한다.","pair_match"],["회수 완료 상태 확인","회수 송장과 물류 상태로 완료 여부를 판단한다.","date_status"],["환불 중복 요청 찾기","동일 주문의 중복 환불 요청을 찾는다.","duplicate_check"],["반품비 부담 주체 분류","반품 사유에 따라 부담 주체를 분류한다.","category_class"],["영수증 금액 OCR 대조","이미지 금액과 추출 결과를 비교해 수정한다.","pair_match"],["사업자번호 OCR 대조","사업자등록번호 이미지와 추출값을 비교한다.","pair_match"],["계좌번호 OCR 대조","문서 계좌번호와 추출값을 확인한다.","pair_match"],["날짜 OCR 정규화","다양한 날짜 표기를 표준 날짜로 정리한다.","normalize_text"],["주소 OCR 줄 합치기","여러 줄 주소 결과를 정상 주소로 정리한다.","normalize_text"],["송장 품목 OCR 대조","송장 이미지의 품목명과 추출 결과를 비교한다.","pair_match"],["수량 OCR 대조","문서 수량과 추출 숫자를 비교한다.","pair_match"],["문서 페이지 방향 확인","회전·뒤집힘·잘림 여부를 판정한다.","quality_class"],["서명·도장 존재 확인","지정 위치의 서명/도장 유무를 확인한다.","boolean_presence"],["문서 중복 페이지 찾기","페이지들을 비교해 중복 페이지를 찾는다.","duplicate_check"],["상품 이미지 배경 확인","배경 기준 위반 여부를 판정한다.","quality_class"],["이미지 흐림 여부 판정","초점 상태로 사용 가능 여부를 결정한다.","quality_class"],["이미지 잘림 여부 판정","상품 핵심 부분의 잘림 여부를 확인한다.","quality_class"],["워터마크 존재 확인","외부 워터마크 유무를 확인한다.","boolean_presence"],["이미지-상품명 일치 확인","이미지 내용과 상품명을 대조한다.","pair_match"],["제한 콘텐츠 이미지 분류","운영 기준상 제한 대상인지 분류한다.","category_class"],["문자 가독성 판정","이미지 속 라벨·문구 가독성을 판단한다.","quality_class"],["색상 대표성 확인","대표 이미지 색상과 선택 옵션을 비교한다.","pair_match"],["대표컷 선택","여러 사진 중 대표 이미지로 적합한 한 장을 고른다.","select_best"],["작업 전후 사진 순서 확인","전·후 이미지 순서가 맞는지 판정한다.","sequence_check"],["배송 문의 유형 분류","조회·지연·분실 등으로 분류한다.","category_class"],["환불 문의 유형 분류","환불 관련 문의를 표준 유형으로 나눈다.","category_class"],["상품 문의 유형 분류","사이즈·재고·호환성·사용법 등으로 분류한다.","category_class"],["긴급 문의 표시","즉시 대응이 필요한 문의인지 판정한다.","boolean_presence"],["중복 문의 묶기","같은 고객의 유사 문의를 묶을지 판단한다.","duplicate_check"],["문의 핵심문장 선택","긴 문의에서 처리에 필요한 문장을 선택한다.","select_best"],["답변 유형 후보 선택","문의 유형에 맞는 답변 유형을 고른다.","select_best"],["개인정보 포함 여부 확인","노출되면 안 되는 개인정보가 있는지 판정한다.","boolean_presence"],["감정 강도 분류","일반·불만·강한 불만으로 분류한다.","category_class"],["처리 담당 분류","배송·상품·결제·반품 담당으로 분류한다.","category_class"],["AI 상품 카테고리 결과 검수","자동 분류값과 상품 정보를 비교한다.","pair_match"],["AI 상품명 정리 결과 검수","자동 정리 결과가 원문을 훼손했는지 확인한다.","pair_match"],["AI OCR 결과 검수","자동 추출값과 원본 문서를 비교한다.","pair_match"],["AI 주소 정규화 결과 검수","정리된 주소의 누락·오류를 확인한다.","pair_match"],["AI 문의 분류 결과 검수","자동 문의 분류의 적합성을 판정한다.","pair_match"],["AI 번역 결과 검수","원문과 번역문 의미 누락을 확인한다.","translation_match"],["AI 이미지 태그 결과 검수","이미지와 자동 태그를 비교한다.","pair_match"],["AI 중복상품 판정 검수","중복 후보가 실제 같은 상품인지 판단한다.","duplicate_check"],["AI 이상가격 탐지 검수","자동 탐지된 가격 이상이 실제 오류인지 확인한다.","numeric_range"],["AI 배송예외 분류 검수","자동 분류된 배송예외 사유를 최종 확인한다.","pair_match"],["영문 상품명 한글 표기 검수","브랜드·모델을 보존한 한글 표기를 확인한다.","normalize_text"],["한글 상품명 영문 표기 검수","자연스러운 영문 표기를 검수한다.","normalize_text"],["국가별 주소 형식 확인","국가에 맞는 주소 필드 배치를 확인한다.","format_check"],["국가코드·전화번호 대조","국가코드와 전화번호 형식을 비교한다.","pair_match"],["통화기호 표기 확인","국가·통화에 맞는 기호와 숫자 형식을 확인한다.","format_check"],["단위 변환 결과 확인","cm/inch, kg/lb 변환 결과를 검수한다.","unit_conversion"],["현지 날짜 형식 확인","국가별 날짜 표기 오류를 찾는다.","format_check"],["현지 금칙 표현 검수","현지 언어의 부적절·금지 표현을 판정한다.","restricted_terms"],["번역 누락 문장 찾기","원문 대비 빠진 번역 문장을 체크한다.","missing_field"],["다국어 옵션명 일치 확인","한국어·영어 옵션명이 같은 의미인지 대조한다.","pair_match"]];
const RULE_OVERRIDES = {"1":"영문/숫자 조합의 내부 송장번호 규칙을 만족하는지 확인","6":"상태 시각은 집하→이동→배달 순으로 같거나 늦어야 함","7":"숫자를 추출해 국내 연락처 표준 형식으로 정리","12":"실제 입고 수량 - 발주 수량의 차이를 계산","13":"실제 출고 수량 - 주문 수량의 차이를 계산","14":"기초재고 + 입고 - 출고로 잔여 재고를 계산","16":"남은 일수에 따라 정상/임박/경과 기준 적용","19":"이동 전 총수량과 이동 후 총수량의 차이를 계산","20":"실사수량 - 장부수량의 차이를 계산","21":"3자리 항공사 prefix + 8자리 일련번호 형식을 확인","23":"도착 시각이 출발 시각보다 늦어야 함","24":"kg/lb 환산계수와 반올림 기준으로 계산","25":"인보이스 포장 수 - 운송장 포장 수 차이를 계산","28":"신고금액 - 인보이스 금액 차이를 계산","31":"영문 4자 + 숫자 7자의 컨테이너 번호 형식을 확인","35":"VGM과 화물중량 차이율이 허용치 이내인지 판정","36":"예정/실제 출항 시각 차이로 정시·지연·오류를 판정","38":"설정온도 대비 기록온도 절대 편차가 허용치 이내인지 판정","39":"Packing List 수량 - B/L 수량 차이를 계산","40":"사용일수가 무료 장치기간을 넘는지 판정","41":"상품명 요소가 브랜드→모델→규격 순서인지 확인","52":"정가 대비 판매가 할인율을 정수 퍼센트로 계산","53":"판매가에서 적용 쿠폰액을 차감해 최종 가격 계산","54":"묶음 총액을 구성 수량으로 나눠 개당 가격 계산","55":"주문금액이 무료배송 기준 이상인지 판정","56":"기준일이 프로모션 시작일~종료일 범위에 있는지 판정","57":"이전 가격 대비 변동률이 허용치 이내인지 판정","58":"선택 옵션 가격 - 기본 옵션 가격으로 추가금 계산","59":"외화 금액 × 내부 기준환율로 원화 환산값 계산","60":"자사 가격이 비교대상 최저가 이하인지 판정","62":"배송 완료일부터 허용일 이내 신청인지 판정","63":"상품가 - 배분 쿠폰 + 환불 가능 배송비로 환불액 계산","64":"반품수량이 0 이상 주문수량 이하인지 판정","68":"회수 송장에 완료 기준 이벤트가 존재하는지 판정","74":"날짜를 YYYY-MM-DD 형식으로 정규화","75":"주소 줄바꿈을 공백으로 합치고 연속 공백을 정리","90":"사진 순서는 작업 전→작업 후여야 함","109":"AI 탐지 가격 편차율이 내부 허용치 이내인지 재검수","113":"국가별 필수 주소 필드와 배치 규칙을 확인","114":"국가코드와 전화번호 형식 조합을 확인","115":"국가·통화 코드에 맞는 통화기호와 숫자 형식을 확인","116":"cm/inch 또는 kg/lb 기준 변환계수로 환산값 계산","117":"국가별 지정 날짜 형식을 확인"};
const OPTION_OVERRIDES = {"5":[["door","문앞"],["guard","경비실"],["other","기타"]],"9":[["undelivered","미배송"],["bad_address","주소불명"],["refused","수취거부"],["damage","파손"]],"16":[["normal","정상"],["near","임박"],["expired","경과"]],"36":[["on_time","정시"],["delayed","지연"],["invalid","일정 오류"]],"40":[["within","무료기간 내"],["over","초과"]],"46":[["electronics","전자기기"],["living","생활용품"],["fashion","패션"]],"56":[["active","노출 가능"],["before","시작 전"],["ended","종료"]],"61":[["defect","상품불량"],["change_mind","단순변심"],["wrong_item","오배송"],["size","사이즈"]],"62":[["eligible","반품 가능"],["expired","기간 초과"]],"68":[["completed","회수 완료"],["moving","회수 중"],["not_started","미회수"]],"70":[["seller","판매자"],["buyer","구매자"],["carrier","배송사"]],"86":[["allowed","일반"],["restricted","제한"],["review","운영검토"]],"91":[["tracking","배송조회"],["delay","배송지연"],["lost","분실"],["address","주소변경"]],"92":[["status","환불상태"],["amount","환불금액"],["method","환불수단"],["cancel","환불취소"]],"93":[["size","사이즈"],["stock","재고"],["compat","호환성"],["usage","사용법"]],"99":[["normal","일반"],["complaint","불만"],["strong","강한 불만"]],"100":[["delivery","배송"],["product","상품"],["payment","결제"],["return","반품"]]};

const CATEGORY_NAMES = ['택배·배송 운영','창고·재고 운영','항공·통관','해상·컨테이너','상품 카탈로그','가격·프로모션','반품·환불','문서·OCR','이미지·콘텐츠 품질','고객문의 데이터','AI 결과 검수','글로벌·현지화'];
const CATEGORY_CODES = 'ABCDEFGHIJKL'.split('');

const COMPONENT_TYPE = {
  format_check:'choice', pair_match:'choice', missing_field:'choice', quality_class:'choice',
  category_class:'choice', sequence_check:'choice', normalize_text:'text', duplicate_check:'choice',
  link_match:'choice', quantity_delta:'integer', calculate_value:'integer', date_status:'choice',
  unit_conversion:'integer', numeric_range:'choice', evidence_sufficient:'choice', select_best:'choice',
  restricted_terms:'choice', boolean_presence:'boolean', translation_match:'choice'
};

const INPUT_KIND = {
  format_check:'format_check:sample', pair_match:'pair_match:left,right', missing_field:'missing_field:required_fields,present_fields',
  quality_class:'quality_class:observed', category_class:'category_class:case_text,categories', sequence_check:'sequence_check:sequence',
  normalize_text:'normalize_text:raw', duplicate_check:'duplicate_check:record_a,record_b', link_match:'link_match:source,target',
  quantity_delta:'quantity_delta:planned,actual', calculate_value:'calculate_value:operands,formula', date_status:'date_status:dates,rule',
  unit_conversion:'unit_conversion:source,factor', numeric_range:'numeric_range:value,min,max', evidence_sufficient:'evidence_sufficient:required,observed',
  select_best:'select_best:candidates', restricted_terms:'restricted_terms:text,blocked_terms', boolean_presence:'boolean_presence:target,observed',
  translation_match:'translation_match:source,translation'
};

const OUTPUT_TYPE = {
  format_check:'choice:valid|invalid', pair_match:'choice:match|mismatch', missing_field:'choice:complete|missing',
  quality_class:'choice:pass|review|fail', category_class:'choice:task_specific', sequence_check:'choice:normal|error',
  normalize_text:'text', duplicate_check:'choice:duplicate|distinct', link_match:'choice:connected|not_connected',
  quantity_delta:'integer', calculate_value:'integer', date_status:'choice:task_specific', unit_conversion:'integer',
  numeric_range:'choice:within|outside', evidence_sufficient:'choice:sufficient|insufficient', select_best:'choice:a|b|c',
  restricted_terms:'choice:clear|restricted', boolean_presence:'boolean', translation_match:'choice:match|missing'
};

const DEFAULT_OPTIONS = {
  format_check:[['valid','형식 정상'],['invalid','형식 오류']],
  pair_match:[['match','일치'],['mismatch','불일치']],
  missing_field:[['complete','누락 없음'],['missing','누락 있음']],
  quality_class:[['pass','사용 가능'],['review','재확인 필요'],['fail','사용 불가']],
  category_class:[['class_a','유형 A'],['class_b','유형 B'],['class_c','유형 C']],
  sequence_check:[['normal','순서 정상'],['error','순서 오류']],
  duplicate_check:[['duplicate','중복'],['distinct','별개']],
  link_match:[['connected','연결 가능'],['not_connected','연결 불가']],
  date_status:[['within','기간 내'],['near','임박'],['expired','기간 초과']],
  numeric_range:[['within','기준 충족'],['outside','기준 이탈']],
  evidence_sufficient:[['sufficient','증빙 충분'],['insufficient','증빙 부족']],
  select_best:[['a','후보 A'],['b','후보 B'],['c','후보 C']],
  restricted_terms:[['clear','문제 없음'],['restricted','제한 표현 있음']],
  translation_match:[['match','의미 일치'],['missing','의미 누락']]
};

const EVIDENCE_POLICY = {
  format_check:'format_decision_snapshot.v1', pair_match:'comparison_snapshot.v1', missing_field:'completeness_snapshot.v1',
  quality_class:'quality_decision_snapshot.v1', category_class:'classification_snapshot.v1', sequence_check:'sequence_snapshot.v1',
  normalize_text:'normalized_text_snapshot.v1', duplicate_check:'duplicate_decision_snapshot.v1', link_match:'linkage_snapshot.v1',
  quantity_delta:'quantity_calculation_snapshot.v1', calculate_value:'calculation_snapshot.v1', date_status:'date_decision_snapshot.v1',
  unit_conversion:'conversion_snapshot.v1', numeric_range:'threshold_decision_snapshot.v1', evidence_sufficient:'evidence_check_snapshot.v1',
  select_best:'selection_snapshot.v1', restricted_terms:'policy_decision_snapshot.v1', boolean_presence:'presence_snapshot.v1',
  translation_match:'translation_review_snapshot.v1'
};

const REVIEW_MODE = {
  format_check:'auto_exact', pair_match:'auto_exact', missing_field:'operator_spot_check', quality_class:'operator_spot_check',
  category_class:'operator_spot_check', sequence_check:'auto_exact', normalize_text:'operator_spot_check', duplicate_check:'dual_review',
  link_match:'auto_exact', quantity_delta:'auto_exact', calculate_value:'auto_exact', date_status:'auto_exact', unit_conversion:'auto_exact',
  numeric_range:'auto_exact', evidence_sufficient:'operator_spot_check', select_best:'operator_spot_check', restricted_terms:'dual_review',
  boolean_presence:'operator_spot_check', translation_match:'dual_review'
};

const COMPLEXITY = {
  format_check:1,pair_match:1,missing_field:2,quality_class:2,category_class:2,sequence_check:2,normalize_text:2,
  duplicate_check:3,link_match:2,quantity_delta:2,calculate_value:3,date_status:2,unit_conversion:3,numeric_range:2,
  evidence_sufficient:3,select_best:3,restricted_terms:3,boolean_presence:1,translation_match:4
};
const TIME_BASE = {1:120,2:300,3:480,4:660};

function optionsFor(ordinal, archetype) {
  const rows = OPTION_OVERRIDES[ordinal] || DEFAULT_OPTIONS[archetype] || [];
  return rows.map(([value,label_ko]) => ({value,label_ko}));
}

function componentExtra(ordinal, archetype) {
  const type = COMPONENT_TYPE[archetype];
  if (type === 'choice') return {options: optionsFor(ordinal, archetype)};
  if (type === 'text') return {min_length:1,max_length:200};
  if (type === 'integer') return {min:-1000000000,max:1000000000};
  return {};
}

function outputTypeFor(ordinal, archetype) {
  if (archetype !== 'category_class' && archetype !== 'date_status') return OUTPUT_TYPE[archetype];
  return `choice:${optionsFor(ordinal, archetype).map((row) => row.value).join('|')}`;
}

export const WORK_CATALOG_120 = Object.freeze(TASK_ROWS.map(([title_ko,purpose_ko,archetype], index) => {
  const ordinal = index + 1;
  const group = Math.floor(index / 10);
  const reward_krw = 3000 + ordinal * 500;
  const stake_krw = reward_krw * 10;
  const review_mode = REVIEW_MODE[archetype];
  return Object.freeze({
    ordinal,
    category_code:CATEGORY_CODES[group],
    category_name:CATEGORY_NAMES[group],
    template_key:`catalog_${String(ordinal).padStart(3,'0')}`,
    public_id:`PDK-CATALOG-${String(ordinal).padStart(3,'0')}`,
    title_ko,purpose_ko,archetype,
    component_type:COMPONENT_TYPE[archetype],
    component_extra:componentExtra(ordinal, archetype),
    input_kind:INPUT_KIND[archetype],
    output_type:outputTypeFor(ordinal, archetype),
    validation_rule:RULE_OVERRIDES[ordinal] || purpose_ko,
    evidence_policy_key:EVIDENCE_POLICY[archetype],
    review_policy_key:`${review_mode}.${archetype}.v1`,
    review_mode,
    workflow_profile:`linear.items.answer.${archetype}`,
    estimated_seconds:TIME_BASE[COMPLEXITY[archetype]] + ordinal,
    reward_krw,stake_krw,
    tier_band:stake_krw < 300000 ? '소액' : stake_krw < 1000000 ? '중간' : '고액',
    requires_assign:ordinal >= 111
  });
}));

export function buildCatalogWorkDefinition(task) {
  const row = task || {};
  return {
    schema_version:'putduk.work/1.0',
    template_key:row.template_key,
    template_version:1,
    title_ko:row.title_ko,
    purpose_ko:row.purpose_ko,
    components:[{
      key:'answer',type:row.component_type,label_ko:`${row.title_ko || '업무'} 결과`,required:true,
      validation:{mode:'equals_expected',rule:row.validation_rule},
      evidence:{capture:'value',type:row.evidence_policy_key,policy_key:row.evidence_policy_key},
      ...(row.component_extra || {})
    }],
    workflow:{mode:'linear',profile:row.workflow_profile,steps:[{key:'work',title_ko:row.title_ko,repeat:'items',component_keys:['answer']}]},
    evidence:{model:'answer_snapshot.v1',retain_with_submission:true,policy_key:row.evidence_policy_key},
    submission:{contract:'putduk.work_submission/1.0',mode:'all_required_valid'},
    review:{contract:'putduk.review/1.0',mode:row.review_mode,policy_key:row.review_policy_key,validation_rule:row.validation_rule,decisions:['approved','rework','rejected']},
    settlement:{contract:'putduk.stake_stipend/1.0',trigger:'review_approved',release_stake:true,post_stipend:true},
    catalog_meta:{catalog_schema:CATALOG_120_SCHEMA,ordinal:row.ordinal,category_code:row.category_code,category_name:row.category_name,
      archetype:row.archetype,input_kind:row.input_kind,output_type:row.output_type,validation_rule:row.validation_rule,
      evidence_policy_key:row.evidence_policy_key,review_policy_key:row.review_policy_key,workflow_profile:row.workflow_profile,
      estimated_seconds:row.estimated_seconds,stake_krw:row.stake_krw,reward_krw:row.reward_krw,publication_state:'draft'}
  };
}

export function catalogSemanticBasis(task) {
  return [task?.purpose_ko,task?.workflow_profile,task?.input_kind,task?.output_type,task?.validation_rule].map((value) => String(value || '')).join('\u001f');
}

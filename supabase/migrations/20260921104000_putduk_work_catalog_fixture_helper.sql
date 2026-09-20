-- Stage 4: service-role-only controlled fixture generator for generic catalog validation.
begin;

create or replace function private.putduk_catalog_fixture(p_ordinal integer, p_title text, p_purpose text, p_archetype text)
returns jsonb
language plpgsql immutable
set search_path = pg_catalog, private
as $$
declare
  v_rule text := private.putduk_catalog_validation_rule(p_ordinal, p_purpose);
  v_options jsonb := private.putduk_catalog_component_options(p_ordinal, p_archetype);
  v_expected jsonb;
  v_member jsonb;
  v_choice text;
  v_n integer;
begin
  if p_archetype = 'format_check' then
    v_choice := case when p_ordinal % 2 = 0 then 'valid' else 'invalid' end;
    v_member := jsonb_build_object('case_title',p_title,'sample',case when v_choice='valid' then 'PDK-'||lpad(p_ordinal::text,3,'0')||'-2026' else 'PDK/'||lpad(p_ordinal::text,3,'0')||'/X' end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'pair_match' then
    v_choice := case when p_ordinal % 2 = 1 then 'match' else 'mismatch' end;
    v_member := jsonb_build_object('case_title',p_title,'left_label','기준 자료','left','REF-'||lpad(p_ordinal::text,4,'0'),'right_label','확인 자료','right',case when v_choice='match' then 'REF-'||lpad(p_ordinal::text,4,'0') else 'REF-'||lpad((p_ordinal+7)::text,4,'0') end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'missing_field' then
    v_choice := case when p_ordinal % 2 = 0 then 'missing' else 'complete' end;
    v_member := jsonb_build_object('case_title',p_title,'required_fields',jsonb_build_array('필수값 A','필수값 B'),'present_fields',case when v_choice='missing' then jsonb_build_array('필수값 A') else jsonb_build_array('필수값 A','필수값 B') end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'quality_class' then
    v_choice := case p_ordinal % 3 when 0 then 'pass' when 1 then 'review' else 'fail' end;
    v_member := jsonb_build_object('case_title',p_title,'observed',case v_choice when 'pass' then jsonb_build_array('핵심 정보 선명','기준 충족') when 'review' then jsonb_build_array('핵심 정보 확인 가능','일부 재확인 필요') else jsonb_build_array('핵심 정보 식별 불가','기준 미충족') end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype in ('category_class','date_status') then
    select count(*)::integer into v_n from jsonb_array_elements(v_options);
    select value ->> 'value' into v_choice from jsonb_array_elements(v_options) with ordinality where ordinality = 1 + (p_ordinal % greatest(v_n,1)) limit 1;
    v_member := jsonb_build_object('case_title',p_title,'case_text',p_title||' 내부 검증 사례','categories',v_options,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'sequence_check' then
    v_choice := case when p_ordinal % 2 = 1 then 'normal' else 'error' end;
    v_member := jsonb_build_object('case_title',p_title,'sequence',case when v_choice='normal' then jsonb_build_array('09:00','10:00','11:00') else jsonb_build_array('09:00','11:00','10:00') end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'normalize_text' then
    v_member := jsonb_build_object('case_title',p_title,'raw','  PDK   '||lpad(p_ordinal::text,3,'0')||'  표준   값 ','rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer','PDK '||lpad(p_ordinal::text,3,'0')||' 표준 값');
  elsif p_archetype = 'duplicate_check' then
    v_choice := case when p_ordinal % 2 = 0 then 'duplicate' else 'distinct' end;
    v_member := jsonb_build_object('case_title',p_title,'record_a',jsonb_build_object('key','A-'||p_ordinal,'value','ITEM-'||p_ordinal),'record_b',case when v_choice='duplicate' then jsonb_build_object('key','A-'||p_ordinal,'value','ITEM-'||p_ordinal) else jsonb_build_object('key','B-'||p_ordinal,'value','ITEM-'||(p_ordinal+1)) end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'link_match' then
    v_choice := case when p_ordinal % 2 = 1 then 'connected' else 'not_connected' end;
    v_member := jsonb_build_object('case_title',p_title,'source','SRC-'||p_ordinal,'target',case when v_choice='connected' then 'SRC-'||p_ordinal else 'SRC-'||(p_ordinal+1) end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'quantity_delta' then
    v_member := jsonb_build_object('case_title',p_title,'planned',100+p_ordinal,'actual',100+p_ordinal+((p_ordinal%5)-2),'formula','actual - planned','rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',((p_ordinal%5)-2));
  elsif p_archetype = 'calculate_value' then
    if p_ordinal = 14 then
      v_member := jsonb_build_object('case_title',p_title,'opening',50,'inbound',10,'outbound',70,'formula','opening + inbound - outbound','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":-10}'::jsonb;
    elsif p_ordinal = 52 then
      v_member := jsonb_build_object('case_title',p_title,'list_price',50000,'sale_price',40000,'formula','round((list_price-sale_price)/list_price*100)','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":20}'::jsonb;
    elsif p_ordinal = 53 then
      v_member := jsonb_build_object('case_title',p_title,'sale_price',40000,'coupon',5000,'formula','sale_price-coupon','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":35000}'::jsonb;
    elsif p_ordinal = 54 then
      v_member := jsonb_build_object('case_title',p_title,'bundle_total',48000,'quantity',4,'formula','bundle_total/quantity','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":12000}'::jsonb;
    elsif p_ordinal = 58 then
      v_member := jsonb_build_object('case_title',p_title,'base_option_price',30000,'selected_option_price',35000,'formula','selected_option_price-base_option_price','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":5000}'::jsonb;
    elsif p_ordinal = 63 then
      v_member := jsonb_build_object('case_title',p_title,'product_price',50000,'coupon_share',5000,'refundable_shipping',0,'formula','product_price-coupon_share+refundable_shipping','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":45000}'::jsonb;
    else
      v_member := jsonb_build_object('case_title',p_title,'base',1000+p_ordinal*10,'adjustment',(p_ordinal%7)*100,'shipping',(p_ordinal%3)*50,'formula','base-adjustment+shipping','rule',v_rule,'instruction',p_purpose);
      v_expected := jsonb_build_object('answer',(1000+p_ordinal*10)-((p_ordinal%7)*100)+((p_ordinal%3)*50));
    end if;
  elsif p_archetype = 'unit_conversion' then
    if p_ordinal = 24 then
      v_member := jsonb_build_object('case_title',p_title,'source_value',10,'source_unit','kg','target_unit','lb','factor',2.20462,'rounding','nearest_integer','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":22}'::jsonb;
    elsif p_ordinal = 59 then
      v_member := jsonb_build_object('case_title',p_title,'foreign_amount',20,'currency','USD','krw_rate',1350,'formula','foreign_amount*krw_rate','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":27000}'::jsonb;
    else
      v_member := jsonb_build_object('case_title',p_title,'source_value',30,'source_unit','cm','target_unit','inch','factor',0.393701,'rounding','nearest_integer','rule',v_rule,'instruction',p_purpose);
      v_expected := '{"answer":12}'::jsonb;
    end if;
  elsif p_archetype = 'numeric_range' then
    v_choice := case when p_ordinal % 2 = 0 then 'within' else 'outside' end;
    v_member := jsonb_build_object('case_title',p_title,'value',case when v_choice='within' then 150 else 240 end,'min',100,'max',200,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'evidence_sufficient' then
    v_choice := case when p_ordinal % 2 = 1 then 'sufficient' else 'insufficient' end;
    v_member := jsonb_build_object('case_title',p_title,'required_evidence',jsonb_build_array('대상','핵심 부위','전체 범위'),'observed_evidence',case when v_choice='sufficient' then jsonb_build_array('대상','핵심 부위','전체 범위') else jsonb_build_array('대상','전체 범위') end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'select_best' then
    v_choice := case p_ordinal % 3 when 0 then 'a' when 1 then 'b' else 'c' end;
    v_member := jsonb_build_object('case_title',p_title,'candidates',jsonb_build_array(jsonb_build_object('value','a','score',case when v_choice='a' then 95 else 60 end),jsonb_build_object('value','b','score',case when v_choice='b' then 95 else 60 end),jsonb_build_object('value','c','score',case when v_choice='c' then 95 else 60 end)),'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'restricted_terms' then
    v_choice := case when p_ordinal % 2 = 0 then 'restricted' else 'clear' end;
    v_member := jsonb_build_object('case_title',p_title,'text',case when v_choice='restricted' then '설명에 금지예시 포함' else '일반 설명 문구' end,'blocked_terms',jsonb_build_array('금지예시'),'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  elsif p_archetype = 'boolean_presence' then
    v_member := jsonb_build_object('case_title',p_title,'target','지정 표시','observed',case when p_ordinal % 2 = 1 then jsonb_build_array('지정 표시') else '[]'::jsonb end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',p_ordinal % 2 = 1);
  elsif p_archetype = 'translation_match' then
    v_choice := case when p_ordinal % 2 = 1 then 'match' else 'missing' end;
    v_member := jsonb_build_object('case_title',p_title,'source','Ship two red cases by Friday.','translation',case when v_choice='match' then '금요일까지 빨간 케이스 두 개를 배송하세요.' else '금요일까지 빨간 케이스를 배송하세요.' end,'rule',v_rule,'instruction',p_purpose);
    v_expected := jsonb_build_object('answer',v_choice);
  else
    raise exception 'Unsupported Stage 4 archetype %', p_archetype;
  end if;
  return jsonb_build_object('member',v_member,'expected',v_expected);
end;
$$;

revoke all on function private.putduk_catalog_fixture(integer,text,text,text) from public, anon, authenticated;
grant execute on function private.putduk_catalog_fixture(integer,text,text,text) to service_role;

commit;

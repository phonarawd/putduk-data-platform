-- Stage 4: unpublished internal source for pre-publication catalog validation.
begin;

insert into public.partner_brands (
  slug,display_name_ko,legal_name,category,verification_status,logo_usage_status,published,description_ko
) values (
  'putduk-internal-catalog','퍼뜩 내부 업무 카탈로그','퍼뜩 내부 업무 카탈로그','내부 검증',
  'pending','not_submitted',false,
  'MASTER 120개 업무의 공개 전 엔진 검증용 내부 source. 실제 외부 협력사 업무로 공개하지 않는다.'
)
on conflict (slug) do update
set display_name_ko=excluded.display_name_ko,legal_name=excluded.legal_name,category=excluded.category,
    verification_status='pending',logo_usage_status='not_submitted',published=false,
    description_ko=excluded.description_ko,updated_at=now();

commit;

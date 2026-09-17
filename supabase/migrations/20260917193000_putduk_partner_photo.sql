-- 협력사 회원 공개용 사진 경로. 원본 파일은 putduk-private에 둔다.
alter table public.partner_brands
  add column if not exists photo_asset_path text;

comment on column public.partner_brands.photo_asset_path is
  '협력사 사진 파일 경로. 로고와 같이 운영자가 등록하고 승인한 뒤에만 회원 화면에 쓴다.';

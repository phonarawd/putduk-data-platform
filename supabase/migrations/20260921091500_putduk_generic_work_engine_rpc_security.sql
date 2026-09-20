-- Stage 3 follow-up: generic work SECURITY DEFINER RPCs stay backend-only.
-- Member browsers must reach these contracts through a verified Edge path before cutover.

begin;

revoke all on function public.putduk_member_work_contract(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.putduk_member_submit_work_v2(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.putduk_member_work_contract(uuid, uuid)
  to service_role;
grant execute on function public.putduk_member_submit_work_v2(uuid, uuid, jsonb)
  to service_role;

comment on function public.putduk_member_work_contract(uuid, uuid) is
  '범용 업무 member-safe contract. 검증된 백엔드/Edge에서 service_role로 호출하며 server-only validation_payload는 반환하지 않는다.';
comment on function public.putduk_member_submit_work_v2(uuid, uuid, jsonb) is
  '범용 work schema 제출. 검증된 백엔드/Edge에서 service_role로 호출한다. 금액은 변경하지 않고 검수/정산은 기존 review contract가 담당한다.';

commit;

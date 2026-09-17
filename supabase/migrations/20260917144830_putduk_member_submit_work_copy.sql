-- 원격 이력 맞춤. 제출 RPC 안내 문구를 근무로 통일한다.

begin;

comment on function public.putduk_member_submit_work(uuid, uuid, text, text) is
  '회원 근무 제출. 고른 보기를 work_submissions와 task_events에 저장한다. 금액은 바꾸지 않는다.';

commit;

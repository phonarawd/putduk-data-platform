-- Stage 4: semantic duplicate fingerprint guard.
begin;

alter table private.work_template_versions
  add column if not exists semantic_fingerprint text null;

create or replace function private.putduk_work_definition_fingerprint(p_definition jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when jsonb_typeof(p_definition) <> 'object' or not (p_definition ? 'catalog_meta') then null
    else md5(concat_ws(E'\x1f',
      coalesce(p_definition ->> 'purpose_ko', ''),
      coalesce(p_definition #>> '{catalog_meta,workflow_profile}', ''),
      coalesce(p_definition #>> '{catalog_meta,input_kind}', ''),
      coalesce(p_definition #>> '{catalog_meta,output_type}', ''),
      coalesce(p_definition #>> '{catalog_meta,validation_rule}', '')
    ))
  end;
$$;

revoke all on function private.putduk_work_definition_fingerprint(jsonb) from public, anon, authenticated;
grant execute on function private.putduk_work_definition_fingerprint(jsonb) to service_role;

create or replace function private.putduk_set_work_definition_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  new.semantic_fingerprint := private.putduk_work_definition_fingerprint(new.definition);
  return new;
end;
$$;

revoke all on function private.putduk_set_work_definition_fingerprint() from public, anon, authenticated;
grant execute on function private.putduk_set_work_definition_fingerprint() to service_role;

drop trigger if exists putduk_work_definition_fingerprint on private.work_template_versions;
create trigger putduk_work_definition_fingerprint
before insert or update of definition on private.work_template_versions
for each row execute function private.putduk_set_work_definition_fingerprint();

update private.work_template_versions
set semantic_fingerprint = private.putduk_work_definition_fingerprint(definition)
where semantic_fingerprint is distinct from private.putduk_work_definition_fingerprint(definition);

create unique index if not exists work_template_versions_semantic_fingerprint_uidx
  on private.work_template_versions(semantic_fingerprint)
  where semantic_fingerprint is not null;

commit;

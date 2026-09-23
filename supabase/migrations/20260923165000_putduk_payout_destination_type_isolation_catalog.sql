begin;

insert into private.deposit_info_catalog (id, catalog_version, updated_at)
values (1, 1, now())
on conflict (id) do update
  set catalog_version = private.deposit_info_catalog.catalog_version + 1,
      updated_at = now();

update private.deposit_info_reveal_tokens
set revoked_at = now()
where revoked_at is null
  and used_at is null
  and scope = 'deposit_info_reveal';

commit;

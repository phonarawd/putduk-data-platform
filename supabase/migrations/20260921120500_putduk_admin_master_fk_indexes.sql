-- Stage 5 follow-up: cover all auth/user foreign keys introduced by Admin MASTER tables.
create index if not exists partner_funding_pools_created_by_idx on private.partner_funding_pools(created_by);
create index if not exists partner_funding_pools_updated_by_idx on private.partner_funding_pools(updated_by);
create index if not exists partner_budget_allocations_updated_by_idx on private.partner_budget_allocations(updated_by);
create index if not exists partner_budget_ledger_actor_id_idx on private.partner_budget_ledger(actor_id);
create index if not exists admin_content_items_created_by_idx on private.admin_content_items(created_by);
create index if not exists admin_content_items_updated_by_idx on private.admin_content_items(updated_by);

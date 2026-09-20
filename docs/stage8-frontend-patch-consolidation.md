# Stage 8 — Frontend patch-stack consolidation

## Scope
Stage 8 consolidates the Stage 6/7 member runtime boundary without rewriting the monolithic app or redesigning features.

- Added one member runtime core loaded immediately after the Supabase vendor script.
- Stage 6 and Stage 7 now reuse one Supabase browser client.
- Auth state changes fan out through one native subscription.
- Trial sanitization, Stage 6 patching, and Stage 7 catalog/player scheduling share one native app MutationObserver.
- Subscriber failures are isolated so one sidecar cannot stop the others.
- Existing loader ordering remains P4 first, then Stage 7 runtime.

## Preserved contracts
- 12-item catalog increments and list-region-only filtering.
- Server-driven budget, slot, approval, and balance proof.
- Browser JWT to member-experience Edge to service-role-only Generic RPC.
- Legacy player fallback when no Generic contract is available.
- Canonical start, stake, review, settlement, finance, and trial behavior.
- Stage 4 catalog publication state is unchanged.
- Synthetic FOMO code and behavior are untouched for Stage 9.
- No database migration, Edge deployment, or Cloudflare configuration change.

# Stage 10 — Scale / Performance QA

- Stage 4 fixture contains 120 distinct catalog rows.
- Member catalog keeps a 12-card DOM window with content visibility.
- Filtering rerenders only the Stage 7 list region.
- Stage 6 and Stage 7 share one client, auth subscription, and app observer.
- Simultaneous initial member-experience reads are coalesced by a 2-second token-scoped cache.
- Cache clears on authentication changes and after state-changing member actions.
- Member proof polling remains 30 seconds; real activity polling remains 12 seconds.
- One member realtime channel, Generic fallback, mobile full-height player, and reduced-motion support remain.
- Real activity query status values were checked against the Production enum; invalid `under_review` was removed in favor of `review_pending`.
- Added a partial `task_runs(updated_at desc)` index for the real-activity status set used by the 12-second read path.
- Stage 11 owns the complete local quality gate.

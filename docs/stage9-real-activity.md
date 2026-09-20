# Stage 9 — Synthetic FOMO to real activity

- Removed generated names, rotating fake actions, sine-wave crowd counts, and synthetic slot depletion.
- Added authenticated `real_activity` Edge action backed by real `task_runs`.
- UI shows current in-progress work, starts in the last 15 minutes, and up to four real recent events.
- Events expose only partner, action class, and timestamp; no user ID or profile name.
- An honest empty state appears when the last 30 minutes contain no activity.
- No database migration, money mutation, catalog publication, or Generic Work contract change.

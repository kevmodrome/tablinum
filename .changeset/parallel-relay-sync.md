---
"tablinum": patch
---

Parallelize relay sync and fix Negentropy async bug

- Parallelize reconciliation across relays (fetch concurrently, sort by rumor timestamp, apply sequentially)
- Fix `reconcileWithRelay` using `Effect.try` instead of `Effect.tryPromise` for async Negentropy methods, which caused reconciliation to silently return empty results
- Deduplicate gift wraps across relays before processing
- Sort events by `rumor.created_at` (real timestamp) instead of randomized gift wrap `created_at`

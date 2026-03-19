# tablinum

## 0.6.1

### Patch Changes

- 868de37: Parallelize relay sync and fix Negentropy async bug

  - Parallelize reconciliation across relays (fetch concurrently, sort by rumor timestamp, apply sequentially)
  - Fix `reconcileWithRelay` using `Effect.try` instead of `Effect.tryPromise` for async Negentropy methods, which caused reconciliation to silently return empty results
  - Deduplicate gift wraps across relays before processing
  - Sort events by `rumor.created_at` (real timestamp) instead of randomized gift wrap `created_at`
  - Fix `field.optional()` to allow omitting keys entirely, not just setting them to `undefined`

## 0.6.0

### Minor Changes

- 750a2a2: Add compact binary encoding for gift wrap storage and background self-healing loop. Gift wrap blobs are now kept in a compact binary format (~55-60% smaller) instead of being stripped after publishing, enabling automatic re-publishing to relays that lost data. A healing loop runs every 5 minutes to detect and backfill gaps using negentropy reconciliation.

## 0.5.0

### Minor Changes

- 28df868: Adds logging functionality

## 0.4.0

### Minor Changes

- 31314a5: Adds dev instructions and docker-compose for running local relays

## 0.3.0

### Minor Changes

- ce23e40: Add user profile update functionality and introduce diffing engine
- 16c3635: Makes it possible to nest schemas. Updates example Svelte application.

## 0.2.0

### Minor Changes

- bcf1c79: Add multi-user-functionality and convert to more idiomatic Effect style

## 0.1.3

### Patch Changes

- Sync version with npm registry

## 0.1.2

### Patch Changes

- Update Readme to add Svelte example

## 0.1.1

### Patch Changes

- eebd8ea: Fixes erroneous svelte export

## 0.1.0

### Minor Changes

- 42169f7: Add Effect-based local-first DB with sync, queries, and Svelte bindings

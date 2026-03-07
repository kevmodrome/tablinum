[PRD]

# PRD: localstr v0.2

## Overview

`localstr` is a browser-first local-first sync library for structured application data.
It gives developers a typed Effect API for defining collections, writing records, querying local
data, and syncing that data across the same user's devices through Nostr relays.

For v0.2, the scope is intentionally narrow:

- local-first browser storage
- typed schema and Effect-based query/mutation API
- single-user sync across devices
- privacy-preserving encrypted relay replication via NIP-59 gift wrapping
- efficient set reconciliation via NIP-77 negentropy

Collaboration, shared collections, invite flows, multi-user membership, and framework-specific
bindings are explicitly out of scope for this phase.

The core developer experience should be:

1. Define a schema once.
2. Initialize the library.
3. Read and write data locally using the Effect API.
4. Call sync when needed.
5. Let the library handle event creation, gift wrapping, relay I/O, and replay.

## Goals

- Provide a typed Effect API for local-first application data in the browser.
- Keep the UI read path entirely local via IndexedDB.
- Replicate data across the same user's devices through Nostr relays.
- Treat relays as untrusted: hide data structure, content, authorship, and timing via NIP-59 gift wrapping.
- Use NIP-77 negentropy for efficient, timestamp-independent set reconciliation during sync.
- Make the library usable in a small browser app by developers familiar with Effect.
- Establish a clean technical foundation for future collaboration support and framework bindings.

## Quality Gates

These commands must pass for every user story:

- `bun run validate`

## User Stories

### US-001: Define typed collections

**Description:** As a developer, I want to define collections and fields once so that TypeScript types and runtime validation stay aligned.

**Acceptance Criteria:**

- [ ] Add schema builders for `collection()` and `field.*()` in the public API.
- [ ] Support `string`, `number`, `boolean`, `json`, `optional`, and array field variants for v0.2.
- [ ] Infer record types from the schema without requiring a separate interface.
- [ ] Reject invalid schema field definitions at initialization time.
- [ ] Document which field types are queryable and which are not.

### US-002: Initialize a localstr database

**Description:** As a developer, I want to create a database instance with schema and relay configuration so that my app can read and write local-first data.

**Acceptance Criteria:**

- [ ] Add `createLocalstr` as the primary entrypoint, returning an `Effect` that requires a `Scope`.
- [ ] Require a schema and at least one relay URL.
- [ ] Generate a Nostr private key by default when one is not supplied.
- [ ] Accept a developer-supplied secret key or signer as an advanced option.
- [ ] Expose `exportKey()` on the database handle so the developer can back up or transfer the generated key to another device.
- [ ] Expose a stable database handle with collection, sync, and lifecycle APIs.
- [ ] Expose `close()` on the database handle to release IndexedDB connections and clean up active subscriptions. Further operations after close should fail with a typed error.

### US-003: Persist records locally and materialize query state

**Description:** As a developer, I want writes to commit locally first so that my app remains fast and usable offline.

**Acceptance Criteria:**

- [ ] Maintain three IndexedDB stores: `giftwraps` (gift wrap event IDs for negentropy), `events` (decrypted rumors as source of truth), and `records` (materialized LWW-resolved state for queries).
- [ ] On local write, store the decrypted rumor in `events`, the gift wrap ID in `giftwraps`, and the LWW-resolved record in `records`.
- [ ] Treat the `events` store as the source of truth for replay and rebuild.
- [ ] Provide rebuild logic that clears `records` and regenerates materialized state by replaying all events with LWW resolution.
- [ ] Expose `rebuild()` on the database handle to replay all events and regenerate the `records` store from scratch.
- [ ] Do not claim local at-rest encryption for the materialized query store in v0.2.

### US-004: Read, write, update, and delete records through a typed API

**Description:** As a developer, I want a small typed CRUD API so that I can use localstr like a normal browser database.

**Acceptance Criteria:**

- [ ] Implement `add()`, `update()`, `delete()`, `get()`, `first()`, `count()`, and `watch()` for collections.
- [ ] All mutation and query methods return `Effect` values with typed error channels.
- [ ] `watch()` returns an `Effect.Stream` that emits initial results followed by subsequent local changes.
- [ ] During sync replay, `watch()` batches changes and emits once after replay completes rather than per-event.
- [ ] Validate write payloads against the schema before local commit.
- [ ] Generate UUIDv7 record IDs for inserts.
- [ ] Represent deletes as tombstone records in the event stream rather than a separate Nostr deletion event kind.
- [ ] Exclude tombstoned records from normal query results.

### US-005: Query local data with predictable constraints

**Description:** As a developer, I want a local query builder so that I can filter and sort records without learning IndexedDB details.

**Acceptance Criteria:**

- [ ] Support `.where().equals()`, `.above()`, `.below()`, `.between()`, `.anyOf()`, `.sortBy()`, `.limit()`, and `.offset()` on indexed scalar fields.
- [ ] Execute normal application queries against the `records` IndexedDB store only.
- [ ] Restrict relay-side filtering to event metadata needed during sync, not application query execution.
- [ ] Reject unsupported query patterns with typed errors in the Effect error channel.
- [ ] Provide live subscriptions via `watch()` that emit initial results and subsequent local changes as an `Effect.Stream`.

### US-006: Sync encrypted events across the same user's devices

**Description:** As a developer, I want local writes to replicate through relays so that users can use the same data on multiple devices.

**Acceptance Criteria:**

- [ ] Convert writes into signed Nostr rumor events using a deterministic `d` tag formatted as `{collectionName}:{recordId}`.
- [ ] Wrap each rumor using NIP-59 gift wrapping: rumor (unsigned) → NIP-44-encrypted seal (signed by real author) → NIP-44-encrypted gift wrap (signed by random disposable key, randomized timestamp).
- [ ] Encrypt gift wraps to the author's own public key (self-encryption for single-user sync).
- [ ] Publish gift wraps to relays asynchronously without blocking the local commit path.
- [ ] Implement `sync()` using NIP-77 negentropy set reconciliation over gift wrap event IDs. No timestamp-based `since` filters.
- [ ] On sync, fetch missing gift wraps, unwrap (decrypt gift wrap → decrypt seal → extract rumor), store rumor in `events` and gift wrap ID in `giftwraps`, then LWW-resolve into `records`.
- [ ] Resolve conflicts using last-write-wins by `created_at` timestamp. Break ties by lowest event ID (lexicographic).
- [ ] Send locally-held gift wraps that the relay is missing (bidirectional sync).

### US-007: Support offline operation and retry relay publication

**Description:** As a developer, I want offline-safe writes so that my app continues working when the network is unavailable.

**Acceptance Criteria:**

- [ ] Commit writes locally even when relay publication fails.
- [ ] Queue failed gift wrap publications for retry.
- [ ] Flush queued publications when the browser returns online or when sync is triggered manually.
- [ ] Surface sync and relay failures separately from local validation/storage failures via distinct error types in the Effect error channel.
- [ ] Keep local reads available when no relay is reachable.

## Functional Requirements

1. `FR-1`: The system must allow a developer to define a schema made of named collections and typed fields.
2. `FR-2`: The system must infer TypeScript record types from the declared schema.
3. `FR-3`: The system must initialize in a browser environment with IndexedDB and relay configuration.
4. `FR-4`: The system must generate a Nostr private key when the developer does not supply one.
5. `FR-5`: The system must allow the developer to supply either a secret key or a signer instead of the generated key.
6. `FR-6`: The system must expose `exportKey()` to allow the developer to back up and transfer the identity to another device.
7. `FR-7`: The system must maintain three IndexedDB stores: `giftwraps` (event IDs for negentropy), `events` (decrypted rumors as source of truth), and `records` (materialized LWW-resolved query state).
8. `FR-8`: The system must validate writes against the schema before committing them locally.
9. `FR-9`: The system must support typed collection CRUD operations returning `Effect` values with typed error channels.
10. `FR-10`: The system must represent record deletion as a tombstone in the event stream.
11. `FR-11`: The system must provide local query operations over indexed scalar fields against the `records` store.
12. `FR-12`: The system must provide reactive subscriptions as `Effect.Stream` values for local query result changes.
13. `FR-13`: The system must wrap outbound events using NIP-59 gift wrapping (rumor → seal → gift wrap) with NIP-44 encryption at each layer.
14. `FR-14`: The system must sign seals with the active identity and gift wraps with a random disposable key.
15. `FR-15`: The system must sync using NIP-77 negentropy set reconciliation over gift wrap event IDs.
16. `FR-16`: The system must unwrap, verify, decrypt, deduplicate, and replay remote gift wraps during sync.
17. `FR-17`: The system must resolve conflicts using last-write-wins by `created_at`, ties broken by lowest event ID.
18. `FR-18`: The system must queue failed gift wrap publications and retry them later.
19. `FR-19`: The system must expose sync status to application code.
20. `FR-20`: The system must surface typed errors via the Effect error channel, including at least `ValidationError`, `StorageError`, `CryptoError`, `RelayError`, `SyncError`, and `NotFoundError`.
21. `FR-21`: The system must expose `close()` to release IndexedDB connections and clean up active subscriptions.
22. `FR-22`: The system must generate UUIDv7 record IDs and use `{collectionName}:{recordId}` as the deterministic `d` tag (client-side only, encrypted inside gift wraps).
23. `FR-23`: The system must expose `rebuild()` to regenerate the materialized `records` store by replaying all events with LWW resolution.

## Non-Goals

- Multi-user collaboration.
- Shared collection invites or join flows.
- Membership tracking.
- Member revocation or key rotation.
- Full-text search.
- Cross-collection joins.
- Multi-record transactions.
- Node.js, Bun, or server-side storage adapters.
- Password-derived identity as the default or only identity mode.
- Promise-based public API (reserved for future framework bindings).
- Framework-specific bindings (Svelte, React, etc.) — these are separate future packages.
- Schema migration.
- KV store.
- IndexedDB quota management or compaction.

## Technical Considerations

- Effect is the public API. All public methods return `Effect` values with typed error channels. Framework bindings (e.g., `@localstr/svelte`, `@localstr/react`) will translate Effect streams into framework-native reactivity as separate packages.
- v0.2 uses IndexedDB as the only supported storage backend, with three stores: `giftwraps`, `events`, and `records`.
- The `events` store (decrypted rumors) is authoritative; the `records` store (materialized view) is rebuildable from events via LWW replay.
- The `giftwraps` store holds only event IDs (not full encrypted blobs) for negentropy fingerprint computation.
- Query execution is local-only against the `records` store. Relay filtering is a sync concern, not a query concern.
- NIP-59 gift wrapping provides three layers of privacy: the relay sees only the gift wrap (kind 1059) signed by a random disposable key with a randomized timestamp. The relay learns nothing about data structure, collection names, record IDs, real timestamps, or authorship. The gift wrap's `p` tag addresses the author's own public key for self-sync filtering.
- NIP-44 is used within NIP-59 for encryption at the seal and gift wrap layers.
- NIP-77 negentropy provides efficient set reconciliation that works regardless of timestamps. First sync (empty local state) degrades gracefully to a full download. Incremental syncs transfer only the difference. Cross-relay deduplication is handled naturally.
- Because NIP-59 randomizes timestamps and uses disposable keys, relay-side replaceable event deduplication is not possible. Every mutation produces a new gift wrap. The relay stores all versions. LWW resolution and dedup happen client-side after decryption.
- Record IDs are client-generated UUIDv7s (time-sortable). The `d` tag for a record's event is `{collectionName}:{recordId}`, visible only inside the encrypted rumor.
- Conflict resolution is last-write-wins by `created_at` timestamp, ties broken by lowest event ID (lexicographic).
- The root identity is a generated Nostr private key stored in IndexedDB, exportable via `exportKey()` for recovery and reuse on another device. If IndexedDB is cleared, the key is lost unless exported.
- A developer-supplied key or signer remains an advanced path for apps that want tighter identity control.
- Delete behavior is handled through replayable tombstones so rebuilds remain deterministic.
- v0.2 does not support schema migration. Adding new optional fields is safe — replay will populate them as `undefined`. Adding required fields, removing fields, or changing field types requires the developer to manually clear and rebuild the local database.
- The library does not manage IndexedDB quota. If the browser evicts storage, the local database is lost and must be rebuilt from relays via `sync()`. Applications storing large datasets should request persistent storage via `navigator.storage.persist()`.
- The NIP-77 negentropy implementation should depend on the external `negentropy` package (reference implementation by the NIP-77 author) rather than bundling a custom implementation.

## Success Metrics

- A developer can define a schema and perform typed local CRUD using the Effect API in a browser app with no direct Nostr usage.
- Data written on one device can be synced and read on a second device using an exported secret key.
- Local queries continue to work while offline.
- Relay failures do not block local writes.
- Relays learn nothing about data structure, content, authorship, or timing (NIP-59 privacy).
- The implementation passes `bun run validate`.

## Resolved Questions

- **`rebuild()` in public API?** Yes. Exposed as `db.rebuild()` returning an `Effect`. Useful as an escape hatch for corrupted state, schema changes, and testing.
- **Negentropy performance ceiling?** Not a concern for v0.2. The algorithm is O(n log n) and the reference JS implementation handles hundreds of thousands of items. The bottleneck would be IndexedDB reads, not the algorithm. Revisit if real usage shows issues.
- **Bundle or depend on external negentropy?** Depend on the external `negentropy` package by Doug Hoyte (NIP-77 author). It's the reference implementation, small, and actively maintained.
  [/PRD]

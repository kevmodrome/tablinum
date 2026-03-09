# tablinum

A local-first storage library for the browser. Define typed collections, read and write data locally via IndexedDB, and sync across devices through Nostr relays.

Built on [Effect](https://effect.website) and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## Features

- **Typed schema** — define collections with `collection()` and `field.*()` builders, get full TypeScript inference
- **Local-first** — all reads hit IndexedDB, no network required
- **Cross-device sync** — replicate data via Nostr relays using NIP-59 gift wrapping for privacy
- **Efficient reconciliation** — NIP-77 negentropy for minimal sync overhead
- **Dexie-style queries** — chainable `.where()`, `.above()`, `.below()`, `.orderBy()` API
- **Svelte 5 bindings** — optional reactive runes integration

## How it works

Tablinum stores all data locally in IndexedDB so your app works offline and reads are instant. When you call `sync()`, it replicates data to [Nostr](https://nostr.com) relays so your other devices can pick it up. All data sent to relays is encrypted using [NIP-59 gift wrapping](https://github.com/nostr-protocol/nips/blob/master/59.md) — relays never see your application data. Sync uses [NIP-77 negentropy](https://github.com/nostr-protocol/nips/blob/master/77.md) to efficiently reconcile what each side has, minimizing bandwidth.

## Getting started

### Pick a relay

Tablinum syncs through Nostr relays, which must support [NIP-77 (Negentropy)](https://github.com/nostr-protocol/nips/blob/master/77.md). You have two options:

- **Use a public relay** — find NIP-77 compatible relays at [nostrwat.ch](https://nostrwat.ch)
- **Self-host a relay** — [strfry](https://github.com/hoytech/strfry) is a good choice if you want full control over where your users' data is stored

### Install

```bash
npm install tablinum
```

### Quick start

```typescript
import { Effect } from "effect";
import { createLocalstr, collection, field } from "tablinum";

const schema = {
  todos: collection("todos", {
    title: field.string(),
    done: field.boolean(),
  }),
};

const program = Effect.gen(function* () {
  const db = yield* createLocalstr({
    schema,
    relays: ["wss://relay.example.com"],
  });

  const todos = db.collection("todos");

  // Create
  const id = yield* todos.add({ title: "Buy milk", done: false });

  // Read
  const todo = yield* todos.get(id);

  // Query
  const pending = yield* todos.where("done").equals(false).toArray();

  // Update
  yield* todos.update(id, { done: true });

  // Sync across devices
  yield* db.sync();
});

Effect.runPromise(Effect.scoped(program));
```

## License

MIT

import { Tablinum, field, collection, decodeInvite, type InferRecord } from "tablinum/svelte";
import { dbUiState, type RemovedInfo } from "./db-state.svelte";

const todosCollection = collection(
  "todos",
  {
    title: field.string(),
    done: field.boolean(),
    priority: field.number(),
  },
  { indices: ["done", "priority"] },
);

const contactsCollection = collection(
  "contacts",
  {
    name: field.string(),
    email: field.optional(field.string()),
    address: field.object({
      street: field.string(),
      city: field.string(),
      zip: field.optional(field.string()),
    }),
  },
  { indices: ["name"] },
);

export type TodoRecord = InferRecord<typeof todosCollection>;
export type ContactRecord = InferRecord<typeof contactsCollection>;

const schema = { todos: todosCollection, contacts: contactsCollection };
export type AppSchema = typeof schema;

function getInviteFromUrl(): ReturnType<typeof decodeInvite> | undefined {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get("invite");
  if (!invite) return undefined;
  try {
    return decodeInvite(invite);
  } catch {
    console.error("[tablinum] Invalid invite in URL");
    return undefined;
  }
}

let _db: Tablinum<AppSchema> | null = null;

export function initDb(opts?: { onRemoved?: (info: RemovedInfo) => void }) {
  if (_db && _db.status !== "closed" && _db.status !== "error") return _db;

  const invite = getInviteFromUrl();
  dbUiState.reset(!!invite);

  _db = new Tablinum({
    schema,
    relays: invite?.relays ?? ["wss://relay.nostr.place"],
    dbName: invite?.dbName ?? "tablinum-svelte-demo",
    epochKeys: invite?.epochKeys,
    onSyncError: (err) => {
      console.error("[tablinum:sync]", err.message);
    },
    onRemoved: (info) => {
      dbUiState.markRemoved(info);
      opts?.onRemoved?.(info);
    },
  });

  return _db;
}

export function getDb(): Tablinum<AppSchema> {
  if (!_db) throw new Error("Database not initialized — did hooks.client.ts run?");
  return _db;
}

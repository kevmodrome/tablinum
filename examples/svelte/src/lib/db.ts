import { createTablinum, field, collection, type InferRecord } from "tablinum/svelte";

const todosCollection = collection(
  "todos",
  {
    title: field.string(),
    done: field.boolean(),
    priority: field.number(),
  },
  { indices: ["done", "priority"] },
);

export type TodoRecord = InferRecord<typeof todosCollection>;

const schema = { todos: todosCollection };
export type AppSchema = typeof schema;

function getKeyFromUrl(): Uint8Array | undefined {
  const params = new URLSearchParams(window.location.search);
  const hex = params.get("key");
  if (!hex || hex.length !== 64) return undefined;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function initDb() {
  const importedKey = getKeyFromUrl();
  const dbSuffix = importedKey ? "-imported" : "";

  const db = await createTablinum({
    schema,
    relays: ["wss://relay.nostr.place"],
    dbName: `tablinum-svelte-demo${dbSuffix}`,
    privateKey: importedKey,
    onSyncError: (err) => {
      console.error("[tablinum:sync]", err.message);
    },
  });

  return { db, imported: !!importedKey };
}

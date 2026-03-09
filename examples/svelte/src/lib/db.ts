import { createTablinum, field, collection, decodeInvite, type InferRecord } from "tablinum/svelte";

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

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

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

export async function initDb() {
  const invite = getInviteFromUrl();

  const db = await createTablinum({
    schema,
    relays: invite?.relays ?? ["wss://relay.nostr.place"],
    dbName: invite?.dbName ?? "tablinum-svelte-demo",
    groupPrivateKey: invite ? hexToBytes(invite.groupKey) : undefined,
    onSyncError: (err) => {
      console.error("[tablinum:sync]", err.message);
    },
  });

  return { db, joined: !!invite };
}

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

export async function initDb(opts?: {
  onRemoved?: (info: { epochId: string; removedBy: string }) => void;
}) {
  const invite = getInviteFromUrl();

  const db = await createTablinum({
    schema,
    relays: invite?.relays ?? ["wss://relay.nostr.place"],
    dbName: invite?.dbName ?? "tablinum-svelte-demo",
    epochKeys: invite?.epochKeys,
    onSyncError: (err) => {
      console.error("[tablinum:sync]", err.message);
    },
    onRemoved: opts?.onRemoved,
  });

  return { db, joined: !!invite };
}

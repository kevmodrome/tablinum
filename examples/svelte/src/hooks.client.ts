import { initDb, getDb } from "$lib/db";

export async function init() {
  initDb();
  await getDb().ready.catch(() => undefined);
}

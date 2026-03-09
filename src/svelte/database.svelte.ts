import { Effect, Scope, Exit } from "effect";
import type { SchemaConfig } from "../schema/types.ts";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { DatabaseHandle, SyncStatus } from "../db/database-handle.ts";
import type { Invite } from "../db/invite.ts";
import { Collection } from "./collection.svelte.ts";

export class Database<S extends SchemaConfig> {
  status = $state<SyncStatus>("idle");
  error = $state<Error | null>(null);

  #handle: DatabaseHandle<S>;
  #scope: Scope.Closeable;
  #collections = new Map<string, Collection<CollectionDef<CollectionFields>>>();
  #statusInterval: ReturnType<typeof setInterval> | null = null;
  #closed = false;

  constructor(handle: DatabaseHandle<S>, scope: Scope.Closeable) {
    this.#handle = handle;
    this.#scope = scope;

    // Poll sync status
    this.#statusInterval = setInterval(() => {
      if (this.#closed) return;
      Effect.runPromise(this.#handle.getSyncStatus())
        .then((s) => {
          this.status = s;
        })
        .catch(() => {
          /* database may be closed, ignore */
        });
    }, 1000);
  }

  collection<K extends string & keyof S>(name: K): Collection<S[K]> {
    let col = this.#collections.get(name);
    if (!col) {
      const handle = this.#handle.collection(name);
      col = new Collection(handle) as Collection<CollectionDef<CollectionFields>>;
      this.#collections.set(name, col);
    }
    return col as unknown as Collection<S[K]>;
  }

  exportKey(): string {
    return this.#handle.exportKey();
  }

  exportInvite(): Invite {
    return this.#handle.exportInvite();
  }

  close = async (): Promise<void> => {
    if (this.#closed) return;
    this.#closed = true;

    if (this.#statusInterval) {
      clearInterval(this.#statusInterval);
      this.#statusInterval = null;
    }
    for (const col of this.#collections.values()) {
      col._destroy();
    }
    this.#collections.clear();
    await Effect.runPromise(this.#handle.close());
    await Effect.runPromise(Scope.close(this.#scope, Exit.void));
  };

  sync = async (): Promise<void> => {
    try {
      this.error = null;
      await Effect.runPromise(this.#handle.sync());
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  rebuild = async (): Promise<void> => {
    try {
      this.error = null;
      await Effect.runPromise(this.#handle.rebuild());
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };
}

import { Effect, Exit, Scope } from "effect";
import type { SchemaConfig } from "../schema/types.ts";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { DatabaseHandle, SyncStatus } from "../db/database-handle.ts";
import type { Invite } from "../db/invite.ts";
import type { MemberRecord } from "../db/members.ts";
import {
  createTablinum as coreCreateTablinum,
  type TablinumConfig,
} from "../db/create-tablinum.ts";
import { Collection } from "./collection.svelte.ts";
import { ClosedError } from "../errors.ts";
import { createDeferred } from "./deferred.ts";

export class Tablinum<S extends SchemaConfig> {
  status = $state<"initializing" | "ready" | "error" | "closed">("initializing");
  syncStatus = $state<SyncStatus>("idle");
  error = $state<Error | null>(null);

  readonly ready: Promise<void>;

  #handle: DatabaseHandle<S> | null = null;
  #scope: Scope.Closeable | null = null;
  #collections = new Map<string, Collection<CollectionDef<CollectionFields>>>();
  #members = new Collection<CollectionDef<CollectionFields>>();
  #unsubscribeSyncStatus: (() => void) | null = null;
  #closed = false;
  #readyState = createDeferred<void>();

  constructor(config: TablinumConfig<S>) {
    this.ready = this.#readyState.promise;
    this.#init(config);
  }

  #settleReady(err?: Error): void {
    if (err) {
      this.#readyState.reject(err);
    } else {
      this.#readyState.resolve();
    }
  }

  #bindCollections(handle: DatabaseHandle<S>): void {
    this.#members._bind(handle.members);

    for (const [name, collection] of this.#collections) {
      collection._bind(handle.collection(name as string & keyof S));
    }
  }

  #runHandleEffect = async <R>(
    run: (handle: DatabaseHandle<S>) => Effect.Effect<R, unknown>,
  ): Promise<R> => {
    const handle = this.#requireReady();
    try {
      this.error = null;
      return await Effect.runPromise(run(handle));
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  async #init(config: TablinumConfig<S>): Promise<void> {
    const scope = Effect.runSync(Scope.make());
    try {
      const handle = await Effect.runPromise(
        coreCreateTablinum(config).pipe(Effect.provideService(Scope.Scope, scope)),
      );
      if (this.#closed) {
        await Effect.runPromise(Scope.close(scope, Exit.void));
        this.#scope = null;
        return;
      }
      this.#handle = handle;
      this.#scope = scope;
      this.#bindCollections(handle);

      // Subscribe to sync status changes (reactive push instead of polling)
      this.#unsubscribeSyncStatus = handle.subscribeSyncStatus((s) => {
        this.syncStatus = s;
      });

      this.status = "ready";
      this.#settleReady();
    } catch (e) {
      await Effect.runPromise(Scope.close(scope, Exit.fail(e))).catch(() => {});
      const err = e instanceof Error ? e : new Error(String(e));
      this.error = err;
      this.status = "error";
      this.#members._fail(err);
      for (const col of this.#collections.values()) {
        col._fail(err);
      }
      this.#settleReady(err);
    }
  }

  get publicKey(): string {
    return this.#handle?.publicKey ?? "";
  }

  get members(): Collection<CollectionDef<CollectionFields>> {
    return this.#members;
  }

  collection<K extends string & keyof S>(name: K): Collection<S[K]> {
    if (this.#closed) {
      throw new ClosedError({ message: "Tablinum is closed" });
    }
    let col = this.#collections.get(name);
    if (!col) {
      col = new Collection() as Collection<CollectionDef<CollectionFields>>;
      this.#collections.set(name, col);
      if (this.#handle) {
        col._bind(this.#handle.collection(name));
      }
    }
    return col as unknown as Collection<S[K]>;
  }

  #requireReady(): DatabaseHandle<S> {
    if (!this.#handle) {
      throw this.error ?? new ClosedError({ message: "Tablinum is not ready" });
    }
    return this.#handle;
  }

  exportKey(): string {
    return this.#requireReady().exportKey();
  }

  exportInvite(): Invite {
    return this.#requireReady().exportInvite();
  }

  close = async (): Promise<void> => {
    if (this.#closed) return;
    this.#closed = true;
    const closeError = new ClosedError({
      message: this.#readyState.settled()
        ? "Tablinum is closed"
        : "Tablinum was closed before initialization completed",
    });

    if (this.#unsubscribeSyncStatus) {
      this.#unsubscribeSyncStatus();
      this.#unsubscribeSyncStatus = null;
    }
    this.#members._destroy(closeError);
    for (const col of this.#collections.values()) col._destroy(closeError);
    this.#collections.clear();
    const handle = this.#handle;
    const scope = this.#scope;
    this.#handle = null;
    this.#scope = null;
    if (handle && scope) {
      await Effect.runPromise(handle.close());
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    if (!this.#readyState.settled()) {
      this.error = closeError;
      this.#settleReady(closeError);
    }
    this.status = "closed";
  };

  sync = async (): Promise<void> => this.#runHandleEffect((handle) => handle.sync());

  rebuild = async (): Promise<void> => this.#runHandleEffect((handle) => handle.rebuild());

  addMember = async (pubkey: string): Promise<void> =>
    this.#runHandleEffect((handle) => handle.addMember(pubkey));

  removeMember = async (pubkey: string): Promise<void> =>
    this.#runHandleEffect((handle) => handle.removeMember(pubkey));

  getMembers = async (): Promise<ReadonlyArray<MemberRecord>> =>
    this.#runHandleEffect((handle) => handle.getMembers());

  setProfile = async (profile: {
    name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
  }): Promise<void> => this.#runHandleEffect((handle) => handle.setProfile(profile));
}

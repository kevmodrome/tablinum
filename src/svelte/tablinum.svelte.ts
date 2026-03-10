import { Effect, Exit, Scope } from "effect";
import { SvelteMap } from "svelte/reactivity";
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

export class Tablinum<S extends SchemaConfig> {
  status = $state<"initializing" | "ready" | "error" | "closed">("initializing");
  syncStatus = $state<SyncStatus>("idle");
  error = $state<Error | null>(null);

  readonly ready: Promise<void>;

  #handle: DatabaseHandle<S> | null = null;
  #scope: Scope.Closeable | null = null;
  #collections = new SvelteMap<string, Collection<CollectionDef<CollectionFields>>>();
  #statusInterval: ReturnType<typeof setInterval> | null = null;
  #closed = false;
  #resolveReady!: () => void;
  #rejectReady!: (err: Error) => void;
  #readySettled = false;

  constructor(config: TablinumConfig<S>) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    // Eagerly create _members so the getter never mutates state (safe in $derived)
    this.#collections.set("_members", new Collection());
    this.#init(config);
  }

  #settleReady(err?: Error): void {
    if (this.#readySettled) return;
    this.#readySettled = true;
    if (err) {
      this.#rejectReady(err);
    } else {
      this.#resolveReady();
    }
  }

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

      // Bind all eagerly-created collections
      for (const [name, col] of this.#collections) {
        const coreHandle =
          name === "_members" ? handle.members : handle.collection(name as string & keyof S);
        col._bind(
          coreHandle as import("../crud/collection-handle.ts").CollectionHandle<
            CollectionDef<CollectionFields>
          >,
        );
      }

      // Poll sync status
      this.#statusInterval = setInterval(() => {
        if (this.#closed || !this.#handle) return;
        Effect.runPromise(this.#handle.getSyncStatus())
          .then((s) => {
            this.syncStatus = s;
          })
          .catch(() => {});
      }, 1000);

      this.status = "ready";
      this.#settleReady();
    } catch (e) {
      await Effect.runPromise(Scope.close(scope, Exit.fail(e))).catch(() => {});
      const err = e instanceof Error ? e : new Error(String(e));
      this.error = err;
      this.status = "error";
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
    const col = this.#collections.get("_members");
    if (!col) throw new ClosedError({ message: "Tablinum is closed" });
    return col;
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
        const handle = this.#handle.collection(name);
        (col as unknown as Collection<S[K]>)._bind(handle);
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
      message: this.#readySettled
        ? "Tablinum is closed"
        : "Tablinum was closed before initialization completed",
    });

    if (this.#statusInterval) {
      clearInterval(this.#statusInterval);
      this.#statusInterval = null;
    }
    for (const col of this.#collections.values()) {
      col._destroy(closeError);
    }
    this.#collections.clear();
    const handle = this.#handle;
    const scope = this.#scope;
    this.#handle = null;
    this.#scope = null;
    if (handle && scope) {
      await Effect.runPromise(handle.close());
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    if (!this.#readySettled) {
      this.error = closeError;
      this.#settleReady(closeError);
    }
    this.status = "closed";
  };

  sync = async (): Promise<void> => {
    const handle = this.#requireReady();
    try {
      this.error = null;
      await Effect.runPromise(handle.sync());
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  rebuild = async (): Promise<void> => {
    const handle = this.#requireReady();
    try {
      this.error = null;
      await Effect.runPromise(handle.rebuild());
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  addMember = async (pubkey: string): Promise<void> => {
    const handle = this.#requireReady();
    try {
      this.error = null;
      await Effect.runPromise(handle.addMember(pubkey));
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  removeMember = async (pubkey: string): Promise<void> => {
    const handle = this.#requireReady();
    try {
      this.error = null;
      await Effect.runPromise(handle.removeMember(pubkey));
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  getMembers = async (): Promise<ReadonlyArray<MemberRecord>> => {
    const handle = this.#requireReady();
    try {
      this.error = null;
      return await Effect.runPromise(handle.getMembers());
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  setProfile = async (profile: {
    name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
  }): Promise<void> => {
    const handle = this.#requireReady();
    try {
      this.error = null;
      await Effect.runPromise(handle.setProfile(profile));
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };
}

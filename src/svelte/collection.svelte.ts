import { Effect, Option, Stream } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { InferRecord } from "../schema/types.ts";
import type { CollectionHandle } from "../crud/collection-handle.ts";
import { ClosedError } from "../errors.ts";
import {
  wrapWhereClause,
  wrapOrderByBuilder,
  type SvelteWhereClause,
  type SvelteOrderByBuilder,
} from "./query.svelte.ts";

export class Collection<C extends CollectionDef<CollectionFields>> {
  error = $state<Error | null>(null);

  #handle: CollectionHandle<C> | null = null;
  #ready!: Promise<void>;
  #resolveReady!: () => void;
  #rejectReady!: (err: Error) => void;
  #readySettled = false;
  #version = $state(0);
  #watchAbort: AbortController | null = null;

  constructor() {
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
  }

  /** @internal Called by Tablinum after the core handle is available. */
  _bind(handle: CollectionHandle<C>): void {
    if (this.#handle) return;
    this.#handle = handle;
    this.error = null;
    this.#settleReady();
    this.#startWatch();
  }

  /** @internal Called by Tablinum if initialization fails before binding. */
  _fail(err: Error): void {
    this.error = err;
    this.#settleReady(err);
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

  #startWatch() {
    if (!this.#handle) return;
    const abort = new AbortController();
    this.#watchAbort = abort;

    Effect.runPromise(
      Stream.runForEach(this.#handle.watch(), (records) =>
        Effect.sync(() => {
          if (!abort.signal.aborted) {
            this.#version++;
          }
        }),
      ),
    ).catch((e) => {
      if (!abort.signal.aborted) {
        this.error = e instanceof Error ? e : new Error(String(e));
      }
    });
  }

  #touchVersion = (): void => {
    // Reading $state synchronously so $derived tracks this dependency
    void this.#version;
  };

  #handleOrThrow = (): CollectionHandle<C> => {
    if (this.#handle) return this.#handle;
    throw this.error ?? new ClosedError({ message: "Collection is not ready" });
  };

  #run = async <R>(getEffect: () => Effect.Effect<R, unknown>): Promise<R> => {
    await this.#ready;
    return Effect.runPromise(getEffect());
  };

  add = (data: Omit<InferRecord<C>, "id">): Promise<string> => {
    return this.#run(() => this.#handleOrThrow().add(data));
  };

  update = (id: string, data: Partial<Omit<InferRecord<C>, "id">>): Promise<void> => {
    return this.#run(() => this.#handleOrThrow().update(id, data));
  };

  delete = (id: string): Promise<void> => {
    return this.#run(() => this.#handleOrThrow().delete(id));
  };

  get(): Promise<ReadonlyArray<InferRecord<C>>>;
  get(id: string): Promise<InferRecord<C>>;
  get(id?: string): Promise<ReadonlyArray<InferRecord<C>> | InferRecord<C>> {
    if (typeof id === "string") {
      return this.#run(() => this.#handleOrThrow().get(id));
    }
    // No-arg: return all records. Touch version for $derived reactivity.
    this.#touchVersion();
    return this.#run(() =>
      Stream.runHead(this.#handleOrThrow().watch()).pipe(
        Effect.map((opt) => Option.getOrElse(opt, () => [] as ReadonlyArray<InferRecord<C>>)),
      ),
    );
  }

  first = (): Promise<InferRecord<C> | null> => {
    this.#touchVersion();
    return this.#run(() => this.#handleOrThrow().first());
  };

  count = (): Promise<number> => {
    this.#touchVersion();
    return this.#run(() => this.#handleOrThrow().count());
  };

  where = (field: string & keyof Omit<InferRecord<C>, "id">): SvelteWhereClause<InferRecord<C>> => {
    return wrapWhereClause(
      () => this.#handleOrThrow().where(field),
      this.#touchVersion,
      this.#ready,
    );
  };

  orderBy = (
    field: string & keyof Omit<InferRecord<C>, "id">,
  ): SvelteOrderByBuilder<InferRecord<C>> => {
    return wrapOrderByBuilder(
      () => this.#handleOrThrow().orderBy(field),
      this.#touchVersion,
      this.#ready,
    );
  };

  /** @internal Called by Tablinum.close() */
  _destroy(reason: Error = new ClosedError({ message: "Collection is closed" })): void {
    if (this.#watchAbort) {
      this.#watchAbort.abort();
      this.#watchAbort = null;
    }
    this.#handle = null;
    this.error ??= reason;
    this.#settleReady(this.error);
  }
}

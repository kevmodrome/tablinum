import { Effect, Option, Stream } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { InferRecord } from "../schema/types.ts";
import type { CollectionHandle } from "../crud/collection-handle.ts";
import { ClosedError } from "../errors.ts";
import { createDeferred } from "./deferred.ts";
import {
  wrapWhereClause,
  wrapOrderByBuilder,
  type SvelteWhereClause,
  type SvelteOrderByBuilder,
} from "./query.svelte.ts";

export class Collection<C extends CollectionDef<CollectionFields>> {
  error = $state<Error | null>(null);

  #handle: CollectionHandle<C> | null = null;
  #ready = createDeferred<void>();
  #version = $state(0);
  #watchAbort: AbortController | null = null;

  /** @internal */
  _bind(handle: CollectionHandle<C>): void {
    if (this.#handle) return;
    this.#handle = handle;
    this.error = null;
    this.#settleReady();
    this.#startWatch();
  }

  /** @internal */
  _fail(err: Error): void {
    this.error = err;
    this.#settleReady(err);
  }

  #settleReady(err?: Error): void {
    if (err) {
      this.#ready.reject(err);
    } else {
      this.#ready.resolve();
    }
  }

  #startWatch() {
    if (!this.#handle) return;
    const abort = new AbortController();
    this.#watchAbort = abort;

    Effect.runPromise(
      Stream.runForEach(this.#handle.watch(), (_records) =>
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
    void this.#version;
  };

  #handleOrThrow = (): CollectionHandle<C> => {
    if (this.#handle) return this.#handle;
    throw this.error ?? new ClosedError({ message: "Collection is not ready" });
  };

  #run = async <R>(getEffect: () => Effect.Effect<R, unknown>): Promise<R> => {
    await this.#ready.promise;
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
    this.#touchVersion();
    return this.#run(() =>
      Stream.runHead(this.#handleOrThrow().watch()).pipe(
        Effect.map((opt) => Option.getOrElse(opt, () => [] as ReadonlyArray<InferRecord<C>>)),
      ),
    );
  }

  first = (): Promise<InferRecord<C> | null> => {
    this.#touchVersion();
    return this.#run(() => Effect.map(this.#handleOrThrow().first(), Option.getOrNull));
  };

  count = (): Promise<number> => {
    this.#touchVersion();
    return this.#run(() => this.#handleOrThrow().count());
  };

  where = (field: string & keyof Omit<InferRecord<C>, "id">): SvelteWhereClause<InferRecord<C>> => {
    return wrapWhereClause(
      () => this.#handleOrThrow().where(field),
      this.#touchVersion,
      this.#ready.promise,
    );
  };

  orderBy = (
    field: string & keyof Omit<InferRecord<C>, "id">,
  ): SvelteOrderByBuilder<InferRecord<C>> => {
    return wrapOrderByBuilder(
      () => this.#handleOrThrow().orderBy(field),
      this.#touchVersion,
      this.#ready.promise,
    );
  };

  /** @internal */
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

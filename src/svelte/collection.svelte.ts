import { Effect, Stream } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { InferRecord } from "../schema/types.ts";
import type { CollectionHandle } from "../crud/collection-handle.ts";
import { LiveQuery } from "./live-query.svelte.ts";
import {
  wrapWhereClause,
  wrapOrderByBuilder,
  type SvelteWhereClause,
  type SvelteOrderByBuilder,
} from "./query.svelte.ts";

export class Collection<C extends CollectionDef<CollectionFields>> {
  items = $state<ReadonlyArray<InferRecord<C>>>([]);
  error = $state<Error | null>(null);

  #handle: CollectionHandle<C>;
  #watchAbort: AbortController | null = null;
  #liveQueries: Set<LiveQuery<unknown>> = new Set();

  constructor(handle: CollectionHandle<C>) {
    this.#handle = handle;
    this.#startWatch();
  }

  #startWatch() {
    const abort = new AbortController();
    this.#watchAbort = abort;

    Effect.runPromise(
      Stream.runForEach(this.#handle.watch(), (records) =>
        Effect.sync(() => {
          if (!abort.signal.aborted) {
            console.log("[Collection] watch emitted", records.length, "records");
            console.log(records);
            this.items = records;
          }
        }),
      ),
    ).catch((e) => {
      console.error("[Collection] watch error", e);
      if (!abort.signal.aborted) {
        this.error = e instanceof Error ? e : new Error(String(e));
      }
    });
  }

  #run = async <R>(effect: Effect.Effect<R, unknown>): Promise<R> => {
    try {
      this.error = null;
      return await Effect.runPromise(effect);
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      throw this.error;
    }
  };

  #onLive = (lq: LiveQuery<unknown>): void => {
    this.#liveQueries.add(lq);
  };

  add = (data: Omit<InferRecord<C>, "id">): Promise<string> => this.#run(this.#handle.add(data));

  update = (id: string, data: Partial<Omit<InferRecord<C>, "id">>): Promise<void> =>
    this.#run(this.#handle.update(id, data));

  delete = (id: string): Promise<void> => this.#run(this.#handle.delete(id));

  get = (id: string): Promise<InferRecord<C>> => this.#run(this.#handle.get(id));

  first = (): Promise<InferRecord<C> | null> => this.#run(this.#handle.first());

  count = (): Promise<number> => this.#run(this.#handle.count());

  where = (field: string & keyof Omit<InferRecord<C>, "id">): SvelteWhereClause<InferRecord<C>> => {
    return wrapWhereClause(this.#handle.where(field), this.#onLive);
  };

  orderBy = (
    field: string & keyof Omit<InferRecord<C>, "id">,
  ): SvelteOrderByBuilder<InferRecord<C>> => {
    return wrapOrderByBuilder(this.#handle.orderBy(field), this.#onLive);
  };

  /** @internal Called by Database.close() */
  _destroy(): void {
    if (this.#watchAbort) {
      this.#watchAbort.abort();
      this.#watchAbort = null;
    }
    for (const lq of this.#liveQueries) {
      lq.destroy();
    }
    this.#liveQueries.clear();
  }
}

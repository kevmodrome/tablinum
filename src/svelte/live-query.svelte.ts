import { Effect, Stream } from "effect";

export class LiveQuery<T> {
  items = $state<ReadonlyArray<T>>([]);
  error = $state<Error | null>(null);
  #abort: AbortController | null = null;

  constructor(stream: Stream.Stream<ReadonlyArray<T>, unknown>) {
    const abort = new AbortController();
    this.#abort = abort;

    Effect.runPromise(
      Stream.runForEach(stream, (records) =>
        Effect.sync(() => {
          if (!abort.signal.aborted) {
            this.items = records;
          }
        }),
      ),
    ).catch((e) => {
      if (!abort.signal.aborted) {
        this.error = e instanceof Error ? e : new Error(String(e));
      }
    });
  }

  destroy(): void {
    if (this.#abort) {
      this.#abort.abort();
      this.#abort = null;
    }
  }
}

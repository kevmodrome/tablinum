import { Effect, Fiber, Stream } from "effect";

export class LiveQuery<T> {
  items = $state<ReadonlyArray<T>>([]);
  error = $state<Error | null>(null);
  #fiber: Fiber.Fiber<void, unknown> | null = null;

  constructor(stream: Stream.Stream<ReadonlyArray<T>, unknown>) {
    const effect = Stream.runForEach(stream, (records) =>
      Effect.sync(() => {
        this.items = records;
      }),
    ).pipe(
      Effect.catch((e) =>
        Effect.sync(() => {
          this.error = e instanceof Error ? e : new Error(String(e));
        }),
      ),
    );
    this.#fiber = Effect.runFork(effect);
  }

  destroy(): void {
    if (this.#fiber) {
      Effect.runFork(Fiber.interrupt(this.#fiber));
      this.#fiber = null;
    }
  }
}

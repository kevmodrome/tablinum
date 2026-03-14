export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly settled: () => boolean;
  readonly resolve: (value?: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    settled: () => settled,
    resolve: (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value as T | PromiseLike<T>);
    },
    reject: (reason) => {
      if (settled) return;
      settled = true;
      rejectPromise(reason);
    },
  };
}

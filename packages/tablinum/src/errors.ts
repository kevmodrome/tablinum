import { Data } from "effect";

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly field?: string | undefined;
}> {}

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class CryptoError extends Data.TaggedError("CryptoError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class RelayError extends Data.TaggedError("RelayError")<{
  readonly message: string;
  readonly url?: string | undefined;
  readonly cause?: unknown;
}> {}

export class SyncError extends Data.TaggedError("SyncError")<{
  readonly message: string;
  readonly phase?: string | undefined;
  readonly cause?: unknown;
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly collection: string;
  readonly id: string;
}> {}

export class ClosedError extends Data.TaggedError("ClosedError")<{
  readonly message: string;
}> {}

export interface EventMeta {
  readonly id: string;
  readonly createdAt: number;
}

/**
 * Last-write-wins resolution.
 * Higher `createdAt` wins. Ties broken by lowest event ID (lexicographic).
 * Returns the winner.
 */
export function resolveWinner<T extends EventMeta>(existing: T | null, incoming: T): T {
  if (existing === null) return incoming;
  if (incoming.createdAt > existing.createdAt) return incoming;
  if (incoming.createdAt < existing.createdAt) return existing;
  // Tie: lowest event ID wins
  return incoming.id < existing.id ? incoming : existing;
}

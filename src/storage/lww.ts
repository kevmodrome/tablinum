export interface EventMeta {
  readonly id: string;
  readonly createdAt: number;
}

export function resolveWinner<T extends EventMeta>(existing: T | null, incoming: T): T {
  if (existing === null) return incoming;
  if (incoming.createdAt > existing.createdAt) return incoming;
  if (incoming.createdAt < existing.createdAt) return existing;
  return incoming.id < existing.id ? incoming : existing;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  let hasChanges = false;

  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];

    if (isPlainObject(a) && isPlainObject(b)) {
      const nested = deepDiff(a, b);
      if (nested !== null) {
        result[key] = nested;
        hasChanges = true;
      }
    } else if (Array.isArray(a) && Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        result[key] = b;
        hasChanges = true;
      }
    } else if (a !== b) {
      result[key] = b;
      hasChanges = true;
    }
  }

  return hasChanges ? result : null;
}

export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const t = target[key];
    const s = source[key];

    if (isPlainObject(t) && isPlainObject(s)) {
      result[key] = deepMerge(t, s);
    } else {
      result[key] = s;
    }
  }

  return result;
}

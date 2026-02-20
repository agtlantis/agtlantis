function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ⚠️ WARNING: Designed for shallow-nested plain objects (e.g., ProviderOptions).
 * Not a full lodash/merge replacement — does not handle circular refs, class instances, or Symbols.
 */
export function deepMerge(
  ...sources: (Record<string, unknown> | undefined | null)[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    if (!source) continue;

    for (const key of Object.keys(source)) {
      const existing = result[key];
      const incoming = source[key];

      result[key] =
        isPlainObject(existing) && isPlainObject(incoming)
          ? deepMerge(existing, incoming)
          : incoming;
    }
  }

  return result;
}

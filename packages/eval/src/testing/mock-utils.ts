/**
 * Creates a properly-typed usage object for mock.text() options.
 *
 * The AI SDK requires usage objects with all properties defined, including
 * optional cache-related fields (cacheRead, cacheWrite, reasoning).
 * This helper provides sensible defaults.
 *
 * @example
 * mock.text(response, {
 *   usage: createMockUsage({ inputTokens: { total: 100 }, outputTokens: { total: 50 } })
 * })
 */
export function createMockUsage(overrides?: {
  inputTokens?: Partial<{
    total: number
    noCache: number
    cacheRead: number
    cacheWrite: number
  }>
  outputTokens?: Partial<{
    total: number
    text: number
    reasoning: number
  }>
}) {
  return {
    inputTokens: {
      total: 0,
      noCache: 0,
      cacheRead: undefined,
      cacheWrite: undefined,
      ...overrides?.inputTokens,
    },
    outputTokens: {
      total: 0,
      text: 0,
      reasoning: undefined,
      ...overrides?.outputTokens,
    },
  }
}

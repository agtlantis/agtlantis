/**
 * Extracts JSON from LLM response, handling markdown code blocks.
 *
 * Supports:
 * - Raw JSON: `{"key": "value"}`
 * - Markdown code block: ```json\n{...}\n```
 * - Code block without annotation: ```\n{...}\n```
 * - JSON embedded in text: "Here is my answer: {...} Hope this helps"
 *
 * @example
 * ```typescript
 * const json = extractJson('```json\n{"foo": "bar"}\n```')
 * console.log(json) // '{"foo": "bar"}'
 * ```
 */
export function extractJson(content: string): string {
  const markdownCodeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (markdownCodeBlockMatch) {
    return markdownCodeBlockMatch[1].trim()
  }

  const jsonObjectMatch = content.match(/\{[\s\S]*\}/)
  if (jsonObjectMatch) {
    return jsonObjectMatch[0]
  }

  return content.trim()
}

/**
 * Truncates a string to a maximum length with ellipsis.
 * Only adds "..." if the string was actually truncated.
 *
 * @example
 * ```typescript
 * truncate('hello', 10)     // 'hello'
 * truncate('hello world', 5) // 'hello...'
 * ```
 */
export function truncate(str: string | undefined | null, maxLength: number): string {
  if (!str) {
    return ''
  }
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength) + '...'
}

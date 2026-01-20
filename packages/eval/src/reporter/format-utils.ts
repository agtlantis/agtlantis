import { mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Formats a score delta for display with consistent sign prefix.
 *
 * @example
 * formatScoreDelta(5.2)   // "+5.2"
 * formatScoreDelta(-3.1)  // "-3.1"
 * formatScoreDelta(0)     // "+0.0"
 * formatScoreDelta(null)  // "-"
 */
export function formatScoreDelta(delta: number | null): string {
  if (delta === null) {
    return '-'
  }
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}`
}

/**
 * Builds the output file path, creating the output directory if it doesn't exist.
 * Used by file-based reporters for consistent path handling.
 */
export function buildOutputPath(
  outputDir: string,
  name: string,
  extension: string,
  addTimestamp: boolean
): string {
  mkdirSync(outputDir, { recursive: true })
  const filename = addTimestamp
    ? `${name}-${Date.now()}.${extension}`
    : `${name}.${extension}`
  return path.join(outputDir, filename)
}

/** Converts a Date to ISO string, handling both Date objects and already-serialized strings */
export function toISOStringIfDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

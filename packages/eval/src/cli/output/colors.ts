/**
 * Terminal Color Utilities
 *
 * Shared ANSI color codes and helpers for CLI output formatting.
 */

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const

export const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR

/**
 * Apply color to text if terminal supports colors.
 */
export function c(color: keyof typeof colors, text: string): string {
  return isColorSupported ? `${colors[color]}${text}${colors.reset}` : text
}

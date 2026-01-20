import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function loadEnvFile(
  filePath: string = '.env',
  cwd: string = process.cwd()
): Promise<void> {
  const absolutePath = resolve(cwd, filePath)

  if (!existsSync(absolutePath)) {
    return
  }

  try {
    const content = await readFile(absolutePath, 'utf-8')
    const vars = parseEnvFile(content)

    for (const [key, value] of Object.entries(vars)) {
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  } catch {
    // Silently ignore read errors
  }
}

/**
 * Parses .env content. Supports KEY=value, quoted values, comments, and escape sequences.
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (value.includes('\\')) {
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
    }

    if (key) {
      result[key] = value
    }
  }

  return result
}

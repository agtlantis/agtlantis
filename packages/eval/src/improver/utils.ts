import type { Suggestion } from './types'
import type { AgentPrompt } from '@/core/types'
import { EvalError, EvalErrorCode } from '@/core/errors'
import { truncate } from '@/utils/json'
import { compileTemplate } from '@agtlantis/core'

/**
 * Generates a unified diff string for a suggestion.
 *
 * @example
 * ```typescript
 * const diff = suggestionDiff(suggestion)
 * console.log(diff)
 * // - Old value here
 * // + New value here
 * ```
 */
export function suggestionDiff(suggestion: Suggestion): string {
  const oldLines = suggestion.currentValue.split('\n')
  const newLines = suggestion.suggestedValue.split('\n')

  const lines: string[] = []
  lines.push(`--- ${suggestion.type} (current)`)
  lines.push(`+++ ${suggestion.type} (suggested)`)
  lines.push('')

  for (const line of oldLines) {
    lines.push(`- ${line}`)
  }
  for (const line of newLines) {
    lines.push(`+ ${line}`)
  }

  return lines.join('\n')
}

/**
 * Generates a preview of what the suggestion would look like when applied.
 *
 * @example
 * ```typescript
 * const preview = suggestionPreview(suggestion)
 * console.log(preview)
 * ```
 */
export function suggestionPreview(suggestion: Suggestion): string {
  const lines: string[] = []

  lines.push(`=== Suggestion Preview ===`)
  lines.push(`Type: ${suggestion.type}`)
  lines.push(`Priority: ${suggestion.priority}`)
  lines.push(``)
  lines.push(`Reasoning: ${suggestion.reasoning}`)
  lines.push(``)
  lines.push(`Expected Improvement: ${suggestion.expectedImprovement}`)
  lines.push(``)
  lines.push(`--- Current Value ---`)
  lines.push(suggestion.currentValue)
  lines.push(``)
  lines.push(`--- Suggested Value ---`)
  lines.push(suggestion.suggestedValue)

  return lines.join('\n')
}

/**
 * Formats a suggestion as a compact summary string.
 *
 * @example
 * ```typescript
 * console.log(suggestionSummary(suggestion))
 * // [HIGH] system_prompt: Improve clarity in instructions
 * ```
 */
export function suggestionSummary(suggestion: Suggestion): string {
  const priorityTag = `[${suggestion.priority.toUpperCase()}]`
  return `${priorityTag} ${suggestion.type}: ${truncate(suggestion.reasoning, 60)}`
}

/**
 * Safely replaces the first occurrence of a search string with a replacement string.
 * Uses a function replacement to avoid special pattern interpretation ($&, $1, etc.)
 * that JavaScript's String.replace() performs.
 *
 * @internal
 */
function safeReplace(str: string, search: string, replacement: string): string {
  return str.replace(search, () => replacement)
}

/**
 * Options for applying suggestions to a prompt.
 */
export interface ApplyPromptSuggestionsOptions {
  /**
   * Version bump type for semver.
   * - 'major': 1.0.0 → 2.0.0 (breaking changes)
   * - 'minor': 1.0.0 → 1.1.0 (new features)
   * - 'patch': 1.0.0 → 1.0.1 (bug fixes)
   */
  bumpVersion?: 'major' | 'minor' | 'patch'
}

/**
 * Result of applying suggestions to a prompt.
 */
export interface ApplySuggestionsResult<TInput, TOutput = unknown> {
  /** The updated prompt with suggestions applied */
  prompt: AgentPrompt<TInput>
  /** Number of suggestions that were successfully applied */
  appliedCount: number
  /** Suggestions that could not be applied (currentValue not found) */
  skipped: Array<{ suggestion: Suggestion; reason: string }>
}

/**
 * Bumps a semver version string.
 *
 * @example
 * ```typescript
 * bumpVersion('1.0.0', 'major') // '2.0.0'
 * bumpVersion('1.0.0', 'minor') // '1.1.0'
 * bumpVersion('1.0.0', 'patch') // '1.0.1'
 * bumpVersion('1.2.3', 'minor') // '1.3.0'
 * ```
 */
export function bumpVersion(
  version: string,
  bump: 'major' | 'minor' | 'patch'
): string {
  const parts = version.split('.').map((n) => parseInt(n, 10))

  // Handle invalid version formats
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new EvalError(`Invalid version format: "${version}". Expected semver format (x.y.z)`, {
      code: EvalErrorCode.SUGGESTION_APPLY_ERROR,
      context: { version, expectedFormat: 'x.y.z' },
    })
  }

  const [major, minor, patch] = parts

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

/**
 * Applies approved suggestions to an AgentPrompt and returns a new prompt.
 *
 * This function:
 * - Only applies suggestions where `approved === true`
 * - For `system_prompt`: replaces `currentValue` in `prompt.system`
 * - For `user_prompt`: requires `prompt.userTemplate` field, updates it and regenerates `buildUserPrompt`
 * - For `parameters`: applies to custom fields in the prompt
 * - Optionally bumps the version (major/minor/patch)
 *
 * **Important behaviors:**
 * - Only the **first occurrence** of `currentValue` is replaced (not all occurrences)
 * - Special characters like `$&`, `$1` in `suggestedValue` are preserved as-is (no regex interpretation)
 *
 * @example
 * ```typescript
 * // Apply approved suggestions with minor version bump
 * const result = applyPromptSuggestions(
 *   currentPrompt,
 *   suggestions.filter(s => s.approved),
 *   { bumpVersion: 'minor' }
 * )
 *
 * console.log(result.prompt.version) // '1.1.0'
 * console.log(`Applied ${result.appliedCount} suggestions`)
 *
 * if (result.skipped.length > 0) {
 *   console.warn('Skipped suggestions:', result.skipped)
 * }
 * ```
 *
 * @throws {EvalError} with code SUGGESTION_APPLY_ERROR if:
 *   - A `user_prompt` suggestion is applied but prompt lacks `userTemplate` field
 *   - Version format is invalid when bumpVersion is specified
 */
export function applyPromptSuggestions<TInput, TOutput = unknown>(
  currentPrompt: AgentPrompt<TInput>,
  suggestions: Suggestion[],
  options?: ApplyPromptSuggestionsOptions
): ApplySuggestionsResult<TInput, TOutput> {
  const approvedSuggestions = suggestions.filter((s) => s.approved)

  if (approvedSuggestions.length === 0) {
    return {
      prompt: currentPrompt,
      appliedCount: 0,
      skipped: [],
    }
  }

  let newPrompt: AgentPrompt<TInput> = { ...currentPrompt }
  let appliedCount = 0
  const skipped: Array<{ suggestion: Suggestion; reason: string }> = []

  for (const suggestion of approvedSuggestions) {
    const applyResult = applySingleSuggestion(newPrompt, suggestion)

    if (applyResult.success) {
      newPrompt = applyResult.prompt
      appliedCount++
    } else {
      skipped.push({ suggestion, reason: applyResult.reason })
    }
  }

  if (options?.bumpVersion && appliedCount > 0) {
    newPrompt = {
      ...newPrompt,
      version: bumpVersion(currentPrompt.version, options.bumpVersion),
    }
  }

  return {
    prompt: newPrompt,
    appliedCount,
    skipped,
  }
}

/** Fields that are part of the core AgentPrompt interface and should not be modified by 'parameters' suggestions */
const AGENT_PROMPT_CORE_FIELDS = ['id', 'version', 'system', 'buildUserPrompt', 'userTemplate'] as const

function applySingleSuggestion<TInput, TOutput>(
  prompt: AgentPrompt<TInput>,
  suggestion: Suggestion
):
  | { success: true; prompt: AgentPrompt<TInput> }
  | { success: false; reason: string } {
  switch (suggestion.type) {
    case 'system_prompt': {
      if (!prompt.system.includes(suggestion.currentValue)) {
        return {
          success: false,
          reason: `currentValue not found in system prompt: "${truncate(suggestion.currentValue, 50)}"`,
        }
      }
      return {
        success: true,
        prompt: {
          ...prompt,
          system: safeReplace(prompt.system, suggestion.currentValue, suggestion.suggestedValue),
        },
      }
    }

    case 'user_prompt': {
      const userTemplate = prompt.userTemplate as string | undefined

      if (typeof userTemplate !== 'string') {
        throw new EvalError(
          `Cannot apply user_prompt suggestion: prompt does not have a userTemplate field. ` +
            `The buildUserPrompt is a function and cannot be modified directly.`,
          {
            code: EvalErrorCode.SUGGESTION_APPLY_ERROR,
            context: {
              suggestionType: suggestion.type,
              hasUserTemplate: 'userTemplate' in prompt,
            },
          }
        )
      }

      if (!userTemplate.includes(suggestion.currentValue)) {
        return {
          success: false,
          reason: `currentValue not found in userTemplate: "${truncate(suggestion.currentValue, 50)}"`,
        }
      }

      const newTemplate = safeReplace(userTemplate, suggestion.currentValue, suggestion.suggestedValue)

      return {
        success: true,
        prompt: {
          ...prompt,
          userTemplate: newTemplate,
          buildUserPrompt: compileTemplate<TInput>(newTemplate, prompt.id),
        },
      }
    }

    case 'parameters': {
      const updatedPrompt = { ...prompt }
      let found = false

      for (const [key, value] of Object.entries(updatedPrompt)) {
        if (AGENT_PROMPT_CORE_FIELDS.includes(key as typeof AGENT_PROMPT_CORE_FIELDS[number])) {
          continue
        }

        if (typeof value === 'string' && value.includes(suggestion.currentValue)) {
          ;(updatedPrompt as Record<string, unknown>)[key] = safeReplace(
            value,
            suggestion.currentValue,
            suggestion.suggestedValue
          )
          found = true
          break
        }
      }

      if (!found) {
        return {
          success: false,
          reason: `currentValue not found in any parameter field: "${truncate(suggestion.currentValue, 50)}"`,
        }
      }

      return {
        success: true,
        prompt: updatedPrompt,
      }
    }

    default: {
      const _exhaustive: never = suggestion.type
      return {
        success: false,
        reason: `Unknown suggestion type: ${suggestion.type}`,
      }
    }
  }
}

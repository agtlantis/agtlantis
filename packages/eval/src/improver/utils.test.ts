import { describe, it, expect } from 'vitest'
import {
  suggestionDiff,
  suggestionPreview,
  suggestionSummary,
  bumpVersion,
  applyPromptSuggestions,
} from './utils'
import type { Suggestion } from './types'
import type { AgentPrompt } from '@/core/types'
import { EvalErrorCode } from '@/core/errors'

describe('suggestionDiff', () => {
  const baseSuggestion: Suggestion = {
    type: 'system_prompt',
    priority: 'high',
    currentValue: 'You are a helpful assistant.',
    suggestedValue: 'You are a precise and helpful assistant.',
    reasoning: 'Add precision to improve accuracy.',
    expectedImprovement: 'Better accuracy scores.',
  }

  it('should generate diff header with type', () => {
    const diff = suggestionDiff(baseSuggestion)

    expect(diff).toContain('--- system_prompt (current)')
    expect(diff).toContain('+++ system_prompt (suggested)')
  })

  it('should show old value with minus prefix', () => {
    const diff = suggestionDiff(baseSuggestion)

    expect(diff).toContain('- You are a helpful assistant.')
  })

  it('should show new value with plus prefix', () => {
    const diff = suggestionDiff(baseSuggestion)

    expect(diff).toContain('+ You are a precise and helpful assistant.')
  })

  it('should handle multiline values', () => {
    const multilineSuggestion: Suggestion = {
      ...baseSuggestion,
      currentValue: 'Line 1\nLine 2\nLine 3',
      suggestedValue: 'New Line 1\nNew Line 2',
    }

    const diff = suggestionDiff(multilineSuggestion)

    expect(diff).toContain('- Line 1')
    expect(diff).toContain('- Line 2')
    expect(diff).toContain('- Line 3')
    expect(diff).toContain('+ New Line 1')
    expect(diff).toContain('+ New Line 2')
  })

  it('should handle empty currentValue', () => {
    const emptySuggestion: Suggestion = {
      ...baseSuggestion,
      currentValue: '',
    }

    const diff = suggestionDiff(emptySuggestion)

    expect(diff).toContain('- ')
    expect(diff).toContain('+ You are a precise')
  })

  it('should handle all suggestion types', () => {
    const types: Array<'system_prompt' | 'user_prompt' | 'parameters'> = [
      'system_prompt',
      'user_prompt',
      'parameters',
    ]

    for (const type of types) {
      const suggestion: Suggestion = { ...baseSuggestion, type }
      const diff = suggestionDiff(suggestion)

      expect(diff).toContain(`--- ${type} (current)`)
      expect(diff).toContain(`+++ ${type} (suggested)`)
    }
  })
})

describe('suggestionPreview', () => {
  const baseSuggestion: Suggestion = {
    type: 'user_prompt',
    priority: 'medium',
    currentValue: 'Current prompt text',
    suggestedValue: 'Suggested prompt text',
    reasoning: 'This change improves clarity.',
    expectedImprovement: 'Clearer user prompts.',
  }

  it('should include type and priority', () => {
    const preview = suggestionPreview(baseSuggestion)

    expect(preview).toContain('Type: user_prompt')
    expect(preview).toContain('Priority: medium')
  })

  it('should include reasoning and expected improvement', () => {
    const preview = suggestionPreview(baseSuggestion)

    expect(preview).toContain('Reasoning: This change improves clarity.')
    expect(preview).toContain('Expected Improvement: Clearer user prompts.')
  })

  it('should include current and suggested values', () => {
    const preview = suggestionPreview(baseSuggestion)

    expect(preview).toContain('--- Current Value ---')
    expect(preview).toContain('Current prompt text')
    expect(preview).toContain('--- Suggested Value ---')
    expect(preview).toContain('Suggested prompt text')
  })

  it('should include section header', () => {
    const preview = suggestionPreview(baseSuggestion)

    expect(preview).toContain('=== Suggestion Preview ===')
  })

  it('should handle all priority levels', () => {
    const priorities: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low']

    for (const priority of priorities) {
      const suggestion: Suggestion = { ...baseSuggestion, priority }
      const preview = suggestionPreview(suggestion)

      expect(preview).toContain(`Priority: ${priority}`)
    }
  })
})

describe('suggestionSummary', () => {
  const baseSuggestion: Suggestion = {
    type: 'parameters',
    priority: 'low',
    currentValue: 'temp=0.7',
    suggestedValue: 'temp=0.3',
    reasoning: 'Reduce temperature for more consistent outputs.',
    expectedImprovement: 'Less variance in responses.',
  }

  it('should include priority tag in uppercase', () => {
    const summary = suggestionSummary(baseSuggestion)

    expect(summary).toContain('[LOW]')
  })

  it('should include type', () => {
    const summary = suggestionSummary(baseSuggestion)

    expect(summary).toContain('parameters:')
  })

  it('should truncate long reasoning with ellipsis', () => {
    const longReasoningSuggestion: Suggestion = {
      ...baseSuggestion,
      reasoning:
        'This is a very long reasoning that exceeds sixty characters and should be truncated properly.',
    }

    const summary = suggestionSummary(longReasoningSuggestion)

    expect(summary).toContain('...')
    expect(summary.length).toBeLessThan(100)
  })

  it('should not add ellipsis for short reasoning', () => {
    const shortReasoningSuggestion: Suggestion = {
      ...baseSuggestion,
      reasoning: 'Short reason',
    }

    const summary = suggestionSummary(shortReasoningSuggestion)

    expect(summary).toBe('[LOW] parameters: Short reason')
    expect(summary).not.toContain('...')
  })

  it('should handle all priority levels', () => {
    const priorities: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low']

    for (const priority of priorities) {
      const suggestion: Suggestion = { ...baseSuggestion, priority }
      const summary = suggestionSummary(suggestion)

      expect(summary).toContain(`[${priority.toUpperCase()}]`)
    }
  })

  it('should handle all suggestion types', () => {
    const types: Array<'system_prompt' | 'user_prompt' | 'parameters'> = [
      'system_prompt',
      'user_prompt',
      'parameters',
    ]

    for (const type of types) {
      const suggestion: Suggestion = { ...baseSuggestion, type }
      const summary = suggestionSummary(suggestion)

      expect(summary).toContain(`${type}:`)
    }
  })

  it('should handle reasoning exactly at 60 characters', () => {
    // Exactly 60 characters
    const exactReasoning = 'a'.repeat(60)
    const suggestion: Suggestion = {
      ...baseSuggestion,
      reasoning: exactReasoning,
    }

    const summary = suggestionSummary(suggestion)

    expect(summary).not.toContain('...')
    expect(summary).toContain(exactReasoning)
  })
})

// ============================================================================
// bumpVersion Tests
// ============================================================================

describe('bumpVersion', () => {
  describe('major bump', () => {
    it('should increment major and reset minor/patch', () => {
      expect(bumpVersion('1.0.0', 'major')).toBe('2.0.0')
      expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
      expect(bumpVersion('0.1.0', 'major')).toBe('1.0.0')
    })
  })

  describe('minor bump', () => {
    it('should increment minor and reset patch', () => {
      expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0')
      expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
      expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0')
    })
  })

  describe('patch bump', () => {
    it('should only increment patch', () => {
      expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1')
      expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
      expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1')
    })
  })

  describe('edge cases', () => {
    it('should handle large version numbers', () => {
      expect(bumpVersion('99.99.99', 'major')).toBe('100.0.0')
      expect(bumpVersion('99.99.99', 'minor')).toBe('99.100.0')
      expect(bumpVersion('99.99.99', 'patch')).toBe('99.99.100')
    })
  })

  describe('error handling', () => {
    it('should throw SUGGESTION_APPLY_ERROR for invalid format', () => {
      try {
        bumpVersion('1.0', 'major')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect((error as { code: string }).code).toBe(EvalErrorCode.SUGGESTION_APPLY_ERROR)
        expect((error as Error).message).toContain('Invalid version format')
      }
    })

    it('should throw for non-numeric version parts', () => {
      expect(() => bumpVersion('a.b.c', 'major')).toThrow()
      expect(() => bumpVersion('1.x.0', 'minor')).toThrow()
    })

    it('should throw for empty version string', () => {
      expect(() => bumpVersion('', 'major')).toThrow()
    })

    it('should throw for too many version parts', () => {
      expect(() => bumpVersion('1.0.0.0', 'major')).toThrow()
    })
  })
})

// ============================================================================
// applyPromptSuggestions Tests
// ============================================================================

describe('applyPromptSuggestions', () => {
  // Helper to create a base prompt for testing
  const createBasePrompt = (): AgentPrompt<{ name: string }> => ({
    id: 'test-prompt',
    version: '1.0.0',
    system: 'You are a helpful assistant.',
    buildUserPrompt: (input) => `Hello, ${input.name}!`,
  })

  // Helper to create a prompt with userTemplate
  const createPromptWithTemplate = (): AgentPrompt<{ name: string }> & {
    userTemplate: string
  } => ({
    id: 'test-prompt',
    version: '1.0.0',
    system: 'You are a helpful assistant.',
    userTemplate: 'Hello, {{name}}!',
    buildUserPrompt: (input) => `Hello, ${input.name}!`,
  })

  // Helper to create a suggestion
  const createSuggestion = (overrides: Partial<Suggestion> = {}): Suggestion => ({
    type: 'system_prompt',
    priority: 'high',
    currentValue: 'helpful',
    suggestedValue: 'precise and helpful',
    reasoning: 'Improves clarity',
    expectedImprovement: 'Better responses',
    approved: true,
    ...overrides,
  })

  describe('basic functionality', () => {
    it('should return original prompt when no suggestions are provided', () => {
      const prompt = createBasePrompt()
      const result = applyPromptSuggestions(prompt, [])

      expect(result.prompt).toBe(prompt)
      expect(result.appliedCount).toBe(0)
      expect(result.skipped).toHaveLength(0)
    })

    it('should return original prompt when no suggestions are approved', () => {
      const prompt = createBasePrompt()
      const suggestions = [
        createSuggestion({ approved: false }),
        createSuggestion({ approved: undefined }),
      ]

      const result = applyPromptSuggestions(prompt, suggestions)

      expect(result.prompt).toBe(prompt)
      expect(result.appliedCount).toBe(0)
      expect(result.skipped).toHaveLength(0)
    })

    it('should not mutate the original prompt', () => {
      const prompt = createBasePrompt()
      const originalSystem = prompt.system
      const suggestions = [createSuggestion()]

      applyPromptSuggestions(prompt, suggestions)

      expect(prompt.system).toBe(originalSystem)
    })
  })

  describe('system_prompt suggestions', () => {
    it('should apply system_prompt suggestion successfully', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion({
        type: 'system_prompt',
        currentValue: 'helpful',
        suggestedValue: 'precise and helpful',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.prompt.system).toBe('You are a precise and helpful assistant.')
      expect(result.appliedCount).toBe(1)
      expect(result.skipped).toHaveLength(0)
    })

    it('should skip suggestion when currentValue not found', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion({
        type: 'system_prompt',
        currentValue: 'nonexistent text',
        suggestedValue: 'replacement',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.prompt.system).toBe(prompt.system)
      expect(result.appliedCount).toBe(0)
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].reason).toContain('not found in system prompt')
    })

    it('should apply multiple system_prompt suggestions', () => {
      const prompt = createBasePrompt()
      const suggestions = [
        createSuggestion({
          currentValue: 'You',
          suggestedValue: 'Act as',
        }),
        createSuggestion({
          currentValue: 'helpful',
          suggestedValue: 'helpful and precise',
        }),
      ]

      const result = applyPromptSuggestions(prompt, suggestions)

      expect(result.prompt.system).toBe('Act as are a helpful and precise assistant.')
      expect(result.appliedCount).toBe(2)
    })
  })

  describe('user_prompt suggestions', () => {
    it('should apply user_prompt suggestion when userTemplate exists', () => {
      const prompt = createPromptWithTemplate()
      const suggestion = createSuggestion({
        type: 'user_prompt',
        currentValue: 'Hello',
        suggestedValue: 'Greetings',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect((result.prompt as typeof prompt).userTemplate).toBe('Greetings, {{name}}!')
      expect(result.prompt.buildUserPrompt({ name: 'World' })).toBe('Greetings, World!')
      expect(result.appliedCount).toBe(1)
    })

    it('should throw SUGGESTION_APPLY_ERROR when userTemplate is missing', () => {
      const prompt = createBasePrompt() // No userTemplate
      const suggestion = createSuggestion({
        type: 'user_prompt',
        currentValue: 'Hello',
        suggestedValue: 'Greetings',
      })

      try {
        applyPromptSuggestions(prompt, [suggestion])
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect((error as { code: string }).code).toBe(EvalErrorCode.SUGGESTION_APPLY_ERROR)
        expect((error as Error).message).toContain('userTemplate')
      }
    })

    it('should skip user_prompt suggestion when currentValue not found in template', () => {
      const prompt = createPromptWithTemplate()
      const suggestion = createSuggestion({
        type: 'user_prompt',
        currentValue: 'nonexistent',
        suggestedValue: 'replacement',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.appliedCount).toBe(0)
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].reason).toContain('not found in userTemplate')
    })
  })

  describe('parameters suggestions', () => {
    it('should apply parameters suggestion to custom fields', () => {
      const prompt = {
        ...createBasePrompt(),
        model: 'gpt-4o',
        temperature: '0.7',
      }
      const suggestion = createSuggestion({
        type: 'parameters',
        currentValue: '0.7',
        suggestedValue: '0.3',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect((result.prompt as typeof prompt).temperature).toBe('0.3')
      expect(result.appliedCount).toBe(1)
    })

    it('should skip parameters suggestion when currentValue not found', () => {
      const prompt = {
        ...createBasePrompt(),
        model: 'gpt-4o',
      }
      const suggestion = createSuggestion({
        type: 'parameters',
        currentValue: 'nonexistent',
        suggestedValue: 'replacement',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.appliedCount).toBe(0)
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].reason).toContain('not found in any parameter field')
    })

    it('should not modify core fields (id, version, system, buildUserPrompt)', () => {
      const prompt = createBasePrompt()
      // Even if currentValue matches something in 'id', it shouldn't modify it
      const suggestion = createSuggestion({
        type: 'parameters',
        currentValue: 'test',
        suggestedValue: 'modified',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      // Should be skipped because 'test' is only in 'id' which is a core field
      expect(result.prompt.id).toBe('test-prompt')
      expect(result.skipped).toHaveLength(1)
    })
  })

  describe('version bumping', () => {
    it('should bump version when bumpVersion option is set', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion()

      const result = applyPromptSuggestions(prompt, [suggestion], {
        bumpVersion: 'minor',
      })

      expect(result.prompt.version).toBe('1.1.0')
    })

    it('should not bump version when no suggestions are applied', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion({
        currentValue: 'nonexistent',
      })

      const result = applyPromptSuggestions(prompt, [suggestion], {
        bumpVersion: 'minor',
      })

      expect(result.prompt.version).toBe('1.0.0')
    })

    it('should bump major version correctly', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion()

      const result = applyPromptSuggestions(prompt, [suggestion], {
        bumpVersion: 'major',
      })

      expect(result.prompt.version).toBe('2.0.0')
    })

    it('should bump patch version correctly', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion()

      const result = applyPromptSuggestions(prompt, [suggestion], {
        bumpVersion: 'patch',
      })

      expect(result.prompt.version).toBe('1.0.1')
    })
  })

  describe('mixed suggestions', () => {
    it('should apply multiple types of suggestions', () => {
      const prompt = {
        ...createPromptWithTemplate(),
        customField: 'value1',
      }
      const suggestions = [
        createSuggestion({
          type: 'system_prompt',
          currentValue: 'helpful',
          suggestedValue: 'precise',
        }),
        createSuggestion({
          type: 'user_prompt',
          currentValue: 'Hello',
          suggestedValue: 'Hi',
        }),
        createSuggestion({
          type: 'parameters',
          currentValue: 'value1',
          suggestedValue: 'value2',
        }),
      ]

      const result = applyPromptSuggestions(prompt, suggestions, {
        bumpVersion: 'minor',
      })

      expect(result.prompt.system).toBe('You are a precise assistant.')
      expect((result.prompt as typeof prompt).userTemplate).toBe('Hi, {{name}}!')
      expect((result.prompt as typeof prompt).customField).toBe('value2')
      expect(result.prompt.version).toBe('1.1.0')
      expect(result.appliedCount).toBe(3)
      expect(result.skipped).toHaveLength(0)
    })

    it('should track both applied and skipped suggestions', () => {
      const prompt = createBasePrompt()
      const suggestions = [
        createSuggestion({
          type: 'system_prompt',
          currentValue: 'helpful',
          suggestedValue: 'precise',
        }),
        createSuggestion({
          type: 'system_prompt',
          currentValue: 'nonexistent',
          suggestedValue: 'ignored',
        }),
      ]

      const result = applyPromptSuggestions(prompt, suggestions)

      expect(result.appliedCount).toBe(1)
      expect(result.skipped).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('should handle empty string replacement', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion({
        currentValue: 'helpful',
        suggestedValue: '',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.prompt.system).toBe('You are a  assistant.')
      expect(result.appliedCount).toBe(1)
    })

    it('should replace only the first occurrence', () => {
      const prompt = {
        ...createBasePrompt(),
        system: 'You are a helpful and helpful assistant.',
      }
      const suggestion = createSuggestion({
        currentValue: 'helpful',
        suggestedValue: 'precise',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      // Only first 'helpful' is replaced
      expect(result.prompt.system).toBe('You are a precise and helpful assistant.')
    })

    it('should preserve other custom fields when applying suggestions', () => {
      const prompt = {
        ...createBasePrompt(),
        customA: 'valueA',
        customB: 'valueB',
      }
      const suggestion = createSuggestion({
        type: 'system_prompt',
        currentValue: 'helpful',
        suggestedValue: 'precise',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect((result.prompt as typeof prompt).customA).toBe('valueA')
      expect((result.prompt as typeof prompt).customB).toBe('valueB')
    })

    it('should handle special regex characters in currentValue', () => {
      // String.replace treats first arg as literal, not regex
      const prompt = {
        ...createBasePrompt(),
        system: 'Use pattern: [a-z]+ and $variable',
      }
      const suggestion = createSuggestion({
        currentValue: '[a-z]+',
        suggestedValue: '\\w+',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.prompt.system).toBe('Use pattern: \\w+ and $variable')
      expect(result.appliedCount).toBe(1)
    })

    it('should handle special regex characters in suggestedValue', () => {
      const prompt = createBasePrompt()
      const suggestion = createSuggestion({
        currentValue: 'helpful',
        suggestedValue: '$1 captured $& group',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      // $ special characters in replacement should be treated literally
      expect(result.prompt.system).toBe('You are a $1 captured $& group assistant.')
    })

    it('should handle multiline currentValue and suggestedValue', () => {
      const prompt = {
        ...createBasePrompt(),
        system: 'Line 1\nLine 2\nLine 3',
      }
      const suggestion = createSuggestion({
        currentValue: 'Line 1\nLine 2',
        suggestedValue: 'New Line A\nNew Line B\nNew Line C',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.prompt.system).toBe('New Line A\nNew Line B\nNew Line C\nLine 3')
      expect(result.appliedCount).toBe(1)
    })

    it('should handle unicode characters', () => {
      const prompt = {
        ...createBasePrompt(),
        system: '당신은 도움이 되는 assistant입니다.',
      }
      const suggestion = createSuggestion({
        currentValue: '도움이 되는',
        suggestedValue: '정확하고 유용한',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.prompt.system).toBe('당신은 정확하고 유용한 assistant입니다.')
      expect(result.appliedCount).toBe(1)
    })

    it('should handle emoji in values', () => {
      const prompt = {
        ...createBasePrompt(),
        system: 'You are a helpful 🤖 assistant.',
      }
      const suggestion = createSuggestion({
        currentValue: '🤖',
        suggestedValue: '🧠',
      })

      const result = applyPromptSuggestions(prompt, [suggestion])

      expect(result.prompt.system).toBe('You are a helpful 🧠 assistant.')
    })
  })
})

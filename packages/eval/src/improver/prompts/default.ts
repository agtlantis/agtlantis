import type { ImproverContext, ImproverPrompt } from '../types'
import { truncate } from '@/utils/json'

export const defaultImproverPrompt: ImproverPrompt = {
  id: 'default-improver',
  version: '2.0.0',

  system: `You are an expert prompt engineer specializing in optimizing AI Agent prompts.

Your role is to analyze test results and evaluation feedback to propose targeted improvements.

## Improvement Principles

1. **Focus on Impact**: Prioritize changes that address the lowest-scoring criteria
   - Target specific failure patterns, not general improvements
   - One well-crafted change is better than many superficial ones

2. **Be Specific and Actionable**: Provide concrete changes, not vague suggestions
   - Show exact text to add, modify, or remove
   - Explain the mechanism by which the change will help

3. **Consider Trade-offs**: Evaluate side effects of each change
   - Will this fix break other test cases?
   - Does it increase prompt length/cost significantly?
   - Could it introduce new failure modes?

4. **Maintain Prompt Quality**: Preserve clarity and structure
   - Keep prompts readable and maintainable
   - Avoid over-engineering or excessive constraints
   - Ensure changes align with the agent's core purpose

## Suggestion Priority Levels
- **high**: Critical issues causing test failures, should be addressed immediately
- **medium**: Issues affecting quality scores, recommended for next iteration
- **low**: Minor optimizations, nice-to-have improvements

## Response Format

You MUST respond with valid JSON only. No additional text outside the JSON structure.

{
  "suggestions": [
    {
      "type": "system_prompt" | "user_prompt" | "parameters",
      "priority": "high" | "medium" | "low",
      "currentValue": "The specific text or value being changed",
      "suggestedValue": "The proposed replacement text or value",
      "reasoning": "Why this change addresses the identified issue",
      "expectedImprovement": "Predicted impact on scores and behavior"
    }
  ]
}`,

  buildUserPrompt: (ctx: ImproverContext): string => {
    const failedDetails = buildFailedCaseDetails(ctx.evaluatedResults)

    return `
## Current Agent Prompt

### System Prompt
\`\`\`
${ctx.agentPrompt.system}
\`\`\`

## Test Results Summary
- Total tests: ${ctx.evaluatedResults.length}
- Passed: ${ctx.evaluatedResults.filter((r) => r.passed).length}
- Failed: ${ctx.evaluatedResults.filter((r) => !r.passed).length}

## Performance Metrics
- Average latency: ${ctx.aggregatedMetrics.avgLatencyMs}ms
- Total tokens used: ${ctx.aggregatedMetrics.totalTokens}

## Failed/Low-Score Cases Details
${failedDetails}

Based on the above results, please propose specific prompt improvements.`.trim()
  },
}

function buildFailedCaseDetails(
  results: ImproverContext['evaluatedResults']
): string {
  const failedOrLowScore = results.filter(
    (r) => !r.passed || r.overallScore < 70
  )

  if (failedOrLowScore.length === 0) {
    return '(None - all tests passed with acceptable scores)'
  }

  return failedOrLowScore
    .map(
      (r) => `
### ${r.testCase.id ?? 'unnamed'} (Score: ${r.overallScore})
**Input:** ${truncate(JSON.stringify(r.testCase.input), 200)}
**Output:** ${truncate(JSON.stringify(r.output), 200)}
**Evaluation:**
${r.verdicts.map((v) => `- ${v.criterionId}: ${v.score}/100 - ${v.reasoning}`).join('\n')}`
    )
    .join('\n')
}

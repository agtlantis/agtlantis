import type { JudgeContext, JudgePrompt } from '../types'

export const defaultJudgePrompt: JudgePrompt = {
  id: 'default-judge',
  version: '2.0.0',

  system: `You are an expert evaluator specializing in assessing AI Agent outputs.

Your role is to fairly and thoroughly evaluate the agent's output against the provided criteria.

## Evaluation Principles

1. **Scoring**: Assign a score between 0-100 for each criterion
   - 90-100: Exceptional - Exceeds expectations with no significant issues
   - 70-89: Good - Meets expectations with minor issues
   - 50-69: Acceptable - Partially meets expectations, notable issues present
   - 30-49: Poor - Falls short of expectations, significant issues
   - 0-29: Failing - Does not meet minimum requirements

2. **Reasoning**: Always provide specific, evidence-based reasoning
   - Quote or reference specific parts of the output
   - Explain both strengths and weaknesses
   - Be constructive and actionable in feedback

3. **Objectivity**: Evaluate based solely on the criteria provided
   - Avoid personal preferences or unstated requirements
   - Consider the agent's intended purpose and context
   - Weight severity of issues proportionally

## Response Format

You MUST respond with valid JSON only. No additional text or explanation outside the JSON structure.

{
  "verdicts": [
    {
      "criterionId": "criterion-id",
      "score": 0-100,
      "reasoning": "Detailed explanation with specific evidence from the output",
      "passed": true/false
    }
  ]
}`,

  buildUserPrompt: (ctx: JudgeContext): string => {
    const fileSection = buildFileSection(ctx.files)

    return `
## Agent Under Evaluation
${ctx.agentDescription}

## Input Provided to Agent
\`\`\`json
${JSON.stringify(ctx.input, null, 2)}
\`\`\`
${fileSection}
## Agent Output
\`\`\`json
${JSON.stringify(ctx.output, null, 2)}
\`\`\`

## Evaluation Criteria
${ctx.criteria.map((c) => `- **${c.name}** (id: ${c.id}, weight: ${c.weight ?? 1}): ${c.description}`).join('\n')}

Please evaluate the agent's output against each criterion listed above.`.trim()
  },
}

function buildFileSection(files: JudgeContext['files']): string {
  if (!files || files.length === 0) {
    return ''
  }

  return `
## Reference Files
${files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}
`
}

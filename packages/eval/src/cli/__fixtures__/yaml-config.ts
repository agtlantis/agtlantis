/**
 * E2E Test Config - YAML Discovery
 *
 * This config is used by E2E tests to verify YAML file discovery works.
 * It uses `include` patterns to discover YAML test files.
 */

// Define mock agent inline with all required fields
const mockAgent = {
  config: {
    name: 'qa-bot',
    description: 'QA Bot for YAML testing',
  },
  prompt: {
    id: 'qa-prompt',
    version: 'v1.0.0',
    system: 'You are a helpful Q&A assistant.',
    buildUserPrompt: (input: { question: string }) => input.question,
  },
  execute: async (input: { question: string }) => ({
    result: { answer: `Answer: ${input.question}` },
    metrics: {
      tokenUsage: { input: 10, output: 20, total: 30 },
      latencyMs: 100,
    },
  }),
}

export default {
  name: 'YAML Discovery Test Suite',
  // Main agent is required by schema (for inline testCases fallback)
  agent: mockAgent,
  llm: {
    provider: 'openai' as const,
    apiKey: 'not-used-in-mock-mode',
  },
  // Agent registry for YAML files to reference
  agents: {
    'qa-bot': mockAgent,
  },
  judge: {
    criteria: [
      {
        id: 'accuracy',
        name: 'Accuracy',
        description: 'How accurate is the response',
        weight: 1,
      },
    ],
    passThreshold: 70,
  },
  // YAML discovery pattern (relative to cwd when running)
  include: ['./*.eval.yaml'],
}

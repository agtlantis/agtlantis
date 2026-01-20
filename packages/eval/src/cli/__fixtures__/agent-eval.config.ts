/**
 * E2E Test Config - Inline Test Cases
 *
 * This config is used by E2E tests to verify the CLI runs correctly.
 * It uses inline testCases (no YAML discovery) and defines an agent directly.
 */

// Define mock agent inline with all required fields
const mockAgent = {
  config: {
    name: 'test-agent',
    description: 'Test Agent for E2E testing',
  },
  prompt: {
    id: 'test-prompt',
    version: 'v1.0.0',
    system: 'You are a helpful test assistant.',
    buildUserPrompt: (input: { question: string }) => input.question,
  },
  execute: async (input: { question: string }) => ({
    result: { answer: `Mock answer for: ${input.question}` },
    metrics: {
      tokenUsage: { input: 10, output: 20, total: 30 },
      latencyMs: 100,
    },
  }),
}

export default {
  name: 'E2E Test Suite',
  agent: mockAgent,
  llm: {
    provider: 'openai' as const,
    apiKey: 'not-used-in-mock-mode',
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
  testCases: [
    {
      id: 'test-1',
      input: { question: 'What is 2+2?' },
    },
    {
      id: 'test-2',
      input: { question: 'What is the capital of France?' },
    },
  ],
}

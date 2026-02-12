/**
 * CLI Test Config - Minimal config for testing the `improve` command.
 * Works with both --mock mode and real LLM execution.
 */

const mathAgent = {
    config: {
        name: 'math-solver',
        description: 'Solves math problems step by step',
    },
    prompt: {
        id: 'math-solver',
        version: '1.0.0',
        system: `You are a math problem solver.
Solve the given math problem and show your work.
Always end with "Answer: X" where X is the final numeric answer.`,
        userTemplate: 'Problem: {{problem}}',
        renderUserPrompt: (input: { problem: string }) => `Problem: ${input.problem}`,
    },
    execute: async (input: { problem: string }) => ({
        result: { answer: `Mock answer for: ${input.problem}` },
        metrics: {
            tokenUsage: { input: 15, output: 25, total: 40 },
            latencyMs: 120,
        },
    }),
};

export default {
    name: 'CLI E2E - Improve Command',
    agent: mathAgent,

    llm: {
        provider: 'gemini',
        defaultModel: 'gemini-2.0-flash-lite',
    },

    judge: {
        criteria: [
            {
                id: 'accuracy',
                name: 'Accuracy',
                description: 'Is the mathematical answer correct?',
                weight: 1,
            },
        ],
        passThreshold: 70,
    },

    improver: {},

    testCases: [
        { id: 'addition', input: { problem: 'What is 15 + 27?' } },
        { id: 'multiplication', input: { problem: 'What is 6 x 8?' } },
    ],
};

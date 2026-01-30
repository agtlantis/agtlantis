/**
 * Q&A Agent - EvalAgent 구현
 *
 * @agtlantis/eval의 EvalAgent 인터페이스를 구현합니다.
 */

import type { Provider } from '@agtlantis/core';
import type { EvalAgent, AgentResult } from '../../src/index';
import { qaAgentPrompt } from './prompt';
import type { QAInput, QAOutput } from './types';

/**
 * Q&A Agent 생성
 *
 * @param provider - Provider 인스턴스 (OpenAI, Google 등)
 * @returns EvalAgent 인터페이스를 구현한 Agent
 *
 * @example
 * ```typescript
 * const provider = createOpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY,
 * }).withDefaultModel('gpt-4o-mini')
 * const qaAgent = createQAAgent(provider)
 *
 * const result = await qaAgent.execute({ question: '한국의 수도는?' })
 * console.log(result.result.answer) // '서울'
 * ```
 */
export function createQAAgent(provider: Provider): EvalAgent<QAInput, QAOutput> {
    return {
        config: {
            name: 'QA Agent',
            description: 'Answers questions accurately and concisely based on provided context',
        },

        prompt: qaAgentPrompt,

        async execute(input: QAInput): Promise<AgentResult<QAOutput>> {
            const startTime = Date.now();

            // Provider를 통해 LLM 호출
            const execution = provider.simpleExecution(async (session) => {
                const result = await session.generateText({
                    messages: [
                        { role: 'system', content: qaAgentPrompt.system },
                        { role: 'user', content: qaAgentPrompt.buildUserPrompt(input) },
                    ],
                    output: Output.object({ schema: qaAgentPrompt.outputSchema }),
                });

                return result.text;
            });

            const executionResult = await execution.result();

            if (executionResult.status !== 'succeeded') {
                throw executionResult.status === 'failed'
                    ? executionResult.error
                    : new Error('Execution was canceled');
            }

            const responseText = executionResult.value;
            const summary = executionResult.summary;

            // JSON 파싱 (LLM이 JSON을 반환하도록 프롬프트에서 지시)
            let output: QAOutput;
            try {
                // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
                output = JSON.parse(jsonStr.trim());
            } catch {
                // JSON 파싱 실패 시 전체 응답을 answer로 사용
                output = {
                    answer: responseText,
                    confidence: 'low',
                };
            }

            return {
                result: output,
                metadata: {
                    duration: Date.now() - startTime,
                    promptVersion: qaAgentPrompt.version,
                    tokenUsage: summary.totalLLMUsage,
                },
            };
        },
    };
}

// Re-export types for convenience
export type { QAInput, QAOutput } from './types';

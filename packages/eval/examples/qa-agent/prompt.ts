/**
 * Q&A Agent - 프롬프트 정의
 */
import type { AgentPrompt } from '../../src/index';
import type { QAInput, QAOutput } from './types';

/**
 * Q&A Agent 프롬프트
 *
 * 질문에 대해 JSON 형식으로 답변을 생성합니다.
 */
export const qaAgentPrompt: AgentPrompt<QAInput> = {
    id: 'qa-agent-prompt',
    version: '1.0.0',
    system: `You are a helpful assistant that answers questions accurately and concisely.

## Guidelines
- Provide direct, factual answers
- If given context, base your answer on the provided information
- Keep answers concise but complete
- If uncertain, indicate your confidence level

## Output Format
Always respond in valid JSON format:
{
  "answer": "your answer here",
  "confidence": "high" | "medium" | "low"
}`,

    renderUserPrompt: (input: QAInput): string => {
        const parts: string[] = [];

        if (input.context) {
            parts.push(`## Context\n${input.context}`);
        }

        parts.push(`## Question\n${input.question}`);
        parts.push(`\nProvide your answer in JSON format.`);

        return parts.join('\n\n');
    },
};

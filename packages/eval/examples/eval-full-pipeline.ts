/**
 * Full Pipeline E2E Test Example
 *
 * Demonstrates the complete @agtlantis/eval pipeline:
 * 1. Multi-turn conversation testing
 * 2. AI simulated user (aiUser)
 * 3. LLM-as-Judge evaluation
 * 4. Report generation (Reporter)
 * 5. Improvement suggestions (Improver)
 *
 * Usage:
 * ```bash
 * # 1. Create .env file in packages/agent-eval
 * cd packages/agent-eval
 * cp .env.example .env
 * # Set OPENAI_API_KEY in .env
 *
 * # 2. Run from project root
 * pnpm --filter @agtlantis/eval example:full-pipeline
 * ```
 */

import { createOpenAIProvider } from '@agtlantis/core'
import {
  // Judge
  createJudge,
  defaultJudgePrompt,
  accuracy,
  relevance,
  // Multi-turn
  executeMultiTurnTestCase,
  aiUser,
  type MultiTurnTestCase,
  type MultiTurnExecuteContext,
  type ConversationContext,
  type MultiTurnTestResult,
  // Reporter
  reportToMarkdown,
  saveReportMarkdown,
  type EvalReport,
  type ReportSummary,
  // Improver
  createImprover,
  defaultImproverPrompt,
  suggestionPreview,
  type Suggestion,
  type TestResultWithIteration,
} from '../src/index'
import {
  createBookingAgent,
  type BookingInput,
  type BookingOutput,
  type ConversationMessage,
} from './multi-turn-agent/agent'

// ============================================================================
// 1. Environment Setup
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is not set.')
  console.error('   Create a .env file with OPENAI_API_KEY=sk-xxx')
  process.exit(1)
}

// ============================================================================
// 2. Create Provider and Components
// ============================================================================

const provider = createOpenAIProvider({
  apiKey: OPENAI_API_KEY,
}).withDefaultModel('gpt-5-nano')

const bookingAgent = createBookingAgent(provider)

// Judge for evaluation
const judge = createJudge({
  provider,
  prompt: defaultJudgePrompt,
  criteria: [
    accuracy({ weight: 2 }),
    relevance(),
    {
      id: 'conversation-naturalness',
      name: '대화 자연스러움',
      description: 'AI 사용자와 Agent 간의 대화가 자연스럽게 진행되었는가',
      weight: 2,
    },
    {
      id: 'booking-completeness',
      name: '예약 완전성',
      description: '모든 필수 정보(날짜, 시간, 인원, 이름, 전화번호)가 수집되었는가',
      weight: 2,
    },
  ],
  passThreshold: 70,
})

// Improver for suggestions
const improver = createImprover({
  provider,
  prompt: defaultImproverPrompt,
})

// ============================================================================
// 3. Helper Functions
// ============================================================================

/**
 * Converts test framework's conversation context to BookingInput format.
 */
function buildInputWithHistory(
  message: string,
  ctx: ConversationContext<BookingInput, BookingOutput>
): BookingInput {
  const conversationHistory: ConversationMessage[] = []

  for (const turn of ctx.history) {
    conversationHistory.push({
      role: 'user',
      content: turn.input.message,
    })
    if (turn.output?.reply) {
      conversationHistory.push({
        role: 'assistant',
        content: turn.output.reply,
      })
    }
  }

  return {
    message,
    conversationHistory,
  }
}

/**
 * Format conversation history for the AI user's LLM prompt.
 */
function formatBookingHistory(ctx: ConversationContext<BookingInput, BookingOutput>): string {
  return ctx.history
    .map((h) => {
      const input = h.input as BookingInput
      const output = h.output as BookingOutput
      let turn = `고객: ${input.message}\n직원: ${output.reply}`
      if (output.booking) {
        turn += `\n[예약 상태: ${output.booking.status}]`
      }
      return turn
    })
    .join('\n---\n')
}

// ============================================================================
// 4. AI User Personas
// ============================================================================

const friendlyCustomerPrompt = `당신은 친절하고 협조적인 고객입니다.

행동 지침:
- 직원의 질문에 명확하고 구체적으로 답변합니다
- 예의 바르고 긍정적인 톤을 유지합니다
- 필요한 정보(날짜, 시간, 인원, 이름, 전화번호)를 한두 개씩 자연스럽게 제공합니다
- 예약이 진행 중이면 확정을 요청합니다

응답 형식:
- 반드시 고객의 말만 출력하세요
- 따옴표나 "고객:" 같은 접두사 없이 순수한 대화문만 작성하세요
- 한국어로 응답하세요`

const challengingCustomerPrompt = `당신은 까다로운 고객입니다.

행동 지침:
- 질문을 많이 합니다 (메뉴, 분위기, 주차 등)
- 처음에는 정보를 한 번에 주지 않고 나눠서 줍니다
- 특별 요청을 추가합니다 (창가 자리, 조용한 곳 등)
- 하지만 결국 필요한 정보는 모두 제공합니다
- 예약 확정 전 한 번 더 확인합니다

응답 형식:
- 반드시 고객의 말만 출력하세요
- 따옴표나 접두사 없이 순수한 대화문만 작성하세요
- 한국어로 응답하세요`

// ============================================================================
// 5. Multi-turn Test Cases with AI Users
// ============================================================================

const testCases: MultiTurnTestCase<BookingInput, BookingOutput>[] = [
  // Test 1: Friendly customer - should pass
  {
    id: 'friendly-customer-booking',
    description: 'AI simulates a friendly customer completing a booking',
    tags: ['ai-user', 'friendly', 'happy-path'],
    input: { message: '안녕하세요, 예약하고 싶은데요.' },
    multiTurn: {
      followUpInputs: [
        {
          input: aiUser<BookingInput, BookingOutput>({
            provider,
            systemPrompt: friendlyCustomerPrompt,
            formatHistory: formatBookingHistory,
            buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
          }),
          description: 'AI friendly customer',
          turns: Infinity,
        },
      ],
      terminateWhen: [
        { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
      ],
      maxTurns: 6,
      onConditionMet: 'pass',
      onMaxTurnsReached: 'fail',
    },
  },

  // Test 2: Challenging customer - tests agent's patience
  {
    id: 'challenging-customer-booking',
    description: 'AI simulates a challenging customer with many questions',
    tags: ['ai-user', 'challenging', 'edge-case'],
    input: { message: '예약 문의드려요. 그 전에 질문 좀 할게요.' },
    multiTurn: {
      followUpInputs: [
        {
          input: aiUser<BookingInput, BookingOutput>({
            provider,
            systemPrompt: challengingCustomerPrompt,
            formatHistory: formatBookingHistory,
            buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
          }),
          description: 'AI challenging customer',
          turns: Infinity,
        },
      ],
      terminateWhen: [
        { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
      ],
      maxTurns: 8,
      onConditionMet: 'pass',
      onMaxTurnsReached: 'fail',
    },
  },
]

// ============================================================================
// 6. Main Execution
// ============================================================================

async function main() {
  console.log('='.repeat(70))
  console.log('  Full Pipeline E2E Test: Multi-turn + aiUser + Reporter + Improver')
  console.log('='.repeat(70))
  console.log('')

  const executeContext: MultiTurnExecuteContext<BookingInput, BookingOutput> = {
    agent: bookingAgent,
    judge,
    agentDescription: 'A conversational restaurant reservation assistant',
  }

  // ============================================================================
  // Step 1: Execute Multi-turn Tests
  // ============================================================================
  console.log('Step 1: Executing Multi-turn Tests with AI Users')
  console.log('-'.repeat(70))

  const results: TestResultWithIteration<BookingInput, BookingOutput>[] = []

  for (const testCase of testCases) {
    console.log(`\n  Running: ${testCase.id}`)
    console.log(`  ${testCase.description}`)

    try {
      const result = await executeMultiTurnTestCase(testCase, executeContext)

      // Display conversation summary
      console.log(`\n  Conversation (${result.totalTurns} turns):`)
      for (const turn of result.conversationHistory) {
        const input = turn.input as BookingInput
        const output = turn.output as BookingOutput
        console.log(`    [${turn.turn}] Customer: ${input.message.slice(0, 50)}...`)
        console.log(`        Agent: ${output?.reply?.slice(0, 50)}...`)
      }

      console.log(`\n  Result: ${result.passed ? 'PASSED' : 'FAILED'} (Score: ${result.overallScore.toFixed(1)})`)
      console.log(`  Termination: ${result.termination.reason}`)

      // Convert MultiTurnTestResult to TestResultWithIteration for report
      results.push({
        testCase: testCase,
        output: result.output,
        metrics: result.metrics,
        verdicts: result.verdicts,
        overallScore: result.overallScore,
        passed: result.passed,
        // Include multi-turn specific fields
        conversationHistory: result.conversationHistory,
        totalTurns: result.totalTurns,
        terminationReason: result.termination.reason,
      })

    } catch (error) {
      console.error(`  Error: ${error}`)
    }
  }

  // ============================================================================
  // Step 2: Generate Report
  // ============================================================================
  console.log('\n')
  console.log('Step 2: Generating Evaluation Report')
  console.log('-'.repeat(70))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
    : 0
  const totalTokens = results.reduce((sum, r) => sum + r.metrics.tokenUsage.total, 0)
  const avgLatency = results.length > 0
    ? results.reduce((sum, r) => sum + r.metrics.latencyMs, 0) / results.length
    : 0

  // Build report summary
  const summary: ReportSummary = {
    totalTests: results.length,
    passed,
    failed,
    avgScore,
    metrics: {
      avgLatencyMs: avgLatency,
      totalTokens,
      totalEstimatedCost: 0,
    },
  }

  // ============================================================================
  // Step 3: Get Improvement Suggestions
  // ============================================================================
  console.log('\n')
  console.log('Step 3: Getting Improvement Suggestions')
  console.log('-'.repeat(70))

  let suggestions: Suggestion[] = []
  try {
    suggestions = await improver.improve(bookingAgent.prompt, results)
    console.log(`\n  Received ${suggestions.length} suggestions:`)

    for (const suggestion of suggestions) {
      console.log(`\n  [${suggestion.priority.toUpperCase()}] ${suggestion.type}`)
      console.log(`  Reasoning: ${suggestion.reasoning.slice(0, 100)}...`)
      console.log(`  Expected: ${suggestion.expectedImprovement.slice(0, 100)}...`)
    }
  } catch (error) {
    console.error(`  Improver error: ${error}`)
  }

  // ============================================================================
  // Step 4: Build and Save Final Report
  // ============================================================================
  console.log('\n')
  console.log('Step 4: Building Final Report')
  console.log('-'.repeat(70))

  const report: EvalReport<BookingInput, BookingOutput> = {
    summary,
    results: results.map(r => ({
      ...r,
      iterationResults: undefined,
      iterationStats: undefined,
    })),
    suggestions,
    generatedAt: new Date(),
    promptVersion: bookingAgent.prompt.version,
  }

  // Generate markdown
  const markdown = reportToMarkdown(report, {
    expandPassedTests: true,
    outputPreviewLength: 300,
  })

  // Save to file
  const reportPath = './examples/reports/full-pipeline-report.md'
  try {
    await saveReportMarkdown(report, reportPath, {
      expandPassedTests: true,
      outputPreviewLength: 300,
    })
    console.log(`\n  Report saved to: ${reportPath}`)
  } catch (error) {
    console.log(`\n  (Could not save to file, showing preview instead)`)
  }

  // Show report preview
  console.log('\n' + '='.repeat(70))
  console.log('  Report Preview')
  console.log('='.repeat(70))
  console.log(markdown.slice(0, 2000) + '\n...(truncated)')

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '='.repeat(70))
  console.log('  Final Summary')
  console.log('='.repeat(70))
  console.log(`
  Tests:        ${results.length}
  Passed:       ${passed} (${((passed / results.length) * 100).toFixed(0)}%)
  Failed:       ${failed}
  Avg Score:    ${avgScore.toFixed(1)}
  Total Tokens: ${totalTokens}
  Avg Latency:  ${avgLatency.toFixed(0)}ms
  Suggestions:  ${suggestions.length}
  `)

  console.log('Pipeline completed!')
}

main().catch(console.error)

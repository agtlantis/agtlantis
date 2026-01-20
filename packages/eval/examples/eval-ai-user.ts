/**
 * AI Simulated User E2E Test Example
 *
 * Demonstrates AI-simulated user testing with @agtlantis/eval.
 *
 * Features demonstrated:
 * - `aiUser()` factory function for AI-generated user inputs
 * - `turns` option for repeating the same input source multiple times
 * - `turns: Infinity` for continuous AI-driven conversation until termination
 * - Different AI customer personas (friendly, rushed, unhappy)
 * - Dynamic persona that changes behavior based on turn count
 *
 * Usage:
 * ```bash
 * # 1. Create .env file in packages/agent-eval
 * cd packages/agent-eval
 * cp .env.example .env
 * # Set OPENAI_API_KEY in .env
 *
 * # 2. Run from project root
 * pnpm --filter @agtlantis/eval example:ai-user
 * ```
 */

import { createOpenAIProvider } from '@agtlantis/core'
import {
  createJudge,
  defaultJudgePrompt,
  accuracy,
  relevance,
  executeMultiTurnTestCase,
  aiUser,
  type MultiTurnTestCase,
  type MultiTurnExecuteContext,
  type ConversationContext,
} from '../src/index'
import {
  createBookingAgent,
  type BookingInput,
  type BookingOutput,
  type ConversationMessage,
} from './multi-turn-agent/agent'

// ============================================================================
// Helper: Build conversation history from test framework context
// ============================================================================

/**
 * Converts test framework's conversation context to BookingInput format.
 * This enables stateless agents to maintain multi-turn conversation context.
 */
function buildInputWithHistory(
  message: string,
  ctx: ConversationContext<BookingInput, BookingOutput>
): BookingInput {
  const conversationHistory: ConversationMessage[] = []

  for (const turn of ctx.history) {
    // Add user message
    conversationHistory.push({
      role: 'user',
      content: turn.input.message,
    })
    // Add assistant response (extract reply from output)
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
 * Provides a human-readable format specific to the booking domain.
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
// 1. Environment Setup
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is not set.')
  console.error('   Create a .env file with OPENAI_API_KEY=sk-xxx')
  console.error('   Example: echo "OPENAI_API_KEY=sk-xxx" > .env')
  process.exit(1)
}

// ============================================================================
// 2. Create Provider and Agent
// ============================================================================

const provider = createOpenAIProvider({
  apiKey: OPENAI_API_KEY,
}).withDefaultModel('gpt-5-nano') // Cost-effective model

const bookingAgent = createBookingAgent(provider)

// ============================================================================
// 3. Create Judge
// ============================================================================

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

// ============================================================================
// 4. AI User Personas
// ============================================================================

/**
 * Friendly Customer Persona
 *
 * A polite and cooperative customer who provides information clearly
 * and responds positively to the agent's questions.
 */
const friendlyCustomerSystemPrompt = `당신은 친절하고 협조적인 고객입니다.

행동 지침:
- 직원의 질문에 명확하고 구체적으로 답변합니다
- 예의 바르고 긍정적인 톤을 유지합니다
- 필요한 정보(날짜, 시간, 인원, 이름, 전화번호)를 한두 개씩 자연스럽게 제공합니다
- 예약이 진행 중이면 확정을 요청합니다

응답 형식:
- 반드시 고객의 말만 출력하세요
- 따옴표나 "고객:" 같은 접두사 없이 순수한 대화문만 작성하세요
- 한국어로 응답하세요`

/**
 * Rushed Customer Persona
 *
 * An impatient customer who wants quick service
 * and provides information efficiently.
 */
const rushedCustomerSystemPrompt = `당신은 바쁘고 급한 고객입니다.

행동 지침:
- 빠른 예약을 원합니다
- 가능하면 여러 정보를 한 번에 제공하려고 합니다
- 짧고 간결하게 답변합니다
- 불필요한 대화는 줄이려 합니다
- 예약이 거의 완료되면 빨리 확정해달라고 요청합니다

응답 형식:
- 반드시 고객의 말만 출력하세요
- 따옴표나 접두사 없이 순수한 대화문만 작성하세요
- 한국어로 응답하세요`

/**
 * Unhappy Customer Persona
 *
 * A dissatisfied customer who has concerns but eventually
 * provides the needed information.
 */
const unhappyCustomerSystemPrompt = `당신은 약간 불만족스러운 고객입니다.

행동 지침:
- 처음에는 불평하거나 질문을 합니다 (예: "저번에 예약이 제대로 안 됐는데...")
- 하지만 결국 필요한 정보는 제공합니다
- 약간 까다롭게 굴지만 무례하지는 않습니다
- 특별 요청(창가 자리, 조용한 자리 등)을 추가합니다
- 예약 확정 전 확인을 한 번 더 요청합니다

응답 형식:
- 반드시 고객의 말만 출력하세요
- 따옴표나 접두사 없이 순수한 대화문만 작성하세요
- 한국어로 응답하세요`

// ============================================================================
// 5. Multi-turn Test Cases with AI Users
// ============================================================================

/**
 * Test Case 1: Friendly Customer - AI Driven Booking
 *
 * Uses aiUser() with `turns: Infinity` to generate all follow-up inputs
 * with a friendly persona until the booking is confirmed.
 *
 * NOTE: Before `turns` option, we had to define aiUser() 5+ times.
 * Now a single entry with `turns: Infinity` handles unlimited follow-ups!
 */
const friendlyCustomerTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'ai-friendly-customer',
  description: 'AI simulates a friendly customer completing a booking',
  tags: ['ai-user', 'friendly', 'happy-path'],

  // First turn: User initiates booking
  input: { message: '안녕하세요, 예약하고 싶은데요.' },

  multiTurn: {
    // Single aiUser() with turns: Infinity handles all follow-ups
    followUpInputs: [
      {
        input: aiUser<BookingInput, BookingOutput>({
          provider,
          systemPrompt: friendlyCustomerSystemPrompt,
          formatHistory: formatBookingHistory,
          buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
        }),
        description: 'AI friendly customer',
        turns: Infinity, // Continue until termination condition is met
      },
    ],

    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],

    maxTurns: 5, // Reduced from 8 for faster feedback
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail',
  },
}

/**
 * Test Case 2: Rushed Customer - Quick Booking
 *
 * Uses aiUser() with a rushed persona. With `turns: Infinity`,
 * the AI continues until booking is confirmed or maxTurns is reached.
 */
const rushedCustomerTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'ai-rushed-customer',
  description: 'AI simulates a rushed customer wanting quick service',
  tags: ['ai-user', 'rushed', 'efficiency'],

  // First turn: Rushed request
  input: { message: '예약 빨리 좀 해주세요.' },

  multiTurn: {
    followUpInputs: [
      {
        input: aiUser<BookingInput, BookingOutput>({
          provider,
          systemPrompt: rushedCustomerSystemPrompt,
          formatHistory: formatBookingHistory,
          buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
        }),
        description: 'AI rushed customer',
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
}

/**
 * Test Case 3: Unhappy Customer - Booking with Complaints
 *
 * Uses aiUser() with an unhappy persona. With `turns: Infinity`,
 * allows longer conversations needed for unhappy customers.
 */
const unhappyCustomerTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'ai-unhappy-customer',
  description: 'AI simulates an unhappy customer with concerns',
  tags: ['ai-user', 'unhappy', 'edge-case'],

  // First turn: Complaint-laden request
  input: { message: '저번에 예약이 좀 문제가 있었는데... 다시 예약하려고요.' },

  multiTurn: {
    followUpInputs: [
      {
        input: aiUser<BookingInput, BookingOutput>({
          provider,
          systemPrompt: unhappyCustomerSystemPrompt,
          formatHistory: formatBookingHistory,
          buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
        }),
        description: 'AI unhappy customer',
        turns: Infinity,
      },
    ],

    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],

    maxTurns: 6, // Reduced from 10 for faster feedback
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail',
  },
}

/**
 * Test Case 4: Dynamic Persona - Escalating Impatience
 *
 * Uses a dynamic system prompt that changes the AI's behavior
 * based on the conversation turn. With `turns: Infinity`, the
 * single aiUser() definition handles all follow-ups while the
 * dynamic systemPrompt changes behavior automatically.
 */
const dynamicPersonaTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'ai-dynamic-persona',
  description: 'AI persona changes from friendly to rushed as turns progress',
  tags: ['ai-user', 'dynamic', 'persona-change'],

  input: { message: '예약 문의드립니다.' },

  multiTurn: {
    followUpInputs: [
      {
        input: aiUser<BookingInput, BookingOutput>({
          provider,
          // Dynamic system prompt based on turn count
          systemPrompt: (ctx) => {
            if (ctx.currentTurn <= 2) {
              return `당신은 친절한 고객입니다. 차분하게 정보를 제공합니다.
응답 형식: 고객의 말만 출력하세요. 한국어로 응답하세요.`
            } else if (ctx.currentTurn <= 4) {
              return `당신은 약간 급해진 고객입니다. 빠른 진행을 원합니다.
응답 형식: 고객의 말만 출력하세요. 한국어로 응답하세요.`
            } else {
              return `당신은 매우 급한 고객입니다. 즉시 확정을 원합니다.
응답 형식: 고객의 말만 출력하세요. 한국어로 응답하세요.`
            }
          },
          formatHistory: formatBookingHistory,
          buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
        }),
        description: 'Dynamic persona (escalating impatience)',
        turns: Infinity, // Dynamic systemPrompt changes behavior each turn
      },
    ],

    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],

    maxTurns: 5,
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail',
  },
}

// Collect all test cases
const testCases: MultiTurnTestCase<BookingInput, BookingOutput>[] = [
  friendlyCustomerTest,
  rushedCustomerTest,
  unhappyCustomerTest,
  dynamicPersonaTest,
]

// ============================================================================
// 6. Execution
// ============================================================================

async function main() {
  console.log('🤖 AI Simulated User E2E Test')
  console.log('='.repeat(60))
  console.log(`   Test Cases: ${testCases.length}`)
  console.log(`   Model: gpt-5-nano`)
  console.log('')
  console.log('This test demonstrates AI-driven multi-turn conversations')
  console.log('where the AI plays different customer personas.')
  console.log('')

  const executeContext: MultiTurnExecuteContext<BookingInput, BookingOutput> = {
    agent: bookingAgent,
    judge,
    agentDescription: 'A conversational restaurant reservation assistant',
  }

  let passed = 0
  let failed = 0
  let totalScore = 0
  let totalTokens = 0
  let totalLatency = 0

  for (const testCase of testCases) {
    console.log(`\n📝 Running: ${testCase.id}`)
    console.log(`   ${testCase.description}`)
    console.log('-'.repeat(60))

    try {
      const result = await executeMultiTurnTestCase(testCase, executeContext)

      // Display conversation
      console.log('\n   💬 Conversation:')
      for (const turn of result.conversationHistory) {
        console.log(`      Turn ${turn.turn}:`)
        const input = turn.input as BookingInput
        console.log(`        🧑 Customer: ${input.message}`)
        const output = turn.output as BookingOutput
        console.log(`        🤖 Agent: ${output?.reply?.slice(0, 100)}...`)
        if (output?.booking) {
          console.log(`        📋 Status: ${output.booking.status}`)
        }
      }

      // Display result
      console.log('\n   📊 Result:')
      console.log(`      Total Turns: ${result.totalTurns}`)
      console.log(`      Termination: ${result.termination.reason}`)
      console.log(`      Score: ${result.overallScore.toFixed(1)}`)
      console.log(`      Passed: ${result.passed ? '✅' : '❌'}`)

      // Display verdicts
      if (result.verdicts.length > 0) {
        console.log('\n   📝 Verdicts:')
        for (const verdict of result.verdicts) {
          const status = verdict.passed ? '✅' : '❌'
          console.log(`      ${status} ${verdict.criterionId}: ${verdict.score}`)
        }
      }

      // Track stats
      if (result.passed) {
        passed++
      } else {
        failed++
      }
      totalScore += result.overallScore
      totalTokens += result.metrics.tokenUsage.total
      totalLatency += result.metrics.latencyMs

    } catch (error) {
      console.error(`   ❌ Error: ${error}`)
      failed++
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary')
  console.log('='.repeat(60))
  console.log(`   Total Tests: ${testCases.length}`)
  console.log(`   Passed: ${passed} (${Math.round((passed / testCases.length) * 100)}%)`)
  console.log(`   Failed: ${failed}`)
  console.log(`   Average Score: ${(totalScore / testCases.length).toFixed(1)}`)
  console.log(`   Total Tokens: ${totalTokens}`)
  console.log(`   Average Latency: ${(totalLatency / testCases.length).toFixed(0)}ms`)

  console.log('\n' + '='.repeat(60))
  console.log('💡 Key Observations')
  console.log('='.repeat(60))
  console.log(`   • turns: Infinity allows a single aiUser() to drive entire conversations`)
  console.log(`   • AI simulated users generate natural, context-aware responses`)
  console.log(`   • Different personas result in different conversation dynamics`)
  console.log(`   • Dynamic systemPrompt + turns: Infinity enables evolving behavior`)
  console.log(`   • Booking completion depends on both agent and AI user behavior`)
}

main().catch(console.error)

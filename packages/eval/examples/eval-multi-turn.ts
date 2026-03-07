/**
 * Multi-turn Booking Agent Evaluation Example
 *
 * Demonstrates multi-turn conversation testing with @agtlantis/eval.
 *
 * Features demonstrated:
 * - Multi-turn test cases with static follow-up inputs
 * - Dynamic follow-up inputs based on previous outputs
 * - Various termination conditions (fieldSet, maxTurns)
 * - Composite conditions (and, or)
 *
 * Usage:
 * ```bash
 * # 1. Create .env file in packages/agent-eval
 * cd packages/agent-eval
 * cp .env.example .env
 * # Set OPENAI_API_KEY in .env
 *
 * # 2. Run from project root
 * pnpm --filter @agtlantis/eval example:multi-turn
 * ```
 */

import { createOpenAIProvider } from '@agtlantis/core'
import {
  createJudge,
  defaultJudgePrompt,
  accuracy,
  relevance,
  executeMultiTurnTestCase,
  type MultiTurnTestCase,
  type MultiTurnExecuteContext,
  type ConversationContext,
} from '../src/index.js'
import {
  createBookingAgent,
  type BookingInput,
  type BookingOutput,
  type ConversationMessage,
} from './multi-turn-agent/agent.js'

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
      id: 'conversation-flow',
      name: '대화 흐름',
      description: 'Agent가 자연스럽게 필요한 정보를 수집하고 예약을 완료했는가',
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
// 4. Multi-turn Test Cases
// ============================================================================

/**
 * Test Case 1: Complete Booking Flow (with conversation history)
 *
 * Tests a complete booking flow with conversation history accumulation.
 * Each turn includes previous conversation for context.
 * Terminates when booking.status becomes 'confirmed'.
 */
const completeBookingTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'complete-booking-flow',
  description: 'Complete booking with all required information',
  tags: ['happy-path', 'complete'],

  // First turn: User initiates booking (no history needed)
  input: { message: '2024년 1월 20일 저녁 7시에 예약하고 싶어요.' },

  multiTurn: {
    // Follow-up inputs - all use dynamic function to include conversation history
    followUpInputs: [
      {
        input: (ctx) => buildInputWithHistory('4명이요. 이름은 김철수입니다.', ctx),
        description: 'Provide party size and name',
      },
      {
        input: (ctx) => buildInputWithHistory('전화번호는 010-1234-5678이고, 창가 자리 부탁드려요.', ctx),
        description: 'Provide phone and special request',
      },
      {
        input: (ctx) => buildInputWithHistory('네, 확인했습니다. 예약 확정해주세요.', ctx),
        description: 'Confirm booking',
      },
    ],

    // Terminate when booking is confirmed
    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],

    maxTurns: 6,
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail',
  },
}

/**
 * Test Case 2: Dynamic Follow-up (Based on Previous Output)
 *
 * Uses dynamic input that references the previous output
 * and includes conversation history for context.
 */
const dynamicFollowUpTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'dynamic-followup',
  description: 'Booking with dynamic responses based on agent replies',
  tags: ['dynamic', 'context-aware'],

  input: { message: '예약하려고요. 2명이고 2024년 1월 21일 점심이요.' },

  multiTurn: {
    followUpInputs: [
      {
        // Dynamic input: Based on previous output's missing fields + with history
        input: (ctx) => {
          const lastOutput = ctx.lastOutput
          let message: string
          if (lastOutput?.missingFields?.includes('time')) {
            message = '12시 30분으로 해주세요.'
          } else if (lastOutput?.missingFields?.includes('name')) {
            message = '박영희라고 해주세요.'
          } else {
            message = '진행해주세요.'
          }
          return buildInputWithHistory(message, ctx)
        },
        description: 'Dynamic response based on missing fields',
      },
      {
        input: (ctx) => buildInputWithHistory('이름은 박영희, 전화번호 010-9876-5432입니다.', ctx),
        description: 'Provide remaining info',
      },
      {
        input: (ctx) => buildInputWithHistory('예, 맞습니다. 예약 확정해주세요.', ctx),
        description: 'Confirm booking',
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

/**
 * Test Case 3: Quick Booking (All Info at Once)
 *
 * User provides all information in the first message.
 * Should complete in 1-2 turns.
 */
const quickBookingTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'quick-booking',
  description: 'User provides all info upfront',
  tags: ['quick', 'efficient'],

  input: {
    // Provide ALL required info with explicit date format and confirmation request
    message: '2024년 1월 22일 저녁 6시(18:00)에 3명 예약할게요. 이름 최민수, 전화번호 010-5555-1234입니다. 예약 확정해주세요.',
  },

  multiTurn: {
    followUpInputs: [
      {
        // If agent asks for confirmation, provide it with history
        input: (ctx) => buildInputWithHistory('네, 맞습니다. 확정해주세요.', ctx),
        description: 'Confirm if needed',
      },
    ],

    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],

    maxTurns: 3,
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail',
  },
}

/**
 * Test Case 4: Max Turns Test (Incomplete Booking)
 *
 * Tests that maxTurns limit works correctly.
 * User provides vague/incomplete info, should hit maxTurns.
 * This is an expected failure scenario.
 */
const maxTurnsTest: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'max-turns-reached',
  description: 'Booking fails due to max turns reached (expected)',
  tags: ['edge-case', 'incomplete'],

  input: { message: '예약하려고요.' },

  multiTurn: {
    followUpInputs: [
      {
        input: (ctx) => buildInputWithHistory('음... 언제가 좋을까요?', ctx),
        description: 'Vague - no date',
      },
      {
        input: (ctx) => buildInputWithHistory('저녁쯤이요.', ctx),
        description: 'Still vague - no specific time',
      },
    ],

    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],

    maxTurns: 3,
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail', // Expected: will fail because user never provides complete info
  },
}

// Collect all test cases
const testCases: MultiTurnTestCase<BookingInput, BookingOutput>[] = [
  completeBookingTest,
  dynamicFollowUpTest,
  quickBookingTest,
  maxTurnsTest,
]

// ============================================================================
// 5. Execution
// ============================================================================

async function main() {
  console.log('🧪 Multi-turn Booking Agent Evaluation')
  console.log('='.repeat(60))
  console.log(`   Test Cases: ${testCases.length}`)
  console.log(`   Model: gpt-5-nano`)
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
        console.log(`        User: ${(turn.input as BookingInput).message}`)
        const output = turn.output as BookingOutput
        console.log(`        Agent: ${output?.reply?.slice(0, 100)}...`)
        if (output?.booking) {
          console.log(`        Status: ${output.booking.status}`)
        }
      }

      // Display result
      console.log('\n   📊 Result:')
      console.log(`      Total Turns: ${result.totalTurns}`)
      console.log(`      Termination: ${result.termination.reason}`)
      console.log(`      Score: ${result.overallScore.toFixed(1)}`)
      console.log(`      Passed: ${result.passed ? '✅' : '❌'}`)

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
}

main().catch(console.error);
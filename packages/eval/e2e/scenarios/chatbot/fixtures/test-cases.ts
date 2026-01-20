/**
 * Chatbot Test Case Fixtures
 *
 * Defines input/output types and test cases for multi-turn chatbot patterns.
 * These test cases cover: context preservation, selection-based, dynamic (aiUser), and termination detection.
 */

import type { MultiTurnTestCase } from '@/multi-turn/types'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Input type for chatbot agent.
 */
export interface ChatbotInput {
  /** User's message */
  message: string
  /** Selected option ID (for selection-based tests) */
  selectedOption?: string
}

/**
 * Output type for chatbot agent.
 * Structured JSON response with optional fields for different patterns.
 */
export interface ChatbotOutput {
  /** Agent's response text */
  response: string
  /** Options presented to user (for selection-based flow) */
  options?: Array<{ id: string; label: string }>
  /** Whether the conversation goal is achieved */
  isComplete?: boolean
  /** Current task status */
  taskStatus?: 'in_progress' | 'completed' | 'cancelled'
  /** Details about selected option */
  selectedDetails?: Record<string, unknown> | null
}

// ============================================================================
// Context Preservation Test Cases
// ============================================================================

/**
 * Tests that the agent remembers user's name across turns.
 * Pattern: Static follow-ups referencing previous context.
 */
export const CONTEXT_NAME_MEMORY_CASE: MultiTurnTestCase<ChatbotInput, ChatbotOutput> = {
  id: 'context-name-memory',
  input: { message: '안녕하세요, 저는 김철수입니다. 반갑습니다!' },
  multiTurn: {
    terminateWhen: [{ type: 'maxTurns', count: 3 }],
    followUpInputs: [
      {
        input: { message: '제 이름을 기억하시나요? 방금 제가 뭐라고 소개했죠?' },
        description: 'Ask for name recall',
      },
      {
        input: { message: '맞아요! 그럼 처음에 제가 뭐라고 인사했는지도 기억하세요?' },
        description: 'Ask for greeting recall',
      },
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'pass',
  },
}

/**
 * Tests multi-topic context retention.
 * Agent should remember multiple pieces of information.
 */
export const CONTEXT_MULTI_TOPIC_CASE: MultiTurnTestCase<ChatbotInput, ChatbotOutput> = {
  id: 'context-multi-topic',
  input: { message: '저는 서울에 살고, 개발자로 일하고 있어요. 취미는 등산이에요.' },
  multiTurn: {
    terminateWhen: [{ type: 'maxTurns', count: 3 }],
    followUpInputs: [
      {
        input: { message: '제 직업이 뭐라고 했죠?' },
        description: 'Recall profession',
      },
      {
        input: { message: '그리고 제 취미는요? 어디에 산다고 했나요?' },
        description: 'Recall hobby and location',
      },
    ],
    onMaxTurnsReached: 'pass',
  },
}

// ============================================================================
// Selection-Based Test Cases (Programmatic)
// ============================================================================

/**
 * Tests option selection flow.
 * Agent presents options, user selects by ID.
 */
export const SELECTION_MOVIE_CASE: MultiTurnTestCase<ChatbotInput, ChatbotOutput> = {
  id: 'selection-movie',
  input: { message: '오늘 볼 영화를 추천해주세요' },
  multiTurn: {
    terminateWhen: [
      { type: 'fieldSet', fieldPath: 'selectedDetails' },
      { type: 'maxTurns', count: 3 },
    ],
    followUpInputs: [
      {
        // Dynamic: select first option from response
        input: (ctx) => {
          const lastOutput = ctx.lastOutput
          const firstOption = lastOutput?.options?.[0]
          if (firstOption) {
            return {
              message: `${firstOption.id}번 "${firstOption.label}"을 선택할게요. 자세한 정보를 알려주세요.`,
              selectedOption: firstOption.id,
            }
          }
          return { message: '첫 번째 옵션을 선택할게요', selectedOption: '1' }
        },
        description: 'Select first option',
      },
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'pass',
  },
}

/**
 * Tests restaurant selection with preferences.
 */
export const SELECTION_RESTAURANT_CASE: MultiTurnTestCase<ChatbotInput, ChatbotOutput> = {
  id: 'selection-restaurant',
  input: { message: '저녁에 갈 레스토랑을 추천해주세요. 이탈리안 음식을 좋아해요.' },
  multiTurn: {
    terminateWhen: [
      { type: 'fieldSet', fieldPath: 'selectedDetails' },
      { type: 'maxTurns', count: 3 },
    ],
    followUpInputs: [
      {
        // Select second option if available
        input: (ctx) => {
          const lastOutput = ctx.lastOutput
          const option = lastOutput?.options?.[1] ?? lastOutput?.options?.[0]
          if (option) {
            return {
              message: `"${option.label}" 괜찮아 보여요. 이걸로 할게요.`,
              selectedOption: option.id,
            }
          }
          return { message: '두 번째 옵션으로 할게요', selectedOption: '2' }
        },
        description: 'Select second option',
      },
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'pass',
  },
}

// ============================================================================
// Termination Detection Test Cases
// ============================================================================

/**
 * Tests goal achievement detection.
 * Agent should set taskStatus: 'completed' when goal is reached.
 */
export const TERMINATION_PASSWORD_RESET_CASE: MultiTurnTestCase<ChatbotInput, ChatbotOutput> = {
  id: 'termination-password-reset',
  input: { message: '비밀번호를 재설정하고 싶어요' },
  multiTurn: {
    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'taskStatus', expectedValue: 'completed' },
      { type: 'maxTurns', count: 5 },
    ],
    followUpInputs: [
      {
        input: { message: '이메일은 test@example.com 입니다' },
        description: 'Provide email',
      },
      {
        input: { message: '인증번호는 123456 입니다' },
        description: 'Provide verification code',
      },
      {
        input: { message: '새 비밀번호는 NewSecurePass123! 입니다' },
        description: 'Provide new password',
      },
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail', // Should complete before max turns
  },
}

/**
 * Tests conversation completion detection.
 * Agent should set isComplete: true when conversation naturally ends.
 */
export const TERMINATION_BOOKING_CASE: MultiTurnTestCase<ChatbotInput, ChatbotOutput> = {
  id: 'termination-booking',
  input: { message: '내일 오후 2시에 회의실을 예약하고 싶어요' },
  multiTurn: {
    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'isComplete', expectedValue: true },
      { type: 'maxTurns', count: 4 },
    ],
    followUpInputs: [
      {
        input: { message: '3명이 참석할 예정이에요' },
        description: 'Specify attendee count',
      },
      {
        input: { message: '네, 확인했습니다. 예약해주세요.' },
        description: 'Confirm booking',
      },
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'pass',
  },
}

// ============================================================================
// Case Collections
// ============================================================================

/**
 * All context preservation test cases.
 */
export const CONTEXT_PRESERVATION_CASES: MultiTurnTestCase<ChatbotInput, ChatbotOutput>[] = [
  CONTEXT_NAME_MEMORY_CASE,
  CONTEXT_MULTI_TOPIC_CASE,
]

/**
 * Minimal context preservation test (single case for cost control).
 */
export const CONTEXT_PRESERVATION_CASES_MINIMAL: MultiTurnTestCase<
  ChatbotInput,
  ChatbotOutput
>[] = [CONTEXT_NAME_MEMORY_CASE]

/**
 * All selection-based test cases.
 */
export const SELECTION_BASED_CASES: MultiTurnTestCase<ChatbotInput, ChatbotOutput>[] = [
  SELECTION_MOVIE_CASE,
  SELECTION_RESTAURANT_CASE,
]

/**
 * Minimal selection-based test (single case for cost control).
 */
export const SELECTION_BASED_CASES_MINIMAL: MultiTurnTestCase<ChatbotInput, ChatbotOutput>[] = [
  SELECTION_MOVIE_CASE,
]

/**
 * All termination detection test cases.
 */
export const TERMINATION_DETECTION_CASES: MultiTurnTestCase<ChatbotInput, ChatbotOutput>[] = [
  TERMINATION_PASSWORD_RESET_CASE,
  TERMINATION_BOOKING_CASE,
]

/**
 * Minimal termination detection test (single case for cost control).
 */
export const TERMINATION_DETECTION_CASES_MINIMAL: MultiTurnTestCase<
  ChatbotInput,
  ChatbotOutput
>[] = [TERMINATION_BOOKING_CASE]

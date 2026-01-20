/**
 * Test Case Fixtures - Input/output types and test cases for each agent type.
 * Designed for simplicity and cost-effectiveness.
 */

import type { TestCase } from '@/core/types'
import type { MultiTurnTestCase } from '@/multi-turn/types'

export interface MathInput {
  problem: string
}

export interface MathOutput {
  solution: string
  answer: string
}

export const MATH_TEST_CASES: TestCase<MathInput>[] = [
  {
    id: 'simple-addition',
    input: { problem: 'What is 2 + 3?' },
  },
  {
    id: 'simple-multiplication',
    input: { problem: 'What is 7 x 8?' },
  },
  {
    id: 'word-problem',
    input: {
      problem: 'John has 5 apples. He gives 2 to Mary. How many apples does John have left?',
    },
  },
]

export const MATH_TEST_CASES_MINIMAL: TestCase<MathInput>[] = [MATH_TEST_CASES[0]]

export interface QAInput {
  question: string
  context: string
}

export interface QAOutput {
  answer: string
}

export const QA_TEST_CASES: TestCase<QAInput>[] = [
  {
    id: 'factual-question',
    input: {
      question: 'What is the capital of France?',
      context:
        'France is a country in Western Europe. Its capital is Paris, which is known for the Eiffel Tower and the Louvre Museum.',
    },
  },
  {
    id: 'inference-question',
    input: {
      question: 'Will the event happen indoors or outdoors based on the context?',
      context:
        'The company picnic is scheduled for Saturday at Central Park. Attendees should bring sunscreen and a blanket to sit on.',
    },
  },
  {
    id: 'not-in-context',
    input: {
      question: 'What is the population of Tokyo?',
      context:
        'Japan is an island nation in East Asia. The country is known for its technology industry and traditional culture.',
    },
  },
]

export const QA_TEST_CASES_MINIMAL: TestCase<QAInput>[] = [QA_TEST_CASES[0]]

export interface RecommenderInput {
  request: string
  preferences?: string
  conversationContext?: string
}

export interface RecommenderOutput {
  response: string
  recommendations?: string[]
}

export const RECOMMENDER_BOOK_CASE: MultiTurnTestCase<RecommenderInput, RecommenderOutput> = {
  id: 'book-recommendation',
  input: { request: 'I want to find a good book to read' },
  multiTurn: {
    terminateWhen: [{ type: 'maxTurns', count: 3 }],
    followUpInputs: [
      {
        input: {
          request: 'I like science fiction, especially stories about space exploration',
          preferences: 'sci-fi, space',
        },
      },
      {
        input: {
          request: 'Something not too long, under 300 pages would be ideal',
          preferences: 'sci-fi, space, short',
        },
      },
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'pass',
  },
}

export const RECOMMENDER_RESTAURANT_CASE: MultiTurnTestCase<RecommenderInput, RecommenderOutput> = {
  id: 'restaurant-recommendation',
  input: { request: 'Can you recommend a restaurant for dinner tonight?' },
  multiTurn: {
    terminateWhen: [{ type: 'maxTurns', count: 3 }],
    followUpInputs: [
      {
        input: {
          request: 'I prefer Italian food, and I want something casual',
          preferences: 'Italian, casual',
        },
      },
      {
        input: {
          request: 'My budget is around $30 per person',
          preferences: 'Italian, casual, budget $30pp',
        },
      },
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'pass',
  },
}

export const RECOMMENDER_MULTI_TURN_CASES: MultiTurnTestCase<
  RecommenderInput,
  RecommenderOutput
>[] = [RECOMMENDER_BOOK_CASE, RECOMMENDER_RESTAURANT_CASE]

export const RECOMMENDER_MULTI_TURN_CASES_MINIMAL: MultiTurnTestCase<
  RecommenderInput,
  RecommenderOutput
>[] = [RECOMMENDER_BOOK_CASE]

export function getMinimalTestCases<T>(cases: TestCase<T>[], count = 1): TestCase<T>[] {
  return cases.slice(0, count)
}

export function getMinimalMultiTurnCases<TInput, TOutput>(
  cases: MultiTurnTestCase<TInput, TOutput>[],
  count = 1,
): MultiTurnTestCase<TInput, TOutput>[] {
  return cases.slice(0, count)
}

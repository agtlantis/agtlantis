/**
 * Q&A Agent 평가 예제
 *
 * @agtlantis/eval 라이브러리를 사용하여 Q&A Agent를 평가합니다.
 *
 * 실행 방법:
 * ```bash
 * # 1. packages/agent-eval/.env 파일 생성
 * cd packages/agent-eval
 * cp .env.example .env
 * # .env 파일을 열어 OPENAI_API_KEY 설정
 *
 * # 2. 예제 실행 (프로젝트 루트에서)
 * pnpm --filter @agtlantis/eval example:qa
 * ```
 */

import { createOpenAIProvider } from '@agtlantis/core'
import {
  createEvalSuite,
  createJudge,
  createImprover,
  defaultJudgePrompt,
  defaultImproverPrompt,
  accuracy,
  relevance,
  reportToMarkdown,
  type TestCase,
} from '../src/index.js'
import { createQAAgent, type QAInput } from './qa-agent/agent.js'

// ============================================================================
// 1. 환경 설정
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.')
  console.error('   .env 파일에 OPENAI_API_KEY=sk-xxx 형식으로 설정하세요.')
  console.error('   예: echo "OPENAI_API_KEY=sk-xxx" > .env')
  process.exit(1)
}

// ============================================================================
// 2. Provider 생성
// ============================================================================

const provider = createOpenAIProvider({
  apiKey: OPENAI_API_KEY,
}).withDefaultModel('gpt-5-nano') // 비용 효율적인 모델

// ============================================================================
// 3. Q&A Agent 생성
// ============================================================================

const qaAgent = createQAAgent(provider)

// ============================================================================
// 4. Judge 생성 (평가자)
// ============================================================================

const judge = createJudge({
  provider,
  prompt: defaultJudgePrompt,
  criteria: [
    // 정확성 - 답변이 사실에 부합하는가 (가중치 2배)
    accuracy({ weight: 2 }),

    // 관련성 - 답변이 질문에 관련되어 있는가
    relevance(),

    // 간결성 - 커스텀 기준
    {
      id: 'conciseness',
      name: '간결성',
      description: '답변이 불필요하게 길지 않고 핵심을 담고 있는가',
      weight: 1,
    },
  ],
  passThreshold: 70,
})

// ============================================================================
// 5. Improver 생성 (개선 제안자)
// ============================================================================

const improver = createImprover({
  provider,
  prompt: defaultImproverPrompt,
})

// ============================================================================
// 6. EvalSuite 생성
// ============================================================================

const suite = createEvalSuite({
  agent: qaAgent,
  judge,
  improver,
  agentDescription: '질문에 대해 정확하고 간결한 답변을 생성하는 Q&A Agent',
})

// ============================================================================
// 7. 테스트 케이스 정의
// ============================================================================

const testCases: TestCase<QAInput>[] = [
  // 단순 사실 질문
  {
    id: 'capital-korea',
    input: { question: '한국의 수도는 어디인가요?' },
    tags: ['factual', 'geography'],
    description: '단순 사실 확인 질문',
  },

  // 수학 질문
  {
    id: 'math-simple',
    input: { question: '1 + 1은 얼마인가요?' },
    tags: ['factual', 'math'],
    description: '단순 계산 질문',
  },

  // 컨텍스트 기반 질문
  {
    id: 'context-based',
    input: {
      question: '주인공의 이름은 무엇인가요?',
      context:
        '철수는 매일 아침 7시에 일어납니다. 그는 학교에 가기 전에 항상 운동을 합니다. 오늘도 철수는 조깅을 하고 학교에 갔습니다.',
    },
    tags: ['context', 'comprehension'],
    description: '컨텍스트 독해 질문',
  },

  // 약간 어려운 질문
  {
    id: 'reasoning',
    input: {
      question: '오늘이 월요일이면, 모레는 무슨 요일인가요?',
    },
    tags: ['reasoning', 'logic'],
    description: '간단한 추론 질문',
  },
]

// ============================================================================
// 8. 실행
// ============================================================================

async function main() {
  console.log('🧪 Q&A Agent 평가 시작...')
  console.log(`   테스트 케이스: ${testCases.length}개`)
  console.log(`   모델: gpt-5-nano`)
  console.log('')
  try {
    // 평가 실행
    const report = await suite.run(testCases, {
      concurrency: 2, // 동시 실행 수
    })

    // 결과 출력
    console.log(reportToMarkdown(report))

    // 개선 제안 출력
    if (report.suggestions.length > 0) {
      console.log('\n' + '='.repeat(60))
      console.log('📝 프롬프트 개선 제안')
      console.log('='.repeat(60) + '\n')

      report.suggestions.forEach((s, i) => {
        console.log(`${i + 1}. [${s.priority.toUpperCase()}] ${s.type}`)
        console.log(`   이유: ${s.reasoning}`)
        console.log(`   예상 개선: ${s.expectedImprovement}`)
        console.log('')
      })
    }

    // 요약 통계
    console.log('\n' + '='.repeat(60))
    console.log('📊 요약')
    console.log('='.repeat(60))
    console.log(`   총 테스트: ${report.summary.totalTests}`)
    console.log(`   통과: ${report.summary.passed} (${Math.round((report.summary.passed / report.summary.totalTests) * 100)}%)`)
    console.log(`   실패: ${report.summary.failed}`)
    console.log(`   평균 점수: ${report.summary.avgScore.toFixed(1)}`)
    console.log(`   총 토큰: ${report.summary.metrics.totalTokens}`)
    console.log(`   평균 지연: ${report.summary.metrics.avgLatencyMs.toFixed(0)}ms`)

  } catch (error) {
    console.error('❌ 평가 중 오류 발생:', error)
    process.exit(1)
  }
}

main()

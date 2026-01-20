/**
 * Q&A Agent - Input/Output 타입 정의
 *
 * 단순한 질문-답변 Agent로 @agtlantis/eval 라이브러리를 검증합니다.
 */

/**
 * Q&A Agent 입력
 */
export interface QAInput {
  /** 질문 */
  question: string

  /** 선택적 컨텍스트 (질문에 답하기 위한 배경 정보) */
  context?: string
}

/**
 * Q&A Agent 출력
 */
export interface QAOutput {
  /** 답변 */
  answer: string

  /** 답변 신뢰도 */
  confidence?: 'high' | 'medium' | 'low'
}

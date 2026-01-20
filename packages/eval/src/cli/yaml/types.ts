/**
 * YAML Test Case Types
 *
 * 사람이 읽기 쉬운 YAML 형식으로 테스트 케이스를 정의하기 위한 타입들.
 * 이 타입들은 YAML 파일에서 파싱된 후 내부 TestCase 타입으로 변환됩니다.
 */

/**
 * YAML 파일의 루트 구조
 */
export interface YamlEvalFile {
  /** Agent 레지스트리 키 (config.agents에서 참조) */
  agent: string

  /** 평가 suite 이름 */
  name?: string

  /** 평가 suite 설명 */
  description?: string

  /** 테스트 케이스 기본값 */
  defaults?: YamlTestCaseDefaults

  /** 인라인 페르소나 정의 */
  personas?: Record<string, YamlPersona>

  /** 테스트 케이스 목록 */
  cases: YamlTestCase[]
}

/**
 * 테스트 케이스 기본값 (모든 케이스에 적용)
 */
export interface YamlTestCaseDefaults {
  /** 최대 턴 수 (multi-turn) */
  maxTurns?: number

  /** 종료 조건 */
  endWhen?: YamlTerminationCondition

  /** 조건 충족 시 결과 */
  onConditionMet?: 'pass' | 'fail'

  /** 최대 턴 도달 시 결과 */
  onMaxTurnsReached?: 'pass' | 'fail'

  /** 기본 태그 */
  tags?: string[]
}

/**
 * 페르소나 정의 (AI Simulated User)
 */
export interface YamlPersona {
  /** 페르소나 이름 */
  name: string

  /** 페르소나 설명 */
  description?: string

  /** 시스템 프롬프트 (멀티라인 지원) */
  systemPrompt: string
}

/**
 * 종료 조건 정의 (단순화된 형식)
 */
export interface YamlTerminationCondition {
  /** 필드 경로 (e.g., "booking.status") */
  field?: string

  /** 기대 값 */
  equals?: unknown

  /** 자연어 조건 (LLM 평가) */
  naturalLanguage?: string
}

/**
 * 단일 테스트 케이스
 */
export interface YamlTestCase {
  /** 고유 ID */
  id: string

  /** 케이스 이름 */
  name?: string

  /** 케이스 설명 */
  description?: string

  /** 태그 (필터링용) */
  tags?: string[]

  /** Agent 입력 (JSON 형식) */
  input: Record<string, unknown>

  /** 페르소나 키 (personas에서 참조) 또는 인라인 정의 */
  persona?: string | YamlPersona

  /** 최대 턴 수 (defaults 오버라이드) */
  maxTurns?: number

  /** 종료 조건 (defaults 오버라이드) */
  endWhen?: YamlTerminationCondition

  /** 조건 충족 시 결과 */
  onConditionMet?: 'pass' | 'fail'

  /** 최대 턴 도달 시 결과 */
  onMaxTurnsReached?: 'pass' | 'fail'

  /** 기대 출력 (선택적 검증용) */
  expectedOutput?: Record<string, unknown>

  /** 기대 조건 */
  expect?: YamlExpectation
}

/**
 * 기대 조건 (추가 검증)
 */
export interface YamlExpectation {
  /** 최소 턴 수 */
  minTurns?: number

  /** 최대 턴 수 */
  maxTurns?: number

  /** 최소 점수 */
  minScore?: number
}

/**
 * YAML 파일 발견 결과
 */
export interface DiscoveredEvalFile {
  /** 파일 경로 */
  path: string

  /** 파싱된 내용 */
  content: YamlEvalFile
}

/**
 * YAML 로딩 옵션
 */
export interface YamlLoadOptions {
  /** 기본 경로 (상대 경로 해석용) */
  basePath?: string

  /** 유효성 검사 스킵 */
  skipValidation?: boolean
}

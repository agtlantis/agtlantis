import { describe, it, expect, expectTypeOf } from 'vitest';
import type { EventMetrics } from '@/observability';
import type { DistributiveOmit, SessionEvent, SessionEventInput } from './types';

// ============================================================================
// Type Helper Tests
// ============================================================================

describe('Type Helper Tests', () => {
    // 테스트용 이벤트 타입 정의 (새 API: metrics 없이 순수 도메인 이벤트)
    type ProgressEvent = {
        type: 'progress';
        step: 'reading' | 'analyzing';
        message: string;
    };

    type CompleteEvent = {
        type: 'complete';
        data: { score: number };
    };

    type ErrorEvent = {
        type: 'error';
        error: Error;
    };

    type TestEvent = ProgressEvent | CompleteEvent | ErrorEvent;

    describe('DistributiveOmit', () => {
        // SessionEvent<T>로 metrics가 추가된 타입에서 DistributiveOmit 테스트
        type EventWithMetrics = SessionEvent<TestEvent>;
        type OmittedEvent = DistributiveOmit<EventWithMetrics, 'metrics'>;

        it('preserves unique properties from each union member', () => {
            // DistributiveOmit 결과: 각 유니온 멤버의 고유 속성이 보존됨
            type ProgressInput = Extract<OmittedEvent, { type: 'progress' }>;
            type CompleteInput = Extract<OmittedEvent, { type: 'complete' }>;
            type ErrorInput = Extract<OmittedEvent, { type: 'error' }>;

            // ✅ ProgressInput에 step, message 존재
            expectTypeOf<ProgressInput>().toHaveProperty('type');
            expectTypeOf<ProgressInput>().toHaveProperty('step');
            expectTypeOf<ProgressInput>().toHaveProperty('message');

            // ✅ CompleteInput에 data 존재
            expectTypeOf<CompleteInput>().toHaveProperty('type');
            expectTypeOf<CompleteInput>().toHaveProperty('data');

            // ✅ ErrorInput에 error 존재
            expectTypeOf<ErrorInput>().toHaveProperty('type');
            expectTypeOf<ErrorInput>().toHaveProperty('error');
        });

        it('allows valid event inputs without casting', () => {
            // ✅ 캐스팅 없이 사용 가능
            const progressInput: OmittedEvent = {
                type: 'progress',
                step: 'reading',
                message: 'Loading...',
            };

            const completeInput: OmittedEvent = {
                type: 'complete',
                data: { score: 95 },
            };

            const errorInput: OmittedEvent = {
                type: 'error',
                error: new Error('Failed'),
            };

            // 타입 체크 통과
            expect(progressInput.type).toBe('progress');
            expect(completeInput.type).toBe('complete');
            expect(errorInput.type).toBe('error');
        });
    });

    describe('SessionEvent', () => {
        // metrics 없이 이벤트 정의 (새 API 패턴)
        type RawProgressEvent = { type: 'progress'; step: string; message: string };
        type RawCompleteEvent = { type: 'complete'; data: { score: number } };
        type RawErrorEvent = { type: 'error'; error: Error };

        // SessionEvent로 감싸면 metrics 자동 추가
        type MyAgentEvent = SessionEvent<RawProgressEvent | RawCompleteEvent | RawErrorEvent>;

        it('automatically adds metrics to all union members', () => {
            type ProgressWithMetrics = Extract<MyAgentEvent, { type: 'progress' }>;
            type CompleteWithMetrics = Extract<MyAgentEvent, { type: 'complete' }>;
            type ErrorWithMetrics = Extract<MyAgentEvent, { type: 'error' }>;

            // ✅ 모든 이벤트에 metrics가 추가됨
            expectTypeOf<ProgressWithMetrics>().toHaveProperty('metrics');
            expectTypeOf<CompleteWithMetrics>().toHaveProperty('metrics');
            expectTypeOf<ErrorWithMetrics>().toHaveProperty('metrics');

            // ✅ 기존 속성도 유지됨
            expectTypeOf<ProgressWithMetrics>().toHaveProperty('step');
            expectTypeOf<CompleteWithMetrics>().toHaveProperty('data');
            expectTypeOf<ErrorWithMetrics>().toHaveProperty('error');
        });
    });

    describe('SessionEventInput (deprecated)', () => {
        // SessionEventInput은 deprecated - 새 API에서는 순수 이벤트 타입 직접 사용
        // 이 테스트는 backwards compatibility 확인용

        type MyEvent =
            | { type: 'progress'; step: string; message: string }
            | { type: 'complete'; data: { score: number } }
            | { type: 'error'; error: Error };

        type EmitInput = SessionEventInput<MyEvent>;

        it('is identity type for backwards compatibility', () => {
            // SessionEventInput<T>는 이제 T를 그대로 반환
            // 새 API에서는 사용자가 처음부터 metrics 없이 이벤트를 정의하므로,
            // SessionEventInput은 더 이상 필요하지 않음
            const input: EmitInput = {
                type: 'progress',
                step: 'reading',
                message: 'Loading...',
            };

            expect(input.type).toBe('progress');
        });
    });

    describe('New API Pattern', () => {
        // 새 API 패턴: 사용자는 순수 도메인 이벤트만 정의
        type MyDomainEvent =
            | { type: 'progress'; step: string; message: string }
            | { type: 'complete'; data: { score: number } };

        it('allows defining events without metrics', () => {
            // ✅ 사용자는 metrics 없이 이벤트 정의
            const event: MyDomainEvent = {
                type: 'progress',
                step: 'analyzing',
                message: 'Processing...',
            };

            expect(event.type).toBe('progress');
        });

        it('SessionEvent adds metrics to user events', () => {
            // SessionEvent<T>가 metrics를 추가
            type EventWithMetrics = SessionEvent<MyDomainEvent>;

            // ✅ metrics 포함된 이벤트
            const eventWithMetrics: EventWithMetrics = {
                type: 'progress',
                step: 'analyzing',
                message: 'Processing...',
                metrics: {
                    timestamp: Date.now(),
                    elapsedMs: 100,
                    deltaMs: 50,
                },
            };

            expect(eventWithMetrics.metrics).toBeDefined();
            expect(eventWithMetrics.metrics.timestamp).toBeGreaterThan(0);
        });
    });
});

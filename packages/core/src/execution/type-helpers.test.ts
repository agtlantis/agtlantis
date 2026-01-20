import { describe, it, expect, expectTypeOf } from 'vitest';
import type { EventMetrics } from '@/observability';
import type { DistributiveOmit, SessionEvent, SessionEventInput } from './types';

// ============================================================================
// Type Helper Tests
// ============================================================================

describe('Type Helper Tests', () => {
    // 테스트용 이벤트 타입 정의
    type ProgressEvent = {
        type: 'progress';
        step: 'reading' | 'analyzing';
        message: string;
        metrics: EventMetrics;
    };

    type CompleteEvent = {
        type: 'complete';
        data: { score: number };
        metrics: EventMetrics;
    };

    type ErrorEvent = {
        type: 'error';
        error: Error;
        metrics: EventMetrics;
    };

    type TestEvent = ProgressEvent | CompleteEvent | ErrorEvent;

    describe('DistributiveOmit', () => {
        type OmittedEvent = DistributiveOmit<TestEvent, 'metrics'>;

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
        // metrics 없이 이벤트 정의
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

    describe('SessionEventInput', () => {
        type MyEvent = SessionEvent<
            | { type: 'progress'; step: string; message: string }
            | { type: 'complete'; data: { score: number } }
            | { type: 'error'; error: Error }
        >;

        type EmitInput = SessionEventInput<MyEvent>;

        it('removes metrics from event types for emit input', () => {
            // ✅ 캐스팅 없이 emit 입력 가능
            const input: EmitInput = {
                type: 'progress',
                step: 'reading',
                message: 'Loading...',
            };

            expect(input.type).toBe('progress');
        });
    });
});

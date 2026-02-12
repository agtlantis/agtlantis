/**
 * Tests for History Persistence Module
 *
 * Following testing guidelines:
 * - Blackbox testing (verify behavior, not implementation)
 * - AAA structure with meaningful test data
 * - Mock only at uncontrollable boundaries (HistoryStorage)
 * - Factory functions for test fixtures
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EvalErrorCode } from '@/core/errors';
import type { AgentPrompt } from '@/core/types';
import type { EvalReport } from '@/reporter/types';
import { MOCK_COSTS } from '@/testing/constants';

import {
    type HistoryStorage,
    type ImprovementSession,
    createSession,
    deserializePrompt,
    hasUserTemplate,
    loadHistory,
    resumeSession,
    saveHistory,
    serializePrompt,
} from './history';
import type { ImprovementHistory, RoundCost, RoundResult, SerializedPrompt } from './types';

// =============================================================================
// Test Fixtures
// =============================================================================

function createPromptFixture<TInput = { name: string }>(
    overrides?: Partial<AgentPrompt<TInput> & { userTemplate: string }>
): AgentPrompt<TInput> & { userTemplate: string } {
    return {
        id: 'test-prompt',
        version: '1.0.0',
        system: 'You are a helpful assistant.',
        userTemplate: 'Hello {{name}}!',
        renderUserPrompt: (input: TInput) => `Hello ${(input as { name: string }).name}!`,
        ...overrides,
    } as AgentPrompt<TInput> & { userTemplate: string };
}

function createPromptWithoutTemplate(): AgentPrompt<{ name: string }> {
    return {
        id: 'test-prompt',
        version: '1.0.0',
        system: 'You are a helpful assistant.',
        renderUserPrompt: (input) => `Hello ${input.name}!`,
    };
}

function createRoundResultFixture(overrides?: Partial<RoundResult>): RoundResult {
    const defaultCost: RoundCost = MOCK_COSTS.singleRound;
    const defaultSnapshot: SerializedPrompt = {
        id: 'test-prompt',
        version: '1.0.0',
        system: 'You are a helpful assistant.',
        userTemplate: 'Hello {{name}}!',
    };

    return {
        round: 1,
        completedAt: new Date('2026-01-11T10:00:00Z'),
        report: {
            summary: {
                avgScore: 75,
                passed: 3,
                failed: 1,
                totalTests: 4,
            },
        } as EvalReport<unknown, unknown>,
        suggestionsGenerated: [
            {
                type: 'system_prompt',
                priority: 'high',
                currentValue: 'old',
                suggestedValue: 'new',
                reasoning: 'Test reasoning',
                expectedImprovement: 'Better performance',
            },
        ],
        suggestionsApproved: [
            {
                type: 'system_prompt',
                priority: 'high',
                currentValue: 'old',
                suggestedValue: 'new',
                reasoning: 'Test reasoning',
                expectedImprovement: 'Better performance',
            },
        ],
        promptSnapshot: defaultSnapshot,
        promptVersionAfter: '1.0.1',
        cost: defaultCost,
        scoreDelta: null,
        ...overrides,
    };
}

function createHistoryFixture(overrides?: Partial<ImprovementHistory>): ImprovementHistory {
    const defaultPrompt: SerializedPrompt = {
        id: 'test-prompt',
        version: '1.0.0',
        system: 'You are a helpful assistant.',
        userTemplate: 'Hello {{name}}!',
    };

    return {
        schemaVersion: '1.1.0',
        sessionId: 'test-session-id',
        startedAt: '2026-01-11T09:00:00.000Z',
        initialPrompt: defaultPrompt,
        currentPrompt: defaultPrompt,
        rounds: [],
        totalCost: 0,
        ...overrides,
    };
}

function createMockStorage(
    files: Record<string, string> = {}
): HistoryStorage & { writtenFiles: Record<string, string>; createdDirs: string[] } {
    const writtenFiles: Record<string, string> = { ...files };
    const createdDirs: string[] = [];

    return {
        writtenFiles,
        createdDirs,
        readFile: async (path: string) => {
            if (path in writtenFiles) {
                return writtenFiles[path];
            }
            throw new Error(`File not found: ${path}`);
        },
        writeFile: async (path: string, content: string) => {
            writtenFiles[path] = content;
        },
        exists: (path: string) => path in writtenFiles || createdDirs.includes(path),
        mkdir: async (path: string) => {
            createdDirs.push(path);
        },
    };
}

// =============================================================================
// hasUserTemplate Tests
// =============================================================================

describe('hasUserTemplate', () => {
    it('should detect prompts with userTemplate as serializable', () => {
        const prompt = createPromptFixture() as AgentPrompt<unknown>;

        const result = hasUserTemplate(prompt);

        expect(result).toBe(true);
    });

    it('should reject prompts without userTemplate', () => {
        const prompt = createPromptWithoutTemplate() as AgentPrompt<unknown>;

        const result = hasUserTemplate(prompt);

        expect(result).toBe(false);
    });

    it('should return false when userTemplate is not a string', () => {
        const prompt = {
            id: 'test',
            version: '1.0.0',
            system: 'test',
            renderUserPrompt: () => 'test',
            userTemplate: 123,
        } as unknown as AgentPrompt<unknown>;

        const result = hasUserTemplate(prompt);

        expect(result).toBe(false);
    });
});

// =============================================================================
// serializePrompt / deserializePrompt Tests
// =============================================================================

describe('serializePrompt / deserializePrompt', () => {
    it('should round-trip preserve all fields', () => {
        const original = createPromptFixture();

        const serialized = serializePrompt(original);
        const deserialized = deserializePrompt<{ name: string }>(serialized);

        expect(deserialized.id).toBe(original.id);
        expect(deserialized.version).toBe(original.version);
        expect(deserialized.system).toBe(original.system);
        expect(deserialized.userTemplate).toBe(original.userTemplate);
    });

    it('should preserve custom fields in customFields', () => {
        const original = createPromptFixture({
            customField1: 'value1',
            customField2: 42,
        } as Partial<AgentPrompt<{ name: string }> & { userTemplate: string }>);

        const serialized = serializePrompt(original);

        expect(serialized.customFields).toEqual({
            customField1: 'value1',
            customField2: 42,
        });
    });

    it('should restore renderUserPrompt that works after deserialization', () => {
        const original = createPromptFixture({
            userTemplate: 'Hello {{name}}, welcome!',
        });

        const serialized = serializePrompt(original);
        const deserialized = deserializePrompt<{ name: string }>(serialized);

        const result = deserialized.renderUserPrompt({ name: 'World' });

        expect(result).toBe('Hello World, welcome!');
    });

    it('should throw PROMPT_INVALID_FORMAT when userTemplate is missing', () => {
        const prompt = createPromptWithoutTemplate() as AgentPrompt<unknown>;

        expect(() => serializePrompt(prompt)).toThrow(
            expect.objectContaining({ code: EvalErrorCode.PROMPT_INVALID_FORMAT })
        );
    });

    it('should not include customFields when there are no extra fields', () => {
        const prompt = createPromptFixture();

        const serialized = serializePrompt(prompt);

        expect(serialized.customFields).toBeUndefined();
    });
});

// =============================================================================
// createSession Tests
// =============================================================================

describe('createSession', () => {
    it('should create session with required API methods', () => {
        const prompt = createPromptFixture();

        const session = createSession(prompt);

        expect(session.sessionId).toBeDefined();
        expect(session.history).toBeDefined();
        expect(typeof session.addRound).toBe('function');
        expect(typeof session.complete).toBe('function');
        expect(typeof session.save).toBe('function');
    });

    it('should generate valid UUID format for sessionId', () => {
        const prompt = createPromptFixture();

        const session = createSession(prompt);

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(session.sessionId).toMatch(uuidRegex);
    });

    it('should use schema version 1.1.0 for new sessions', () => {
        const prompt = createPromptFixture();

        const session = createSession(prompt);

        expect(session.history.schemaVersion).toBe('1.1.0');
    });

    it('should track original prompt before any modifications', () => {
        const prompt = createPromptFixture();

        const session = createSession(prompt);

        expect(session.history.initialPrompt).toEqual(session.history.currentPrompt);
    });

    it('should start with empty rounds and zero totalCost', () => {
        const prompt = createPromptFixture();

        const session = createSession(prompt);

        expect(session.history.rounds).toEqual([]);
        expect(session.history.totalCost).toBe(0);
    });
});

// =============================================================================
// session.addRound Tests
// =============================================================================

describe('session.addRound', () => {
    let session: ImprovementSession;

    beforeEach(() => {
        const prompt = createPromptFixture();
        session = createSession(prompt);
    });

    it('should append serialized round to history.rounds', () => {
        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));

        session.addRound(roundResult, updatedPrompt);

        expect(session.history.rounds).toHaveLength(1);
        expect(session.history.rounds[0].round).toBe(1);
    });

    it('should update currentPrompt with updatedPrompt', () => {
        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));

        session.addRound(roundResult, updatedPrompt);

        expect(session.history.currentPrompt.version).toBe('1.0.1');
    });

    it('should accumulate totalCost correctly', () => {
        const roundResult1 = createRoundResultFixture({ cost: MOCK_COSTS.singleRound });
        const roundResult2 = createRoundResultFixture({
            round: 2,
            cost: { agent: 0.02, judge: 0.01, improver: 0.003, total: 0.033 },
        });
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));

        session.addRound(roundResult1, updatedPrompt);
        session.addRound(roundResult2, updatedPrompt);

        expect(session.history.totalCost).toBeCloseTo(0.05, 5);
    });

    it('should auto-save when autoSave is enabled and path is configured', async () => {
        const mockStorage = createMockStorage();
        const prompt = createPromptFixture();
        const sessionWithAutoSave = createSession(prompt, {
            path: '/tmp/test-history.json',
            autoSave: true,
            storage: mockStorage,
        });

        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));
        sessionWithAutoSave.addRound(roundResult, updatedPrompt);

        // Give the fire-and-forget save a moment to complete
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockStorage.writtenFiles['/tmp/test-history.json']).toBeDefined();
    });
});

// =============================================================================
// session.complete Tests
// =============================================================================

describe('session.complete', () => {
    let session: ImprovementSession;

    beforeEach(() => {
        const prompt = createPromptFixture();
        session = createSession(prompt);
    });

    it('should set completedAt timestamp in ISO format', () => {
        session.complete('targetScore reached');

        expect(session.history.completedAt).toBeDefined();
        expect(session.history.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should set terminationReason', () => {
        session.complete('maxRounds reached: 5/5');

        expect(session.history.terminationReason).toBe('maxRounds reached: 5/5');
    });

    it('should auto-save when autoSave is enabled and path is configured', async () => {
        const mockStorage = createMockStorage();
        const prompt = createPromptFixture();
        const sessionWithAutoSave = createSession(prompt, {
            path: '/tmp/test-history.json',
            autoSave: true,
            storage: mockStorage,
        });

        sessionWithAutoSave.complete('test complete');

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockStorage.writtenFiles['/tmp/test-history.json']).toBeDefined();
    });
});

// =============================================================================
// session.save Tests
// =============================================================================

describe('session.save', () => {
    it('should throw INVALID_CONFIG when no path configured', async () => {
        const prompt = createPromptFixture();
        const session = createSession(prompt);

        await expect(session.save()).rejects.toMatchObject({
            code: EvalErrorCode.INVALID_CONFIG,
        });
    });

    it('should create parent directories when missing', async () => {
        const mockStorage = createMockStorage();
        const prompt = createPromptFixture();
        const session = createSession(prompt, {
            path: '/deep/nested/dir/history.json',
            storage: mockStorage,
        });

        await session.save();

        expect(mockStorage.createdDirs).toContain('/deep/nested/dir');
    });

    it('should write pretty-printed JSON with 2-space indent', async () => {
        const mockStorage = createMockStorage();
        const prompt = createPromptFixture();
        const session = createSession(prompt, {
            path: '/tmp/history.json',
            storage: mockStorage,
        });

        await session.save();

        const content = mockStorage.writtenFiles['/tmp/history.json'];
        expect(content).toContain('\n  ');
        const parsed = JSON.parse(content);
        expect(parsed.schemaVersion).toBe('1.1.0');
    });
});

// =============================================================================
// resumeSession Tests
// =============================================================================

describe('resumeSession', () => {
    it('should load history and create session', async () => {
        const history = createHistoryFixture();
        const mockStorage = createMockStorage({
            '/tmp/history.json': JSON.stringify(history),
        });

        const session = await resumeSession('/tmp/history.json', { storage: mockStorage });

        expect(session.sessionId).toBe('test-session-id');
    });

    it('should preserve original history data', async () => {
        const history = createHistoryFixture({
            totalCost: 0.5,
            rounds: [
                {
                    round: 1,
                    completedAt: '2026-01-11T10:00:00.000Z',
                    avgScore: 75,
                    passed: 3,
                    failed: 1,
                    totalTests: 4,
                    suggestionsGenerated: [],
                    suggestionsApproved: [],
                    promptSnapshot: {
                        id: 'test-prompt',
                        version: '1.0.0',
                        system: 'Test',
                        userTemplate: 'Test',
                    },
                    promptVersionAfter: '1.0.1',
                    cost: MOCK_COSTS.singleRound,
                    scoreDelta: null,
                },
            ],
        });
        const mockStorage = createMockStorage({
            '/tmp/history.json': JSON.stringify(history),
        });

        const session = await resumeSession('/tmp/history.json', { storage: mockStorage });

        expect(session.history.rounds).toHaveLength(1);
        expect(session.history.totalCost).toBe(0.5);
    });

    it('should allow continuing to add rounds', async () => {
        const history = createHistoryFixture();
        const mockStorage = createMockStorage({
            '/tmp/history.json': JSON.stringify(history),
        });

        const session = await resumeSession('/tmp/history.json', { storage: mockStorage });
        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));

        session.addRound(roundResult, updatedPrompt);

        expect(session.history.rounds).toHaveLength(1);
    });
});

// =============================================================================
// saveHistory / loadHistory Tests
// =============================================================================

describe('saveHistory / loadHistory', () => {
    it('should round-trip to storage via mock', async () => {
        const history = createHistoryFixture();
        const mockStorage = createMockStorage();

        await saveHistory(history, '/tmp/history.json', mockStorage);
        const loaded = await loadHistory('/tmp/history.json', mockStorage);

        expect(loaded).toEqual(history);
    });

    it('should create parent directories when missing', async () => {
        const history = createHistoryFixture();
        const mockStorage = createMockStorage();

        await saveHistory(history, '/deep/nested/dir/history.json', mockStorage);

        expect(mockStorage.createdDirs).toContain('/deep/nested/dir');
    });

    it('should pretty-print JSON with 2-space indent', async () => {
        const history = createHistoryFixture();
        const mockStorage = createMockStorage();

        await saveHistory(history, '/tmp/history.json', mockStorage);

        const content = mockStorage.writtenFiles['/tmp/history.json'];
        const lines = content.split('\n');
        expect(lines.some((line) => line.startsWith('  '))).toBe(true);
    });

    it('should throw FILE_READ_ERROR when file not found', async () => {
        const mockStorage = createMockStorage();

        await expect(loadHistory('/nonexistent.json', mockStorage)).rejects.toMatchObject({
            code: EvalErrorCode.FILE_READ_ERROR,
        });
    });
});

// =============================================================================
// validateHistorySchema Tests
// =============================================================================

describe('validateHistorySchema (via loadHistory)', () => {
    it('should throw for non-object data', async () => {
        const mockStorage = createMockStorage({
            '/tmp/history.json': '"just a string"',
        });

        await expect(loadHistory('/tmp/history.json', mockStorage)).rejects.toMatchObject({
            code: EvalErrorCode.SCHEMA_VALIDATION_ERROR,
        });
    });

    it('should throw for wrong schemaVersion', async () => {
        const history = { ...createHistoryFixture(), schemaVersion: '0.9.0' };
        const mockStorage = createMockStorage({
            '/tmp/history.json': JSON.stringify(history),
        });

        await expect(loadHistory('/tmp/history.json', mockStorage)).rejects.toMatchObject({
            code: EvalErrorCode.SCHEMA_VALIDATION_ERROR,
        });
    });

    it('should throw for missing required fields', async () => {
        const incompleteHistory = {
            schemaVersion: '1.1.0',
            sessionId: 'test',
            // missing startedAt, initialPrompt, currentPrompt, rounds, totalCost
        };
        const mockStorage = createMockStorage({
            '/tmp/history.json': JSON.stringify(incompleteHistory),
        });

        await expect(loadHistory('/tmp/history.json', mockStorage)).rejects.toMatchObject({
            code: EvalErrorCode.SCHEMA_VALIDATION_ERROR,
        });
    });

    it('should pass for valid history', async () => {
        const history = createHistoryFixture();
        const mockStorage = createMockStorage({
            '/tmp/history.json': JSON.stringify(history),
        });

        const loaded = await loadHistory('/tmp/history.json', mockStorage);

        expect(loaded.schemaVersion).toBe('1.1.0');
    });
});

// =============================================================================
// Additional Tests for Edge Cases
// =============================================================================

describe('session state validation', () => {
    it('should throw when adding round to completed session', () => {
        const prompt = createPromptFixture();
        const session = createSession(prompt);
        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));

        session.complete('done');

        expect(() => session.addRound(roundResult, updatedPrompt)).toThrow(
            expect.objectContaining({ code: EvalErrorCode.INVALID_CONFIG })
        );
    });

    it('should throw CONCURRENT_MODIFICATION when addRound is called while updating', () => {
        const prompt = createPromptFixture();
        const session = createSession(prompt);
        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));

        // Simulate concurrent access by manually setting the private flag
        (session as unknown as { _isUpdating: boolean })._isUpdating = true;

        expect(() => session.addRound(roundResult, updatedPrompt)).toThrow(
            expect.objectContaining({
                code: EvalErrorCode.CONCURRENT_MODIFICATION,
                message: 'Session is being updated',
            })
        );
    });
});

describe('deserializePrompt edge cases', () => {
    it('should not allow customFields to override core fields', () => {
        const serialized: SerializedPrompt = {
            id: 'original-id',
            version: '1.0.0',
            system: 'original-system',
            userTemplate: 'Hello {{name}}!',
            customFields: {
                id: 'hacked-id',
                version: 'hacked-version',
                extra: 'extra-value',
            },
        };

        const result = deserializePrompt<{ name: string }>(serialized);

        expect(result.id).toBe('original-id');
        expect(result.version).toBe('1.0.0');
        expect(result.system).toBe('original-system');
        expect((result as Record<string, unknown>).extra).toBe('extra-value');
    });

    /**
     * Note: This test documents the defensive error handling in deserializePrompt.
     *
     * The current compileTemplate() implementation doesn't throw at compile time -
     * it returns a function that may throw at render time. The try-catch in
     * deserializePrompt is defensive programming that will catch errors if:
     * 1. compileTemplate's implementation changes to validate templates eagerly
     * 2. TypeErrors occur (e.g., non-string template)
     *
     * When caught, errors are wrapped with EvalErrorCode.TEMPLATE_COMPILE_ERROR
     * and include context: { promptId, userTemplate }
     */
    it('should correctly compile valid templates', () => {
        const serialized: SerializedPrompt = {
            id: 'test-prompt-id',
            version: '1.0.0',
            system: 'Test system',
            userTemplate: 'Hello {{name}}, your score is {{score}}!',
        };

        const result = deserializePrompt<{ name: string; score: number }>(serialized);

        expect(result.renderUserPrompt).toBeInstanceOf(Function);
        expect(result.renderUserPrompt({ name: 'Test', score: 95 })).toBe(
            'Hello Test, your score is 95!'
        );
    });
});

describe('onAutoSaveError callback', () => {
    it('should call onAutoSaveError when auto-save fails', async () => {
        const errorHandler = vi.fn();
        const failingStorage: HistoryStorage = {
            ...createMockStorage(),
            writeFile: () => Promise.reject(new Error('Write failed')),
        };
        const prompt = createPromptFixture();
        const session = createSession(prompt, {
            path: '/tmp/test.json',
            autoSave: true,
            storage: failingStorage,
            onAutoSaveError: errorHandler,
        });

        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));
        session.addRound(roundResult, updatedPrompt);

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should use console.error when onAutoSaveError is not provided', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const failingStorage: HistoryStorage = {
            ...createMockStorage(),
            writeFile: () => Promise.reject(new Error('Write failed')),
        };
        const prompt = createPromptFixture();
        const session = createSession(prompt, {
            path: '/tmp/test.json',
            autoSave: true,
            storage: failingStorage,
        });

        const roundResult = createRoundResultFixture();
        const updatedPrompt = serializePrompt(createPromptFixture({ version: '1.0.1' }));
        session.addRound(roundResult, updatedPrompt);

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});

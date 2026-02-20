import { z } from 'zod';

import { EvalError, EvalErrorCode } from '@/core/errors.js';

import type { YamlEvalFile } from './types.js';

export const yamlExpectationSchema = z.object({
    minTurns: z.number().int().positive().optional(),
    maxTurns: z.number().int().positive().optional(),
    minScore: z.number().min(0).max(100).optional(),
});

export const yamlTerminationConditionSchema = z
    .object({
        field: z.string().min(1).optional(),
        equals: z.unknown().optional(),
        naturalLanguage: z.string().min(1).optional(),
    })
    .refine((data) => data.field !== undefined || data.naturalLanguage !== undefined, {
        message: 'Either field or naturalLanguage must be specified',
    });

export const yamlPersonaSchema = z.object({
    name: z.string().min(1, 'Persona name is required'),
    description: z.string().optional(),
    systemPrompt: z.string().min(1, 'Persona systemPrompt is required'),
});

export const yamlTestCaseDefaultsSchema = z.object({
    maxTurns: z.number().int().positive().optional(),
    endWhen: yamlTerminationConditionSchema.optional(),
    onConditionMet: z.enum(['pass', 'fail']).optional(),
    onMaxTurnsReached: z.enum(['pass', 'fail']).optional(),
    tags: z.array(z.string()).optional(),
});

export const yamlTestCaseSchema = z.object({
    id: z.string().min(1, 'Test case id is required'),
    name: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    input: z.record(z.string(), z.unknown()),
    persona: z.union([z.string().min(1), yamlPersonaSchema]).optional(),
    maxTurns: z.number().int().positive().optional(),
    endWhen: yamlTerminationConditionSchema.optional(),
    onConditionMet: z.enum(['pass', 'fail']).optional(),
    onMaxTurnsReached: z.enum(['pass', 'fail']).optional(),
    expectedOutput: z.record(z.string(), z.unknown()).optional(),
    expect: yamlExpectationSchema.optional(),
});

export const yamlEvalFileSchema = z.object({
    agent: z.string().min(1, 'Agent name is required'),
    name: z.string().optional(),
    description: z.string().optional(),
    defaults: yamlTestCaseDefaultsSchema.optional(),
    personas: z.record(z.string(), yamlPersonaSchema).optional(),
    cases: z.array(yamlTestCaseSchema).min(1, 'At least one test case is required'),
});

export type ValidatedYamlEvalFile = z.infer<typeof yamlEvalFileSchema>;
export type ValidatedYamlTestCase = z.infer<typeof yamlTestCaseSchema>;
export type ValidatedYamlPersona = z.infer<typeof yamlPersonaSchema>;
export type ValidatedYamlExpectation = z.infer<typeof yamlExpectationSchema>;
export type ValidatedYamlTerminationCondition = z.infer<typeof yamlTerminationConditionSchema>;
export type ValidatedYamlTestCaseDefaults = z.infer<typeof yamlTestCaseDefaultsSchema>;

export function validateYamlEvalFile(content: unknown): YamlEvalFile {
    const result = yamlEvalFileSchema.safeParse(content);

    if (!result.success) {
        const errors = result.error.issues
            .map((issue) => {
                const path = issue.path.join('.');
                return path ? `  - ${path}: ${issue.message}` : `  - ${issue.message}`;
            })
            .join('\n');

        throw new EvalError(`Invalid YAML eval file:\n${errors}`, {
            code: EvalErrorCode.INVALID_CONFIG,
        });
    }

    return result.data as YamlEvalFile;
}

export function validateYamlEvalFileSourceial(content: unknown): {
    success: boolean;
    data?: YamlEvalFile;
    errors?: string[];
} {
    const result = yamlEvalFileSchema.safeParse(content);

    if (result.success) {
        return { success: true, data: result.data as YamlEvalFile };
    }

    return {
        success: false,
        errors: result.error.issues.map((issue) => {
            const path = issue.path.join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
        }),
    };
}

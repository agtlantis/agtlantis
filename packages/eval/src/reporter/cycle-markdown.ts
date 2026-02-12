import { writeFileSync } from 'node:fs';

import type { ImprovementCycleResult } from '@/improvement-cycle/types';

import { formatScoreDelta } from './format-utils';
import { reportToMarkdown } from './markdown';

/**
 * Options for generating cycle markdown.
 */
export interface CycleMarkdownOptions {
    /** Include full per-round details (default: true) */
    includeRoundDetails?: boolean;
    /** Show prompt evolution - initial vs final (default: false) */
    showPromptEvolution?: boolean;
}

/**
 * Converts an ImprovementCycleResult to markdown.
 *
 * Generates a comprehensive report including:
 * - Summary table (rounds, termination, cost, scores)
 * - Score progression table
 * - Per-round details (optional)
 * - Prompt evolution (optional)
 *
 * @param result - The improvement cycle result
 * @param options - Markdown generation options
 * @returns Markdown string
 *
 * @example
 * ```typescript
 * import { cycleToMarkdown } from '@agtlantis/eval'
 *
 * const result = await runImprovementCycleAuto(config)
 * const markdown = cycleToMarkdown(result, {
 *   includeRoundDetails: true,
 *   showPromptEvolution: true,
 * })
 * ```
 */
export function cycleToMarkdown<TInput, TOutput>(
    result: ImprovementCycleResult<TInput, TOutput>,
    options: CycleMarkdownOptions = {}
): string {
    const { includeRoundDetails = true, showPromptEvolution = false } = options;
    const lines: string[] = [];

    // Header
    lines.push('# Improvement Cycle Report');
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Rounds | ${result.rounds.length} |`);
    lines.push(`| Termination | ${result.terminationReason} |`);
    lines.push(`| Total Cost | $${result.totalCost.toFixed(4)} |`);

    if (result.rounds.length > 0) {
        const first = result.rounds[0].report.summary.avgScore;
        const last = result.rounds[result.rounds.length - 1].report.summary.avgScore;
        lines.push(`| Initial Score | ${first.toFixed(1)} |`);
        lines.push(`| Final Score | ${last.toFixed(1)} |`);
        lines.push(`| Improvement | ${formatScoreDelta(last - first)} |`);
    }
    lines.push('');

    // Score progression table
    lines.push('## Score Progression');
    lines.push('');
    lines.push('| Round | Score | Delta | Cost |');
    lines.push('|-------|-------|-------|------|');
    for (const round of result.rounds) {
        const delta = formatScoreDelta(round.scoreDelta);
        lines.push(
            `| ${round.round} | ${round.report.summary.avgScore.toFixed(1)} | ${delta} | $${round.cost.total.toFixed(4)} |`
        );
    }
    lines.push('');

    // Per-round details
    if (includeRoundDetails) {
        lines.push('## Round Details');
        lines.push('');
        for (const round of result.rounds) {
            lines.push(`### Round ${round.round}`);
            lines.push('');
            lines.push(reportToMarkdown(round.report));
            lines.push('');
        }
    }

    // Prompt evolution
    if (showPromptEvolution && result.rounds.length > 0) {
        lines.push('## Prompt Evolution');
        lines.push('');
        lines.push('### Initial Prompt');
        lines.push('');
        lines.push('```');
        lines.push(result.rounds[0].promptSnapshot.userTemplate);
        lines.push('```');
        lines.push('');
        lines.push('### Final Prompt');
        lines.push('');
        lines.push('```');
        // Use the final prompt's userTemplate if available, otherwise try to call renderUserPrompt
        const finalPrompt = result.finalPrompt;
        if ('userTemplate' in finalPrompt && typeof finalPrompt.userTemplate === 'string') {
            lines.push(finalPrompt.userTemplate);
        } else {
            lines.push('[Compiled prompt - template not available]');
        }
        lines.push('```');
    }

    return lines.join('\n');
}

/**
 * Saves an ImprovementCycleResult as markdown.
 *
 * @param result - The improvement cycle result
 * @param filePath - Path to save the markdown file
 * @param options - Markdown generation options
 *
 * @example
 * ```typescript
 * import { saveCycleMarkdown } from '@agtlantis/eval'
 *
 * const result = await runImprovementCycleAuto(config)
 * saveCycleMarkdown(result, './reports/cycle-report.md', {
 *   includeRoundDetails: true,
 * })
 * ```
 */
export function saveCycleMarkdown<TInput, TOutput>(
    result: ImprovementCycleResult<TInput, TOutput>,
    filePath: string,
    options?: CycleMarkdownOptions
): void {
    const markdown = cycleToMarkdown(result, options);
    writeFileSync(filePath, markdown);
}

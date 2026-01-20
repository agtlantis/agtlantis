import type { Reporter, TestCase } from 'vitest/node';
import { getCostMeta, type CostMeta } from '../helpers/cost-meta';

interface AggregatedCost {
  totalCost: number;
  llmCost: number;
  llmCallCount: number;
  testCount: number;
  costByModel: Record<string, number>;
  totalTokens: { input: number; output: number };
}

/**
 * Custom Vitest Reporter that aggregates and displays E2E test costs.
 *
 * This reporter runs in the main process and collects cost data from test metadata.
 * Tests must pass `{ task }` to `createTestProvider()` for cost tracking.
 *
 * Enable with: `E2E_SHOW_COSTS=true`
 *
 * @example
 * // In test file:
 * it('should work', async ({ task }) => {
 *   const provider = createTestProvider('google', { task });
 *   // ...
 * });
 */
export class CostReporter implements Reporter {
  private aggregated: AggregatedCost = {
    totalCost: 0,
    llmCost: 0,
    llmCallCount: 0,
    testCount: 0,
    costByModel: {},
    totalTokens: { input: 0, output: 0 },
  };

  onTestCaseResult(testCase: TestCase): void {
    const cost = getCostMeta(testCase.meta());
    if (!cost) return;

    this.aggregated.totalCost += cost.totalCost;
    this.aggregated.llmCost += cost.llmCost;
    this.aggregated.llmCallCount += cost.llmCallCount;
    this.aggregated.testCount += 1;
    this.aggregated.totalTokens.input += cost.totalTokens.input;
    this.aggregated.totalTokens.output += cost.totalTokens.output;

    this.mergeCostByModel(cost.costByModel);
  }

  onTestRunEnd(): void {
    if (this.aggregated.testCount === 0) return;

    const divider = '\u2500'.repeat(60);
    console.log('\n' + divider);
    console.log('\ud83d\udcca E2E Cost Summary');
    console.log(divider);
    console.log(`  Total Cost: $${this.formatCost(this.aggregated.totalCost)}`);
    console.log(`  LLM Cost:   $${this.formatCost(this.aggregated.llmCost)}`);
    console.log(`  API Calls:  ${this.aggregated.llmCallCount}`);
    console.log(`  Tests:      ${this.aggregated.testCount}`);
    console.log(
      `  Tokens:     ${this.formatNumber(this.aggregated.totalTokens.input)} in / ${this.formatNumber(this.aggregated.totalTokens.output)} out`
    );

    if (Object.keys(this.aggregated.costByModel).length > 0) {
      console.log('\n  Cost by Model:');
      const sortedModels = Object.entries(this.aggregated.costByModel).sort(
        ([, a], [, b]) => b - a
      );
      for (const [model, cost] of sortedModels) {
        console.log(`    ${model}: $${this.formatCost(cost)}`);
      }
    }
    console.log(divider);
  }

  private mergeCostByModel(costByModel: CostMeta['costByModel']): void {
    for (const [model, cost] of Object.entries(costByModel)) {
      this.aggregated.costByModel[model] =
        (this.aggregated.costByModel[model] ?? 0) + cost;
    }
  }

  private formatCost(cost: number): string {
    // Show 6 decimal places for small costs, fewer for larger costs
    if (cost < 0.01) return cost.toFixed(6);
    if (cost < 1) return cost.toFixed(4);
    return cost.toFixed(2);
  }

  private formatNumber(num: number): string {
    return num.toLocaleString();
  }
}

import type { MealParser, CallUsage } from "@/ai/types";
import { absPctError, mape, percentile } from "./metrics";
import type { EvalCase } from "./schema";

export type CaseResult = {
  case: EvalCase;
  ok: boolean;
  error?: string;
  calories?: number;
  protein_g?: number;
  calorieError?: number | null;
  proteinError?: number | null;
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export type EvalSummary = {
  parser: string;
  cases: number;
  parsed: number;
  parseSuccessRate: number;
  calorieMape: { value: number | null; n: number };
  proteinMape: { value: number | null; n: number };
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  costPerCaseUsd: number;
  totalCostUsd: number;
  uncheckedCases: number;
  results: CaseResult[];
};

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const usageTotals = (usage: CallUsage[]) => ({
  costUsd: sum(usage.map((u) => u.costUsd)),
  inputTokens: sum(usage.map((u) => u.inputTokens)),
  outputTokens: sum(usage.map((u) => u.outputTokens)),
});

export async function runCase(
  parser: MealParser,
  c: EvalCase,
  timeoutMs: number,
): Promise<CaseResult> {
  const start = performance.now();
  try {
    const result = await withTimeout(parser.parse({ text: c.input }), timeoutMs);
    const latencyMs = performance.now() - start;
    const totals = usageTotals(result.usage);
    if (!result.ok) {
      return { case: c, ok: false, error: result.error, latencyMs, ...totals };
    }
    const calories = sum(result.items.map((i) => i.calories));
    const protein_g = sum(result.items.map((i) => i.protein_g));
    return {
      case: c,
      ok: true,
      calories,
      protein_g,
      calorieError: absPctError(calories, c.expected.calories),
      proteinError: absPctError(protein_g, c.expected.protein_g),
      latencyMs,
      ...totals,
    };
  } catch (err) {
    return {
      case: c,
      ok: false,
      error: `threw: ${(err as Error).message}`,
      latencyMs: performance.now() - start,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export async function runEval(
  parser: MealParser,
  cases: EvalCase[],
  { concurrency = 4, timeoutMs = 30_000 } = {},
): Promise<EvalSummary> {
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const i = next++;
      results[i] = await runCase(parser, cases[i], timeoutMs);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length) }, worker),
  );
  return summarize(parser.name, results);
}

export function summarize(parser: string, results: CaseResult[]): EvalSummary {
  const parsedResults = results.filter((r) => r.ok);
  const latencies = results.map((r) => r.latencyMs);
  const totalCostUsd = sum(results.map((r) => r.costUsd));
  return {
    parser,
    cases: results.length,
    parsed: parsedResults.length,
    parseSuccessRate: results.length ? parsedResults.length / results.length : 0,
    calorieMape: mape(
      parsedResults.map((r) => ({
        actual: r.calories!,
        expected: r.case.expected.calories,
      })),
    ),
    proteinMape: mape(
      parsedResults.map((r) => ({
        actual: r.protein_g!,
        expected: r.case.expected.protein_g,
      })),
    ),
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    costPerCaseUsd: results.length ? totalCostUsd / results.length : 0,
    totalCostUsd,
    uncheckedCases: results.filter((r) => r.case.source.checked_on === null)
      .length,
    results,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

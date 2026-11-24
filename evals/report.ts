import type { EvalSummary } from "./run-cases";

const pct = (x: number | null | undefined) =>
  x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(1)}%`;
const ms = (x: number | null) => (x === null ? "n/a" : `${Math.round(x)} ms`);
const usd = (x: number) => `$${x.toFixed(4)}`;

/** A markdown summary meant to be pasted into a PR. */
export function toMarkdown(s: EvalSummary): string {
  const lines = [
    `### Eval: \`${s.parser}\` on ${s.cases} cases`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Calorie error (MAPE) | ${pct(s.calorieMape.value)} (n=${s.calorieMape.n}) |`,
    `| Protein error (MAPE) | ${pct(s.proteinMape.value)} (n=${s.proteinMape.n}) |`,
    `| Parse success | ${pct(s.parseSuccessRate)} (${s.parsed}/${s.cases}) |`,
    `| Latency p50 / p95 | ${ms(s.latencyP50Ms)} / ${ms(s.latencyP95Ms)} |`,
    `| Cost per case | ${usd(s.costPerCaseUsd)} (total ${usd(s.totalCostUsd)}) |`,
    "",
  ];
  if (s.parser === "stub") {
    lines.push(
      "_Stub parser: it echoes the expected answers, so these scores only check the harness._",
      "",
    );
  }
  if (s.uncheckedCases > 0) {
    lines.push(
      `_${s.uncheckedCases} of ${s.cases} cases haven't been checked against their source yet (\`checked_on: null\`)._`,
      "",
    );
  }

  // Worst first, failures on top, so problems are easy to spot.
  const rows = [...s.results].sort(
    (a, b) =>
      Number(a.ok) - Number(b.ok) ||
      (b.calorieError ?? 0) - (a.calorieError ?? 0),
  );
  lines.push(
    "<details><summary>Per case</summary>",
    "",
    "| Case | kcal exp / got | kcal err | protein exp / got | protein err | latency |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) =>
      r.ok
        ? `| ${r.case.id} | ${r.case.expected.calories} / ${Math.round(r.calories!)} | ${pct(r.calorieError)} | ${r.case.expected.protein_g} / ${round1(r.protein_g!)} | ${pct(r.proteinError)} | ${ms(r.latencyMs)} |`
        : `| ${r.case.id} | ${r.case.expected.calories} / — | failed | ${r.case.expected.protein_g} / — | failed: ${escape(r.error ?? "")} | ${ms(r.latencyMs)} |`,
    ),
    "",
    "</details>",
    "",
  );
  return lines.join("\n");
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const escape = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

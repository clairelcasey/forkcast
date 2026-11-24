import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MealParser } from "@/ai/types";
import { loadCases } from "./load";
import { absPctError, mape, percentile } from "./metrics";
import { createStubParser } from "./parsers";
import { toMarkdown } from "./report";
import { runEval } from "./run-cases";
import { evalCaseSchema, type EvalCase } from "./schema";

const validCase: EvalCase = {
  id: "test-latte",
  input: "grande latte",
  tags: ["chain", "drink"],
  expected: {
    items: [{ name: "Latte", quantity: "grande", calories: 190, protein_g: 13 }],
    calories: 190,
    protein_g: 13,
  },
  source: { kind: "published", name: "Test", checked_on: null },
};

describe("committed eval cases", () => {
  it("are all valid, with at least 20 cases", async () => {
    const cases = await loadCases();
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });
});

describe("evalCaseSchema", () => {
  it("accepts a valid case", () => {
    expect(evalCaseSchema.safeParse(validCase).success).toBe(true);
  });

  it("rejects totals that don't match the items", () => {
    const bad = { ...validCase, expected: { ...validCase.expected, calories: 250 } };
    const result = evalCaseSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/add up to 190/);
  });

  it("rejects unknown fields and tags", () => {
    expect(evalCaseSchema.safeParse({ ...validCase, extra: 1 }).success).toBe(false);
    expect(evalCaseSchema.safeParse({ ...validCase, tags: ["snack"] }).success).toBe(
      false,
    );
  });
});

describe("loadCases", () => {
  let dir: string;
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("fails loudly, naming every bad file", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "evals-"));
    await writeFile(path.join(dir, "test-latte.json"), JSON.stringify(validCase));
    await writeFile(path.join(dir, "broken.json"), "{ not json");
    await writeFile(
      path.join(dir, "wrong-name.json"),
      JSON.stringify({ ...validCase, id: "other-id" }),
    );
    await expect(loadCases(dir)).rejects.toThrow(
      /2 invalid eval case file\(s\)[\s\S]*broken\.json[\s\S]*wrong-name\.json/,
    );
  });
});

describe("metrics", () => {
  it("computes absolute percentage error", () => {
    expect(absPctError(110, 100)).toBeCloseTo(0.1);
    expect(absPctError(90, 100)).toBeCloseTo(0.1);
    expect(absPctError(5, 0)).toBeNull();
  });

  it("skips zero expected values in MAPE", () => {
    expect(
      mape([
        { actual: 120, expected: 100 },
        { actual: 0, expected: 0 },
        { actual: 50, expected: 100 },
      ]),
    ).toEqual({ value: 0.35, n: 2 });
  });

  it("uses nearest-rank percentiles", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(10);
    expect(percentile(xs, 95)).toBe(19);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("runEval", () => {
  const cases: EvalCase[] = [
    validCase,
    { ...validCase, id: "test-2", input: "two" },
    { ...validCase, id: "test-3", input: "three" },
    { ...validCase, id: "test-4", input: "four" },
  ];

  it("scores the stub perfectly", async () => {
    const s = await runEval(createStubParser(cases), cases);
    expect(s.parseSuccessRate).toBe(1);
    expect(s.calorieMape.value).toBe(0);
    expect(toMarkdown(s)).toContain("Stub parser");
  });

  it("counts errors, throws and timeouts as failed parses", async () => {
    const parser: MealParser = {
      name: "flaky",
      async parse({ text }) {
        const usage = [{ model: "m", inputTokens: 100, outputTokens: 20, costUsd: 0.001 }];
        if (text === "two") return { ok: false, error: "bad schema", usage };
        if (text === "three") throw new Error("network down");
        if (text === "four") return new Promise(() => {}); // never resolves
        return {
          ok: true,
          // 10% over on calories, exact on protein, split across two items.
          items: [
            { name: "a", quantity: "1", calories: 100, protein_g: 6.5 },
            { name: "b", quantity: "1", calories: 109, protein_g: 6.5 },
          ],
          usage,
        };
      },
    };
    const s = await runEval(parser, cases, { timeoutMs: 50 });
    expect(s.parsed).toBe(1);
    expect(s.parseSuccessRate).toBe(0.25);
    expect(s.calorieMape).toEqual({ value: expect.closeTo(0.1), n: 1 });
    expect(s.proteinMape.value).toBe(0);
    expect(s.totalCostUsd).toBeCloseTo(0.002);
    expect(s.costPerCaseUsd).toBeCloseTo(0.0005);
    const errors = s.results.map((r) => r.error);
    expect(errors).toEqual([
      undefined,
      "bad schema",
      "threw: network down",
      "threw: timed out after 50 ms",
    ]);
    const md = toMarkdown(s);
    expect(md).toContain("Parse success | 25.0% (1/4)");
    expect(md).toContain("4 of 4 cases haven't been checked");
  });
});

import type { MealParser } from "@/ai/types";
import type { EvalCase } from "./schema";

/**
 * Echoes each case's expected answer. It checks the harness, not the AI:
 * its scores are perfect by construction.
 */
export function createStubParser(cases: EvalCase[]): MealParser {
  const byInput = new Map(cases.map((c) => [c.input, c]));
  return {
    name: "stub",
    async parse({ text }) {
      const c = byInput.get(text);
      if (!c) return { ok: false, error: "stub: unknown input", usage: [] };
      return { ok: true, items: c.expected.items, usage: [] };
    },
  };
}

/** Parsers selectable with `pnpm eval --parser <name>`. Issue 7 adds "claude". */
export const PARSERS: Record<string, (cases: EvalCase[]) => MealParser> = {
  stub: createStubParser,
};

import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicCaller, createClaudeParser } from "@/ai/claude-parser";
import type { MealParser } from "@/ai/types";
import { createUsdaProvider } from "@/server/nutrition/usda";
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

/** The app's Claude parser with live USDA search. Costs real money per run. */
export function createLiveClaudeParser(): MealParser {
  const missing = ["ANTHROPIC_API_KEY", "USDA_API_KEY"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    throw new Error(
      `--parser claude needs ${missing.join(" and ")} in the environment.`,
    );
  }
  const usda = createUsdaProvider(process.env.USDA_API_KEY!);
  return createClaudeParser({
    callModel: createAnthropicCaller(new Anthropic()),
    search: (query, options) => usda.search(query, options),
  });
}

/** Parsers selectable with `pnpm eval --parser <name>`. */
export const PARSERS: Record<string, (cases: EvalCase[]) => MealParser> = {
  stub: createStubParser,
  claude: createLiveClaudeParser,
};

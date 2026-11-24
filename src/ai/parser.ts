import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { searchFoods } from "@/server/nutrition";
import { createAnthropicCaller, createClaudeParser } from "./claude-parser";
import type { MealParser } from "./types";

let parser: MealParser | null | undefined;

/**
 * The meal parser the app uses, or null when the Claude or USDA key is not
 * configured (the confirm card then opens in manual entry).
 */
export function getMealParser(): MealParser | null {
  if (parser !== undefined) return parser;
  if (!process.env.ANTHROPIC_API_KEY || !process.env.USDA_API_KEY) {
    parser = null;
    return parser;
  }
  // Reads ANTHROPIC_API_KEY from the environment.
  const client = new Anthropic({ maxRetries: 1, timeout: 20_000 });
  parser = createClaudeParser({
    callModel: createAnthropicCaller(client),
    search: searchFoods,
  });
  return parser;
}

/** Parses per user per day before the log box falls back to manual entry. */
export function dailyParseLimit(): number {
  const n = Number(process.env.AI_DAILY_PARSE_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 50;
}

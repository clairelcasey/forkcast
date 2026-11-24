// The contract every meal parser implements: the Claude parser and the eval
// stub. Nutrition numbers come from database search results, never from the
// model (CLAUDE.md rule 5).

import type { FoodEntry } from "@/server/nutrition/types";

export type ParsedItem = {
  name: string;
  /** Human-readable amount, e.g. "1 bowl", "half an order". */
  quantity: string;
  calories: number;
  protein_g: number;
  /** Low = a typical portion was assumed (e.g. "some", "a bit"). */
  confidence?: Confidence;
  /** The database entry the numbers were computed from. */
  food?: FoodEntry;
  /** Amount eaten, in the entry's basis unit (g or ml). */
  amount?: number;
};

export type Confidence = "high" | "medium" | "low";

/** One model call; a parse makes several (split, pick, and any retries). */
export type CallUsage = {
  model: string;
  /** What the call was for, e.g. "meal_split" (logged to ai_calls). */
  purpose?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
  latencyMs?: number;
  /** Set when this call failed or returned unusable output. */
  error?: string;
};

export type ParseResult =
  | { ok: true; items: ParsedItem[]; usage: CallUsage[] }
  | { ok: false; error: string; usage: CallUsage[] };

export type MealParser = {
  /** Shown in eval reports, e.g. "stub" or the model id. */
  name: string;
  parse(input: { text: string }): Promise<ParseResult>;
};

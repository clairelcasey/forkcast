import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { FoodEntry, SearchOptions } from "@/server/nutrition/types";
import { costUsd, PARSER_MODEL } from "./models";
import { PICK_SYSTEM, SPLIT_SYSTEM } from "./prompts";
import {
  MAX_ITEM_AMOUNT,
  pickSchema,
  splitSchema,
  type PickOutput,
  type SplitOutput,
} from "./schemas";
import type { CallUsage, MealParser, ParsedItem, ParseResult } from "./types";

// The meal parser:
// 1. Claude splits the line into items with search queries.
// 2. Code searches the nutrition database for each item.
// 3. Claude picks one candidate per item (or none) and estimates the amount.
// 4. Code computes calories and protein from the picked entry × amount.
// Claude never produces a nutrition number (CLAUDE.md rule 5). Each step is
// validated and retried once; on failure the app falls back to manual entry.

export type ModelRequest<T> = {
  purpose: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
};

/** One model call. `output` is null when the call failed or was unusable. */
export type CallModel = <T>(
  request: ModelRequest<T>,
) => Promise<{ output: T | null; usage: CallUsage }>;

export type SearchFoods = (
  query: string,
  options?: SearchOptions,
) => Promise<FoodEntry[]>;

const MAX_ITEMS = 12;
const CANDIDATES_PER_GROUP = 4; // generic + branded, so up to 8 per item

/** Calls Claude with a cached static system prompt and a structured output. */
export function createAnthropicCaller(
  client: Anthropic,
  model: string = PARSER_MODEL,
): CallModel {
  return async <T>(request: ModelRequest<T>) => {
    const start = performance.now();
    const base = { model, purpose: request.purpose };
    try {
      const response = await client.messages.parse({
        model,
        max_tokens: 4000,
        system: [
          {
            type: "text",
            text: request.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: request.user }],
        // Extraction and matching: low effort keeps it fast and cheap.
        output_config: {
          effort: "low",
          format: zodOutputFormat(request.schema),
        },
      });
      const tokens = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      };
      const usage: CallUsage = {
        ...base,
        ...tokens,
        costUsd: costUsd(model, tokens),
        latencyMs: Math.round(performance.now() - start),
      };
      if (response.stop_reason === "refusal") {
        return { output: null, usage: { ...usage, error: "refusal" } };
      }
      if (response.stop_reason === "max_tokens") {
        return { output: null, usage: { ...usage, error: "max_tokens" } };
      }
      if (response.parsed_output == null) {
        return { output: null, usage: { ...usage, error: "invalid_output" } };
      }
      return { output: response.parsed_output as T, usage };
    } catch (err) {
      return {
        output: null,
        usage: {
          ...base,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: Math.round(performance.now() - start),
          error:
            err instanceof Anthropic.APIError
              ? `api_error_${err.status ?? "network"}`
              : `error_${(err as Error).name ?? "unknown"}`,
        },
      };
    }
  };
}

type Candidate = { id: string; food: FoodEntry };

export function createClaudeParser(deps: {
  callModel: CallModel;
  search: SearchFoods;
  name?: string;
}): MealParser {
  return {
    name: deps.name ?? PARSER_MODEL,
    async parse({ text }): Promise<ParseResult> {
      const usage: CallUsage[] = [];

      /** Calls the model, checks the output, retries once. */
      async function callChecked<T>(
        request: ModelRequest<T>,
        check: (output: T) => string | null,
      ): Promise<T | null> {
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await deps.callModel(request);
          const problem = result.output === null ? null : check(result.output);
          usage.push(
            problem ? { ...result.usage, error: problem } : result.usage,
          );
          if (result.output !== null && !problem) return result.output;
        }
        return null;
      }

      // 1. Split the line into items.
      const split = await callChecked<SplitOutput>(
        {
          purpose: "meal_split",
          system: SPLIT_SYSTEM,
          user: text,
          schema: splitSchema,
        },
        (out) => {
          if (out.items.length === 0) return "no_items";
          if (out.items.length > MAX_ITEMS) return "too_many_items";
          if (out.items.some((i) => !i.search_query.trim()))
            return "empty_query";
          return null;
        },
      );
      if (!split) return { ok: false, error: "split_failed", usage };

      // 2. Search the nutrition database for every item at once.
      let candidates: Candidate[][];
      try {
        const results = await Promise.all(
          split.items.map((item) =>
            deps.search(item.search_query, { limit: CANDIDATES_PER_GROUP }),
          ),
        );
        candidates = results.map((foods, i) =>
          foods.map((food, j) => ({ id: `${i}-${j}`, food })),
        );
      } catch {
        return { ok: false, error: "search_failed", usage };
      }

      // 3. Pick a candidate and an amount for each item.
      const pick = await callChecked<PickOutput>(
        {
          purpose: "meal_pick",
          system: PICK_SYSTEM,
          user: pickPrompt(text, split, candidates),
          schema: pickSchema,
        },
        (out) => checkPicks(out, candidates),
      );
      if (!pick) return { ok: false, error: "pick_failed", usage };

      const picks = [...pick.picks].sort((a, b) => a.item_index - b.item_index);
      const unmatched = picks
        .filter((p) => p.entry_id === null)
        .map((p) => split.items[p.item_index].name);
      if (unmatched.length > 0) {
        return { ok: false, error: `no_match: ${unmatched.join(", ")}`, usage };
      }

      // 4. Compute the numbers in code.
      const items: ParsedItem[] = picks.map((p) => {
        const food = candidates[p.item_index].find(
          (c) => c.id === p.entry_id,
        )!.food;
        return {
          name: split.items[p.item_index].name,
          quantity: p.quantity,
          ...macrosFor(food, p.amount),
          confidence: p.confidence,
          food,
          amount: p.amount,
        };
      });
      return { ok: true, items, usage };
    },
  };
}

/** Calories and protein for `amount` of a food, in the food's basis unit. */
export function macrosFor(food: FoodEntry, amount: number) {
  const factor = amount / food.basis.amount;
  return {
    calories: Math.round(food.calories * factor * 10) / 10,
    protein_g: Math.round(food.protein_g * factor * 10) / 10,
  };
}

/** Returns a problem description, or null when every pick is usable. */
export function checkPicks(
  out: PickOutput,
  candidates: Candidate[][],
): string | null {
  const seen = new Set<number>();
  for (const p of out.picks) {
    const options = candidates[p.item_index];
    if (!options) return `unknown_item_${p.item_index}`;
    if (seen.has(p.item_index)) return `duplicate_item_${p.item_index}`;
    seen.add(p.item_index);
    if (p.entry_id === null) continue;
    if (!options.some((c) => c.id === p.entry_id))
      return `unknown_entry_${p.entry_id}`;
    if (!(p.amount > 0 && p.amount <= MAX_ITEM_AMOUNT))
      return `bad_amount_${p.amount}`;
  }
  if (seen.size !== candidates.length) return "missing_items";
  return null;
}

function pickPrompt(
  text: string,
  split: SplitOutput,
  candidates: Candidate[][],
) {
  const items = split.items.map((item, i) => ({
    item_index: i,
    name: item.name,
    amount_text: item.amount_text,
    candidates: candidates[i].map(({ id, food }) => ({
      id,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      kind: food.kind,
      unit: food.basis.unit,
      // Shown so clearly wrong entries can be skipped; never to be repeated.
      per_100: `${food.calories} kcal, ${food.protein_g} g protein`,
      ...(food.serving
        ? {
            label_serving: `${food.serving.amount} ${food.serving.unit}${
              food.serving.label ? ` (${food.serving.label})` : ""
            }`,
          }
        : {}),
    })),
  }));
  return `Line: ${JSON.stringify(text)}\n\nItems and candidates:\n${JSON.stringify(items, null, 1)}`;
}

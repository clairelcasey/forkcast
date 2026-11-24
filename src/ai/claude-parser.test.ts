import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { FoodEntry } from "@/server/nutrition/types";
import {
  createAnthropicCaller,
  createClaudeParser,
  type CallModel,
  type ModelRequest,
} from "./claude-parser";
import { costUsd } from "./models";
import { splitSchema, type PickOutput, type SplitOutput } from "./schemas";
import type { CallUsage } from "./types";

const food = (patch: Partial<FoodEntry>): FoodEntry => ({
  provider: "usda",
  providerId: "1",
  name: "Food",
  brand: null,
  basis: { amount: 100, unit: "g" },
  calories: 100,
  protein_g: 10,
  carbs_g: null,
  fat_g: null,
  serving: null,
  kind: "SR Legacy",
  ...patch,
});

const EGG = food({
  providerId: "171287",
  name: "Egg, whole, raw",
  calories: 143,
  protein_g: 12.6,
});
const TOAST = food({
  providerId: "172688",
  name: "Bread, whole-wheat",
  calories: 252,
  protein_g: 12.4,
});

const usage = (purpose: string): CallUsage => ({
  model: "test-model",
  purpose,
  inputTokens: 100,
  outputTokens: 20,
  costUsd: 0.001,
});

/** A fake model: answers each purpose from a queue of outputs (null = unusable). */
function fakeModel(
  answers: Record<string, (SplitOutput | PickOutput | null)[]>,
) {
  const requests: ModelRequest<unknown>[] = [];
  const callModel = (async (request: ModelRequest<unknown>) => {
    requests.push(request);
    const output = answers[request.purpose]?.shift() ?? null;
    return {
      output,
      usage:
        output === null
          ? { ...usage(request.purpose), error: "invalid_output" }
          : usage(request.purpose),
    };
  }) as CallModel;
  return { callModel, requests };
}

const split: SplitOutput = {
  items: [
    { name: "Eggs", search_query: "egg whole", amount_text: "2" },
    {
      name: "Toast",
      search_query: "whole wheat bread",
      amount_text: "a slice",
    },
  ],
};

const search = vi.fn(async (query: string) =>
  query.startsWith("egg") ? [EGG] : [TOAST],
);

const goodPick: PickOutput = {
  picks: [
    {
      item_index: 0,
      entry_id: "0-0",
      amount: 100,
      quantity: "2 large",
      confidence: "high",
    },
    {
      item_index: 1,
      entry_id: "1-0",
      amount: 32,
      quantity: "1 slice",
      confidence: "medium",
    },
  ],
};

describe("createClaudeParser", () => {
  it("splits, searches, picks, and computes the numbers in code", async () => {
    const { callModel, requests } = fakeModel({
      meal_split: [split],
      meal_pick: [goodPick],
    });
    const parser = createClaudeParser({ callModel, search });

    const result = await parser.parse({ text: "2 eggs and a slice of toast" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([
      expect.objectContaining({
        name: "Eggs",
        calories: 143,
        protein_g: 12.6,
        confidence: "high",
        food: EGG,
        amount: 100,
      }),
      // 252 kcal/100 g × 32 g = 80.64 → 80.6
      expect.objectContaining({
        name: "Toast",
        calories: 80.6,
        protein_g: 4,
        confidence: "medium",
        food: TOAST,
      }),
    ]);
    expect(result.usage.map((u) => u.purpose)).toEqual([
      "meal_split",
      "meal_pick",
    ]);
    expect(search).toHaveBeenCalledWith("egg whole", { limit: 4 });
    // The pick prompt carries the original line and the candidate ids.
    expect(requests[1].user).toContain('"2 eggs and a slice of toast"');
    expect(requests[1].user).toContain('"id": "1-0"');
  });

  it("retries once when the output is unusable", async () => {
    const { callModel } = fakeModel({
      meal_split: [null, split],
      meal_pick: [goodPick],
    });
    const result = await createClaudeParser({ callModel, search }).parse({
      text: "x",
    });
    expect(result.ok).toBe(true);
    expect(result.usage.map((u) => [u.purpose, u.error])).toEqual([
      ["meal_split", "invalid_output"],
      ["meal_split", undefined],
      ["meal_pick", undefined],
    ]);
  });

  it("falls back after two bad splits", async () => {
    const { callModel } = fakeModel({ meal_split: [null, { items: [] }] });
    const result = await createClaudeParser({ callModel, search }).parse({
      text: "x",
    });
    expect(result).toMatchObject({ ok: false, error: "split_failed" });
    expect(result.usage.map((u) => u.error)).toEqual([
      "invalid_output",
      "no_items",
    ]);
  });

  it("rejects picks that aren't from the search results, then retries", async () => {
    const invented: PickOutput = {
      picks: [
        {
          item_index: 0,
          entry_id: "made-up",
          amount: 100,
          quantity: "2",
          confidence: "high",
        },
        goodPick.picks[1],
      ],
    };
    const { callModel } = fakeModel({
      meal_split: [split],
      meal_pick: [invented, goodPick],
    });
    const result = await createClaudeParser({ callModel, search }).parse({
      text: "x",
    });
    expect(result.ok).toBe(true);
    expect(result.usage[1].error).toBe("unknown_entry_made-up");
  });

  it.each([
    ["a missing item", { picks: [goodPick.picks[0]] }, "missing_items"],
    [
      "an impossible amount",
      { picks: [{ ...goodPick.picks[0], amount: 0 }, goodPick.picks[1]] },
      "bad_amount_0",
    ],
    [
      "a duplicated item",
      { picks: [goodPick.picks[0], goodPick.picks[0]] },
      "duplicate_item_0",
    ],
  ])("falls back on %s after a retry", async (_label, bad, error) => {
    const { callModel } = fakeModel({
      meal_split: [split],
      meal_pick: [bad as PickOutput, bad as PickOutput],
    });
    const result = await createClaudeParser({ callModel, search }).parse({
      text: "x",
    });
    expect(result).toMatchObject({ ok: false, error: "pick_failed" });
    expect(result.usage.at(-1)?.error).toBe(error);
  });

  it("asks for manual entry when an item has no matching entry", async () => {
    const noMatch: PickOutput = {
      picks: [goodPick.picks[0], { ...goodPick.picks[1], entry_id: null }],
    };
    const { callModel } = fakeModel({
      meal_split: [split],
      meal_pick: [noMatch],
    });
    const result = await createClaudeParser({ callModel, search }).parse({
      text: "x",
    });
    expect(result).toMatchObject({ ok: false, error: "no_match: Toast" });
  });

  it("falls back when the nutrition search fails", async () => {
    const { callModel } = fakeModel({ meal_split: [split] });
    const failing = async () => {
      throw new Error("USDA down");
    };
    const result = await createClaudeParser({
      callModel,
      search: failing,
    }).parse({ text: "x" });
    expect(result).toMatchObject({ ok: false, error: "search_failed" });
  });

  it("uses ml for liquids measured per 100 ml", async () => {
    const milk = food({
      name: "Milk",
      basis: { amount: 100, unit: "ml" },
      calories: 50,
      protein_g: 5.42,
    });
    const { callModel } = fakeModel({
      meal_split: [
        {
          items: [
            {
              name: "Milk",
              search_query: "fairlife 2% milk",
              amount_text: "a glass",
            },
          ],
        },
      ],
      meal_pick: [
        {
          picks: [
            {
              item_index: 0,
              entry_id: "0-0",
              amount: 240,
              quantity: "1 cup",
              confidence: "low",
            },
          ],
        },
      ],
    });
    const result = await createClaudeParser({
      callModel,
      search: async () => [milk],
    }).parse({ text: "x" });
    expect(result.ok && result.items[0]).toMatchObject({
      calories: 120,
      protein_g: 13,
    });
  });
});

describe("createAnthropicCaller", () => {
  const request: ModelRequest<SplitOutput> = {
    purpose: "meal_split",
    system: "static prompt",
    user: "2 eggs",
    schema: splitSchema,
  };

  function clientReturning(parse: (...args: unknown[]) => unknown) {
    return { messages: { parse: vi.fn(parse) } } as unknown as Anthropic;
  }

  const response = (patch: Record<string, unknown>) => ({
    stop_reason: "end_turn",
    parsed_output: split,
    usage: {
      input_tokens: 200,
      output_tokens: 50,
      cache_read_input_tokens: 800,
      cache_creation_input_tokens: 0,
    },
    ...patch,
  });

  it("caches the system prompt and records usage and cost", async () => {
    const client = clientReturning(async () => response({}));
    const result = await createAnthropicCaller(
      client,
      "claude-haiku-5-5",
    )(request);

    expect(result.output).toEqual(split);
    expect(result.usage).toMatchObject({
      model: "claude-haiku-5-5",
      purpose: "meal_split",
      inputTokens: 200,
      outputTokens: 50,
      cacheReadTokens: 800,
      cacheWriteTokens: 0,
    });
    expect(result.usage.error).toBeUndefined();
    const sent = vi.mocked(client.messages.parse).mock
      .calls[0][0] as unknown as Record<string, unknown>;
    expect(sent.system).toEqual([
      {
        type: "text",
        text: "static prompt",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(sent.model).toBe("claude-haiku-5-5");
    expect((sent.output_config as { effort: string }).effort).toBe("low");
  });

  it.each([
    ["refusal", { stop_reason: "refusal" }],
    ["max_tokens", { stop_reason: "max_tokens" }],
    ["invalid_output", { parsed_output: null }],
  ])("reports %s as unusable output", async (error, patch) => {
    const result = await createAnthropicCaller(
      clientReturning(async () => response(patch)),
    )(request);
    expect(result.output).toBeNull();
    expect(result.usage.error).toBe(error);
  });

  it("turns API errors into an error code instead of throwing", async () => {
    const client = clientReturning(async () => {
      throw new Anthropic.RateLimitError(
        429,
        undefined,
        "rate limited",
        new Headers(),
      );
    });
    const result = await createAnthropicCaller(client)(request);
    expect(result.output).toBeNull();
    expect(result.usage).toMatchObject({ error: "api_error_429", costUsd: 0 });
  });
});

describe("costUsd", () => {
  it("prices Haiku 5.5 tokens, including cache writes and reads", () => {
    // 1M input $0.10 + 1M cache write $0.125 + 1M cache read $0.01 + 1M output $0.50
    expect(
      costUsd("claude-haiku-5-5", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.735);
  });

  it("is 0 for an unknown model rather than a guess", () => {
    expect(
      costUsd("unknown", {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(0);
  });
});

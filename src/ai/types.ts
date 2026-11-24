// The contract every meal parser implements: the real Claude parser (issue 7)
// and the eval stub. Nutrition numbers come from database search results,
// never from the model (CLAUDE.md rule 5).

export type ParsedItem = {
  name: string;
  /** Human-readable amount, e.g. "1 bowl", "half an order". */
  quantity: string;
  calories: number;
  protein_g: number;
};

/** Usage for one model call; a parse can make several (e.g. a retry). */
export type CallUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type ParseResult =
  | { ok: true; items: ParsedItem[]; usage: CallUsage[] }
  | { ok: false; error: string; usage: CallUsage[] };

export type MealParser = {
  /** Shown in eval reports, e.g. "stub" or the model id. */
  name: string;
  parse(input: { text: string }): Promise<ParseResult>;
};

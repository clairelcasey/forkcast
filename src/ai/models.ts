// Model choice and pricing for AI calls. CLAUDE.md asks for a small, fast
// model; `pnpm eval` decides whether it is accurate enough.

export const PARSER_MODEL = "claude-haiku-5-5";

/** USD per million tokens (Claude API, prompts up to 100K tokens). */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

// Prompt caching: writes cost 1.25x input, reads 0.1x input.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export function costUsd(model: string, usage: TokenUsage): number {
  const price = PRICING[model];
  if (!price) return 0;
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(price.input) +
    usage.cacheWriteTokens * perToken(price.input * CACHE_WRITE_MULTIPLIER) +
    usage.cacheReadTokens * perToken(price.input * CACHE_READ_MULTIPLIER) +
    usage.outputTokens * perToken(price.output)
  );
}

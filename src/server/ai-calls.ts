import "server-only";
import type { CallUsage } from "@/ai/types";
import { createClient } from "@/lib/supabase/server";

// Every Claude call is logged to ai_calls (CLAUDE.md rule 6), as the user,
// under RLS. Never include prompts or meal text here.

export async function logAiCalls(userId: string, calls: CallUsage[]) {
  if (calls.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("ai_calls").insert(
    calls.map((c) => ({
      user_id: userId,
      purpose: c.purpose ?? "unknown",
      model: c.model,
      input_tokens: c.inputTokens,
      output_tokens: c.outputTokens,
      cache_read_tokens: c.cacheReadTokens ?? 0,
      cache_write_tokens: c.cacheWriteTokens ?? 0,
      cache_hit: (c.cacheReadTokens ?? 0) > 0,
      cost_usd: c.costUsd,
      latency_ms: c.latencyMs ?? null,
      error: c.error ?? null,
    })),
  );
  if (error) console.error("ai_calls insert failed", error.code);
}

/** Meal parses started since `sinceIso` (one meal_split call per attempt). */
export async function countParsesSince(userId: string, sinceIso: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("purpose", "meal_split")
    .gte("created_at", sinceIso);
  return count ?? 0;
}

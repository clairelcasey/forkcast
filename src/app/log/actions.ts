"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getMealParser } from "@/ai/parser";
import type { ParsedItem } from "@/ai/types";
import {
  mealConfidence,
  mealLocalDate,
  mealTotals,
} from "@/lib/meals/meal-math";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ParseResponse =
  { kind: "parsed"; items: ParsedItem[] } | { kind: "manual"; reason: string };

const textSchema = z.string().trim().min(1).max(500);

/** Turns one typed line into draft items, or asks for manual entry. */
export async function parseMealText(text: string): Promise<ParseResponse> {
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return { kind: "manual", reason: "Type what you ate." };

  const user = await getCurrentUser();
  if (!user) return { kind: "manual", reason: "Sign in again to log meals." };

  const parser = getMealParser();
  if (!parser) {
    return { kind: "manual", reason: "Enter the numbers for this meal." };
  }

  const result = await parser.parse({ text: parsed.data });
  if (!result.ok || result.items.length === 0) {
    return {
      kind: "manual",
      reason: "Couldn't read that one. Enter the numbers.",
    };
  }
  return { kind: "parsed", items: result.items };
}

const confidenceSchema = z.enum(["high", "medium", "low"]);

const saveSchema = z.object({
  clientId: z.uuid(),
  inputText: z.string().trim().max(500),
  source: z.enum(["ai", "manual"]),
  day: z.enum(["today", "yesterday"]),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.string().trim().max(60),
        calories: z.number().min(0).max(5000),
        protein_g: z.number().min(0).max(500),
        portion: z.number().min(0.1).max(10),
        confidence: confidenceSchema.nullable(),
      }),
    )
    .min(1)
    .max(20),
});

export type SaveMealInput = z.input<typeof saveSchema>;

export async function saveMealLog(
  input: SaveMealInput,
): Promise<{ error?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the items and numbers." };
  const meal = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in again to save." };

  // Runs as the user under RLS (no service role).
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return { error: "Couldn't load your settings. Try again." };

  const now = new Date();
  const totals = mealTotals(meal.items);
  const { error } = await supabase.from("meal_logs").insert({
    user_id: user.id,
    client_id: meal.clientId,
    logged_at: now.toISOString(),
    timezone: profile.timezone,
    local_date: mealLocalDate(now, profile.timezone, meal.day),
    input_text: meal.inputText || null,
    items: meal.items,
    calories: totals.calories,
    protein_g: totals.protein_g,
    source: meal.source,
    confidence: meal.source === "ai" ? mealConfidence(meal.items) : null,
  });

  // 23505 = this client_id was already saved (a retried tap): treat as saved.
  if (error && error.code !== "23505") {
    return { error: "Couldn't save. Try again." };
  }

  refresh();
  return {};
}

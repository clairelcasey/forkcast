"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dailyParseLimit, getMealParser } from "@/ai/parser";
import type { ParsedItem, ParseResult } from "@/ai/types";
import {
  mealConfidence,
  mealLocalDate,
  mealTotals,
} from "@/lib/meals/meal-math";
import { mealItemsSchema, type MealItem } from "@/lib/meals/item-schema";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { countParsesSince, logAiCalls } from "@/server/ai-calls";
import { rememberFoods, type FoodEntry } from "@/server/nutrition";
import {
  findSavedMeal,
  recordSavedMeal,
  markSavedMealUsed,
} from "@/server/saved-meals";

export type ParseResponse =
  | { kind: "parsed"; items: ParsedItem[] }
  | {
      kind: "cache";
      savedMealId: string;
      useCount: number;
      items: MealItem[];
    }
  | { kind: "manual"; reason: string };

const textSchema = z.string().trim().min(1).max(500);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Turns one typed line into draft items, or asks for manual entry. */
export async function parseMealText(text: string): Promise<ParseResponse> {
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return { kind: "manual", reason: "Type what you ate." };

  const user = await getCurrentUser();
  if (!user) return { kind: "manual", reason: "Sign in again to log meals." };

  // A meal confirmed before needs no AI call.
  const saved = await findSavedMeal(user.id, parsed.data);
  if (saved) {
    return {
      kind: "cache",
      savedMealId: saved.id,
      useCount: saved.useCount,
      items: saved.items,
    };
  }

  const parser = getMealParser();
  if (!parser) {
    return { kind: "manual", reason: "Enter the numbers for this meal." };
  }

  // Per-user cap on AI calls (rolling 24 hours).
  const since = new Date(Date.now() - DAY_MS).toISOString();
  if ((await countParsesSince(user.id, since)) >= dailyParseLimit()) {
    return {
      kind: "manual",
      reason: "That's the AI limit for today. Enter the numbers.",
    };
  }

  let result: ParseResult;
  try {
    result = await parser.parse({ text: parsed.data });
  } catch {
    return {
      kind: "manual",
      reason: "Couldn't read that one. Enter the numbers.",
    };
  }
  await logAiCalls(user.id, result.usage);

  if (!result.ok) {
    const missing = result.error.match(/^no_match: (.+)$/)?.[1];
    return {
      kind: "manual",
      reason: missing
        ? `Couldn't find ${missing} in the nutrition database. Enter the numbers.`
        : "Couldn't read that one. Enter the numbers.",
    };
  }
  return { kind: "parsed", items: result.items };
}

const saveSchema = z.object({
  clientId: z.uuid(),
  inputText: z.string().trim().max(500),
  source: z.enum(["ai", "manual", "cache"]),
  /** The saved meal a cache log re-uses. */
  savedMealId: z.uuid().optional(),
  day: z.enum(["today", "yesterday"]),
  /** When the meal was typed, for logs queued offline. Defaults to now. */
  loggedAt: z.iso.datetime({ offset: true }).optional(),
  items: mealItemsSchema,
});

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SaveMealInput = z.input<typeof saveSchema>;

export async function saveMealLog(
  input: SaveMealInput,
): Promise<{ error?: string; id?: string }> {
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
  const loggedAt = meal.loggedAt ? new Date(meal.loggedAt) : now;
  if (
    loggedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS ||
    loggedAt.getTime() < now.getTime() - MAX_QUEUE_AGE_MS
  ) {
    return { error: "This one is too old to save. Log it again." };
  }

  const totals = mealTotals(meal.items);
  const { data: inserted, error } = await supabase
    .from("meal_logs")
    .insert({
      user_id: user.id,
      client_id: meal.clientId,
      logged_at: loggedAt.toISOString(),
      timezone: profile.timezone,
      local_date: mealLocalDate(loggedAt, profile.timezone, meal.day),
      input_text: meal.inputText || null,
      items: meal.items,
      calories: totals.calories,
      protein_g: totals.protein_g,
      source: meal.source,
      confidence: meal.source === "manual" ? null : mealConfidence(meal.items),
    })
    .select("id")
    .single();

  // 23505 = this client_id was already saved (a retried tap): treat as saved,
  // without counting the saved meal twice.
  if (error?.code === "23505") return {};
  if (error || !inserted) return { error: "Couldn't save. Try again." };

  // Every confirmed meal becomes (or re-uses) a saved meal.
  let savedMealId =
    meal.source === "cache" && meal.savedMealId
      ? await markSavedMealUsed(meal.savedMealId)
      : null;
  if (!savedMealId && meal.inputText) {
    savedMealId = await recordSavedMeal({
      text: meal.inputText,
      items: meal.items,
      ...totals,
    });
  }
  if (savedMealId) {
    await supabase
      .from("meal_logs")
      .update({ saved_meal_id: savedMealId })
      .eq("id", inserted.id);
  }

  // Remember the database entries behind a confirmed meal (foods cache).
  const foods = new Map<string, FoodEntry>();
  for (const item of meal.items) {
    if (item.food)
      foods.set(`${item.food.provider}:${item.food.providerId}`, item.food);
  }
  const remembered = await rememberFoods(user.id, [...foods.values()]);
  if (remembered.error)
    console.error("foods upsert failed", remembered.error.code);

  refresh();
  return { id: inserted.id };
}

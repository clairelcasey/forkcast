import "server-only";
import { mealItemsSchema, type MealItem } from "@/lib/meals/item-schema";
import { mealMatchKey } from "@/lib/meals/normalize";
import { createClient } from "@/lib/supabase/server";

// Saved meals: the cache that lets a repeat meal skip the AI call. Every
// query runs as the user under RLS (no service role).

export type SavedMeal = {
  id: string;
  name: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  useCount: number;
  lastUsedAt: string | null;
};

const COLUMNS = "id, name, items, calories, protein_g, use_count, last_used_at";

type Row = {
  id: string;
  name: string;
  items: unknown;
  calories: number;
  protein_g: number;
  use_count: number;
  last_used_at: string | null;
};

/** Null when the stored items no longer validate (treated as a cache miss). */
function toSavedMeal(row: Row): SavedMeal | null {
  const items = mealItemsSchema.safeParse(row.items);
  if (!items.success) return null;
  return {
    id: row.id,
    name: row.name,
    items: items.data,
    calories: Number(row.calories),
    protein_g: Number(row.protein_g),
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
  };
}

/** The active saved meal with the same normalized text, if any. */
export async function findSavedMeal(
  userId: string,
  text: string,
): Promise<SavedMeal | null> {
  const key = mealMatchKey(text);
  if (!key) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_meals")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("match_key", key)
    .is("superseded_by", null)
    .eq("archived", false)
    .maybeSingle();
  return data ? toSavedMeal(data) : null;
}

/** The user's most recently used saved meals, newest first. */
export async function recentSavedMeals(
  userId: string,
  limit = 5,
): Promise<SavedMeal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_meals")
    .select(COLUMNS)
    .eq("user_id", userId)
    .is("superseded_by", null)
    .eq("archived", false)
    .not("last_used_at", "is", null)
    .order("last_used_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map(toSavedMeal)
    .filter((m): m is SavedMeal => m !== null);
}

/**
 * Records a confirmed meal as a saved meal (created, or the one with the same
 * text updated to the new items). Returns its id, or null on failure.
 */
export async function recordSavedMeal(meal: {
  text: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
}): Promise<string | null> {
  const key = mealMatchKey(meal.text);
  if (!key) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_saved_meal", {
    p_match_key: key,
    p_name: meal.text.trim().slice(0, 120),
    p_items: meal.items,
    p_calories: meal.calories,
    p_protein_g: meal.protein_g,
  });
  if (error) console.error("record_saved_meal failed", error.code);
  return data ?? null;
}

/** Counts a re-log of a saved meal. Null if it isn't the user's active meal. */
export async function markSavedMealUsed(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("use_saved_meal", { p_id: id });
  if (error) console.error("use_saved_meal failed", error.code);
  return data ?? null;
}

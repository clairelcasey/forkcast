import "server-only";
import { mealItemsSchema, type MealItem } from "@/lib/meals/item-schema";
import { matchNickname } from "@/lib/meals/modifiers";
import { mealMatchKey } from "@/lib/meals/normalize";
import { rankByContext, resolveVersions } from "@/lib/meals/suggest";
import { createClient } from "@/lib/supabase/server";

// Saved meals: the cache that lets a repeat meal skip the AI call. Every
// query runs as the user under RLS (no service role).

export type SavedMeal = {
  id: string;
  name: string;
  nickname: string | null;
  items: MealItem[];
  calories: number;
  protein_g: number;
  useCount: number;
  lastUsedAt: string | null;
};

const COLUMNS =
  "id, name, nickname, items, calories, protein_g, use_count, last_used_at";

type Row = {
  id: string;
  name: string;
  nickname: string | null;
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
    nickname: row.nickname,
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

/**
 * The saved meal whose nickname starts the line ("usual bowl, no rice"), and
 * the modifier text after it.
 */
export async function findByNickname(
  userId: string,
  text: string,
): Promise<{ meal: SavedMeal; rest: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_meals")
    .select(COLUMNS)
    .eq("user_id", userId)
    .not("nickname", "is", null)
    .is("superseded_by", null)
    .eq("archived", false);
  const rows = data ?? [];
  const match = matchNickname(
    text,
    rows.map((r) => r.nickname!),
  );
  if (!match) return null;
  const row = rows.find((r) => r.nickname === match.nickname);
  const meal = row ? toSavedMeal(row) : null;
  return meal ? { meal, rest: match.rest } : null;
}

/**
 * New version of a saved meal ("update going forward", "re-estimate"). Old
 * logs keep their own numbers. Returns the new version's id.
 */
export async function versionSavedMeal(
  id: string,
  meal: { items: MealItem[]; calories: number; protein_g: number },
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("version_saved_meal", {
    p_id: id,
    p_items: meal.items,
    p_calories: meal.calories,
    p_protein_g: meal.protein_g,
  });
  if (error) console.error("version_saved_meal failed", error.code);
  return data ?? null;
}

/** Whether another active saved meal already uses this nickname. */
export async function nicknameTaken(
  userId: string,
  nickname: string,
  exceptMatchKey: string,
  exceptId?: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_meals")
    .select("id, nickname, match_key")
    .eq("user_id", userId)
    .ilike("nickname", nickname.replace(/[%_\\]/g, "\\$&"))
    .is("superseded_by", null)
    .eq("archived", false);
  return (data ?? []).some(
    (r) =>
      r.nickname?.toLowerCase() === nickname.toLowerCase() &&
      r.id !== exceptId &&
      r.match_key !== exceptMatchKey,
  );
}

export async function setNickname(id: string, nickname: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_meals")
    .update({ nickname })
    .eq("id", id);
  return { error };
}

/** Saved meals that fuzzily match a partly typed line, best first. */
export async function searchSavedMeals(
  text: string,
  { limit = 5, minScore = 0.3 }: { limit?: number; minScore?: number } = {},
): Promise<(SavedMeal & { score: number })[]> {
  const query = mealMatchKey(text);
  if (query.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_saved_meals", {
    p_query: query,
    p_limit: limit,
  });
  if (error) {
    console.error("search_saved_meals failed", error.code);
    return [];
  }
  return (data ?? [])
    .filter((row) => row.score >= minScore)
    .map((row) => {
      const meal = toSavedMeal(row);
      return meal ? { ...meal, score: row.score } : null;
    })
    .filter((m): m is SavedMeal & { score: number } => m !== null);
}

const SUGGEST_LOOKBACK_DAYS = 90;

/**
 * Saved meals to offer before anything is typed: ranked by time of day,
 * weekday, recency and frequency, topped up with the most recent ones.
 */
export async function suggestedSavedMeals(
  userId: string,
  timeZone: string,
  limit = 5,
): Promise<SavedMeal[]> {
  const supabase = await createClient();
  const since = new Date(
    Date.now() - SUGGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [{ data: logs }, { data: versions }] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("saved_meal_id, logged_at")
      .eq("user_id", userId)
      .not("saved_meal_id", "is", null)
      .gte("logged_at", since),
    supabase
      .from("saved_meals")
      .select("id, superseded_by")
      .eq("user_id", userId),
  ]);

  const current = resolveVersions(versions ?? []);
  const ranked = rankByContext(
    (logs ?? []).map((l) => ({
      savedMealId: current(l.saved_meal_id!),
      loggedAt: new Date(l.logged_at),
    })),
    new Date(),
    timeZone,
  );
  const ids = ranked.slice(0, limit).map((r) => r.savedMealId);

  const byId = new Map<string, SavedMeal>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("saved_meals")
      .select(COLUMNS)
      .eq("user_id", userId)
      .in("id", ids)
      .is("superseded_by", null)
      .eq("archived", false);
    for (const row of data ?? []) {
      const meal = toSavedMeal(row);
      if (meal) byId.set(meal.id, meal);
    }
  }
  const suggested = ids
    .map((id) => byId.get(id))
    .filter((m): m is SavedMeal => Boolean(m));
  if (suggested.length >= limit) return suggested;

  // Top up with recently used meals not already listed.
  const recent = await recentSavedMeals(userId, limit * 2);
  for (const meal of recent) {
    if (suggested.length >= limit) break;
    if (!suggested.some((m) => m.id === meal.id)) suggested.push(meal);
  }
  return suggested;
}

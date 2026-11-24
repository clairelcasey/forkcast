import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FoodEntry, NutritionProvider, SearchOptions } from "./types";
import { createUsdaProvider } from "./usda";

export type { FoodEntry } from "./types";
export { NutritionSearchError } from "./types";

let provider: NutritionProvider | undefined;

function getProvider(): NutritionProvider {
  if (provider) return provider;
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    throw new Error("USDA_API_KEY is not set. See .env.example.");
  }
  provider = createUsdaProvider(apiKey);
  return provider;
}

/** Searches the nutrition database. Generic foods first, then branded. */
export function searchFoods(
  query: string,
  options?: SearchOptions,
): Promise<FoodEntry[]> {
  return getProvider().search(query, options);
}

/**
 * Remembers foods the user picked, in their own `foods` rows (RLS, no
 * service role). Macros are stored per `serving_size serving_unit`, i.e. the
 * entry's basis (USDA: per 100 g or 100 ml).
 */
export async function rememberFoods(userId: string, foods: FoodEntry[]) {
  if (foods.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("foods").upsert(
    foods.map((f) => ({
      user_id: userId,
      provider: f.provider,
      provider_id: f.providerId,
      name: f.name,
      brand: f.brand,
      serving_size: f.basis.amount,
      serving_unit: f.basis.unit,
      calories: f.calories,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
      raw: { kind: f.kind, serving: f.serving },
    })),
    { onConflict: "user_id,provider,provider_id" },
  );
  return { error };
}

// Normalized nutrition-database entries. Claude picks from these and
// estimates an amount; calories and protein are then computed in code
// (CLAUDE.md rule 5). It never sees or invents the numbers themselves.

export type NutritionProviderId = "usda" | "nutritionix" | "fatsecret";

export type FoodEntry = {
  provider: NutritionProviderId;
  /** The provider's own id (USDA: fdcId). */
  providerId: string;
  name: string;
  brand: string | null;
  /** Macros below are per this amount (USDA: 100 g, or 100 ml for some drinks). */
  basis: { amount: number; unit: "g" | "ml" };
  calories: number;
  protein_g: number;
  carbs_g: number | null;
  fat_g: number | null;
  /** The label serving, when the provider has one (e.g. 52 g, "1 bar"). */
  serving: { amount: number; unit: "g" | "ml"; label: string | null } | null;
  /** Provider-specific kind, e.g. USDA "SR Legacy", "Foundation", "Branded". */
  kind: string;
};

export type SearchOptions = {
  /** Max entries per group (generic and branded). */
  limit?: number;
  signal?: AbortSignal;
};

/**
 * A nutrition database. USDA today; Nutritionix or FatSecret could be added
 * later (open question in the spec, and they may cost money: ask first).
 */
export interface NutritionProvider {
  id: NutritionProviderId;
  search(query: string, options?: SearchOptions): Promise<FoodEntry[]>;
}

export class NutritionSearchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "NutritionSearchError";
  }
}

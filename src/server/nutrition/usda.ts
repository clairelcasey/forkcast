import { z } from "zod";
import {
  NutritionSearchError,
  type FoodEntry,
  type NutritionProvider,
  type SearchOptions,
} from "./types";

// USDA FoodData Central: https://fdc.nal.usda.gov/api-guide
// Search results give nutrients per 100 g (per 100 ml for some branded
// drinks), including branded foods.
const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const TIMEOUT_MS = 8000;

// Generic foods (whole ingredients) and branded/packaged foods are searched
// separately: branded results would otherwise crowd out the basics.
const GENERIC_TYPES = ["Foundation", "SR Legacy"];
const BRANDED_TYPES = ["Branded"];

const NUTRIENT = {
  energy: 1008, // kcal
  energyAtwaterSpecific: 2048, // kcal; newer Foundation foods use these
  energyAtwaterGeneral: 2047, // kcal
  protein: 1003,
  fat: 1004,
  carbs: 1005,
} as const;

const nutrientSchema = z.object({
  nutrientId: z.number(),
  unitName: z.string(),
  value: z.number().optional(),
});

const foodSchema = z.object({
  fdcId: z.number(),
  description: z.string(),
  dataType: z.string(),
  brandOwner: z.string().optional(),
  brandName: z.string().optional(),
  servingSize: z.number().optional(),
  servingSizeUnit: z.string().optional(),
  householdServingFullText: z.string().optional(),
  foodNutrients: z.array(nutrientSchema),
});

const searchResponseSchema = z.object({
  foods: z.array(z.unknown()),
});

export type UsdaFood = z.infer<typeof foodSchema>;

function unitOf(raw: string | undefined): "g" | "ml" | null {
  const u = raw?.trim().toLowerCase();
  if (u === "g" || u === "grm") return "g";
  if (u === "ml" || u === "mlt") return "ml";
  return null;
}

/** "CHOCOLATE SEA SALT BAR" → "Chocolate sea salt bar"; mixed case is kept. */
function tidyName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Some branded entries carry the literal text "None" as their serving label. */
function servingLabel(raw: string | undefined): string | null {
  const label = raw?.trim();
  return label && label.toLowerCase() !== "none" ? label : null;
}

function tidyBrand(food: UsdaFood): string | null {
  const brand = (food.brandName ?? food.brandOwner)?.trim();
  return brand ? tidyName(brand) : null;
}

/**
 * Turns one USDA search result into a FoodEntry, or null when it lacks the
 * energy or protein needed to log it.
 */
export function normalizeUsdaFood(raw: unknown): FoodEntry | null {
  const parsed = foodSchema.safeParse(raw);
  if (!parsed.success) return null;
  const food = parsed.data;

  const value = (id: number, unit: string) => {
    const n = food.foodNutrients.find(
      (x) => x.nutrientId === id && x.unitName.toUpperCase() === unit,
    );
    return n?.value ?? null;
  };

  const calories =
    value(NUTRIENT.energy, "KCAL") ??
    value(NUTRIENT.energyAtwaterSpecific, "KCAL") ??
    value(NUTRIENT.energyAtwaterGeneral, "KCAL");
  const protein = value(NUTRIENT.protein, "G");
  if (calories === null || protein === null) return null;

  const servingUnit = unitOf(food.servingSizeUnit);
  const isBranded = food.dataType === "Branded";
  const serving =
    isBranded && food.servingSize && servingUnit
      ? {
          // Stored as float32 upstream: 31.2 arrives as 31.200000762939453.
          amount: Math.round(food.servingSize * 10) / 10,
          unit: servingUnit,
          label: servingLabel(food.householdServingFullText),
        }
      : null;

  return {
    provider: "usda",
    providerId: String(food.fdcId),
    name: tidyName(food.description),
    brand: isBranded ? tidyBrand(food) : null,
    // Branded liquids are reported per 100 ml; everything else per 100 g.
    basis: { amount: 100, unit: serving?.unit ?? "g" },
    calories,
    protein_g: protein,
    carbs_g: value(NUTRIENT.carbs, "G"),
    fat_g: value(NUTRIENT.fat, "G"),
    serving,
    kind: food.dataType,
  };
}

export function normalizeUsdaSearch(body: unknown): FoodEntry[] {
  const parsed = searchResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new NutritionSearchError("Unexpected USDA search response");
  }
  return parsed.data.foods
    .map(normalizeUsdaFood)
    .filter((f): f is FoodEntry => f !== null);
}

export function createUsdaProvider(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): NutritionProvider {
  async function searchTypes(
    query: string,
    dataType: string[],
    limit: number,
    signal?: AbortSignal,
  ) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const response = await fetchImpl(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header rather than ?api_key= so the key stays out of URLs and logs.
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ query, dataType, pageSize: limit }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    }).catch((err: unknown) => {
      throw new NutritionSearchError(
        `USDA search failed: ${(err as Error).name}`,
      );
    });
    if (!response.ok) {
      throw new NutritionSearchError(
        `USDA search returned ${response.status}`,
        response.status,
      );
    }
    return normalizeUsdaSearch(await response.json());
  }

  return {
    id: "usda",
    async search(query, { limit = 5, signal }: SearchOptions = {}) {
      const q = query.trim();
      if (!q) return [];
      const [generic, branded] = await Promise.all([
        searchTypes(q, GENERIC_TYPES, limit, signal),
        searchTypes(q, BRANDED_TYPES, limit, signal),
      ]);
      return [...generic, ...branded];
    },
  };
}

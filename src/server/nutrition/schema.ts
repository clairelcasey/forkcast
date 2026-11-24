import { z } from "zod";
import type { FoodEntry } from "./types";

/** Validates a FoodEntry coming back from the client with a saved meal. */
export const foodEntrySchema: z.ZodType<FoodEntry> = z.object({
  provider: z.enum(["usda", "nutritionix", "fatsecret"]),
  providerId: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  brand: z.string().max(200).nullable(),
  basis: z.object({ amount: z.number().positive(), unit: z.enum(["g", "ml"]) }),
  calories: z.number().min(0).max(10000),
  protein_g: z.number().min(0).max(1000),
  carbs_g: z.number().min(0).max(1000).nullable(),
  fat_g: z.number().min(0).max(1000).nullable(),
  serving: z
    .object({
      amount: z.number().positive(),
      unit: z.enum(["g", "ml"]),
      label: z.string().max(200).nullable(),
    })
    .nullable(),
  kind: z.string().max(40),
});

import { z } from "zod";
import { foodEntrySchema } from "@/server/nutrition/schema";

/** One item of a meal, as saved in meal_logs.items and saved_meals.items. */
export const mealItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().max(60),
  /** Per one portion of `quantity`. */
  calories: z.number().min(0).max(5000),
  protein_g: z.number().min(0).max(500),
  /** Share eaten: 0.5 for "split fries". */
  portion: z.number().min(0.1).max(10),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  /** The nutrition-database entry an AI-parsed item came from. */
  food: foodEntrySchema.optional(),
  /** Amount in the food's basis unit (g or ml). */
  amount: z.number().positive().max(3000).optional(),
});

export type MealItem = z.infer<typeof mealItemSchema>;

export const mealItemsSchema = z.array(mealItemSchema).min(1).max(20);

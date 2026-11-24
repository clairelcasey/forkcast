import "server-only";
import type { MealParser } from "./types";

/**
 * The meal parser the app uses. Null until the Claude parser lands
 * (issue 7); the confirm card then opens in manual entry.
 */
export function getMealParser(): MealParser | null {
  return null;
}

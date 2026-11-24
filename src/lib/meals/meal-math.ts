import type { Confidence } from "@/ai/types";
import { localDate } from "@/lib/targets/targets";

/** Quick size chips on the confirm card. ½ covers shared plates. */
export const PORTION_CHIPS = [0.5, 1, 1.5, 2] as const;

export type PortionedItem = {
  /** Per one portion of `quantity`. */
  calories: number;
  protein_g: number;
  /** Share of the portion eaten: 0.5 for "split fries". */
  portion: number;
};

export function itemMacros(item: PortionedItem) {
  return {
    calories: Math.round(item.calories * item.portion),
    protein_g: round1(item.protein_g * item.portion),
  };
}

export function mealTotals(items: PortionedItem[]) {
  const sums = items.reduce(
    (t, i) => ({
      calories: t.calories + i.calories * i.portion,
      protein_g: t.protein_g + i.protein_g * i.portion,
    }),
    { calories: 0, protein_g: 0 },
  );
  return {
    calories: Math.round(sums.calories),
    protein_g: round1(sums.protein_g),
  };
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** A meal is only as confident as its least confident item. */
export function mealConfidence(
  items: { confidence?: Confidence | null }[],
): Confidence | null {
  const known = items
    .map((i) => i.confidence)
    .filter((c): c is Confidence => Boolean(c));
  if (known.length === 0) return null;
  return known.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
}

/** Before this local hour, a meal might belong to the previous day. */
export const LATE_NIGHT_CUTOFF_HOUR = 4;

export function isLateNight(at: Date, timeZone: string): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(at),
  );
  return hour < LATE_NIGHT_CUTOFF_HOUR;
}

export type DayChoice = "today" | "yesterday";

/** The local date (YYYY-MM-DD) a meal is saved under. */
export function mealLocalDate(
  at: Date,
  timeZone: string,
  day: DayChoice,
): string {
  const today = localDate(at, timeZone);
  if (day === "today") return today;
  // Date-only arithmetic in UTC avoids DST edge cases.
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

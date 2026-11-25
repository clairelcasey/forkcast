// Context suggestions: which saved meals to offer before anything is typed.
// Ranked by recency and frequency, weighted toward meals usually eaten at
// this time of day and on this day of the week. Old orders fade.

export type MealUse = { savedMealId: string; loggedAt: Date };

const DAY_MS = 24 * 60 * 60 * 1000;
/** A log's weight halves every this many days. */
const HALF_LIFE_DAYS = 21;
/** How far from the usual hour a meal still counts as "this time of day". */
const HOUR_SIGMA = 2;
const SAME_WEEKDAY_BONUS = 1.3;
/** Small base so frequent meals show even at other times of day. */
const ANY_TIME_WEIGHT = 0.25;

function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  return {
    hour: Number(get("hour")) + Number(get("minute")) / 60,
    weekday: get("weekday"),
  };
}

/** Hours between two times of day, wrapping at midnight (0-12). */
function hourDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}

/** Saved-meal ids, best first, with their scores. */
export function rankByContext(
  uses: MealUse[],
  now: Date,
  timeZone: string,
): { savedMealId: string; score: number }[] {
  const here = localParts(now, timeZone);
  const scores = new Map<string, number>();

  for (const use of uses) {
    const ageDays = (now.getTime() - use.loggedAt.getTime()) / DAY_MS;
    if (ageDays < 0) continue;
    const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const then = localParts(use.loggedAt, timeZone);
    const hours = hourDistance(here.hour, then.hour);
    const timeOfDay = Math.exp(
      -(hours * hours) / (2 * HOUR_SIGMA * HOUR_SIGMA),
    );
    const weekday = then.weekday === here.weekday ? SAME_WEEKDAY_BONUS : 1;
    const score = recency * (ANY_TIME_WEIGHT + timeOfDay) * weekday;
    scores.set(use.savedMealId, (scores.get(use.savedMealId) ?? 0) + score);
  }

  return [...scores.entries()]
    .map(([savedMealId, score]) => ({ savedMealId, score }))
    .sort((a, b) => b.score - a.score);
}

/** Follows superseded_by links so logs of old versions count for the current one. */
export function resolveVersions(
  rows: { id: string; superseded_by: string | null }[],
): (id: string) => string {
  const next = new Map(rows.map((r) => [r.id, r.superseded_by]));
  return (id) => {
    let current = id;
    for (let i = 0; i < 50; i++) {
      const successor = next.get(current);
      if (!successor) return current;
      current = successor;
    }
    return current;
  };
}

// Plain, tested target math (CLAUDE.md rules 3 and 7). No AI involved.

export type TargetProfile = {
  protein_rest_g: number;
  baseline_calories: number | null;
  rest_day_deficit: number;
  calorie_floor: number;
};

export type DayTargets = {
  protein_g: number;
  /** Null until a calorie baseline has been estimated. */
  calories: number | null;
};

/**
 * Rest-day targets: baseline minus a small deficit, never below the floor.
 * Other day types arrive with Strava (Milestone 4).
 */
export function restDayTargets(p: TargetProfile): DayTargets {
  return {
    protein_g: p.protein_rest_g,
    calories:
      p.baseline_calories === null
        ? null
        : Math.max(p.baseline_calories - p.rest_day_deficit, p.calorie_floor),
  };
}

export type Remaining = {
  /** How much is left to reach the target (never negative). */
  left: number;
  /** How far past the target (0 when not past it). Shown neutrally as "+N". */
  past: number;
};

export function remaining(target: number, eaten: number): Remaining {
  const diff = Math.round(target - eaten);
  return { left: Math.max(diff, 0), past: Math.max(-diff, 0) };
}

/** The calendar date (YYYY-MM-DD) at `at` in the given IANA timezone. */
export function localDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function sumMacros(logs: { calories: number; protein_g: number }[]) {
  return logs.reduce(
    (t, l) => ({
      calories: t.calories + Number(l.calories),
      protein_g: t.protein_g + Number(l.protein_g),
    }),
    { calories: 0, protein_g: 0 },
  );
}

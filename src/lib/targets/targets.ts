// Plain, tested target math (CLAUDE.md rules 3 and 7). No AI involved.

// Day types and calorie targets: see ./day-type.ts.

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

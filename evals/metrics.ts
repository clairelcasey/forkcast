/** |actual - expected| / expected. Undefined when expected is 0. */
export function absPctError(actual: number, expected: number): number | null {
  if (expected === 0) return null;
  return Math.abs(actual - expected) / expected;
}

/** Mean absolute percentage error, skipping pairs where expected is 0. */
export function mape(pairs: { actual: number; expected: number }[]) {
  const errors = pairs
    .map((p) => absPctError(p.actual, p.expected))
    .filter((e): e is number => e !== null);
  return {
    value: errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : null,
    n: errors.length,
  };
}

/** Nearest-rank percentile (p in 0–100). */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

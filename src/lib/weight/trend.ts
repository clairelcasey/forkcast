// Weight trend, maintenance estimate and loss-rate guardrails. Plain, tested
// code. The app shows only the smoothed trend, never day-to-day changes.

export type WeighIn = { measuredAt: Date; kg: number };
export type IntakeDay = { date: string; calories: number };

const DAY_MS = 24 * 60 * 60 * 1000;
export const KG_PER_LB = 0.45359237;
/** Energy in a kilogram of body weight change (approximate). */
const KCAL_PER_KG = 7700;

/** Trend window: a straight line through the last four weeks of weigh-ins. */
const TREND_WINDOW_DAYS = 28;
const MIN_TREND_WEIGH_INS = 3;
const MIN_TREND_SPAN_DAYS = 10;

/** Baseline: average intake over three weeks of reasonably complete logging. */
const BASELINE_WINDOW_DAYS = 21;
const MIN_LOGGED_DAYS = 10;
/** Days below this were probably not fully logged and are left out. */
const INCOMPLETE_DAY_KCAL = 800;

/** Guardrail: the most the target is raised to slow fast loss. */
const MAX_LOSS_CORRECTION_KCAL = 500;
const UNDER_FUELING_WINDOW_DAYS = 14;
/** "Well below": intake under this share of estimated needs. */
const UNDER_FUELING_RATIO = 0.75;

export type Trend = {
  /** Trend weight today (kg). */
  kg: number;
  /** Change per week (kg); negative = losing. */
  kgPerWeek: number;
  lastWeighIn: Date;
};

/** Least-squares line through the recent weigh-ins, or null if too few. */
export function weightTrend(weighIns: WeighIn[], now: Date): Trend | null {
  const since = now.getTime() - TREND_WINDOW_DAYS * DAY_MS;
  const points = weighIns
    .filter((w) => w.measuredAt.getTime() >= since && w.measuredAt <= now)
    .map((w) => ({
      x: (w.measuredAt.getTime() - now.getTime()) / DAY_MS,
      y: w.kg,
    }));
  if (points.length < MIN_TREND_WEIGH_INS) return null;
  const xs = points.map((p) => p.x);
  if (Math.max(...xs) - Math.min(...xs) < MIN_TREND_SPAN_DAYS) return null;

  const n = points.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const sxy = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const slopePerDay = sxy / sxx;
  // x = 0 is "now", so the intercept is today's trend weight.
  const kg = meanY - slopePerDay * meanX;
  const lastWeighIn = weighIns.reduce(
    (latest, w) => (w.measuredAt > latest ? w.measuredAt : latest),
    weighIns[0].measuredAt,
  );
  return { kg, kgPerWeek: slopePerDay * 7, lastWeighIn };
}

function completeDays(days: IntakeDay[], windowDays: number, today: string) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - windowDays);
  const from = start.toISOString().slice(0, 10);
  // Today is still in progress, so it never counts.
  return days.filter(
    (d) =>
      d.date >= from && d.date < today && d.calories >= INCOMPLETE_DAY_KCAL,
  );
}

const average = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Maintenance calories: average intake, corrected by what the weight trend
 * says about the balance (losing 0.5 kg/week ≈ eating 550 kcal/day under).
 * Null until there are enough logged days and a trend.
 */
export function estimateMaintenance(
  days: IntakeDay[],
  trend: Trend | null,
  today: string,
): number | null {
  if (!trend) return null;
  const logged = completeDays(days, BASELINE_WINDOW_DAYS, today);
  if (logged.length < MIN_LOGGED_DAYS) return null;
  const avgIntake = average(logged.map((d) => d.calories));
  const balancePerDay = (trend.kgPerWeek / 7) * KCAL_PER_KG;
  const estimate = avgIntake - balancePerDay;
  return Math.min(Math.max(Math.round(estimate / 10) * 10, 1200), 5000);
}

/**
 * Guardrail: if the trend drops faster than the allowed rate, the calories
 * to add per day to slow it down (0 otherwise).
 */
export function lossRateCorrection(
  trend: Trend | null,
  maxLossLbPerWeek: number,
) {
  if (!trend) return 0;
  const lossLbPerWeek = -trend.kgPerWeek / KG_PER_LB;
  const excess = lossLbPerWeek - maxLossLbPerWeek;
  if (excess <= 0) return 0;
  const perDay = (excess * KG_PER_LB * KCAL_PER_KG) / 7;
  return Math.min(Math.round(perDay / 10) * 10, MAX_LOSS_CORRECTION_KCAL);
}

/** Average intake well below estimated needs for two weeks or more. */
export function isUnderFueling(
  days: IntakeDay[],
  maintenance: number | null,
  today: string,
): boolean {
  if (maintenance === null) return false;
  const logged = completeDays(days, UNDER_FUELING_WINDOW_DAYS, today);
  if (logged.length < MIN_LOGGED_DAYS) return false;
  return (
    average(logged.map((d) => d.calories)) < maintenance * UNDER_FUELING_RATIO
  );
}

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

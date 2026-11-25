// Day type and targets from the day's workouts. Plain, tested code: Strava
// data never goes into an LLM prompt (CLAUDE.md rule 3). Guardrails (calorie
// floor, no deficit on long-run days) are applied here and nowhere else.

export type DayType = "rest" | "strength" | "run" | "long_run";

export type Workout = {
  type: "run" | "pilates" | "strength" | "other";
  distance_m: number | null;
  /** Strava's calorie estimate, when it has one. */
  calories_estimate: number | null;
};

export type TargetProfile = {
  units: "imperial" | "metric";
  protein_rest_g: number;
  protein_strength_g: number;
  protein_run_g: number;
  protein_long_run_g: number;
  /** Null until it has been estimated from logs (issue 16). */
  baseline_calories: number | null;
  rest_day_deficit: number;
  calorie_floor: number;
  long_run_distance_m: number;
};

export type DayTargets = {
  dayType: DayType;
  protein_g: number;
  /** Null until a baseline exists. */
  calories: number | null;
  /** Short, neutral explanation shown on the home screen. */
  reason: string;
};

/** Share of Strava's calorie estimate for runs added to a run day's target. */
export const RUN_CALORIE_SHARE = 0.5;

const METERS_PER_MILE = 1609.344;

export function classifyDay(
  workouts: Workout[],
  longRunDistanceM: number,
): DayType {
  const runs = workouts.filter((w) => w.type === "run");
  if (runs.some((r) => (r.distance_m ?? 0) >= longRunDistanceM))
    return "long_run";
  if (runs.length > 0) return "run";
  if (workouts.some((w) => w.type === "pilates" || w.type === "strength")) {
    return "strength";
  }
  return "rest";
}

function formatDistance(meters: number, units: TargetProfile["units"]) {
  return units === "imperial"
    ? `${(meters / METERS_PER_MILE).toFixed(1)} mi`
    : `${(meters / 1000).toFixed(1)} km`;
}

export type TargetAdjustments = {
  /** Maintenance estimated from logs and the weight trend (issue 16). */
  estimatedBaseline?: number | null;
  /** Guardrail: calories added because weight is dropping too fast. */
  lossCorrection?: number;
};

export function dayTargets(
  workouts: Workout[],
  profile: TargetProfile,
  adjustments: TargetAdjustments = {},
): DayTargets {
  const dayType = classifyDay(workouts, profile.long_run_distance_m);
  const runs = workouts.filter((w) => w.type === "run");
  const runDistance = runs.reduce((s, r) => s + (r.distance_m ?? 0), 0);
  const runCalories = runs.reduce((s, r) => s + (r.calories_estimate ?? 0), 0);
  const runBonus = Math.round(runCalories * RUN_CALORIE_SHARE);
  // A baseline set in the profile wins over the estimate.
  const baseline =
    profile.baseline_calories ?? adjustments.estimatedBaseline ?? null;
  const distance = formatDistance(runDistance, profile.units);

  const plan: Record<
    DayType,
    { protein: number; calories: number | null; why: string }
  > = {
    rest: {
      protein: profile.protein_rest_g,
      calories: baseline === null ? null : baseline - profile.rest_day_deficit,
      why: "Rest day",
    },
    strength: {
      protein: profile.protein_strength_g,
      calories: baseline,
      why: "Pilates or strength day",
    },
    run: {
      protein: profile.protein_run_g,
      calories: baseline === null ? null : baseline + runBonus,
      why: `Run day (${distance})`,
    },
    long_run: {
      protein: profile.protein_long_run_g,
      // Guardrail: never a deficit on a long-run day.
      calories:
        baseline === null ? null : Math.max(baseline + runBonus, baseline),
      why: `Long run (${distance}) · no deficit`,
    },
  };

  const { protein, why } = plan[dayType];
  let calories = plan[dayType].calories;
  let reason = why;
  if (dayType === "run" || dayType === "long_run") {
    if (calories !== null && runBonus > 0)
      reason += ` · +${runBonus} for the run`;
  }
  // Guardrail: weight dropping faster than the allowed rate raises the target.
  const correction = adjustments.lossCorrection ?? 0;
  if (calories !== null && correction > 0) {
    calories += correction;
    reason += ` · +${correction} to slow weight loss`;
  }
  // Guardrail: never below the calorie floor.
  if (calories !== null && calories < profile.calorie_floor) {
    calories = profile.calorie_floor;
    reason += " · set to your calorie floor";
  }

  return { dayType, protein_g: protein, calories, reason };
}

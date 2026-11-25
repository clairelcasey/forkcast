// Maps Strava activities to workouts. Plain code; Strava data never goes into
// an LLM prompt (CLAUDE.md rule 3).

export type StravaActivity = {
  id: number;
  sport_type?: string;
  type?: string;
  /** UTC start, e.g. "2026-11-24T13:02:11Z". */
  start_date: string;
  /** Local wall-clock start, formatted with a misleading "Z". */
  start_date_local: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  /** Only on the detailed activity. */
  calories?: number;
};

export type WorkoutRow = {
  strava_activity_id: number;
  type: "run" | "pilates" | "strength" | "other";
  started_at: string;
  local_date: string;
  distance_m: number | null;
  duration_s: number | null;
  calories_estimate: number | null;
  source: "strava";
};

const RUN = new Set(["Run", "TrailRun", "VirtualRun"]);
const STRENGTH = new Set([
  "WeightTraining",
  "Crossfit",
  "HighIntensityIntervalTraining",
]);
const PILATES = new Set(["Pilates"]);

export function workoutType(
  activity: Pick<StravaActivity, "sport_type" | "type">,
) {
  const kind = activity.sport_type ?? activity.type ?? "";
  if (RUN.has(kind)) return "run" as const;
  if (PILATES.has(kind)) return "pilates" as const;
  if (STRENGTH.has(kind)) return "strength" as const;
  return "other" as const;
}

export function toWorkoutRow(activity: StravaActivity): WorkoutRow {
  return {
    strava_activity_id: activity.id,
    type: workoutType(activity),
    started_at: activity.start_date,
    // The local date the activity happened on, wherever it was recorded.
    local_date: activity.start_date_local.slice(0, 10),
    distance_m: activity.distance ?? null,
    duration_s: activity.moving_time ?? activity.elapsed_time ?? null,
    calories_estimate: activity.calories ?? null,
    source: "strava",
  };
}

/**
 * Strava's activity list has no calorie estimates (only the detailed
 * activity does), so a re-sync must not erase ones already stored.
 */
export function keepKnownCalories(
  rows: WorkoutRow[],
  known: Map<number, number>,
): WorkoutRow[] {
  return rows.map((row) =>
    row.calories_estimate === null && known.has(row.strava_activity_id)
      ? { ...row, calories_estimate: known.get(row.strava_activity_id)! }
      : row,
  );
}

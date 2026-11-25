import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  dayTargets,
  type DayTargets,
  type TargetProfile,
} from "@/lib/targets/day-type";

/**
 * The day's targets from its workouts (plain code, no AI), saved to
 * day_targets when they change. Runs as the user under RLS.
 */
export async function targetsForDate(
  userId: string,
  date: string,
  profile: TargetProfile,
): Promise<DayTargets> {
  const supabase = await createClient();
  const [{ data: workouts }, { data: saved }] = await Promise.all([
    supabase
      .from("workouts")
      .select("type, distance_m, calories_estimate")
      .eq("user_id", userId)
      .eq("local_date", date),
    supabase
      .from("day_targets")
      .select("day_type, protein_g, calories, reason")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle(),
  ]);

  const targets = dayTargets(
    (workouts ?? []).map((w) => ({
      type: w.type as "run" | "pilates" | "strength" | "other",
      distance_m: w.distance_m === null ? null : Number(w.distance_m),
      calories_estimate:
        w.calories_estimate === null ? null : Number(w.calories_estimate),
    })),
    profile,
  );

  const changed =
    !saved ||
    saved.day_type !== targets.dayType ||
    saved.protein_g !== targets.protein_g ||
    saved.calories !== targets.calories ||
    saved.reason !== targets.reason;
  if (changed) {
    const { error } = await supabase.from("day_targets").upsert(
      {
        user_id: userId,
        date,
        day_type: targets.dayType,
        protein_g: targets.protein_g,
        calories: targets.calories,
        reason: targets.reason,
      },
      { onConflict: "user_id,date" },
    );
    if (error) console.error("day_targets upsert failed", error.code);
  }
  return targets;
}

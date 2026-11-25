import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  estimateMaintenance,
  isUnderFueling,
  lossRateCorrection,
  weightTrend,
  type Trend,
} from "@/lib/weight/trend";

export type WeightSummary = {
  trend: Trend | null;
  /** Maintenance estimated from logs + trend; null until there's enough. */
  maintenance: number | null;
  /** Guardrail: calories added per day because loss is too fast. */
  lossCorrection: number;
  underFueling: boolean;
};

const LOOKBACK_DAYS = 35;

/** Weight trend and what it means for targets. Runs as the user (RLS). */
export async function weightSummary(
  userId: string,
  today: string,
  maxLossLbPerWeek: number,
): Promise<WeightSummary> {
  const supabase = await createClient();
  const now = new Date();
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);
  const sinceDate = since.toISOString().slice(0, 10);

  const [{ data: weighIns }, { data: logs }] = await Promise.all([
    supabase
      .from("weigh_ins")
      .select("measured_at, weight_kg")
      .eq("user_id", userId)
      .gte("measured_at", since.toISOString()),
    supabase
      .from("meal_logs")
      .select("local_date, calories")
      .eq("user_id", userId)
      .gte("local_date", sinceDate),
  ]);

  const perDay = new Map<string, number>();
  for (const log of logs ?? []) {
    perDay.set(
      log.local_date,
      (perDay.get(log.local_date) ?? 0) + Number(log.calories),
    );
  }
  const days = [...perDay.entries()].map(([date, calories]) => ({
    date,
    calories,
  }));

  const trend = weightTrend(
    (weighIns ?? []).map((w) => ({
      measuredAt: new Date(w.measured_at),
      kg: Number(w.weight_kg),
    })),
    now,
  );
  const maintenance = estimateMaintenance(days, trend, today);
  return {
    trend,
    maintenance,
    lossCorrection: lossRateCorrection(trend, maxLossLbPerWeek),
    underFueling: isUnderFueling(days, maintenance, today),
  };
}

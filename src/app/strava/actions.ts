"use server";

import { refresh } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { localDate } from "@/lib/targets/targets";
import { disconnectStrava, syncStrava, type SyncResult } from "@/server/strava";

export async function syncStravaNow(): Promise<SyncResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reconnect: false, error: "Sign in again." };
  const result = await syncStrava(user.id);
  if (result.ok) refresh();
  return result;
}

export async function disconnectStravaAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await disconnectStrava(user.id);
  refresh();
}

async function today(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return { supabase, date: localDate(new Date(), data?.timezone ?? "UTC") };
}

/** "I did Pilates": a manual workout for today (once per day). */
export async function logPilatesToday() {
  const user = await getCurrentUser();
  if (!user) return;
  const { supabase, date } = await today(user.id);
  const { data: existing } = await supabase
    .from("workouts")
    .select("id")
    .eq("user_id", user.id)
    .eq("local_date", date)
    .eq("type", "pilates")
    .eq("source", "manual")
    .limit(1);
  if (!existing?.length) {
    await supabase.from("workouts").insert({
      user_id: user.id,
      type: "pilates",
      started_at: new Date().toISOString(),
      local_date: date,
      source: "manual",
    });
  }
  refresh();
}

export async function removePilatesToday() {
  const user = await getCurrentUser();
  if (!user) return;
  const { supabase, date } = await today(user.id);
  await supabase
    .from("workouts")
    .delete()
    .eq("user_id", user.id)
    .eq("local_date", date)
    .eq("type", "pilates")
    .eq("source", "manual");
  refresh();
}

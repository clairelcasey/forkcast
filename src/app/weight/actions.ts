"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { lbToKg } from "@/lib/weight/trend";

const weightSchema = z.number().positive().max(900);

/** Adds a weigh-in, in the user's units. */
export async function addWeighIn(value: number): Promise<{ error?: string }> {
  const parsed = weightSchema.safeParse(value);
  if (!parsed.success) return { error: "Enter your weight." };

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in again to save." };

  // Runs as the user under RLS (no service role).
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .eq("user_id", user.id)
    .maybeSingle();
  const kg = profile?.units === "metric" ? parsed.data : lbToKg(parsed.data);
  if (kg < 20 || kg > 400)
    return { error: "That doesn't look right. Check the number." };

  const { error } = await supabase.from("weigh_ins").insert({
    user_id: user.id,
    measured_at: new Date().toISOString(),
    weight_kg: Math.round(kg * 100) / 100,
    source: "manual",
  });
  if (error) return { error: "Couldn't save. Try again." };

  refresh();
  return {};
}

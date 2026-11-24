"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const idSchema = z.uuid();

export async function deleteMealLog(id: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return;

  const user = await getCurrentUser();
  if (!user) return;

  // RLS already limits deletes to the user's own rows; the user_id filter
  // keeps that explicit.
  const supabase = await createClient();
  await supabase
    .from("meal_logs")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id);

  refresh();
}

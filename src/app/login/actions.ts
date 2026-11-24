"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

const emailSchema = z.email().transform((e) => e.trim().toLowerCase());
const codeSchema = z.string().trim().regex(/^\d{6}$/);

export async function sendCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) {
    return { step: "email", error: "Enter a valid email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    // New accounts are only created for allowlisted emails (auth hook).
    options: { shouldCreateUser: true },
  });

  if (error) {
    // The allowlist hook rejects unknown emails with a 403.
    const notAllowed = error.status === 403 || /access list/i.test(error.message);
    return {
      step: "email",
      error: notAllowed
        ? "This email doesn't have access yet."
        : "Couldn't send a code. Try again in a minute.",
    };
  }

  return { step: "code", email: email.data };
}

export async function verifyCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { step: "email" };

  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) {
    return { step: "code", email: email.data, error: "Enter the 6-digit code from the email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: email.data,
    token: code.data,
    type: "email",
  });

  if (error) {
    return {
      step: "code",
      email: email.data,
      error: "That code didn't work. Check it or send a new one.",
    };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

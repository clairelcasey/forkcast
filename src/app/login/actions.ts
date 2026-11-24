"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; notice?: string };

const MIN_PASSWORD_LENGTH = 8;

const credentialsSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  password: z.string().min(1),
});

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const creds = readCredentials(formData);
  if (!creds.success) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(creds.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first, then sign in." };
    }
    return { error: "That email and password don't match." };
  }

  redirect("/");
}

export async function signUp(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const creds = readCredentials(formData);
  if (!creds.success) {
    return { error: "Enter your email and a password." };
  }
  if (creds.data.password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const supabase = await createClient();
  // New accounts are only created for allowlisted emails (auth hook).
  const { data, error } = await supabase.auth.signUp(creds.data);

  if (error) {
    const notAllowed = error.status === 403 || /access list/i.test(error.message);
    if (notAllowed) return { error: "This email doesn't have access yet." };
    if (error.code === "weak_password") {
      return { error: "Pick a stronger password." };
    }
    if (error.code === "user_already_exists") {
      return { error: "That email already has an account. Sign in instead." };
    }
    return { error: "Couldn't create the account. Try again in a minute." };
  }

  // With "Confirm email" off in Supabase, sign-up returns a session directly.
  if (data.session) redirect("/");

  return { notice: "Check your email to confirm, then sign in here." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

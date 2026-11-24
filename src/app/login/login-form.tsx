"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp, type LoginState } from "./actions";

type Mode = "sign-in" | "sign-up";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  // Remount on mode change so each form starts with a clean state.
  return <CredentialsForm key={mode} mode={mode} onSwitch={setMode} />;
}

function CredentialsForm({
  mode,
  onSwitch,
}: {
  mode: Mode;
  onSwitch: (mode: Mode) => void;
}) {
  const isSignUp = mode === "sign-up";
  const [state, action, pending] = useActionState<LoginState, FormData>(
    isSignUp ? signUp : signIn,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        // "username" lets iOS Passwords pair the email with the saved password.
        autoComplete="username"
        autoCapitalize="none"
        required
        placeholder="you@example.com"
      />
      <Label htmlFor="password">Password</Label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete={isSignUp ? "new-password" : "current-password"}
        minLength={isSignUp ? 8 : undefined}
        required
      />
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage>{state.notice}</FormMessage> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending
          ? isSignUp
            ? "Creating…"
            : "Signing in…"
          : isSignUp
            ? "Create account"
            : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => onSwitch(isSignUp ? "sign-in" : "sign-up")}
      >
        {isSignUp ? "Have an account? Sign in" : "New here? Create an account"}
      </Button>
    </form>
  );
}

function FormMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

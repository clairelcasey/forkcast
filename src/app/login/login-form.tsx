"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendCode, verifyCode, type LoginState } from "./actions";

export function LoginForm() {
  // Remounting with a new key resets both steps ("use a different email").
  const [attempt, setAttempt] = useState(0);
  return <LoginSteps key={attempt} onRestart={() => setAttempt((n) => n + 1)} />;
}

function LoginSteps({ onRestart }: { onRestart: () => void }) {
  const [emailState, emailAction, sending] = useActionState<LoginState, FormData>(
    sendCode,
    { step: "email" },
  );
  const [codeState, codeAction, verifying] = useActionState<LoginState, FormData>(
    verifyCode,
    { step: "email" },
  );

  if (emailState.step === "email") {
    return (
      <form action={emailAction} className="flex flex-col gap-3">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          placeholder="you@example.com"
        />
        {emailState.error ? <FormMessage>{emailState.error}</FormMessage> : null}
        <Button type="submit" size="lg" disabled={sending}>
          {sending ? "Sending…" : "Send code"}
        </Button>
      </form>
    );
  }

  const error = codeState.step === "code" ? codeState.error : undefined;

  return (
    <form action={codeAction} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to{" "}
        <span className="text-foreground">{emailState.email}</span>.
      </p>
      <input type="hidden" name="email" value={emailState.email} />
      <Label htmlFor="code">Code</Label>
      <Input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        autoFocus
        placeholder="123456"
        className="tracking-[0.4em]"
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button type="submit" size="lg" disabled={verifying}>
        {verifying ? "Checking…" : "Sign in"}
      </Button>
      <Button type="button" variant="ghost" onClick={onRestart}>
        Use a different email
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

"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "./login/actions";
import { forgetCachedPages } from "./service-worker";

export function SignOutButton() {
  return (
    <form action={signOut} onSubmit={forgetCachedPages}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}

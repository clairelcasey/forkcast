import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

// Home screen placeholder. Logging and real targets arrive in Milestone 2.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Forkcast</h1>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <Input
        aria-label="What did you eat?"
        placeholder="What did you eat?"
        disabled
        title="Meal logging is coming soon"
      />

      <Suspense fallback={<TodayCard />}>
        <Today />
      </Suspense>
    </main>
  );
}

async function Today() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Reads the user's own profile through RLS (no service role).
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("protein_rest_g, baseline_calories")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <TodayCard
      protein={profile?.protein_rest_g ?? null}
      calories={profile?.baseline_calories ?? null}
    />
  );
}

function TodayCard({
  protein,
  calories,
}: {
  protein?: number | null;
  calories?: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <Stat label="Protein target" value={protein} unit="g" />
        <Stat label="Calorie target" value={calories} />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, unit }: { label: string; value?: number | null; unit?: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {value == null ? "—" : `${value}${unit ?? ""}`}
      </p>
    </div>
  );
}

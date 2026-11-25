import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { targetsForDate } from "@/server/day-targets";
import { weightSummary } from "@/server/weight";
import { kgToLb } from "@/lib/weight/trend";
import { WeightCard, type WeightView } from "./weight/weight-card";
import { suggestedSavedMeals } from "@/server/saved-meals";
import { localDate, remaining, sumMacros } from "@/lib/targets/targets";
import { LogMeal } from "./log/log-meal";
import { deleteMealLog } from "./meals/actions";

type MealRow = {
  id: string;
  logged_at: string;
  input_text: string | null;
  items: unknown;
  calories: number;
  protein_g: number;
};

// The log box, today's remaining targets and today's meals. Reads cookies, so render it inside
// <Suspense>.
export async function Today() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Everything below reads the user's own rows through RLS (no service role).
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "timezone, units, protein_rest_g, protein_strength_g, protein_run_g, protein_long_run_g, baseline_calories, rest_day_deficit, calorie_floor, long_run_distance_m, max_loss_lb_per_week",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return <TodaySkeleton />;

  const today = localDate(new Date(), profile.timezone);
  const weight = await weightSummary(
    user.id,
    today,
    Number(profile.max_loss_lb_per_week),
  );
  const [{ data: meals }, recent, targets] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("id, logged_at, input_text, items, calories, protein_g")
      .eq("user_id", user.id)
      .eq("local_date", today)
      .order("logged_at", { ascending: true }),
    suggestedSavedMeals(user.id, profile.timezone),
    targetsForDate(
      user.id,
      today,
      {
        ...profile,
        units: profile.units === "metric" ? "metric" : "imperial",
        long_run_distance_m: Number(profile.long_run_distance_m),
      },
      {
        estimatedBaseline: weight.maintenance,
        lossCorrection: weight.lossCorrection,
      },
    ),
  ]);

  const rows = meals ?? [];
  const eaten = sumMacros(rows);

  return (
    <>
      <LogMeal
        timeZone={profile.timezone}
        userId={user.id}
        recent={recent.map((m) => ({
          id: m.id,
          name: m.name,
          nickname: m.nickname,
          calories: m.calories,
          protein_g: m.protein_g,
          items: m.items,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today</CardTitle>
          <p className="text-sm text-muted-foreground">{targets.reason}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <RemainingStat
            label="Protein"
            target={targets.protein_g}
            eaten={eaten.protein_g}
            unit="g"
          />
          {targets.calories === null ? (
            <div>
              <p className="text-sm text-muted-foreground">Calories</p>
              <p className="text-2xl font-semibold tabular-nums">
                {Math.round(eaten.calories)}
              </p>
              <p className="text-xs text-muted-foreground">
                eaten · target after a few weeks of logs
              </p>
            </div>
          ) : (
            <RemainingStat
              label="Calories"
              target={targets.calories}
              eaten={eaten.calories}
            />
          )}
        </CardContent>
      </Card>

      <MealList meals={rows} timeZone={profile.timezone} />

      <WeightCard
        view={weightView(
          weight,
          profile.units === "metric" ? "kg" : "lb",
          profile.timezone,
        )}
      />
    </>
  );
}

function RemainingStat({
  label,
  target,
  eaten,
  unit = "",
}: {
  label: string;
  target: number;
  eaten: number;
  unit?: string;
}) {
  const { left, past } = remaining(target, eaten);
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {left}
        {unit} <span className="text-base font-normal">left</span>
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {past > 0
          ? `+${past}${unit} past ${target}${unit}`
          : `of ${target}${unit}`}
      </p>
    </div>
  );
}

function MealList({ meals, timeZone }: { meals: MealRow[]; timeZone: string }) {
  if (meals.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Nothing logged yet today.
      </p>
    );
  }

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section aria-label="Today's meals">
      <ul className="divide-y rounded-xl border">
        {meals.map((meal) => {
          const name = mealName(meal);
          return (
            <li
              key={meal.id}
              className="flex items-center gap-3 py-3 pr-1 pl-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {time.format(new Date(meal.logged_at))} ·{" "}
                  {Math.round(Number(meal.calories))} kcal ·{" "}
                  {round1(Number(meal.protein_g))}g protein
                </p>
              </div>
              <form action={deleteMealLog.bind(null, meal.id)}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="size-11 text-muted-foreground"
                  aria-label={`Remove ${name}`}
                >
                  <X />
                </Button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function mealName(meal: MealRow): string {
  if (meal.input_text) return meal.input_text;
  if (Array.isArray(meal.items)) {
    const names = meal.items
      .map((i) =>
        i && typeof i === "object" && "name" in i ? String(i.name) : null,
      )
      .filter(Boolean);
    if (names.length) return names.join(", ");
  }
  return "Meal";
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function TodaySkeleton() {
  return (
    <>
      <Input
        aria-label="What did you eat?"
        placeholder="What did you eat?"
        disabled
      />
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle className="text-base">Today</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {["Protein", "Calories"].map((label) => (
            <div key={label}>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold">—</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

const STALE_WEIGH_IN_DAYS = 14;

function weightView(
  weight: Awaited<ReturnType<typeof weightSummary>>,
  unit: "lb" | "kg",
  timeZone: string,
): WeightView {
  const convert = (kg: number) => (unit === "lb" ? kgToLb(kg) : kg);
  const trend = weight.trend;
  const stale =
    trend &&
    Date.now() - trend.lastWeighIn.getTime() > STALE_WEIGH_IN_DAYS * 86_400_000;
  return {
    unit,
    trend: trend ? convert(trend.kg) : null,
    perWeek: trend ? convert(trend.kgPerWeek) : null,
    lastWeighInLabel: stale
      ? new Intl.DateTimeFormat("en-US", {
          timeZone,
          month: "short",
          day: "numeric",
        }).format(trend.lastWeighIn)
      : null,
    maintenance: weight.maintenance,
    underFueling: weight.underFueling,
  };
}

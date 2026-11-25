"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addWeighIn } from "./actions";

export type WeightView = {
  unit: "lb" | "kg";
  /** Trend weight in `unit`, or null until there is a trend. */
  trend: number | null;
  /** Change per week in `unit`. */
  perWeek: number | null;
  /** e.g. "Nov 3" when the last weigh-in is over two weeks old. */
  lastWeighInLabel: string | null;
  maintenance: number | null;
  underFueling: boolean;
};

/** The weekly trend is the headline; no day-to-day changes, no nagging. */
export function WeightCard({ view }: { view: WeightView }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    startSaving(async () => {
      const result = await addWeighIn(n);
      if (result.error) {
        setMessage(result.error);
      } else {
        setValue("");
        setMessage("Saved.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weight trend</CardTitle>
        <p className="text-sm text-muted-foreground">{trendLine(view)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view.trend !== null ? (
          <p className="text-2xl font-semibold tabular-nums">
            {view.trend.toFixed(1)} {view.unit}
          </p>
        ) : null}
        {view.maintenance !== null ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            Estimated maintenance: {view.maintenance.toLocaleString("en-US")}{" "}
            kcal
          </p>
        ) : null}
        {view.underFueling ? (
          <p className="text-sm">
            Intake has been well below your estimated needs for two weeks. A
            little more on training days may help.
          </p>
        ) : null}
        <form onSubmit={submit} className="flex gap-2">
          <Input
            aria-label={`Weight in ${view.unit}`}
            placeholder={`Weight (${view.unit})`}
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMessage(null);
            }}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="lg"
            variant="outline"
            disabled={!value.trim() || saving}
          >
            {saving ? "Saving…" : "Add"}
          </Button>
        </form>
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function trendLine(view: WeightView): string {
  const parts: string[] = [];
  if (view.trend === null || view.perWeek === null) {
    parts.push("Weigh in now and then; a trend appears after about two weeks.");
  } else if (Math.abs(view.perWeek) < 0.1) {
    parts.push("Steady");
  } else {
    const amount = `${Math.abs(view.perWeek).toFixed(1)} ${view.unit} a week`;
    parts.push(view.perWeek < 0 ? `Down ${amount}` : `Up ${amount}`);
  }
  if (view.lastWeighInLabel)
    parts.push(`Last weigh-in ${view.lastWeighInLabel}`);
  return parts.join(" · ");
}

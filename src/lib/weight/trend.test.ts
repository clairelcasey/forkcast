import { describe, expect, it } from "vitest";
import {
  estimateMaintenance,
  isUnderFueling,
  kgToLb,
  lbToKg,
  lossRateCorrection,
  weightTrend,
  type IntakeDay,
  type WeighIn,
} from "./trend";

const now = new Date("2026-11-25T12:00:00Z");
const today = "2026-11-25";
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

/** Weigh-ins every `every` days over `span` days, losing `lbPerWeek`. */
function series(
  lbPerWeek: number,
  span = 21,
  every = 1,
  startLb = 160,
): WeighIn[] {
  const out: WeighIn[] = [];
  for (let d = span; d >= 0; d -= every) {
    const lb = startLb - (lbPerWeek * (span - d)) / 7;
    out.push({ measuredAt: daysAgo(d), kg: lbToKg(lb) });
  }
  return out;
}

/** Logged intake for the `n` days before today. */
function intake(kcal: number, n = 21): IntakeDay[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (i + 1));
    return { date: d.toISOString().slice(0, 10), calories: kcal };
  });
}

describe("weightTrend", () => {
  it("fits the weekly rate and today's trend weight", () => {
    const t = weightTrend(series(0.5), now)!;
    expect(kgToLb(t.kgPerWeek)).toBeCloseTo(-0.5, 5);
    expect(kgToLb(t.kg)).toBeCloseTo(160 - 1.5, 5);
  });

  it("smooths out daily water swings", () => {
    const noisy = series(0).map((w, i) => ({
      ...w,
      kg: w.kg + (i % 2 ? 0.9 : -0.9),
    }));
    expect(Math.abs(kgToLb(weightTrend(noisy, now)!.kgPerWeek))).toBeLessThan(
      0.3,
    );
  });

  it("needs at least 3 weigh-ins over 10+ days", () => {
    expect(weightTrend(series(0.5, 21, 14), now)).toBeNull(); // 2 weigh-ins
    expect(weightTrend(series(0.5, 6), now)).toBeNull(); // 6-day span
    expect(weightTrend(series(0.5, 12, 6), now)).not.toBeNull(); // 3 over 12 days
  });

  it("ignores weigh-ins older than four weeks, and just waits when they stop", () => {
    const old = series(1, 60).filter((w) => w.measuredAt < daysAgo(30));
    expect(weightTrend(old, now)).toBeNull();
  });
});

describe("estimateMaintenance", () => {
  it("is intake plus the deficit the trend implies", () => {
    // Eating 2000 and losing 0.5 lb/week (≈ 250 kcal/day) → maintenance ≈ 2250.
    const m = estimateMaintenance(
      intake(2000),
      weightTrend(series(0.5), now),
      today,
    );
    expect(m).toBe(2250);
  });

  it("equals intake when weight is stable", () => {
    expect(
      estimateMaintenance(intake(2300), weightTrend(series(0), now), today),
    ).toBe(2300);
  });

  it("leaves out incomplete days and today", () => {
    const days = [...intake(2000, 12), { date: today, calories: 300 }];
    days[0] = { ...days[0], calories: 400 }; // incomplete: skipped
    expect(estimateMaintenance(days, weightTrend(series(0), now), today)).toBe(
      2000,
    );
  });

  it("waits for 10 logged days and a trend", () => {
    expect(
      estimateMaintenance(intake(2000, 9), weightTrend(series(0), now), today),
    ).toBeNull();
    expect(estimateMaintenance(intake(2000), null, today)).toBeNull();
  });
});

describe("lossRateCorrection (guardrail)", () => {
  it("raises the target when the trend drops faster than allowed", () => {
    // 1 lb/week vs 0.5 allowed: 0.5 lb/week ≈ 250 kcal/day.
    expect(lossRateCorrection(weightTrend(series(1), now), 0.5)).toBe(250);
  });

  it("does nothing at or under the allowed rate, or when gaining", () => {
    expect(lossRateCorrection(weightTrend(series(0.5), now), 0.5)).toBe(0);
    expect(lossRateCorrection(weightTrend(series(-0.5), now), 0.5)).toBe(0);
    expect(lossRateCorrection(null, 0.5)).toBe(0);
  });

  it("is capped", () => {
    expect(lossRateCorrection(weightTrend(series(4), now), 0.5)).toBe(500);
  });
});

describe("isUnderFueling", () => {
  it("flags intake well below needs for two weeks", () => {
    expect(isUnderFueling(intake(1500, 14), 2300, today)).toBe(true);
  });

  it("does not flag a normal deficit or too little data", () => {
    expect(isUnderFueling(intake(2000, 14), 2300, today)).toBe(false);
    expect(isUnderFueling(intake(1500, 9), 2300, today)).toBe(false);
    expect(isUnderFueling(intake(1500, 14), null, today)).toBe(false);
  });
});

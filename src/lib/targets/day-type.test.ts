import { describe, expect, it } from "vitest";
import {
  classifyDay,
  dayTargets,
  type TargetProfile,
  type Workout,
} from "./day-type";

const profile: TargetProfile = {
  units: "imperial",
  protein_rest_g: 100,
  protein_strength_g: 110,
  protein_run_g: 110,
  protein_long_run_g: 120,
  baseline_calories: 2200,
  rest_day_deficit: 250,
  calorie_floor: 1600,
  long_run_distance_m: 12875, // 8 mi
};

const run = (
  distance_m: number,
  calories_estimate: number | null = 500,
): Workout => ({
  type: "run",
  distance_m,
  calories_estimate,
});
const pilates: Workout = {
  type: "pilates",
  distance_m: null,
  calories_estimate: 200,
};
const strength: Workout = {
  type: "strength",
  distance_m: null,
  calories_estimate: 300,
};
const walk: Workout = {
  type: "other",
  distance_m: 3000,
  calories_estimate: 150,
};

describe("classifyDay", () => {
  it.each<[string, Workout[], string]>([
    ["no workouts", [], "rest"],
    ["only an 'other' activity", [walk], "rest"],
    ["Pilates", [pilates], "strength"],
    ["strength", [strength], "strength"],
    ["a short run", [run(8000)], "run"],
    ["a run plus Pilates", [run(5000), pilates], "run"],
    ["a long run", [run(16000)], "long_run"],
  ])("%s → %s", (_label, workouts, type) => {
    expect(classifyDay(workouts, profile.long_run_distance_m)).toBe(type);
  });

  it("puts the boundary at the long-run distance", () => {
    expect(classifyDay([run(12874)], 12875)).toBe("run");
    expect(classifyDay([run(12875)], 12875)).toBe("long_run");
  });

  it("needs one long run, not two short ones adding up", () => {
    expect(classifyDay([run(7000), run(7000)], 12875)).toBe("run");
  });
});

describe("dayTargets", () => {
  it("rest day: baseline minus the deficit, rest protein", () => {
    expect(dayTargets([], profile)).toEqual({
      dayType: "rest",
      protein_g: 100,
      calories: 1950,
      reason: "Rest day",
    });
  });

  it("strength day: baseline, strength protein", () => {
    expect(dayTargets([pilates], profile)).toMatchObject({
      dayType: "strength",
      protein_g: 110,
      calories: 2200,
    });
  });

  it("run day: baseline plus half of Strava's estimate", () => {
    expect(dayTargets([run(8047, 520)], profile)).toEqual({
      dayType: "run",
      protein_g: 110,
      calories: 2460,
      reason: "Run day (5.0 mi) · +260 for the run",
    });
  });

  it("run day without a calorie estimate stays at baseline", () => {
    expect(dayTargets([run(8047, null)], profile)).toMatchObject({
      calories: 2200,
      reason: "Run day (5.0 mi)",
    });
  });

  it("long run: no deficit, long-run protein", () => {
    const t = dayTargets([run(16093, 1000)], profile);
    expect(t).toMatchObject({
      dayType: "long_run",
      protein_g: 120,
      calories: 2700,
    });
    expect(t.reason).toBe("Long run (10.0 mi) · no deficit · +500 for the run");
  });

  it("guardrail: a long run is never below baseline", () => {
    const t = dayTargets([run(16093, null)], profile);
    expect(t.calories).toBe(2200);
  });

  it("guardrail: never below the calorie floor", () => {
    const low = { ...profile, baseline_calories: 1700 };
    expect(dayTargets([], low)).toMatchObject({
      calories: 1600,
      reason: "Rest day · set to your calorie floor",
    });
  });

  it("guardrail: the floor also holds on a long-run day", () => {
    const low = { ...profile, baseline_calories: 1500 };
    expect(dayTargets([run(16093, null)], low).calories).toBe(1600);
  });

  it("has no calorie target until a baseline exists, but still a day type", () => {
    const none = { ...profile, baseline_calories: null };
    expect(dayTargets([run(16093, 1000)], none)).toMatchObject({
      dayType: "long_run",
      protein_g: 120,
      calories: null,
      reason: "Long run (10.0 mi) · no deficit",
    });
  });

  it("shows kilometres for metric users", () => {
    expect(
      dayTargets([run(8000, null)], { ...profile, units: "metric" }).reason,
    ).toBe("Run day (8.0 km)");
  });

  it("uses the estimated baseline when the profile has none", () => {
    const none = { ...profile, baseline_calories: null };
    expect(dayTargets([], none, { estimatedBaseline: 2300 }).calories).toBe(
      2050,
    );
    // A profile baseline wins over the estimate.
    expect(dayTargets([], profile, { estimatedBaseline: 3000 }).calories).toBe(
      1950,
    );
  });

  it("guardrail: adds the loss-rate correction and says why", () => {
    expect(dayTargets([], profile, { lossCorrection: 250 })).toMatchObject({
      calories: 2200,
      reason: "Rest day · +250 to slow weight loss",
    });
  });
});

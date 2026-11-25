import { describe, expect, it } from "vitest";
import { keepKnownCalories, toWorkoutRow, workoutType } from "./map";

describe("workoutType", () => {
  it.each([
    ["Run", "run"],
    ["TrailRun", "run"],
    ["VirtualRun", "run"],
    ["Pilates", "pilates"],
    ["WeightTraining", "strength"],
    ["Crossfit", "strength"],
    ["Walk", "other"],
    ["Yoga", "other"],
    ["Ride", "other"],
  ])("%s → %s", (sport, type) => {
    expect(workoutType({ sport_type: sport })).toBe(type);
  });

  it("falls back to the legacy type field", () => {
    expect(workoutType({ type: "Run" })).toBe("run");
  });
});

describe("toWorkoutRow", () => {
  it("keeps the local date of a late-evening run", () => {
    // 11:30pm in New York is the next day in UTC.
    const row = toWorkoutRow({
      id: 123,
      sport_type: "Run",
      start_date: "2026-11-25T04:30:00Z",
      start_date_local: "2026-11-24T23:30:00Z",
      distance: 16093.4,
      moving_time: 5400,
      calories: 1010,
    });
    expect(row).toEqual({
      strava_activity_id: 123,
      type: "run",
      started_at: "2026-11-25T04:30:00Z",
      local_date: "2026-11-24",
      distance_m: 16093.4,
      duration_s: 5400,
      calories_estimate: 1010,
      source: "strava",
    });
  });

  it("leaves unknown values empty", () => {
    const row = toWorkoutRow({
      id: 9,
      sport_type: "Pilates",
      start_date: "2026-11-24T14:00:00Z",
      start_date_local: "2026-11-24T09:00:00Z",
    });
    expect(row).toMatchObject({
      distance_m: null,
      duration_s: null,
      calories_estimate: null,
    });
  });
});

describe("keepKnownCalories", () => {
  it("keeps a stored estimate when the list has none, and takes new ones", () => {
    const base = toWorkoutRow({
      id: 1,
      sport_type: "Run",
      start_date: "2026-11-24T12:00:00Z",
      start_date_local: "2026-11-24T07:00:00Z",
    });
    const known = new Map([[1, 1010]]);
    expect(keepKnownCalories([base], known)[0].calories_estimate).toBe(1010);
    expect(
      keepKnownCalories([{ ...base, calories_estimate: 990 }], known)[0]
        .calories_estimate,
    ).toBe(990);
    expect(
      keepKnownCalories([base], new Map())[0].calories_estimate,
    ).toBeNull();
  });
});

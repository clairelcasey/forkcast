import { describe, expect, it } from "vitest";
import {
  isLateNight,
  itemMacros,
  mealConfidence,
  mealLocalDate,
  mealTotals,
} from "./meal-math";

describe("portions", () => {
  it("scales an item by its portion (split fries = ½)", () => {
    expect(itemMacros({ calories: 320, protein_g: 5, portion: 0.5 })).toEqual({
      calories: 160,
      protein_g: 2.5,
    });
  });

  it("totals a meal from unrounded item values", () => {
    expect(
      mealTotals([
        { calories: 590, protein_g: 25, portion: 1 },
        { calories: 320, protein_g: 5, portion: 0.5 },
        { calories: 100.4, protein_g: 0.33, portion: 1.5 },
      ]),
    ).toEqual({ calories: 901, protein_g: 28 });
  });
});

describe("mealConfidence", () => {
  it("is the lowest item confidence", () => {
    expect(
      mealConfidence([{ confidence: "high" }, { confidence: "low" }, {}]),
    ).toBe("low");
    expect(
      mealConfidence([{ confidence: "high" }, { confidence: "medium" }]),
    ).toBe("medium");
  });

  it("is null for manual entries", () => {
    expect(mealConfidence([{}, { confidence: null }])).toBeNull();
  });
});

describe("late-night meals", () => {
  const tz = "America/New_York";

  it("asks between midnight and 4am local time", () => {
    expect(isLateNight(new Date("2026-11-25T05:30:00Z"), tz)).toBe(true); // 00:30
    expect(isLateNight(new Date("2026-11-25T08:59:00Z"), tz)).toBe(true); // 03:59
    expect(isLateNight(new Date("2026-11-25T09:00:00Z"), tz)).toBe(false); // 04:00
    expect(isLateNight(new Date("2026-11-25T04:59:00Z"), tz)).toBe(false); // 23:59
  });

  it("saves under today or yesterday in the user's timezone", () => {
    const at = new Date("2026-11-25T05:30:00Z"); // 00:30 on Nov 25 in New York
    expect(mealLocalDate(at, tz, "today")).toBe("2026-11-25");
    expect(mealLocalDate(at, tz, "yesterday")).toBe("2026-11-24");
  });

  it("crosses month and year boundaries", () => {
    const at = new Date("2027-01-01T06:00:00Z"); // 01:00 Jan 1 in New York
    expect(mealLocalDate(at, tz, "yesterday")).toBe("2026-12-31");
  });
});

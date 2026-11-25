import { describe, expect, it } from "vitest";
import { localDate, remaining, sumMacros } from "./targets";

describe("remaining", () => {
  it("counts down to the target", () => {
    expect(remaining(100, 58)).toEqual({ left: 42, past: 0 });
  });

  it("shows 0 left and how far past, never a negative number", () => {
    expect(remaining(1950, 2100)).toEqual({ left: 0, past: 150 });
  });

  it("rounds to whole units", () => {
    expect(remaining(100, 99.6)).toEqual({ left: 0, past: 0 });
    expect(remaining(100, 58.4)).toEqual({ left: 42, past: 0 });
  });
});

describe("localDate", () => {
  // 2026-11-25 03:30 UTC is still Nov 24 in New York.
  const at = new Date("2026-11-25T03:30:00Z");

  it("uses the user's timezone, not UTC", () => {
    expect(localDate(at, "America/New_York")).toBe("2026-11-24");
    expect(localDate(at, "UTC")).toBe("2026-11-25");
    expect(localDate(at, "Asia/Tokyo")).toBe("2026-11-25");
  });
});

describe("sumMacros", () => {
  it("adds numeric strings from Postgres numerics too", () => {
    expect(
      sumMacros([
        { calories: 300, protein_g: 20.5 },
        { calories: "150" as unknown as number, protein_g: 4 },
      ]),
    ).toEqual({ calories: 450, protein_g: 24.5 });
  });
});

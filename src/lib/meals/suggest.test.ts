import { describe, expect, it } from "vitest";
import { rankByContext, resolveVersions, type MealUse } from "./suggest";

const tz = "America/New_York";
// Tuesday 2026-11-24, 8:00 in New York.
const now = new Date("2026-11-24T13:00:00Z");
const daysAgo = (days: number, utcHour: number) =>
  new Date(Date.UTC(2026, 10, 24 - days, utcHour));

const uses = (id: string, list: Date[]): MealUse[] =>
  list.map((loggedAt) => ({ savedMealId: id, loggedAt }));

describe("rankByContext", () => {
  it("prefers meals usually eaten at this time of day", () => {
    const ranked = rankByContext(
      [
        // Oatmeal around 8am, bowl around 1pm, equally often.
        ...uses("oatmeal", [daysAgo(1, 13), daysAgo(2, 13), daysAgo(3, 12)]),
        ...uses("bowl", [daysAgo(1, 18), daysAgo(2, 18), daysAgo(3, 17)]),
      ],
      now,
      tz,
    );
    expect(ranked.map((r) => r.savedMealId)).toEqual(["oatmeal", "bowl"]);
    // At 1pm the order flips.
    const lunch = rankByContext(
      [
        ...uses("oatmeal", [daysAgo(1, 13), daysAgo(2, 13), daysAgo(3, 12)]),
        ...uses("bowl", [daysAgo(1, 18), daysAgo(2, 18), daysAgo(3, 17)]),
      ],
      new Date("2026-11-24T18:00:00Z"),
      tz,
    );
    expect(lunch[0].savedMealId).toBe("bowl");
  });

  it("lets old orders fade behind recent ones", () => {
    const ranked = rankByContext(
      [
        // Eaten often two months ago, at the same hour.
        ...uses("old", [
          daysAgo(60, 13),
          daysAgo(61, 13),
          daysAgo(62, 13),
          daysAgo(63, 13),
        ]),
        // Eaten once this week.
        ...uses("new", [daysAgo(2, 13)]),
      ],
      now,
      tz,
    );
    expect(ranked[0].savedMealId).toBe("new");
  });

  it("counts frequency", () => {
    const ranked = rankByContext(
      [
        ...uses(
          "daily",
          [1, 2, 3, 4, 5].map((d) => daysAgo(d, 13)),
        ),
        ...uses("once", [daysAgo(1, 13)]),
      ],
      now,
      tz,
    );
    expect(ranked[0].savedMealId).toBe("daily");
  });

  it("gives a bonus for the same weekday", () => {
    // Same hour and age band; one was a Tuesday (7 days ago), one a Wednesday (6).
    const ranked = rankByContext(
      [
        ...uses("tuesday", [daysAgo(7, 13)]),
        ...uses("wednesday", [daysAgo(6, 13)]),
      ],
      now,
      tz,
    );
    expect(ranked[0].savedMealId).toBe("tuesday");
  });

  it("wraps around midnight", () => {
    // 11:30pm snack vs now at 12:30am: one hour apart, not 23.
    const lateNow = new Date("2026-11-25T05:30:00Z"); // 00:30 NY
    const ranked = rankByContext(
      [
        ...uses("snack", [new Date("2026-11-23T04:30:00Z")]), // 23:30 NY
        ...uses("lunch", [new Date("2026-11-23T17:30:00Z")]), // 12:30 NY
      ],
      lateNow,
      tz,
    );
    expect(ranked[0].savedMealId).toBe("snack");
  });
});

describe("resolveVersions", () => {
  it("follows superseded_by to the current version", () => {
    const current = resolveVersions([
      { id: "v1", superseded_by: "v2" },
      { id: "v2", superseded_by: "v3" },
      { id: "v3", superseded_by: null },
    ]);
    expect(current("v1")).toBe("v3");
    expect(current("v3")).toBe("v3");
    expect(current("unknown")).toBe("unknown");
  });
});

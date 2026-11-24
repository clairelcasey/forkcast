import { describe, expect, it } from "vitest";
import { mealMatchKey } from "./normalize";

describe("mealMatchKey", () => {
  it.each([
    ["Chipotle chicken bowl, white rice", "chipotle chicken bowl white rice"],
    [
      "  chipotle   CHICKEN bowl white rice.  ",
      "chipotle chicken bowl white rice",
    ],
    ["I had a grande latte", "a grande latte"],
    ["ate a grande latte!", "a grande latte"],
    ["For breakfast I had oatmeal", "oatmeal"],
    ["McDonald’s Big Mac", "mcdonalds big mac"],
    ["2% milk, 1.5 cups", "2% milk 1.5 cups"],
    ["½ avocado", "1/2 avocado"],
    ["1/2 avocado", "1/2 avocado"],
    ["salad w/ chicken", "salad w chicken"],
  ])("%j → %j", (input, key) => {
    expect(mealMatchKey(input)).toBe(key);
  });

  it("keeps differences that change the meal", () => {
    expect(mealMatchKey("chicken bowl no rice")).not.toBe(
      mealMatchKey("chicken bowl"),
    );
    expect(mealMatchKey("2 eggs")).not.toBe(mealMatchKey("3 eggs"));
    expect(mealMatchKey("whole milk latte")).not.toBe(
      mealMatchKey("oat milk latte"),
    );
  });

  it("only strips filler at the start", () => {
    expect(mealMatchKey("toast i had with jam")).toBe("toast i had with jam");
  });
});

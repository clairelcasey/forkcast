import { describe, expect, it, vi } from "vitest";
import branded from "./__fixtures__/usda-branded-rxbar.json";
import foundation from "./__fixtures__/usda-foundation-broccoli.json";
import srLegacy from "./__fixtures__/usda-sr-legacy-egg.json";
import { NutritionSearchError } from "./types";
import {
  createUsdaProvider,
  normalizeUsdaFood,
  normalizeUsdaSearch,
} from "./usda";

// Fixtures are real FoodData Central search responses (Nov 2026), trimmed to
// the fields and nutrients we use plus one unrelated nutrient (caffeine).

describe("normalizeUsdaSearch", () => {
  it("normalizes SR Legacy foods per 100 g", () => {
    const [egg] = normalizeUsdaSearch(srLegacy);
    expect(egg).toEqual({
      provider: "usda",
      providerId: "171287",
      name: "Egg, whole, raw, fresh",
      brand: null,
      basis: { amount: 100, unit: "g" },
      calories: 143,
      protein_g: 12.6,
      carbs_g: 0.72,
      fat_g: 9.51,
      serving: null,
      kind: "SR Legacy",
    });
  });

  it("falls back to Atwater energy for Foundation foods", () => {
    const beets = normalizeUsdaSearch(foundation).find(
      (f) => f.providerId === "2685576",
    );
    // No nutrient 1008; uses Atwater specific factors (2048), not general (2047).
    expect(beets?.calories).toBe(41);
    expect(beets?.protein_g).toBe(1.69);
  });

  it("drops entries with no energy value", () => {
    const ids = normalizeUsdaSearch(foundation).map((f) => f.providerId);
    expect(ids).not.toContain("2727581"); // blackberries: protein only
  });

  it("keeps the label serving and brand for branded foods", () => {
    const rxbar = normalizeUsdaSearch(branded).find((f) => f.brand === "Rxbar");
    expect(rxbar).toMatchObject({
      name: "Chocolate sea salt bar, chocolate sea salt",
      basis: { amount: 100, unit: "g" },
      calories: 385,
      protein_g: 23.1,
      serving: { amount: 52, unit: "g", label: "1 bar" },
      kind: "Branded",
    });
  });

  it("treats a lower-case 'g' serving unit like 'GRM' and blank labels as null", () => {
    const [almonds, iqbar] = normalizeUsdaSearch(branded);
    expect(almonds.serving).toEqual({
      amount: 31,
      unit: "g",
      label: "9 pieces",
    });
    expect(iqbar.serving).toEqual({ amount: 45, unit: "g", label: null });
  });

  it("rejects a response without a foods list", () => {
    expect(() => normalizeUsdaSearch({ error: "nope" })).toThrow(
      NutritionSearchError,
    );
  });
});

describe("normalizeUsdaFood", () => {
  const base = {
    fdcId: 1,
    description: "Juice drink",
    dataType: "Branded",
    servingSize: 240,
    servingSizeUnit: "MLT",
    foodNutrients: [
      { nutrientId: 1008, unitName: "KCAL", value: 46 },
      { nutrientId: 1003, unitName: "G", value: 0.2 },
    ],
  };

  it("uses 100 ml as the basis for branded liquids", () => {
    expect(normalizeUsdaFood(base)).toMatchObject({
      basis: { amount: 100, unit: "ml" },
      serving: { amount: 240, unit: "ml", label: null },
    });
  });

  it("cleans float noise and 'None' labels seen in live data", () => {
    const noisy = {
      ...base,
      servingSize: 31.200000762939453,
      householdServingFullText: "None",
    };
    expect(normalizeUsdaFood(noisy)?.serving).toEqual({
      amount: 31.2,
      unit: "ml",
      label: null,
    });
  });

  it("ignores energy reported in kJ", () => {
    const kjOnly = {
      ...base,
      foodNutrients: [
        { nutrientId: 1008, unitName: "kJ", value: 190 },
        { nutrientId: 1003, unitName: "G", value: 0.2 },
      ],
    };
    expect(normalizeUsdaFood(kjOnly)).toBeNull();
  });

  it("returns null for malformed entries", () => {
    expect(normalizeUsdaFood({ fdcId: "x" })).toBeNull();
  });
});

describe("createUsdaProvider", () => {
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("searches generic and branded foods with the key in a header", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        return ok(body.dataType.includes("Branded") ? branded : srLegacy);
      },
    );
    const usda = createUsdaProvider("test-key", fetchImpl as typeof fetch);

    const results = await usda.search("  egg  ", { limit: 3 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.nal.usda.gov/fdc/v1/foods/search");
    expect(String(url)).not.toContain("test-key");
    expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe(
      "test-key",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "egg",
      dataType: ["Foundation", "SR Legacy"],
      pageSize: 3,
    });
    // Generic first, then branded.
    expect(results[0].kind).toBe("SR Legacy");
    expect(results.at(-1)?.kind).toBe("Branded");
  });

  it("returns nothing for an empty query without calling USDA", async () => {
    const fetchImpl = vi.fn();
    const usda = createUsdaProvider("k", fetchImpl as unknown as typeof fetch);
    expect(await usda.search("   ")).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports HTTP errors with the status", async () => {
    const usda = createUsdaProvider(
      "bad",
      (async () => new Response("forbidden", { status: 403 })) as typeof fetch,
    );
    await expect(usda.search("egg")).rejects.toMatchObject({
      name: "NutritionSearchError",
      status: 403,
    });
  });

  it("wraps network failures", async () => {
    const usda = createUsdaProvider("k", (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    await expect(usda.search("egg")).rejects.toThrow(/USDA search failed/);
  });
});

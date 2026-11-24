import { describe, expect, it } from "vitest";
import { applyModifiers, matchNickname } from "./modifiers";

const bowl = [
  { name: "Chicken", quantity: "1 serving", portion: 1 },
  { name: "White rice", quantity: "1 serving", portion: 1 },
  { name: "Black beans", quantity: "1 serving", portion: 1 },
  { name: "Guacamole", quantity: "1 side", portion: 1 },
];

describe("matchNickname", () => {
  const nicknames = ["usual bowl", "Breakfast A", "usual"];

  it("matches the whole line, ignoring case and punctuation", () => {
    expect(matchNickname("Breakfast A!", nicknames)).toEqual({
      nickname: "Breakfast A",
      rest: "",
    });
  });

  it("splits off modifiers after the nickname, preferring the longest", () => {
    expect(matchNickname("usual bowl, no rice", nicknames)).toEqual({
      nickname: "usual bowl",
      rest: "no rice",
    });
  });

  it("needs a word boundary", () => {
    expect(matchNickname("usually oatmeal", nicknames)).toBeNull();
    expect(matchNickname("oatmeal", nicknames)).toBeNull();
  });
});

describe("applyModifiers", () => {
  it("removes items: no / without / hold the", () => {
    const r = applyModifiers(bowl, "no rice, without guac");
    expect(r.unknown).toEqual(["without guac"]); // "guac" isn't "guacamole"
    expect(r.items.map((i) => i.name)).toEqual([
      "Chicken",
      "Black beans",
      "Guacamole",
    ]);
    expect(applyModifiers(bowl, "hold the guacamole").items).toHaveLength(3);
  });

  it("matches plurals and multi-word names", () => {
    const r = applyModifiers(bowl, "no beans");
    expect(r.items.map((i) => i.name)).not.toContain("Black beans");
    expect(r.applied).toEqual(["no beans"]);
  });

  it("scales portions: double, extra, half", () => {
    const r = applyModifiers(
      bowl,
      "double chicken and half the rice, extra guacamole",
    );
    const portion = (name: string) =>
      r.items.find((i) => i.name === name)?.portion;
    expect(portion("Chicken")).toBe(2);
    expect(portion("White rice")).toBe(0.5);
    expect(portion("Guacamole")).toBe(1.5);
    expect(r.unknown).toEqual([]);
  });

  it("halves the whole meal for 'split'", () => {
    const r = applyModifiers(bowl, "split");
    expect(r.items.every((i) => i.portion === 0.5)).toBe(true);
  });

  it("reports what it couldn't apply and leaves the meal unchanged", () => {
    const r = applyModifiers(bowl, "no cheese, add salsa");
    expect(r.unknown).toEqual(["no cheese", "add salsa"]);
    expect(r.items).toEqual(bowl);
  });

  it("does not modify the input", () => {
    applyModifiers(bowl, "double chicken");
    expect(bowl[0].portion).toBe(1);
  });
});

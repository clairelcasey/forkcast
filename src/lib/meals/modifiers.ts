// Nicknames and modifiers: "usual bowl, no rice" re-uses the saved meal
// nicknamed "usual bowl" and changes it in plain code, with no AI call.

import { mealMatchKey } from "./normalize";

/** The nickname the text starts with (longest wins), and what follows it. */
export function matchNickname(
  text: string,
  nicknames: string[],
): { nickname: string; rest: string } | null {
  const key = mealMatchKey(text);
  const sorted = [...nicknames].sort((a, b) => b.length - a.length);
  for (const nickname of sorted) {
    const nick = mealMatchKey(nickname);
    if (!nick) continue;
    if (key === nick) return { nickname, rest: "" };
    if (key.startsWith(`${nick} `)) {
      return { nickname, rest: key.slice(nick.length).trim() };
    }
  }
  return null;
}

type Item = { name: string; quantity: string; portion: number };

export type ModifierResult<T extends Item> = {
  items: T[];
  /** Modifiers that changed the meal, as typed. */
  applied: string[];
  /** Modifiers that couldn't be applied (shown on the card). */
  unknown: string[];
};

const PATTERNS: { re: RegExp; apply: "remove" | number }[] = [
  {
    re: /^(?:no|without|hold the|minus|skip(?: the)?)\s+(.+)$/,
    apply: "remove",
  },
  { re: /^(?:double|2x|two)\s+(.+)$/, apply: 2 },
  { re: /^(?:extra|more|added)\s+(.+)$/, apply: 1.5 },
  {
    re: /^(?:half(?: the)?|light|less|easy(?: on)?(?: the)?)\s+(.+)$/,
    apply: 0.5,
  },
];

/** "split", "half", "shared" with nothing after them: the whole meal halves. */
const WHOLE_MEAL_HALF =
  /^(?:split|shared|half|half of it|split it|shared it|split with a friend)$/;

const singular = (w: string) => w.replace(/(?:es|s)$/, "");

/** Item whose name (or quantity) contains every word of `target`. */
function findItem<T extends Item>(items: T[], target: string): T | undefined {
  const words = mealMatchKey(target).split(" ").filter(Boolean).map(singular);
  if (words.length === 0) return undefined;
  return items.find((item) => {
    const haystack = mealMatchKey(`${item.name} ${item.quantity}`)
      .split(" ")
      .map(singular);
    return words.every((w) => haystack.includes(w));
  });
}

/** Applies typed modifiers ("no rice, extra chicken") to a saved meal's items. */
export function applyModifiers<T extends Item>(
  items: T[],
  rest: string,
): ModifierResult<T> {
  let result = items.map((i) => ({ ...i }));
  const applied: string[] = [];
  const unknown: string[] = [];

  const parts = rest
    .split(/,|;|\band\b|\bwith\b/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (WHOLE_MEAL_HALF.test(part)) {
      result = result.map((i) => ({ ...i, portion: i.portion * 0.5 }));
      applied.push(part);
      continue;
    }
    const pattern = PATTERNS.map((p) => ({ ...p, m: part.match(p.re) })).find(
      (p) => p.m,
    );
    const target = pattern?.m?.[1];
    const item = target ? findItem(result, target) : undefined;
    if (!pattern || !item) {
      unknown.push(part);
      continue;
    }
    result =
      pattern.apply === "remove"
        ? result.filter((i) => i !== item)
        : result.map((i) =>
            i === item
              ? { ...i, portion: i.portion * (pattern.apply as number) }
              : i,
          );
    applied.push(part);
  }
  return { items: result, applied, unknown };
}

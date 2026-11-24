import { z } from "zod";

// Structured outputs for the meal parser. The API constrains Claude to these
// shapes; the parser then checks the rules a JSON schema can't express
// (picked ids must come from the search results, sane amounts).

export const splitSchema = z.object({
  items: z
    .array(
      z.object({
        /** Short display name, e.g. "Chicken". */
        name: z.string(),
        /** What to search the nutrition database for, e.g. "chicken breast grilled". */
        search_query: z.string(),
        /** The amount as the user said it, or "" if unstated. */
        amount_text: z.string(),
      }),
    )
    .describe("Every food or drink in the line, in order"),
});

export type SplitOutput = z.infer<typeof splitSchema>;

export const pickSchema = z.object({
  picks: z.array(
    z.object({
      item_index: z.number().int(),
      /** One of the candidate ids for this item, or null if none fits. */
      entry_id: z.string().nullable(),
      /** Amount eaten, in the candidate's unit (g or ml). */
      amount: z.number(),
      /** Human-readable amount, e.g. "1 cup", "half an order". */
      quantity: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});

export type PickOutput = z.infer<typeof pickSchema>;

/** Largest believable single item, in g or ml. */
export const MAX_ITEM_AMOUNT = 3000;

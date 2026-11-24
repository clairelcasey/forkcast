import { z } from "zod";

export const CASE_TAGS = [
  "chain",
  "home",
  "packaged",
  "mixed_bowl",
  "shared_plate",
  "drink",
  "vague_amount",
  "multi_item",
] as const;

const itemSchema = z
  .object({
    name: z.string().min(1),
    /** The amount actually eaten (after any sharing). */
    quantity: z.string().min(1),
    calories: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
  })
  .strict();

const sourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("published"),
      /** e.g. "Chipotle US nutrition calculator". */
      name: z.string().min(1),
      url: z.url().optional(),
      /** Date someone checked the numbers against the source; null = not yet. */
      checked_on: z.iso.date().nullable(),
    })
    .strict(),
  z
    .object({
      /** A made-up home meal: gram weights × USDA per-100 g values. */
      kind: z.literal("made_up"),
      basis: z.string().min(1),
      checked_on: z.iso.date().nullable(),
    })
    .strict(),
]);

const CALORIE_SLACK = 1;
const PROTEIN_SLACK = 0.5;

export const evalCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case id"),
    /** Exactly what would be typed into the log box. */
    input: z.string().min(1),
    tags: z.array(z.enum(CASE_TAGS)).min(1),
    expected: z
      .object({
        items: z.array(itemSchema).min(1),
        calories: z.number().positive(),
        protein_g: z.number().nonnegative(),
      })
      .strict(),
    source: sourceSchema,
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const cal = c.expected.items.reduce((s, i) => s + i.calories, 0);
    const pro = c.expected.items.reduce((s, i) => s + i.protein_g, 0);
    if (Math.abs(cal - c.expected.calories) > CALORIE_SLACK) {
      ctx.addIssue({
        code: "custom",
        path: ["expected", "calories"],
        message: `items add up to ${cal} kcal, total says ${c.expected.calories}`,
      });
    }
    if (Math.abs(pro - c.expected.protein_g) > PROTEIN_SLACK) {
      ctx.addIssue({
        code: "custom",
        path: ["expected", "protein_g"],
        message: `items add up to ${pro} g protein, total says ${c.expected.protein_g}`,
      });
    }
  });

export type EvalCase = z.infer<typeof evalCaseSchema>;

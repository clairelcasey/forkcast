"use client";

import { useState, useTransition } from "react";
import { ArrowUp, Plus, X } from "lucide-react";
import type { Confidence, ParsedItem } from "@/ai/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  isLateNight,
  itemMacros,
  mealConfidence,
  mealTotals,
  PORTION_CHIPS,
  type DayChoice,
} from "@/lib/meals/meal-math";
import { cn } from "@/lib/utils";
import { parseMealText, saveMealLog } from "./actions";

type DraftItem = {
  key: string;
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  portion: number;
  confidence: Confidence | null;
};

type Draft = {
  clientId: string;
  inputText: string;
  source: "ai" | "manual";
  note: string | null;
  items: DraftItem[];
};

const newKey = () => crypto.randomUUID();

const blankItem = (name = ""): DraftItem => ({
  key: newKey(),
  name,
  quantity: "",
  calories: 0,
  protein_g: 0,
  portion: 1,
  confidence: null,
});

function toDraftItem(item: ParsedItem): DraftItem {
  return {
    key: newKey(),
    name: item.name,
    quantity: item.quantity,
    calories: item.calories,
    protein_g: item.protein_g,
    portion: 1,
    confidence: item.confidence ?? null,
  };
}

/** The log box and, after submitting, the editable confirm card. */
export function LogMeal({ timeZone }: { timeZone: string }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const inputText = text.trim();
    if (!inputText || pending) return;
    startTransition(async () => {
      const result = await parseMealText(inputText);
      const clientId = crypto.randomUUID();
      setDraft(
        result.kind === "parsed"
          ? {
              clientId,
              inputText,
              source: "ai",
              note: null,
              items: result.items.map(toDraftItem),
            }
          : {
              clientId,
              inputText,
              source: "manual",
              note: result.reason,
              items: [blankItem(inputText)],
            },
      );
    });
  }

  return (
    <>
      <form onSubmit={submit} className="relative">
        <Input
          aria-label="What did you eat?"
          placeholder="What did you eat?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="go"
          autoComplete="off"
          maxLength={500}
          disabled={pending || draft !== null}
          className="pr-12"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Log it"
          disabled={!text.trim() || pending || draft !== null}
          className="absolute top-1 right-1"
        >
          <ArrowUp />
        </Button>
      </form>

      {draft ? (
        <ConfirmCard
          // Remount per meal so field state starts fresh.
          key={draft.clientId}
          draft={draft}
          timeZone={timeZone}
          onChange={setDraft}
          onDone={() => {
            setDraft(null);
            setText("");
          }}
          onCancel={() => setDraft(null)}
        />
      ) : null}
    </>
  );
}

function ConfirmCard({
  draft,
  timeZone,
  onChange,
  onDone,
  onCancel,
}: {
  draft: Draft;
  timeZone: string;
  onChange: (draft: Draft) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Decided once when the card opens, so the question doesn't appear mid-edit.
  const [askDay] = useState(() => isLateNight(new Date(), timeZone));
  const [day, setDay] = useState<DayChoice | null>(askDay ? null : "today");

  const manual = draft.source === "manual";
  const totals = mealTotals(draft.items);
  const confidence = manual ? null : mealConfidence(draft.items);
  const canSave =
    draft.items.length > 0 &&
    draft.items.every((i) => i.name.trim()) &&
    day !== null &&
    !saving;

  const updateItem = (key: string, patch: Partial<DraftItem>) =>
    onChange({
      ...draft,
      items: draft.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    });

  const removeItem = (key: string) =>
    onChange({ ...draft, items: draft.items.filter((i) => i.key !== key) });

  // Manual numbers are what was eaten, so fold portions into them.
  const switchToManual = () =>
    onChange({
      ...draft,
      source: "manual",
      note: null,
      items: draft.items.map((i) => ({
        ...i,
        ...itemMacros(i),
        portion: 1,
        confidence: null,
      })),
    });

  function save() {
    if (!canSave || day === null) return;
    setError(null);
    startSaving(async () => {
      const result = await saveMealLog({
        clientId: draft.clientId,
        inputText: draft.inputText,
        source: draft.source,
        day,
        items: draft.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          calories: i.calories,
          protein_g: i.protein_g,
          portion: i.portion,
          confidence: i.confidence,
        })),
      });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base">
            {manual ? "Enter this meal" : "Check this meal"}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.note ??
              (confidence ? `${capitalize(confidence)} confidence` : null)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancel"
          className="-mt-2 -mr-2 size-11 text-muted-foreground"
          onClick={onCancel}
        >
          <X />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-4">
          {draft.items.map((item) =>
            manual ? (
              <ManualItem
                key={item.key}
                item={item}
                onChange={(patch) => updateItem(item.key, patch)}
                onRemove={
                  draft.items.length > 1
                    ? () => removeItem(item.key)
                    : undefined
                }
              />
            ) : (
              <ParsedItemRow
                key={item.key}
                item={item}
                onPortion={(portion) => updateItem(item.key, { portion })}
                onRemove={() => removeItem(item.key)}
              />
            ),
          )}
        </ul>

        {manual ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({ ...draft, items: [...draft.items, blankItem()] })
            }
          >
            <Plus /> Add item
          </Button>
        ) : null}

        <p className="flex justify-between border-t pt-3 text-sm tabular-nums">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium">
            {totals.calories} kcal · {totals.protein_g}g protein
          </span>
        </p>

        {askDay ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm">Which day is this for?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["yesterday", "today"] as const).map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={day === d ? "default" : "outline"}
                  aria-pressed={day === d}
                  onClick={() => setDay(d)}
                >
                  {d === "today" ? "Today" : "Yesterday"}
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-muted-foreground">
            {error}
          </p>
        ) : null}

        <Button type="button" size="lg" disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {!manual ? (
          <Button type="button" variant="ghost" onClick={switchToManual}>
            Enter numbers instead
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ParsedItemRow({
  item,
  onPortion,
  onRemove,
}: {
  item: DraftItem;
  onPortion: (portion: number) => void;
  onRemove: () => void;
}) {
  const macros = itemMacros(item);
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {item.quantity}
            {item.portion !== 1
              ? ` × ${formatPortion(item.portion)}`
              : ""} · {macros.calories} kcal · {macros.protein_g}g protein
          </p>
          {item.confidence === "low" ? (
            <p className="text-xs text-muted-foreground">
              Amount is a guess. Pick a size.
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${item.name}`}
          className="-mt-2 size-11 text-muted-foreground"
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      <div
        role="group"
        aria-label={`Amount of ${item.name}`}
        className="flex gap-2"
      >
        {PORTION_CHIPS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={item.portion === p}
            onClick={() => onPortion(p)}
            className={cn(
              "h-9 min-w-11 rounded-full border px-3 text-sm tabular-nums transition-colors",
              item.portion === p
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-accent",
            )}
          >
            {formatPortion(p)}
          </button>
        ))}
      </div>
    </li>
  );
}

function ManualItem({
  item,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove?: () => void;
}) {
  const id = item.key;
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Item"
          placeholder="Item"
          defaultValue={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          maxLength={120}
        />
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${item.name || "item"}`}
            className="size-11 text-muted-foreground"
            onClick={onRemove}
          >
            <X />
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id={`${id}-cal`}
          label="Calories"
          defaultValue={item.calories}
          onChange={(calories) => onChange({ calories })}
        />
        <NumberField
          id={`${id}-pro`}
          label="Protein (g)"
          defaultValue={item.protein_g}
          onChange={(protein_g) => onChange({ protein_g })}
        />
      </div>
    </li>
  );
}

function NumberField({
  id,
  label,
  defaultValue,
  onChange,
}: {
  id: string;
  label: string;
  defaultValue: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="0"
        defaultValue={defaultValue ? String(defaultValue) : ""}
        onChange={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
        className="tabular-nums"
      />
    </div>
  );
}

function formatPortion(p: number) {
  const whole = Math.floor(p);
  const half = p - whole === 0.5;
  if (half) return whole === 0 ? "½" : `${whole}½`;
  return `${p}×`;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

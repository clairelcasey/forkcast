"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Plus, X } from "lucide-react";
import type { Confidence, ParsedItem } from "@/ai/types";
import type { FoodEntry } from "@/server/nutrition/types";
import type { MealItem } from "@/lib/meals/item-schema";
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
import {
  idbQueue,
  syncQueue,
  type QueuedItem,
  type QueueEntry,
} from "@/lib/offline/queue";
import { cn } from "@/lib/utils";
import { deleteMealLog } from "../meals/actions";
import {
  parseMealText,
  saveMealLog,
  suggestSavedMeals,
  type SuggestedMeal,
} from "./actions";

type DraftItem = {
  key: string;
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  portion: number;
  confidence: Confidence | null;
  /** Database entry behind an AI-parsed item; dropped on manual entry. */
  food?: FoodEntry;
  amount?: number;
};

type Draft = {
  clientId: string;
  inputText: string;
  /** When the line was typed (ISO). Saved as logged_at for queued meals. */
  typedAt: string;
  /** Finishing a line that was queued offline. */
  fromQueue: boolean;
  source: "ai" | "manual" | "cache";
  /** The saved meal this draft came from (or is re-estimating). */
  savedMealId?: string;
  /** The saved meal as the card opened, to notice edits to it. */
  saved?: SavedContext;
  /** Modifiers applied to the saved meal ("no rice"). */
  modifiers?: string[];
  note: string | null;
  items: DraftItem[];
};

type SavedContext = {
  name: string;
  nickname: string | null;
  snapshot: string;
  /** Re-estimating: saving always makes a new version. */
  reestimate?: boolean;
};

/** What makes two versions of a meal different. */
const itemsSnapshot = (items: DraftItem[]) =>
  JSON.stringify(
    items.map((i) => [i.name, i.portion, i.calories, i.protein_g]),
  );

/** A saved meal offered for one-tap re-logging. */
export type RecentMeal = {
  id: string;
  name: string;
  nickname: string | null;
  calories: number;
  protein_g: number;
  items: MealItem[];
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
    food: item.food,
    amount: item.amount,
  };
}

/** Saved items keep their portions (a saved "split fries" stays ½). */
function savedToDraftItem(item: MealItem): DraftItem {
  return { ...item, key: newKey() };
}

const timesLabel = (n: number) => (n === 1 ? "once" : `${n} times`);

const toQueuedItems = (items: DraftItem[]): QueuedItem[] =>
  items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    calories: i.calories,
    protein_g: i.protein_g,
    portion: i.portion,
    confidence: i.confidence,
    ...(i.food ? { food: i.food, amount: i.amount } : {}),
  }));

const REESTIMATE_NOTE =
  "Re-estimated. Saving updates the saved meal; past logs keep their numbers.";

const OFFLINE_NOTE = "You're offline. Enter the numbers, or finish it later.";

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * The log box, the editable confirm card, and the offline queue: meals
 * saved without a connection wait in IndexedDB and sync when back online.
 */
export function LogMeal({
  timeZone,
  userId,
  recent = [],
}: {
  timeZone: string;
  userId: string;
  recent?: RecentMeal[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<Flash | null>(null);
  const [matches, setMatches] = useState<SuggestedMeal[]>([]);
  const [similar, setSimilar] = useState<Similar | null>(null);
  const latestQuery = useRef(0);

  // Type-ahead: saved meals matching what's typed so far (debounced).
  useEffect(() => {
    const query = text.trim();
    if (draft || similar || !online || query.length < 2) return;
    const id = ++latestQuery.current;
    const timer = setTimeout(() => {
      suggestSavedMeals(query)
        .then((found) => {
          if (id === latestQuery.current) setMatches(found);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [text, draft, similar, online]);
  const showMatches =
    !draft && !similar && text.trim().length >= 2 && matches.length > 0;

  // The "Logged … Undo" note fades after a few seconds.
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(timer);
  }, [flash]);

  const reloadQueue = useCallback(async () => {
    try {
      setQueue(await idbQueue.list(userId));
    } catch {
      // IndexedDB unavailable (e.g. private mode): no offline queue.
    }
  }, [userId]);

  const sync = useCallback(async () => {
    let entries: QueueEntry[];
    try {
      entries = await idbQueue.list(userId);
    } catch {
      return;
    }
    const { saved } = await syncQueue(entries, {
      save: (e) =>
        saveMealLog({
          clientId: e.clientId,
          inputText: e.text,
          source: e.source,
          savedMealId: e.savedMealId,
          savedMealChange: e.savedMealChange,
          nickname: e.nickname,
          modifiers: e.modifiers,
          day: e.day,
          loggedAt: e.queuedAt,
          items: e.items,
        }),
      remove: idbQueue.remove,
      put: idbQueue.put,
    });
    await reloadQueue();
    if (saved > 0) router.refresh();
  }, [userId, reloadQueue, router]);

  // Show the queue on load (even offline); sync on load, when the
  // connection returns, and when the app is reopened.
  useEffect(() => {
    idbQueue
      .list(userId)
      .then(setQueue)
      .catch(() => {});
    const syncIfOnline = () => {
      if (navigator.onLine && document.visibilityState === "visible") {
        void sync();
      }
    };
    syncIfOnline();
    window.addEventListener("online", syncIfOnline);
    document.addEventListener("visibilitychange", syncIfOnline);
    return () => {
      window.removeEventListener("online", syncIfOnline);
      document.removeEventListener("visibilitychange", syncIfOnline);
    };
  }, [sync, userId]);

  async function enqueue(entry: Omit<QueueEntry, "userId">) {
    await idbQueue.put({ ...entry, userId });
    await reloadQueue();
  }

  function openDraft(
    inputText: string,
    base: Pick<Draft, "clientId" | "typedAt" | "fromQueue">,
    reestimate?: Pick<Draft, "savedMealId" | "saved">,
    { skipSimilar = false }: { skipSimilar?: boolean } = {},
  ) {
    const manualDraft = (note: string): Draft => ({
      ...base,
      ...reestimate,
      inputText,
      source: "manual",
      note,
      items: [blankItem(inputText)],
    });
    if (!navigator.onLine) {
      setDraft(manualDraft(OFFLINE_NOTE));
      return;
    }
    startTransition(async () => {
      try {
        const result = await parseMealText(inputText, {
          reestimate: Boolean(reestimate),
          skipSimilar,
        });
        if (result.kind === "parsed") {
          setDraft({
            ...base,
            ...reestimate,
            inputText,
            source: "ai",
            note: reestimate ? REESTIMATE_NOTE : null,
            items: result.items.map(toDraftItem),
          });
        } else if (result.kind === "cache") {
          const items = result.items.map(savedToDraftItem);
          setDraft({
            ...base,
            inputText,
            source: "cache",
            savedMealId: result.savedMealId,
            saved: {
              name: result.name,
              nickname: result.nickname,
              snapshot: itemsSnapshot(items),
            },
            modifiers: result.modifiers,
            note: [
              `Saved meal · logged ${timesLabel(result.useCount)}`,
              result.modifiers.length
                ? `With ${result.modifiers.join(", ")}`
                : "",
              result.unknownModifiers.length
                ? `Couldn't apply "${result.unknownModifiers.join(", ")}". Adjust below.`
                : "",
            ]
              .filter(Boolean)
              .join(". "),
            items,
          });
        } else {
          if (result.kind === "similar") {
            setSimilar({ meal: result.meal, inputText, base });
            return;
          }
          setDraft(manualDraft(result.reason));
        }
      } catch {
        // The request failed: treat it as offline.
        setDraft(manualDraft(OFFLINE_NOTE));
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const inputText = text.trim();
    if (!inputText || pending || draft || similar) return;
    openDraft(inputText, {
      clientId: crypto.randomUUID(),
      typedAt: new Date().toISOString(),
      fromQueue: false,
    });
  }

  function finishQueued(entry: QueueEntry) {
    if (draft) return;
    openDraft(entry.text, {
      clientId: entry.clientId,
      typedAt: entry.queuedAt,
      fromQueue: true,
    });
  }

  /** One tap logs a recent meal as is; late at night it asks for the day. */
  /** Opens a saved meal on the confirm card (type-ahead, "same as?"). */
  function openSaved(
    meal: SuggestedMeal,
    inputText: string,
    base: Pick<Draft, "clientId" | "typedAt" | "fromQueue">,
  ) {
    const items = meal.items.map(savedToDraftItem);
    setMatches([]);
    setSimilar(null);
    setDraft({
      ...base,
      inputText,
      source: "cache",
      savedMealId: meal.id,
      saved: {
        name: meal.name,
        nickname: meal.nickname,
        snapshot: itemsSnapshot(items),
      },
      note: `Saved meal · logged ${timesLabel(meal.useCount)}`,
      items,
    });
  }

  function pickMatch(meal: SuggestedMeal) {
    if (draft || pending) return;
    setText(meal.name);
    openSaved(meal, meal.name, {
      clientId: crypto.randomUUID(),
      typedAt: new Date().toISOString(),
      fromQueue: false,
    });
  }

  function relog(meal: RecentMeal) {
    if (draft || pending) return;
    const base = {
      clientId: crypto.randomUUID(),
      typedAt: new Date().toISOString(),
      fromQueue: false,
    };
    if (isLateNight(new Date(base.typedAt), timeZone)) {
      setDraft({
        ...base,
        inputText: meal.name,
        source: "cache",
        savedMealId: meal.id,
        saved: {
          name: meal.name,
          nickname: meal.nickname,
          snapshot: itemsSnapshot(meal.items.map(savedToDraftItem)),
        },
        note: "Saved meal",
        items: meal.items.map(savedToDraftItem),
      });
      return;
    }
    const entry: Omit<QueueEntry, "userId"> = {
      clientId: base.clientId,
      text: meal.name,
      queuedAt: base.typedAt,
      day: "today",
      source: "cache",
      savedMealId: meal.id,
      items: meal.items,
    };
    startTransition(async () => {
      if (!navigator.onLine) {
        await enqueue(entry);
        setFlash({ name: meal.name, logId: null });
        return;
      }
      try {
        const result = await saveMealLog({
          clientId: entry.clientId,
          inputText: entry.text,
          source: "cache",
          savedMealId: meal.id,
          day: "today",
          items: meal.items,
        });
        setFlash(
          result.error
            ? { name: meal.name, logId: null, error: result.error }
            : { name: meal.name, logId: result.id ?? null },
        );
      } catch {
        await enqueue(entry);
        setFlash({ name: meal.name, logId: null });
      }
    });
  }

  /** Estimates a saved meal again; saving it makes a new version. */
  function reestimate(current: Draft) {
    if (!current.savedMealId || !current.saved) return;
    openDraft(
      current.saved.name,
      {
        clientId: current.clientId,
        typedAt: current.typedAt,
        fromQueue: current.fromQueue,
      },
      {
        savedMealId: current.savedMealId,
        saved: { ...current.saved, reestimate: true },
      },
    );
  }

  function undo(logId: string) {
    setFlash(null);
    startTransition(() => deleteMealLog(logId));
  }

  async function discard(entry: QueueEntry) {
    await idbQueue.remove(entry.clientId);
    await reloadQueue();
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
          disabled={pending || draft !== null || similar !== null}
          className="pr-12"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Log it"
          disabled={
            !text.trim() || pending || draft !== null || similar !== null
          }
          className="absolute top-1 right-1"
        >
          <ArrowUp />
        </Button>
      </form>

      {!online ? (
        <p className="-mt-3 text-sm text-muted-foreground">
          Offline. Meals you save will sync when you&apos;re back online.
        </p>
      ) : null}

      {showMatches ? (
        <section aria-label="Matching saved meals" className="-mt-3">
          <ul className="divide-y overflow-hidden rounded-xl border">
            {matches.map((meal) => (
              <li key={meal.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pickMatch(meal)}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{meal.name}</span>
                    {meal.nickname ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {meal.nickname}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {Math.round(meal.calories)} kcal ·{" "}
                    {Math.round(meal.protein_g)}g
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {similar ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Same as your {similar.meal.name}
              {similar.meal.lastUsedAt
                ? ` from ${shortDate(similar.meal.lastUsedAt, timeZone)}`
                : ""}
              ?
            </CardTitle>
            <p className="text-sm text-muted-foreground tabular-nums">
              {Math.round(similar.meal.calories)} kcal ·{" "}
              {Math.round(similar.meal.protein_g)}g protein
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() =>
                openSaved(similar.meal, similar.inputText, similar.base)
              }
            >
              Yes, use it
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const { inputText, base } = similar;
                setSimilar(null);
                openDraft(inputText, base, undefined, { skipSimilar: true });
              }}
            >
              No, it&apos;s new
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {flash ? (
        <p
          role="status"
          className="-mt-3 flex items-center gap-1 text-sm text-muted-foreground"
        >
          <span className="min-w-0 truncate">
            {flash.error ?? `Logged ${flash.name}.`}
          </span>
          {flash.logId ? (
            <Button
              type="button"
              variant="link"
              className="h-auto shrink-0 p-0"
              onClick={() => undo(flash.logId!)}
            >
              Undo
            </Button>
          ) : null}
        </p>
      ) : null}

      {!draft && !similar && !showMatches && recent.length > 0 ? (
        <section aria-label="Recent meals">
          <h2 className="mb-2 text-sm font-medium">Log again</h2>
          <ul className="flex flex-wrap gap-2">
            {recent.map((meal) => (
              <li key={meal.id} className="max-w-full">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => relog(meal)}
                  className="flex h-11 max-w-full items-center gap-1.5 rounded-full border bg-background px-4 text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <span className="truncate">{meal.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {Math.round(meal.calories)} kcal
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft ? (
        <ConfirmCard
          // Remount per meal so field state starts fresh.
          key={draft.clientId}
          draft={draft}
          timeZone={timeZone}
          onChange={setDraft}
          onReestimate={() => reestimate(draft)}
          onQueue={async (entry) => {
            await enqueue(entry);
            setDraft(null);
            setText("");
          }}
          onDone={async () => {
            if (draft.fromQueue) {
              await idbQueue.remove(draft.clientId).catch(() => {});
              await reloadQueue();
            }
            setDraft(null);
            setText("");
          }}
          onCancel={() => setDraft(null)}
        />
      ) : null}

      <QueueList
        entries={queue}
        online={online}
        busy={draft !== null || pending}
        onFinish={finishQueued}
        onDiscard={discard}
      />
    </>
  );
}

function QueueList({
  entries,
  online,
  busy,
  onFinish,
  onDiscard,
}: {
  entries: QueueEntry[];
  online: boolean;
  busy: boolean;
  onFinish: (entry: QueueEntry) => void;
  onDiscard: (entry: QueueEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section aria-label="Not saved yet">
      <h2 className="mb-2 text-sm font-medium">Not saved yet</h2>
      <ul className="divide-y rounded-xl border border-dashed">
        {entries.map((entry) => {
          const totals = entry.items ? mealTotals(entry.items) : null;
          return (
            <li
              key={entry.clientId}
              className="flex items-center gap-2 py-3 pr-1 pl-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.text}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {entry.error
                    ? entry.error
                    : totals
                      ? `${totals.calories} kcal · ${totals.protein_g}g protein · syncs when online`
                      : "Not logged yet. Finish it when online."}
                </p>
              </div>
              {!entry.items ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!online || busy}
                  onClick={() => onFinish(entry)}
                >
                  Finish
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Discard ${entry.text}`}
                className="size-11 text-muted-foreground"
                onClick={() => onDiscard(entry)}
              >
                <X />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConfirmCard({
  draft,
  timeZone,
  onChange,
  onReestimate,
  onQueue,
  onDone,
  onCancel,
}: {
  draft: Draft;
  timeZone: string;
  onChange: (draft: Draft) => void;
  onReestimate: () => void;
  onQueue: (entry: Omit<QueueEntry, "userId">) => Promise<void>;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Decided once when the card opens, so the question doesn't appear mid-edit.
  const [askDay] = useState(() =>
    isLateNight(new Date(draft.typedAt), timeZone),
  );
  const [day, setDay] = useState<DayChoice | null>(askDay ? null : "today");
  const [nickname, setNicknameText] = useState(draft.saved?.nickname ?? "");
  const [change, setChange] = useState<"none" | "version" | null>(null);

  // Editing a saved meal asks whether the edit is for this log only.
  const editedSaved =
    Boolean(draft.savedMealId && draft.saved && !draft.saved.reestimate) &&
    itemsSnapshot(draft.items) !== draft.saved?.snapshot;
  const savedMealChange: "none" | "version" = draft.saved?.reestimate
    ? "version"
    : editedSaved
      ? (change ?? "none")
      : "none";
  const nicknameChange =
    nickname.trim() === (draft.saved?.nickname ?? "")
      ? undefined
      : nickname.trim();

  const manual = draft.source === "manual";
  const totals = mealTotals(draft.items);
  const confidence = manual ? null : mealConfidence(draft.items);
  const canSave =
    draft.items.length > 0 &&
    draft.items.every((i) => i.name.trim()) &&
    day !== null &&
    (!editedSaved || change !== null) &&
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
        // Typed numbers no longer come from the database entry.
        food: undefined,
        amount: undefined,
      })),
    });

  const queueEntry = (
    items: QueueEntry["items"],
  ): Omit<QueueEntry, "userId"> => ({
    clientId: draft.clientId,
    text: draft.inputText,
    queuedAt: draft.typedAt,
    day: day ?? "today",
    source: draft.source,
    savedMealId: draft.savedMealId,
    savedMealChange,
    nickname: nicknameChange,
    modifiers: draft.modifiers,
    items,
  });

  function save() {
    if (!canSave || day === null) return;
    setError(null);
    const items = toQueuedItems(draft.items);
    startSaving(async () => {
      // No connection: keep it in the queue; it syncs when back online.
      if (!navigator.onLine) return onQueue(queueEntry(items));
      let result: { error?: string };
      try {
        result = await saveMealLog({
          clientId: draft.clientId,
          inputText: draft.inputText,
          source: draft.source,
          savedMealId: draft.savedMealId,
          savedMealChange,
          nickname: nicknameChange,
          modifiers: draft.modifiers,
          day,
          // Queued lines keep the time they were typed.
          loggedAt: draft.fromQueue ? draft.typedAt : undefined,
          items,
        });
      } catch {
        return onQueue(queueEntry(items));
      }
      if (result.error) setError(result.error);
      else await onDone();
    });
  }

  const offline = draft.note === OFFLINE_NOTE;

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

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${draft.clientId}-nick`}
            className="text-xs text-muted-foreground"
          >
            Nickname (optional)
          </label>
          <Input
            id={`${draft.clientId}-nick`}
            value={nickname}
            onChange={(e) => setNicknameText(e.target.value)}
            placeholder="e.g. usual bowl"
            maxLength={40}
            autoComplete="off"
          />
        </div>

        {editedSaved ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm">
              Save this change to the saved meal?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["none", "Just this time"],
                  ["version", "Update saved meal"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={change === value ? "default" : "outline"}
                  aria-pressed={change === value}
                  onClick={() => setChange(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}

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
        {draft.source === "cache" && draft.saved ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={onReestimate}
          >
            Re-estimate
          </Button>
        ) : null}
        {offline && !draft.fromQueue ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => startSaving(() => onQueue(queueEntry(null)))}
          >
            Finish later
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
            {[
              [
                item.quantity,
                item.portion !== 1 ? `× ${formatPortion(item.portion)}` : "",
              ]
                .filter(Boolean)
                .join(" "),
              `${macros.calories} kcal`,
              `${macros.protein_g}g protein`,
            ]
              .filter(Boolean)
              .join(" · ")}
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

type Flash = { name: string; logId: string | null; error?: string };

type Similar = {
  meal: SuggestedMeal;
  inputText: string;
  base: Pick<Draft, "clientId" | "typedAt" | "fromQueue">;
};

/** "Nov 12", or "today" / "yesterday" in the user's timezone. */
function shortDate(iso: string, timeZone: string): string {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const now = new Date();
  const then = new Date(iso);
  if (day(then) === day(now)) return "today";
  if (day(then) === day(new Date(now.getTime() - 86_400_000)))
    return "yesterday";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(then);
}

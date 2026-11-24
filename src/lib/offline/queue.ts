// Unsynced meal logs, kept in IndexedDB until the server has them.
// The server is the source of truth: entries are deleted once saved.

import type { DayChoice } from "@/lib/meals/meal-math";

export type QueuedItem = {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  portion: number;
  confidence: "high" | "medium" | "low" | null;
};

export type QueueEntry = {
  /** Becomes meal_logs.client_id, so a retried sync can't double-save. */
  clientId: string;
  userId: string;
  text: string;
  /** When it was typed; saved as logged_at. */
  queuedAt: string;
  day: DayChoice;
  source: "ai" | "manual";
  /** Null = only the line was saved; finish it when online. */
  items: QueuedItem[] | null;
  /** Set when the server rejected it (not for network errors). */
  error?: string;
};

const DB_NAME = "forkcast";
const STORE = "meal-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "clientId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const idbQueue = {
  async list(userId: string): Promise<QueueEntry[]> {
    const all = await withStore<QueueEntry[]>("readonly", (s) => s.getAll());
    return all
      .filter((e) => e.userId === userId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  },
  put: (entry: QueueEntry) => withStore("readwrite", (s) => s.put(entry)),
  remove: (clientId: string) =>
    withStore("readwrite", (s) => s.delete(clientId)),
};

export type SaveResult = { error?: string };

/**
 * Sends every complete entry to the server, oldest first. Saved entries are
 * removed; server rejections are kept with their error; a network failure
 * stops the run (still offline) and leaves the rest queued.
 */
export async function syncQueue(
  entries: QueueEntry[],
  deps: {
    save: (entry: QueueEntry & { items: QueuedItem[] }) => Promise<SaveResult>;
    remove: (clientId: string) => Promise<unknown>;
    put: (entry: QueueEntry) => Promise<unknown>;
  },
): Promise<{ saved: number; stoppedOffline: boolean }> {
  let saved = 0;
  for (const entry of entries) {
    if (!entry.items || entry.error) continue;
    let result: SaveResult;
    try {
      result = await deps.save({ ...entry, items: entry.items });
    } catch {
      return { saved, stoppedOffline: true };
    }
    if (result.error) {
      await deps.put({ ...entry, error: result.error });
    } else {
      await deps.remove(entry.clientId);
      saved++;
    }
  }
  return { saved, stoppedOffline: false };
}

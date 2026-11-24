import { describe, expect, it, vi } from "vitest";
import { syncQueue, type QueueEntry } from "./queue";

const entry = (
  clientId: string,
  patch: Partial<QueueEntry> = {},
): QueueEntry => ({
  clientId,
  userId: "u1",
  text: clientId,
  queuedAt: "2026-11-24T17:00:00.000Z",
  day: "today",
  source: "manual",
  items: [
    {
      name: "x",
      quantity: "",
      calories: 100,
      protein_g: 5,
      portion: 1,
      confidence: null,
    },
  ],
  ...patch,
});

function deps(save: (e: QueueEntry) => Promise<{ error?: string }>) {
  return {
    save: vi.fn(save),
    remove: vi.fn(async () => {}),
    put: vi.fn(async () => {}),
  };
}

describe("syncQueue", () => {
  it("saves complete entries and removes them", async () => {
    const d = deps(async () => ({}));
    const r = await syncQueue([entry("a"), entry("b")], d);
    expect(r).toEqual({ saved: 2, stoppedOffline: false });
    expect(d.remove.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("skips line-only entries and ones the server already rejected", async () => {
    const d = deps(async () => ({}));
    await syncQueue(
      [entry("line", { items: null }), entry("bad", { error: "x" })],
      d,
    );
    expect(d.save).not.toHaveBeenCalled();
  });

  it("keeps a rejected entry with its error", async () => {
    const d = deps(async () => ({ error: "Check the items and numbers." }));
    await syncQueue([entry("a")], d);
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.put).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "a",
        error: "Check the items and numbers.",
      }),
    );
  });

  it("stops on a network failure and leaves the rest queued", async () => {
    const d = deps(async (e) => {
      if (e.clientId === "b") throw new TypeError("Failed to fetch");
      return {};
    });
    const r = await syncQueue([entry("a"), entry("b"), entry("c")], d);
    expect(r).toEqual({ saved: 1, stoppedOffline: true });
    expect(d.remove.mock.calls).toEqual([["a"]]);
    expect(d.save).toHaveBeenCalledTimes(2);
  });
});

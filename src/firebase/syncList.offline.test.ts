import { describe, it, expect, vi, beforeEach } from "vitest";

// Offline first open (the owner's report, 2026-11-16 — a page that showed
// «nothing here» for lists that had never been read): offline, Firestore answers
// a list from its own cache, and on a device that has never read that list the
// cache holds nothing — an empty answer that only LOOKS like an empty list.
// `syncedList` must not hand it on as one.

const disk = vi.hoisted(() => ({ current: new Map<string, unknown>() }));
const server = vi.hoisted(() => ({ answer: { fromCache: true, docs: [] as { id: string; data: () => object }[] } }));

vi.mock("./config", () => ({ db: {} }));
vi.mock("../lib/readMeter", () => ({ meterRead: () => {} }));
vi.mock("../lib/localStore", () => ({
  localGet: async (key: string) => structuredClone(disk.current.get(key)),
  localSet: async (key: string, value: unknown) => void disk.current.set(key, structuredClone(value)),
  localDeletePrefix: async () => {},
}));
vi.mock("./firestoreApi", () => {
  class Timestamp {
    static fromMillis = (ms: number) => ({ ms });
  }
  return {
    collection: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    deleteField: () => ({}),
    updateDoc: async () => {},
    FieldPath: class {},
    Timestamp,
    getDoc: async () => ({ data: () => ({}), metadata: { fromCache: true } }),
    getDocs: async () => ({
      docs: server.answer.docs,
      size: server.answer.docs.length,
      empty: server.answer.docs.length === 0,
      metadata: { fromCache: server.answer.fromCache },
    }),
  };
});

import { NO_ANSWER_YET, syncedList } from "./syncList";

beforeEach(() => {
  disk.current = new Map();
  server.answer = { fromCache: true, docs: [] };
});

describe("syncedList, offline", () => {
  it("never read on this device and nothing in Firestore's cache: no answer yet — it fails (to be retried), it does not say «empty»", async () => {
    await expect(syncedList("bills", "u")).rejects.toMatchObject({ code: NO_ANSWER_YET });
    // Nothing stored either: the next start must still read it whole.
    expect(disk.current.size).toBe(0);
  });

  it("with this device's own copy: that copy, not the empty cache answer", async () => {
    // A copy due its weekly whole read, so the whole read is what runs.
    disk.current.set("sync:u:bills", { v: 1, rows: [{ id: "rent" }], cursor: 0, syncedAt: 0, fullAt: 0 });
    await expect(syncedList("bills", "u")).resolves.toEqual([{ id: "rent" }]);
  });

  it("whatever Firestore's cache does hold is shown, as before", async () => {
    server.answer = { fromCache: true, docs: [{ id: "rent", data: () => ({ name: "Rent" }) }] };
    await expect(syncedList("bills", "u")).resolves.toEqual([{ id: "rent", name: "Rent" }]);
  });

  it("online, the server's empty answer is a genuinely empty list — and is kept on the device", async () => {
    server.answer = { fromCache: false, docs: [] };
    await expect(syncedList("bills", "u")).resolves.toEqual([]);
    expect(disk.current.get("sync:u:bills")).toMatchObject({ rows: [] });
  });
});

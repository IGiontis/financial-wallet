import { describe, it, expect } from "vitest";
import { CLOCK_SKEW_MS, DELETE_LOG_KEEP_MS, expiredLogKeys, FULL_SYNC_EVERY_MS, logEntries, logKey, mergeChanges, needsFullSync, newestUpdate, SYNC_VERSION, type SyncState } from "./deltaSync";

// The rules that decide what a device holds after a sync. What can go wrong
// here is money shown that no longer exists (a delete that never arrives) or
// money missing that does (a record dropped as deleted when it was written
// again) — both checked from the record's side, not only the happy path.

interface Row {
  id: string;
  amount: number;
  updatedAt?: Date;
}

const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
const at = (ms: number) => new Date(T0 + ms);
const updatedMs = (row: Row) => row.updatedAt?.getTime() ?? 0;
const state = (over: Partial<SyncState<Row>> = {}): SyncState<Row> => ({ v: SYNC_VERSION, rows: [], cursor: T0, syncedAt: T0, fullAt: T0, ...over });
const total = (rows: Row[]) => Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;

describe("when the whole list is read", () => {
  it("the first time on a device, and when the copy is from another version", () => {
    expect(needsFullSync(undefined, T0)).toBe(true);
    expect(needsFullSync({ ...state(), v: SYNC_VERSION - 1 }, T0)).toBe(true);
    expect(needsFullSync(state(), T0 + 1000)).toBe(false);
  });

  it("once a week anyway", () => {
    expect(needsFullSync(state({ syncedAt: T0 + FULL_SYNC_EVERY_MS }), T0 + FULL_SYNC_EVERY_MS)).toBe(false);
    expect(needsFullSync(state({ syncedAt: T0 + FULL_SYNC_EVERY_MS }), T0 + FULL_SYNC_EVERY_MS + 1)).toBe(true);
  });

  it("when the device last asked longer ago than deletions are kept", () => {
    // Its last full read is recent, but the log may have dropped deletions it never saw.
    const s = state({ fullAt: T0 + DELETE_LOG_KEEP_MS, syncedAt: T0 });
    expect(needsFullSync(s, T0 + DELETE_LOG_KEEP_MS + 1)).toBe(true);
  });

  it("when another device cleared the data after this one last read it whole", () => {
    expect(needsFullSync(state(), T0 + 1000, T0 - 1)).toBe(false);
    expect(needsFullSync(state(), T0 + 1000, T0 + 500)).toBe(true);
  });
});

describe("merging what changed", () => {
  const held: Row[] = [
    { id: "a", amount: 10, updatedAt: at(-3_600_000) },
    { id: "b", amount: 20, updatedAt: at(-3_600_000) },
    { id: "c", amount: 30, updatedAt: at(-3_600_000) },
  ];

  it("replaces a changed record and adds a new one, once each", () => {
    const changed = [
      { id: "b", amount: 25, updatedAt: at(1000) },
      { id: "d", amount: 5, updatedAt: at(2000) },
      // The overlap before the cursor sends one back unchanged; it must not double.
      { id: "a", amount: 10, updatedAt: at(-3_600_000) },
    ];
    const rows = mergeChanges(held, changed, [], "transactions", updatedMs);

    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b", "c", "d"]);
    // Second way: the old total, less the old b, plus the new b and d.
    expect(total(rows)).toBe(60 - 20 + 25 + 5);
  });

  it("drops a record deleted on another device", () => {
    const rows = mergeChanges(held, [], [{ c: "transactions", id: "c", at: T0 }], "transactions", updatedMs);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(total(rows)).toBe(30);
  });

  it("ignores deletions from another collection", () => {
    const rows = mergeChanges(held, [], [{ c: "billPayments", id: "c", at: T0 }], "transactions", updatedMs);
    expect(rows).toHaveLength(3);
  });

  it("keeps a record written again under a deleted id — a debt's interest coming back", () => {
    // Deleted at T0, written again ten minutes later under the same id.
    const again = { id: "debtint_p1", amount: 4.12, updatedAt: at(10 * 60 * 1000) };
    const rows = mergeChanges(held, [again], [{ c: "transactions", id: "debtint_p1", at: T0 }], "transactions", updatedMs);
    expect(rows.find((r) => r.id === "debtint_p1")?.amount).toBe(4.12);
  });

  it("still drops a record the deleting device's clock put a little before its last change", () => {
    // The phone's clock runs a minute slow: its delete is stamped before the server's last update.
    const rows = mergeChanges([{ id: "x", amount: 7, updatedAt: at(60_000) }], [], [{ c: "transactions", id: "x", at: T0 }], "transactions", updatedMs);
    expect(rows).toEqual([]);
    expect(CLOCK_SKEW_MS).toBeGreaterThan(60_000);
  });

  it("does nothing for a deletion of something never held", () => {
    const rows = mergeChanges(held, [], [{ c: "transactions", id: "zzz", at: T0 }], "transactions", updatedMs);
    expect(rows).toEqual(held);
  });
});

describe("the cursor", () => {
  it("is the newest update held, and 0 for records that carry none", () => {
    expect(newestUpdate([{ id: "a", amount: 1, updatedAt: at(5) }, { id: "b", amount: 1, updatedAt: at(9) }, { id: "c", amount: 1 }], updatedMs)).toBe(T0 + 9);
    expect(newestUpdate([{ id: "c", amount: 1 }], updatedMs)).toBe(0);
  });
});

describe("the deletion log on the user's document", () => {
  it("reads back one entry per field, skipping anything malformed", () => {
    const log = { [logKey("transactions", "t1")]: T0, [logKey("transactions", "debt_x")]: T0 + 5, broken: T0, "transactions__t2": "yesterday" };
    expect(logEntries(log)).toEqual([
      { c: "transactions", id: "t1", at: T0 },
      { c: "transactions", id: "debt_x", at: T0 + 5 },
    ]);
    expect(logEntries(undefined)).toEqual([]);
  });

  it("drops entries only once they are older than the keeping time", () => {
    const log = { old: T0 - DELETE_LOG_KEEP_MS - 1, young: T0 - DELETE_LOG_KEEP_MS + 1, junk: "x" };
    expect(expiredLogKeys(log, T0).sort()).toEqual(["junk", "old"]);
  });
});

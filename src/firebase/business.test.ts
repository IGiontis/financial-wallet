import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteBusinessRecords, deleteClosing, deletedBeforeFailure, saveClosing } from "./business";
import { closingFigures, forBusiness, monthSummary, personalRecord } from "../features/business/businessSummary";
import { BUSINESS_CATEGORY_ID } from "../shared/utils/categories";
import type { BusinessEntry, BusinessEntryInput, Transaction } from "../shared/types/IndexTypes";

// «Δουλειά»'s data layer against a small in-memory Firestore that refuses, as
// the production rules do, to delete a document that is not there (and fails
// the whole batch with it) — the emulator and the demo do not, and hide it.
// What is pinned down: a day's closing and its record in the owner's own money
// (an income of the profit, an expense of a loss, nothing at 0 — filed under
// «Δουλειά», never a category of the user's, and no category ever written) are
// written, changed and deleted TOGETHER; deleting a business takes exactly its
// closings and their records, in batches of at most 450; and a batch never
// names a document already gone.
// The store below is the one in `firestore.test.ts`.

type Data = Record<string, unknown>;
interface Ref {
  kind: "doc";
  col: string;
  id: string;
}
type Op = ["set" | "update", Ref, Data] | ["delete", Ref];

const fs = vi.hoisted(() => {
  const store = new Map<string, Map<string, Data>>();
  const batches: Op[][] = [];
  let auto = 0;
  // As the security rules do: a delete of a document that is not there has no
  // owner to check, is refused, and fails the whole batch with it.
  const rules = { strictDeletes: false };
  const serverReads: string[] = [];
  const hooks: { afterServerRead?: (col: string) => void; pendingWrites?: () => void; beforeCommit?: (ops: Op[]) => void } = {};

  const table = (col: string) => {
    let t = store.get(col);
    if (!t) store.set(col, (t = new Map()));
    return t;
  };
  const ref = (col: string, id: string): Ref => ({ kind: "doc", col, id });
  const apply = (op: Op) => {
    const [kind, r] = op;
    if (kind === "delete") table(r.col).delete(r.id);
    else if (kind === "set") table(r.col).set(r.id, { ...op[2] });
    else {
      const current = table(r.col).get(r.id);
      if (!current) throw new Error(`No document to update: ${r.col}/${r.id}`);
      table(r.col).set(r.id, { ...current, ...op[2] });
    }
  };

  return {
    store,
    batches,
    table,
    rules,
    serverReads,
    hooks,
    reset: () => {
      store.clear();
      batches.length = 0;
      serverReads.length = 0;
      delete hooks.afterServerRead;
      delete hooks.pendingWrites;
      delete hooks.beforeCommit;
      auto = 0;
      rules.strictDeletes = false;
    },
    api: {
      collection: (_db: unknown, name: string) => ({ kind: "collection", col: name }),
      doc: (parent: { kind: string; col: string }, col?: string, id?: string) => (parent.kind === "collection" ? ref(parent.col, `auto-${++auto}`) : ref(col!, id!)),
      query: (col: { col: string }, ...filters: { field: string; value: unknown }[]) => ({ col: col.col, filters }),
      where: (field: string, op: string, value: unknown) => ({ field, op, value }),
      getDocs: async (q: { col: string; filters: { field: string; value: unknown }[] }) => {
        const docs = [...table(q.col).entries()]
          .filter(([, d]) => q.filters.every((f) => ((f as { op?: string }).op === "array-contains" ? Array.isArray(d[f.field]) && (d[f.field] as unknown[]).includes(f.value) : d[f.field] === f.value)))
          .map(([id, d]) => ({ id, ref: ref(q.col, id), data: () => d }));
        return { docs, size: docs.length };
      },
      getDoc: async (r: Ref) => ({ exists: () => table(r.col).has(r.id), data: () => table(r.col).get(r.id) }),
      // The server's answer: the same store here. `serverReads` lets a test
      // act between one read and the next, as another device would.
      getDocsFromServer: async (q: { col: string; filters: { field: string; value: unknown }[] }) => {
        const docs = [...table(q.col).entries()]
          .filter(([, d]) => q.filters.every((f) => ((f as { op?: string }).op === "array-contains" ? Array.isArray(d[f.field]) && (d[f.field] as unknown[]).includes(f.value) : d[f.field] === f.value)))
          .map(([id, d]) => ({ id, ref: ref(q.col, id), data: () => d }));
        serverReads.push(q.col);
        hooks.afterServerRead?.(q.col);
        return { docs, size: docs.length };
      },
      getDocFromServer: async (r: Ref) => {
        serverReads.push(`${r.col}/${r.id}`);
        return { exists: () => table(r.col).has(r.id), data: () => table(r.col).get(r.id) };
      },
      waitForPendingWrites: async () => {
        hooks.pendingWrites?.();
      },
      setDoc: async (r: Ref, d: Data) => apply(["set", r, d]),
      updateDoc: async (r: Ref, d: Data) => apply(["update", r, d]),
      deleteDoc: async (r: Ref) => {
        if (rules.strictDeletes && !table(r.col).has(r.id)) throw Object.assign(new Error("PERMISSION_DENIED"), { code: "permission-denied" });
        apply(["delete", r]);
      },
      addDoc: async (c: { col: string }, d: Data) => {
        const r = ref(c.col, `auto-${++auto}`);
        apply(["set", r, d]);
        return r;
      },
      writeBatch: () => {
        const ops: Op[] = [];
        return {
          set: (r: Ref, d: Data) => ops.push(["set", r, d]),
          update: (r: Ref, d: Data) => ops.push(["update", r, d]),
          delete: (r: Ref) => ops.push(["delete", r]),
          commit: async () => {
            hooks.beforeCommit?.(ops);
            if (rules.strictDeletes && ops.some(([kind, r]) => kind === "delete" && !table(r.col).has(r.id))) throw Object.assign(new Error("PERMISSION_DENIED"), { code: "permission-denied" });
            batches.push(ops);
            ops.forEach(apply);
          },
        };
      },
      serverTimestamp: () => "SERVER_TIME",
      deleteField: () => "DELETE_FIELD",
    },
  };
});

vi.mock("firebase/firestore", () => fs.api);
vi.mock("./config", () => ({ db: {} }));
// The delta sync's own bookkeeping is tested in `deltaSync.test.ts`; here
// only what reaches the collections matters.
const noted = vi.hoisted(() => ({ deleted: [] as [string, string, string[]][] }));
vi.mock("./syncList", () => ({
  syncedList: async () => [],
  noteDeleted: async (userId: string, name: string, ids: string[]) => void noted.deleted.push([userId, name, ids]),
  noteDeletions: async (userId: string, byList: Record<string, string[]>) => {
    for (const [name, ids] of Object.entries(byList)) if (ids.length > 0) noted.deleted.push([userId, name, ids]);
  },
  noteRecreated: async () => {},
  noteReset: async () => {},
}));



const put = (col: string, id: string, data: Data) => fs.table(col).set(id, data);
const get = (col: string, id: string) => fs.table(col).get(id);
const ids = (col: string) => [...fs.table(col).keys()].sort();
const opsOf = (ops: Op[]) => ops.map(([kind, r]) => `${kind} ${r.col}/${r.id}`).sort();

beforeEach(() => {
  fs.reset();
  noted.deleted.length = 0;
  fs.rules.strictDeletes = true;
});

const PH = "biz-pharmacy";
const MK = "biz-market";
const day = new Date(2026, 10, 12, 21);
/** A pharmacy's day: 520 + 280 in; 350 stock, 60 staff, 90 rent, 40 a one-off → 800 − 540 = 260 profit. */
const pharmacyDay: BusinessEntryInput = {
  businessId: PH,
  date: day,
  incomes: [
    { lineId: "till", amount: 520 },
    { lineId: "eopyy", amount: 280 },
  ],
  expenses: [
    { lineId: "stock", amount: 350 },
    { lineId: "staff", amount: 60 },
    { lineId: "rent", amount: 90, note: "μισό" },
    { name: "Επισκευή ψυγείου", amount: 40 },
  ],
  accountId: "acc-main",
};
const names: Record<string, string> = { [PH]: "Φαρμακείο", [MK]: "Λαϊκή" };
/** The record a closing's profit (or loss) writes in the owner's money — the app's own builder. */
const recordOf = (closing: BusinessEntryInput) => personalRecord(closing, (type) => `${type === "income" ? "Κέρδος" : "Ζημιά"} · ${names[closing.businessId]}`);
const create = (closing = pharmacyDay, entryId = "b1", txId = "t1") => {
  const data = recordOf(closing);
  return saveClosing("u1", { entryId, closing, personal: data ? { id: txId, data } : null });
};

describe("a day's closing", () => {
  it("is written with its profit as an income in ONE batch, each naming the other — and no category is written", async () => {
    await create();
    expect(fs.batches).toHaveLength(1);
    expect(opsOf(fs.batches[0])).toEqual(["set businessEntries/b1", "set transactions/t1"]);
    expect(get("businessEntries", "b1")).toMatchObject({
      userId: "u1",
      businessId: PH,
      linkedTransactionId: "t1",
      accountId: "acc-main",
      incomes: [
        { lineId: "till", amount: 520 },
        { lineId: "eopyy", amount: 280 },
      ],
      expenses: [{ lineId: "stock", amount: 350 }, { lineId: "staff", amount: 60 }, { lineId: "rent", amount: 90, note: "μισό" }, { name: "Επισκευή ψυγείου", amount: 40 }],
      lineIds: ["till", "eopyy", "stock", "staff", "rent"],
    });
    expect(get("businessEntries", "b1")).not.toHaveProperty("turnover");
    // The personal half is an income of the profit — (520 + 280) − (350 + 60 + 90 + 40) = 260 — under «Δουλειά».
    expect(get("transactions", "t1")).toMatchObject({ userId: "u1", type: "income", amount: 260, businessEntryId: "b1", businessId: PH, accountId: "acc-main", categoryId: BUSINESS_CATEGORY_ID, description: "Κέρδος · Φαρμακείο" });
    expect(ids("categories")).toEqual([]);
  });

  it("files the record under «Δουλειά» even when handed a category of the user's", async () => {
    const data = { ...recordOf(pharmacyDay)!, categoryId: "cat-user-salary" };
    await saveClosing("u1", { entryId: "b1", closing: pharmacyDay, personal: { id: "t1", data } });
    expect(get("transactions", "t1")!.categoryId).toBe(BUSINESS_CATEGORY_ID);
    expect(ids("categories")).toEqual([]);
  });

  it("writes a loss as an expense of the loss, covered from the owner's own money", async () => {
    // 300 in; 350 + 60 + 90 + 40 = 540 out → −240.
    const loss: BusinessEntryInput = { ...pharmacyDay, incomes: [{ lineId: "till", amount: 300 }] };
    await create(loss);
    expect(get("transactions", "t1")).toMatchObject({ type: "expense", amount: 240, categoryId: BUSINESS_CATEGORY_ID, businessEntryId: "b1", description: "Ζημιά · Φαρμακείο" });
  });

  it("writes no personal record at all for a day that came to zero", async () => {
    // 540 in, 540 out.
    await create({ ...pharmacyDay, incomes: [{ lineId: "till", amount: 540 }] });
    expect(opsOf(fs.batches[0])).toEqual(["set businessEntries/b1"]);
    expect(get("businessEntries", "b1")!.linkedTransactionId).toBeUndefined();
    expect(ids("transactions")).toEqual([]);
  });

  it("refuses more than 30 incomes or expenses — the rules' limit — before writing anything", async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ lineId: `l${i}`, amount: 1 }));
    await expect(create({ ...pharmacyDay, incomes: many })).rejects.toThrow();
    await expect(create({ ...pharmacyDay, expenses: many })).rejects.toThrow();
    expect(fs.batches).toHaveLength(0);
  });

  it("is corrected together with its record in one batch — profit flips to a loss, and the business changes", async () => {
    await create();
    // Moved to the market and corrected: 90 in; 150 produce, 25 fuel → −85.
    const moved: BusinessEntryInput = { businessId: MK, date: new Date(2026, 10, 11, 21), incomes: [{ lineId: "sales", amount: 90 }], expenses: [{ lineId: "produce", amount: 150 }, { lineId: "fuel", amount: 25 }], accountId: "acc-cash", notes: "" };
    await saveClosing("u1", { entryId: "b1", closing: moved, personal: { id: "t1", data: recordOf(moved)! }, editing: { previousTransactionId: "t1" } });
    expect(fs.batches).toHaveLength(2);
    expect(opsOf(fs.batches[1])).toEqual(["update businessEntries/b1", "update transactions/t1"]);
    expect(get("businessEntries", "b1")).toMatchObject({ businessId: MK, incomes: [{ lineId: "sales", amount: 90 }], lineIds: ["sales", "produce", "fuel"], accountId: "acc-cash", notes: "DELETE_FIELD", linkedTransactionId: "t1" });
    expect(get("transactions", "t1")).toMatchObject({ type: "expense", amount: 85, accountId: "acc-cash", categoryId: BUSINESS_CATEGORY_ID, businessId: MK, description: "Ζημιά · Λαϊκή", date: moved.date });
    // Still one record, never two: the owner's money holds −85, not +260 and −85.
    expect(ids("transactions")).toEqual(["t1"]);
  });

  it("corrected to zero, deletes its record — with the delete noted", async () => {
    await create();
    const zero = { ...pharmacyDay, incomes: [{ lineId: "till", amount: 540 }] };
    const result = await saveClosing("u1", { entryId: "b1", closing: zero, personal: null, editing: { previousTransactionId: "t1" } });
    expect(result.removedTransactionId).toBe("t1");
    expect(opsOf(fs.batches[1])).toEqual(["delete transactions/t1", "update businessEntries/b1"]);
    expect(get("businessEntries", "b1")!.linkedTransactionId).toBe("DELETE_FIELD");
    expect(ids("transactions")).toEqual([]);
    expect(noted.deleted).toEqual([["u1", "transactions", ["t1"]]]);
  });

  it("corrected to zero with its record already gone, names nothing missing — the strict rules would refuse the batch", async () => {
    await create();
    fs.table("transactions").delete("t1");
    await saveClosing("u1", { entryId: "b1", closing: { ...pharmacyDay, incomes: [{ lineId: "till", amount: 540 }] }, personal: null, editing: { previousTransactionId: "t1" } });
    expect(opsOf(fs.batches[1])).toEqual(["update businessEntries/b1"]);
    expect(noted.deleted).toEqual([]);
  });

  it("writes its record again when it was removed elsewhere, instead of failing the save", async () => {
    await create();
    fs.table("transactions").delete("t1"); // another device, or a reset of the transactions
    // 900 in, 540 out → +360.
    const more = { ...pharmacyDay, incomes: [{ lineId: "till", amount: 900 }] };
    const { recreated } = await saveClosing("u1", { entryId: "b1", closing: more, personal: { id: "t1", data: recordOf(more)! }, editing: { previousTransactionId: "t1" } });
    expect(recreated).toBe(true);
    expect(opsOf(fs.batches[1])).toEqual(["set transactions/t1", "update businessEntries/b1"]);
    expect(get("transactions", "t1")).toMatchObject({ userId: "u1", type: "income", amount: 360, businessEntryId: "b1", categoryId: BUSINESS_CATEGORY_ID });
  });

  it("corrected from zero to a profit, writes a new record", async () => {
    await create({ ...pharmacyDay, incomes: [{ lineId: "till", amount: 540 }] });
    // 600 in, 540 out → +60.
    const profit = { ...pharmacyDay, incomes: [{ lineId: "till", amount: 600 }] };
    await saveClosing("u1", { entryId: "b1", closing: profit, personal: { id: "t9", data: recordOf(profit)! }, editing: {} });
    expect(opsOf(fs.batches[1])).toEqual(["set transactions/t9", "update businessEntries/b1"]);
    expect(get("businessEntries", "b1")!.linkedTransactionId).toBe("t9");
    expect(get("transactions", "t9")).toMatchObject({ type: "income", amount: 60 });
  });

  it("is deleted with its record, both deletions noted in one call", async () => {
    await create();
    put("transactions", "t-other", { userId: "u1", amount: 5, type: "expense" });
    const { transactionId } = await deleteClosing("u1", "b1", "t1");
    expect(transactionId).toBe("t1");
    expect(ids("businessEntries")).toEqual([]);
    expect(ids("transactions")).toEqual(["t-other"]);
    expect(opsOf(fs.batches.at(-1)!)).toEqual(["delete businessEntries/b1", "delete transactions/t1"]);
    expect(noted.deleted).toEqual([
      ["u1", "businessEntries", ["b1"]],
      ["u1", "transactions", ["t1"]],
    ]);
  });

  it("with its record already gone, is deleted alone", async () => {
    await create();
    fs.table("transactions").delete("t1");
    const { transactionId } = await deleteClosing("u1", "b1", "t1");
    expect(transactionId).toBeUndefined();
    expect(opsOf(fs.batches.at(-1)!)).toEqual(["delete businessEntries/b1"]);
    expect(noted.deleted).toEqual([["u1", "businessEntries", ["b1"]]]);
  });

  it("the strict store really does refuse a batch naming a missing document — so the guards above are needed", async () => {
    const batch = fs.api.writeBatch();
    batch.delete({ kind: "doc", col: "transactions", id: "nope" });
    await expect(batch.commit()).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("deleting a business", () => {
  /** The pharmacy's three closings (two with records, one at zero), the market's one, and a stray record. */
  async function shop() {
    await create(pharmacyDay, "p1", "tp1"); // +260
    await create({ ...pharmacyDay, date: new Date(2026, 10, 13, 21), incomes: [{ lineId: "till", amount: 300 }] }, "p2", "tp2"); // −240
    await create({ ...pharmacyDay, date: new Date(2026, 10, 14, 21), incomes: [{ lineId: "till", amount: 540 }] }, "p3", "tp3"); // 0: no record
    await create({ businessId: MK, date: day, incomes: [{ lineId: "sales", amount: 300 }], expenses: [{ lineId: "produce", amount: 100 }], accountId: "acc-main" }, "m1", "tm1"); // +200
    // A record of the pharmacy whose closing went some other way (it carries the business).
    put("transactions", "tp-stray", { userId: "u1", businessId: PH, businessEntryId: "p-gone", type: "income", amount: 5 });
    // Another user's pharmacy, and the owner's own other money: never touched.
    put("businessEntries", "x1", { userId: "u2", businessId: PH });
    put("transactions", "tx1", { userId: "u2", businessId: PH, businessEntryId: "x1", type: "income", amount: 9 });
    put("transactions", "salary", { userId: "u1", type: "income", amount: 1720, categoryId: "cat-salary" });
    fs.batches.length = 0;
  }

  it("takes exactly its closings and their records, as the server has them, and says so once", async () => {
    await shop();
    const done = await deleteBusinessRecords("u1", PH);
    // 3 closings; 3 records (tp1, tp2 and the stray) — p3 at zero never had one.
    expect([...done.businessEntries].sort()).toEqual(["p1", "p2", "p3"]);
    expect([...done.transactions].sort()).toEqual(["tp-stray", "tp1", "tp2"]);
    expect(fs.batches).toHaveLength(1);
    expect(opsOf(fs.batches[0])).toEqual(["delete businessEntries/p1", "delete businessEntries/p2", "delete businessEntries/p3", "delete transactions/tp-stray", "delete transactions/tp1", "delete transactions/tp2"]);
    expect(ids("businessEntries")).toEqual(["m1", "x1"]);
    expect(ids("transactions")).toEqual(["salary", "tm1", "tx1"]);
    expect(noted.deleted).toEqual([
      ["u1", "businessEntries", ["p1", "p2", "p3"]],
      ["u1", "transactions", ["tp1", "tp2", "tp-stray"]],
    ]);
    // Read from the server, not the device's copy.
    expect(fs.serverReads).toEqual(["businessEntries", "transactions"]);
  });

  it("never names a closing the device still shows but the server no longer has", async () => {
    await shop();
    // Deleted on the phone a minute ago — this device's list still holds it.
    fs.table("businessEntries").delete("p2");
    fs.table("transactions").delete("tp2");
    const done = await deleteBusinessRecords("u1", PH);
    expect([...done.businessEntries].sort()).toEqual(["p1", "p3"]);
    expect([...done.transactions].sort()).toEqual(["tp-stray", "tp1"]);
    // The strict rules passed: nothing missing was named.
    expect(ids("businessEntries")).toEqual(["m1", "x1"]);
  });

  it("goes in batches of at most 450, each closing in the same batch as its record", async () => {
    for (let i = 0; i < 300; i++) {
      put("businessEntries", `e${i}`, { userId: "u1", businessId: PH, linkedTransactionId: `r${i}` });
      put("transactions", `r${i}`, { userId: "u1", businessId: PH, businessEntryId: `e${i}`, type: "income", amount: 1 });
    }
    const done = await deleteBusinessRecords("u1", PH);
    // 600 deletes: 450 (225 pairs) + 150 (75 pairs).
    expect(fs.batches.map((b) => b.length)).toEqual([450, 150]);
    for (const batch of fs.batches) {
      const here = new Set(batch.map(([, r]) => r.id));
      for (const [, r] of batch) if (r.col === "businessEntries") expect(here.has(`r${r.id.slice(1)}`)).toBe(true);
    }
    expect(done.businessEntries).toHaveLength(300);
    expect(done.transactions).toHaveLength(300);
    expect(ids("businessEntries")).toEqual([]);
    expect(ids("transactions")).toEqual([]);
  });

  it("failing part-way, tells what did go — and only that is in the sync's log", async () => {
    for (let i = 0; i < 300; i++) {
      put("businessEntries", `e${i}`, { userId: "u1", businessId: PH });
      put("transactions", `r${i}`, { userId: "u1", businessId: PH, businessEntryId: `e${i}`, type: "income", amount: 1 });
    }
    let commits = 0;
    fs.hooks.beforeCommit = () => {
      if (++commits === 2) throw Object.assign(new Error("UNAVAILABLE"), { code: "unavailable" });
    };
    const err = await deleteBusinessRecords("u1", PH).catch((e: unknown) => e);
    const done = deletedBeforeFailure(err)!;
    expect(done.businessEntries).toHaveLength(225);
    expect(done.transactions).toHaveLength(225);
    expect(ids("businessEntries")).toHaveLength(75);
    expect(noted.deleted.map(([, name, list]) => [name, list.length])).toEqual([
      ["businessEntries", 225],
      ["transactions", 225],
    ]);
  });

  it("with nothing written yet, deletes nothing and writes no log", async () => {
    const done = await deleteBusinessRecords("u1", "biz-new");
    expect(done).toEqual({ businessEntries: [], transactions: [] });
    expect(fs.batches).toHaveLength(0);
    expect(noted.deleted).toEqual([]);
  });
});

describe("the month's figures from what was written", () => {
  it("reconcile with the owner's money: the records add up to the month's profit — each business and «Όλες»", async () => {
    const days: BusinessEntryInput[] = [
      pharmacyDay, // +260
      { businessId: PH, date: new Date(2026, 10, 13, 21), incomes: [{ lineId: "till", amount: 640.5 }], expenses: [{ lineId: "stock", amount: 210.25 }], accountId: "acc-main" }, // +430,25
      { businessId: PH, date: new Date(2026, 10, 14, 21), incomes: [{ lineId: "till", amount: 120 }], expenses: [{ lineId: "tax", amount: 380 }], accountId: "acc-main" }, // −260
      { businessId: MK, date: new Date(2026, 10, 16, 21), incomes: [{ lineId: "sales", amount: 50 }], expenses: [{ lineId: "produce", amount: 50 }], accountId: "acc-main" }, // 0
      { businessId: MK, date: new Date(2026, 10, 18, 21), incomes: [{ lineId: "sales", amount: 310.4 }], expenses: [{ lineId: "produce", amount: 205.6 }], accountId: "acc-main" }, // +104,80
      // December's first minute: not November's.
      { businessId: MK, date: new Date(2026, 11, 1, 0, 0), incomes: [{ lineId: "sales", amount: 99 }], expenses: [], accountId: "acc-main" },
    ];
    for (const [i, closing] of days.entries()) await create(closing, `b${i}`, `t${i}`);
    const entries = [...fs.table("businessEntries").entries()].map(([id, d]) => ({ ...d, id }) as unknown as BusinessEntry);
    const personal = [...fs.table("transactions").values()] as unknown as Transaction[];
    const nov = new Date(2026, 10, 1);
    const novRecords = personal.filter((t) => new Date(t.date).getMonth() === 10);
    const signedCents = (rows: Transaction[]) => rows.reduce((s, t) => s + (t.type === "income" ? 1 : -1) * Math.round(t.amount * 100), 0);
    // By hand — pharmacy: 800 + 640,50 + 120 = 1.560,50 in; 540 + 210,25 + 380 = 1.130,25 out; 430,25.
    expect(monthSummary(forBusiness(entries, PH), nov)).toEqual({ turnover: 1560.5, expenses: 1130.25, profit: 430.25, days: 3 });
    // Market: 50 + 310,40 = 360,40 in; 50 + 205,60 = 255,60 out; 104,80.
    expect(monthSummary(forBusiness(entries, MK), nov)).toEqual({ turnover: 360.4, expenses: 255.6, profit: 104.8, days: 2 });
    // «Όλες»: 1.920,90 in; 1.385,85 out; 535,05; 5 days.
    expect(monthSummary(entries, nov)).toEqual({ turnover: 1920.9, expenses: 1385.85, profit: 535.05, days: 5 });
    // A second way: the owner's money — incomes in, expenses out — holds exactly each profit; the zero day wrote nothing.
    expect(novRecords).toHaveLength(4);
    expect(signedCents(novRecords)).toBe(53505);
    expect(signedCents(novRecords.filter((t) => t.businessId === PH))).toBe(43025);
    expect(signedCents(novRecords.filter((t) => t.businessId === MK))).toBe(10480);
    // Every record under «Δουλειά», none under a category of the user's.
    expect(personal.every((t) => t.categoryId === BUSINESS_CATEGORY_ID)).toBe(true);
    expect(closingFigures(entries.find((e) => e.id === "b0")!).profit).toBe(260);
  });
});

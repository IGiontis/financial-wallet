import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteClosing, moveBusinessCategory, saveClosing } from "./business";
import { closingFigures, monthSummary, personalMove } from "../features/business/businessSummary";
import type { BusinessEntry, BusinessEntryInput, CreateTransactionDTO, Transaction } from "../shared/types/IndexTypes";

// «Δουλειά»'s data layer against a small in-memory Firestore that refuses, as
// the production rules do, to delete a document that is not there (and fails
// the whole batch with it) — the emulator and the demo do not, and hide it.
// What is pinned down: a day's closing and its record in the owner's own money
// (an income of the profit, an expense of a loss, nothing at 0) are written,
// changed and deleted TOGETHER, and a batch never names a record already gone.
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
  const hooks: { afterServerRead?: (col: string) => void; pendingWrites?: () => void } = {};

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

const day = new Date(2026, 10, 12, 21);
/** The owner's own day: 800 in; 40 fuel, 350 stock, 50 the employee, 100 VAT + licence → 260 profit. */
const ownersDay: BusinessEntryInput = {
  date: day,
  turnover: 800,
  expenses: [
    { categoryId: "transport", amount: 40, note: "βενζίνη" },
    { categoryId: "goods", amount: 350 },
    { categoryId: "operating", amount: 50, note: "υπάλληλος" },
    { categoryId: "taxes", amount: 100, note: "ΦΠΑ + άδεια" },
  ],
  accountId: "acc-main",
};
/** The record a closing's profit (or loss) writes in the owner's money. */
const recordOf = (closing: BusinessEntryInput, categoryId: string): CreateTransactionDTO | null => {
  const move = personalMove(closingFigures(closing).profit);
  return move ? { amount: move.amount, type: move.type, categoryId, date: closing.date, description: "Κλείσιμο ημέρας", accountId: closing.accountId } : null;
};
const create = (closing = ownersDay, categoryId = "cat-profit") => {
  const data = recordOf(closing, categoryId);
  return saveClosing("u1", { entryId: "b1", closing, personal: data ? { id: "t1", data } : null });
};

describe("a day's closing", () => {
  it("is written with its profit as an income in ONE batch, each naming the other", async () => {
    await create();
    expect(fs.batches).toHaveLength(1);
    expect(opsOf(fs.batches[0])).toEqual(["set businessEntries/b1", "set transactions/t1"]);
    expect(get("businessEntries", "b1")).toMatchObject({ userId: "u1", turnover: 800, linkedTransactionId: "t1", accountId: "acc-main", categoryIds: ["transport", "goods", "operating", "taxes"] });
    expect((get("businessEntries", "b1")!.expenses as unknown[]).length).toBe(4);
    // The personal half is an income of the profit — 800 − 540 — that the rules accept.
    expect(get("transactions", "t1")).toMatchObject({ userId: "u1", type: "income", amount: 260, businessEntryId: "b1", accountId: "acc-main", categoryId: "cat-profit" });
  });

  it("makes the personal category in the same batch the first time", async () => {
    const data = recordOf(ownersDay, "cat-new")!;
    await saveClosing("u1", { entryId: "b1", closing: ownersDay, personal: { id: "t1", data }, newCategory: { id: "cat-new", data: { name: "Κέρδος δουλειάς", type: "income", icon: "🏪" } } });
    expect(fs.batches).toHaveLength(1);
    expect(opsOf(fs.batches[0])).toEqual(["set businessEntries/b1", "set categories/cat-new", "set transactions/t1"]);
    expect(get("categories", "cat-new")).toMatchObject({ userId: "u1", isDefault: false, type: "income", name: "Κέρδος δουλειάς" });
  });

  it("writes a loss as an expense of the loss, covered from the owner's own money", async () => {
    const loss: BusinessEntryInput = { ...ownersDay, turnover: 300 };
    await create(loss, "cat-loss");
    expect(get("transactions", "t1")).toMatchObject({ type: "expense", amount: 240, categoryId: "cat-loss", businessEntryId: "b1" });
  });

  it("writes no personal record at all for a day that came to zero", async () => {
    await create({ ...ownersDay, turnover: 540 });
    expect(opsOf(fs.batches[0])).toEqual(["set businessEntries/b1"]);
    expect(get("businessEntries", "b1")!.linkedTransactionId).toBeUndefined();
    expect(ids("transactions")).toEqual([]);
  });

  it("is corrected together with its record in one batch — the type flips when a profit becomes a loss", async () => {
    await create();
    const loss: BusinessEntryInput = { ...ownersDay, turnover: 300, accountId: "acc-cash", notes: "" };
    await saveClosing("u1", { entryId: "b1", closing: loss, personal: { id: "t1", data: recordOf(loss, "cat-loss")! }, editing: { previousTransactionId: "t1" } });
    expect(fs.batches).toHaveLength(2);
    expect(opsOf(fs.batches[1])).toEqual(["update businessEntries/b1", "update transactions/t1"]);
    expect(get("businessEntries", "b1")).toMatchObject({ turnover: 300, accountId: "acc-cash", notes: "DELETE_FIELD", linkedTransactionId: "t1" });
    expect(get("transactions", "t1")).toMatchObject({ type: "expense", amount: 240, accountId: "acc-cash", categoryId: "cat-loss" });
  });

  it("corrected to zero, deletes its record — with the delete noted", async () => {
    await create();
    const zero = { ...ownersDay, turnover: 540 };
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
    await saveClosing("u1", { entryId: "b1", closing: { ...ownersDay, turnover: 540 }, personal: null, editing: { previousTransactionId: "t1" } });
    expect(opsOf(fs.batches[1])).toEqual(["update businessEntries/b1"]);
    expect(noted.deleted).toEqual([]);
  });

  it("writes its record again when it was removed elsewhere, instead of failing the save", async () => {
    await create();
    fs.table("transactions").delete("t1"); // another device, or a reset of the transactions
    const more = { ...ownersDay, turnover: 900 };
    const { recreated } = await saveClosing("u1", { entryId: "b1", closing: more, personal: { id: "t1", data: recordOf(more, "cat-profit")! }, editing: { previousTransactionId: "t1" } });
    expect(recreated).toBe(true);
    expect(opsOf(fs.batches[1])).toEqual(["set transactions/t1", "update businessEntries/b1"]);
    expect(get("transactions", "t1")).toMatchObject({ userId: "u1", type: "income", amount: 360, businessEntryId: "b1" });
  });

  it("corrected from zero to a profit, writes a new record", async () => {
    await create({ ...ownersDay, turnover: 540 });
    const profit = { ...ownersDay, turnover: 600 };
    await saveClosing("u1", { entryId: "b1", closing: profit, personal: { id: "t9", data: recordOf(profit, "cat-profit")! }, editing: {} });
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

describe("moving a category's lines before it is deleted", () => {
  it("rewrites exactly this user's closings that name it, as the server has them, in one batch", async () => {
    put("businessEntries", "e1", { userId: "u1", turnover: 10, expenses: [{ categoryId: "old", amount: 3 }, { categoryId: "keep", amount: 2 }], categoryIds: ["old", "keep"] });
    put("businessEntries", "e2", { userId: "u1", turnover: 10, expenses: [{ categoryId: "old", amount: 4 }, { categoryId: "new", amount: 1 }], categoryIds: ["old", "new"] });
    put("businessEntries", "e3", { userId: "u1", turnover: 10, expenses: [{ categoryId: "keep", amount: 5 }], categoryIds: ["keep"] });
    put("businessEntries", "x1", { userId: "u2", turnover: 10, expenses: [{ categoryId: "old", amount: 6 }], categoryIds: ["old"] });
    const moved = await moveBusinessCategory("u1", "old", "new");
    expect(moved.map((m) => m.id).sort()).toEqual(["e1", "e2"]);
    expect(fs.batches).toHaveLength(1);
    expect(get("businessEntries", "e1")).toMatchObject({ expenses: [{ categoryId: "new", amount: 3 }, { categoryId: "keep", amount: 2 }], categoryIds: ["new", "keep"] });
    // Two lines now in one category: named once.
    expect(get("businessEntries", "e2")).toMatchObject({ expenses: [{ categoryId: "new", amount: 4 }, { categoryId: "new", amount: 1 }], categoryIds: ["new"] });
    expect(get("businessEntries", "e3")!.categoryIds).toEqual(["keep"]);
    expect(get("businessEntries", "x1")!.categoryIds).toEqual(["old"]);
    // The money is untouched: the same amounts, only filed elsewhere.
    expect((get("businessEntries", "e1")!.expenses as { amount: number }[]).reduce((s, l) => s + l.amount, 0)).toBe(5);
  });
});

describe("the month's figures from what was written", () => {
  it("reconcile with the owner's money: the records add up to the month's profit", async () => {
    const days: BusinessEntryInput[] = [
      ownersDay,
      { date: new Date(2026, 10, 13, 21), turnover: 640.5, expenses: [{ categoryId: "goods", amount: 210.25 }], accountId: "acc-main" },
      { date: new Date(2026, 10, 14, 21), turnover: 120, expenses: [{ categoryId: "taxes", amount: 380 }], accountId: "acc-main" },
      { date: new Date(2026, 10, 16, 21), turnover: 50, expenses: [{ categoryId: "goods", amount: 50 }], accountId: "acc-main" },
    ];
    for (const [i, closing] of days.entries()) {
      const data = recordOf(closing, "cat");
      await saveClosing("u1", { entryId: `b${i}`, closing, personal: data ? { id: `t${i}`, data } : null });
    }
    const entries = [...fs.table("businessEntries").entries()].map(([id, d]) => ({ ...d, id }) as unknown as BusinessEntry);
    const m = monthSummary(entries, new Date(2026, 10, 1));
    expect(m).toEqual({ turnover: 1610.5, expenses: 1180.25, profit: 430.25, days: 4 });
    // A second way: the owner's money — incomes in, expenses out — holds exactly the month's profit.
    const personal = [...fs.table("transactions").values()] as unknown as Transaction[];
    expect(personal).toHaveLength(3);
    expect(personal.reduce((s, t) => s + (t.type === "income" ? 1 : -1) * Math.round(t.amount * 100), 0)).toBe(Math.round(m.profit * 100));
  });
});

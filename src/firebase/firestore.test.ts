import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { goalHeldTotal } from "../features/accounts/accountsUtils";
import { computeGoalStats } from "../features/budget/investmentsUtils";
import type { InvestmentContribution, InvestmentGoal, Transaction } from "../shared/types/IndexTypes";
import { createContributionWithTransaction, createTransaction, deleteAllUserData, deleteContribution, deleteInvestmentGoal, deleteTransaction, markBillPaid, updateTransaction } from "./firestore";

// The data layer against a small in-memory Firestore.
//
// What these pin down is what gets *deleted together*: a goal with its
// contributions and their mirrored transactions, a bill's expense with its
// payment, an account with every collection that holds the user's data. Each
// of those used to leave something behind, and what it left behind kept
// counting — money "in goals" for a goal that no longer existed, a bill still
// "paid" by an expense that was gone.

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
    reset: () => {
      store.clear();
      batches.length = 0;
      auto = 0;
    },
    api: {
      collection: (_db: unknown, name: string) => ({ kind: "collection", col: name }),
      doc: (parent: { kind: string; col: string }, col?: string, id?: string) => (parent.kind === "collection" ? ref(parent.col, `auto-${++auto}`) : ref(col!, id!)),
      query: (col: { col: string }, ...filters: { field: string; value: unknown }[]) => ({ col: col.col, filters }),
      where: (field: string, _op: string, value: unknown) => ({ field, value }),
      getDocs: async (q: { col: string; filters: { field: string; value: unknown }[] }) => {
        const docs = [...table(q.col).entries()]
          .filter(([, d]) => q.filters.every((f) => d[f.field] === f.value))
          .map(([id, d]) => ({ id, ref: ref(q.col, id), data: () => d }));
        return { docs, size: docs.length };
      },
      getDoc: async (r: Ref) => ({ exists: () => table(r.col).has(r.id), data: () => table(r.col).get(r.id) }),
      setDoc: async (r: Ref, d: Data) => apply(["set", r, d]),
      updateDoc: async (r: Ref, d: Data) => apply(["update", r, d]),
      deleteDoc: async (r: Ref) => apply(["delete", r]),
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


const put = (col: string, id: string, data: Data) => fs.table(col).set(id, data);
const ids = (col: string) => [...fs.table(col).keys()].sort();
const rows = <T,>(col: string) => [...fs.table(col).entries()].map(([id, d]) => ({ ...d, id }) as T);

beforeEach(() => fs.reset());
afterEach(() => vi.restoreAllMocks());

// ─── A goal, and what it holds ───────────────────────────────────────────────

const day = (d: number) => new Date(2026, 5, d);

/** A contribution and its mirror, written the way `useAddContribution` writes them. */
function contribute(goalId: string, id: string, amount: number, type: "deposit" | "withdrawal", date: Date, fromGoalsPage: boolean, userId = "u1") {
  put("investmentContributions", `c-${id}`, { userId, goalId, amount, contributionType: type, date });
  put("transactions", `t-${id}`, {
    userId,
    amount,
    type: "investment",
    categoryId: "",
    date,
    description: goalId,
    isInvestmentTransaction: true,
    isGoalTransaction: fromGoalsPage,
    goalId,
    goalName: goalId,
    contributionType: type,
  });
}

function seedGoals() {
  const goal = (id: string, userId = "u1") => put("investmentGoals", id, { userId, name: id, goalType: "targeted", isActive: true, isCompleted: false, createdAt: day(1) });
  // A: a Goals-page goal holding €500 (600 in, 100 out).
  goal("gA");
  contribute("gA", "a1", 400, "deposit", day(2), true);
  contribute("gA", "a2", 200, "deposit", day(3), true);
  contribute("gA", "a3", 100, "withdrawal", day(4), true);
  // B: another Goals-page goal, €200.
  goal("gB");
  contribute("gB", "b1", 200, "deposit", day(2), true);
  // C: an Investments-page goal — its money has left for a broker, not "in goals".
  goal("gC");
  contribute("gC", "c1", 300, "deposit", day(2), false);
  // Someone else's goal with the same id must never be touched.
  put("transactions", "t-other", { userId: "u2", goalId: "gA", amount: 999, isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "deposit", date: day(2) });
  put("investmentContributions", "c-other", { userId: "u2", goalId: "gA", amount: 999, contributionType: "deposit", date: day(2) });
  // And an ordinary expense.
  put("transactions", "t-coffee", { userId: "u1", amount: 3, type: "expense", categoryId: "food", date: day(5), description: "Coffee" });
}

/**
 * The balance invariant: what Banks & cash counts as "in goals" is exactly
 * what the remaining Goals-page goals say they hold.
 */
function heldVsSaved() {
  const userTx = rows<Transaction>("transactions").filter((t) => t.userId === "u1");
  const contributions = rows<InvestmentContribution>("investmentContributions").filter((c) => c.userId === "u1");
  const goals = rows<InvestmentGoal>("investmentGoals").filter((g) => g.userId === "u1");
  // A goal is a Goals-page goal when its contributions were mirrored as goal transactions.
  const goalsPage = new Set(userTx.filter((t) => t.isGoalTransaction).map((t) => t.goalId));
  const saved = goals.filter((g) => goalsPage.has(g.id)).reduce((sum, g) => sum + computeGoalStats(g, contributions.filter((c) => c.goalId === g.id)).totalSaved, 0);
  return { held: goalHeldTotal(userTx), saved };
}

describe("deleteInvestmentGoal", () => {
  it("deletes the goal, its contributions and their mirrored transactions in one batch", async () => {
    seedGoals();

    const deleted = await deleteInvestmentGoal("u1", "gA");

    expect(fs.batches).toHaveLength(1);
    const deletedPaths = fs.batches[0].map(([, r]) => `${r.col}/${r.id}`).sort();
    expect(deletedPaths).toEqual(
      [
        "investmentContributions/c-a1",
        "investmentContributions/c-a2",
        "investmentContributions/c-a3",
        "investmentGoals/gA",
        "transactions/t-a1",
        "transactions/t-a2",
        "transactions/t-a3",
      ].sort(),
    );
    expect(deleted.contributionIds.sort()).toEqual(["c-a1", "c-a2", "c-a3"]);
    expect(deleted.transactionIds.sort()).toEqual(["t-a1", "t-a2", "t-a3"]);

    // Everything else stays: the other goals, their records, the coffee, and
    // another user's documents that happen to carry the same goal id.
    expect(ids("investmentGoals")).toEqual(["gB", "gC"]);
    expect(ids("investmentContributions")).toEqual(["c-b1", "c-c1", "c-other"]);
    expect(ids("transactions")).toEqual(["t-b1", "t-c1", "t-coffee", "t-other"]);
  });

  it("leaves nothing counted as 'in goals' for a goal that is gone", async () => {
    seedGoals();
    // Before: A's €500 and B's €200 — and Banks & cash agrees.
    expect(heldVsSaved()).toEqual({ held: 700, saved: 700 });

    await deleteInvestmentGoal("u1", "gA");

    // After: only B's €200, on both sides. Deleting the goal document alone
    // left `held` at 700 against `saved` 200 — €500 short on every balance.
    expect(heldVsSaved()).toEqual({ held: 200, saved: 200 });
  });

  it("stays under the 500-write batch limit, with the goal in the last batch", async () => {
    put("investmentGoals", "gBig", { userId: "u1", name: "Big", goalType: "targeted", isActive: true, isCompleted: false, createdAt: day(1) });
    for (let i = 0; i < 300; i++) contribute("gBig", `n${i}`, 10, "deposit", day(2), true);

    await deleteInvestmentGoal("u1", "gBig");

    expect(fs.batches.length).toBeGreaterThan(1);
    for (const batch of fs.batches) expect(batch.length).toBeLessThan(500);
    // A failure part-way leaves the goal on screen to be deleted again.
    const last = fs.batches.at(-1)!;
    expect(last.at(-1)![1]).toEqual({ kind: "doc", col: "investmentGoals", id: "gBig" });
    expect(ids("investmentGoals")).toEqual([]);
    expect(ids("investmentContributions")).toEqual([]);
    expect(ids("transactions")).toEqual([]);
  });

  it("refuses without a connection, and deletes nothing", async () => {
    seedGoals();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await expect(deleteInvestmentGoal("u1", "gA")).rejects.toThrow(/connection/);
    expect(fs.batches).toHaveLength(0);
    expect(ids("investmentGoals")).toEqual(["gA", "gB", "gC"]);
  });
});

describe("deleteContribution", () => {
  it("takes exactly one matching mirror with it", async () => {
    // Two identical deposits on the same day are interchangeable: one goes.
    contribute("gA", "x1", 50, "deposit", day(2), true);
    contribute("gA", "x2", 50, "deposit", day(2), true);
    // Same goal, different amount or day or direction: not its mirror.
    contribute("gA", "y1", 60, "deposit", day(2), true);
    contribute("gA", "y2", 50, "deposit", day(3), true);
    contribute("gA", "y3", 50, "withdrawal", day(2), true);

    const result = await deleteContribution("u1", { id: "c-x1", userId: "u1", goalId: "gA", amount: 50, contributionType: "deposit", date: day(2) } as InvestmentContribution);

    expect(fs.batches).toHaveLength(1);
    expect(ids("investmentContributions")).not.toContain("c-x1");
    expect(["t-x1", "t-x2"]).toContain(result.transactionId);
    // One of the pair is gone, the other and every non-match remain.
    expect(ids("transactions").filter((id) => id === "t-x1" || id === "t-x2")).toHaveLength(1);
    expect(ids("transactions")).toEqual(expect.arrayContaining(["t-y1", "t-y2", "t-y3"]));
  });

  it("deletes the contribution alone when it never had a mirror", async () => {
    put("investmentContributions", "c-old", { userId: "u1", goalId: "gA", amount: 20, contributionType: "deposit", date: day(1) });

    const result = await deleteContribution("u1", { id: "c-old", userId: "u1", goalId: "gA", amount: 20, contributionType: "deposit", date: day(1) } as InvestmentContribution);

    expect(result.transactionId).toBeNull();
    expect(ids("investmentContributions")).toEqual([]);
  });
});

// ─── A bill's expense and its payment ────────────────────────────────────────

function seedPaidBill() {
  put("bills", "b1", { userId: "u1", name: "Power", amount: 80 });
  put("transactions", "t-bill", { userId: "u1", amount: 80, type: "expense", categoryId: "c1", date: day(10), description: "Power", billId: "b1" });
  put("billPayments", "p1", { userId: "u1", billId: "b1", periodKey: "2026-06", amount: 80, paidDate: day(10), transactionId: "t-bill" });
  put("billPayments", "p-other", { userId: "u1", billId: "b1", periodKey: "2026-05", amount: 75, paidDate: day(1), transactionId: "t-may" });
}

describe("deleteTransaction", () => {
  it("deletes a bill's expense and its payment in one batch", async () => {
    seedPaidBill();

    await deleteTransaction("t-bill", { userId: "u1", paymentId: "p1" });

    expect(fs.batches).toHaveLength(1);
    expect(ids("transactions")).toEqual([]);
    expect(ids("billPayments")).toEqual(["p-other"]);
  });

  it("finds the payment by its transaction when the screen did not know it", async () => {
    seedPaidBill();

    await deleteTransaction("t-bill", { userId: "u1" });

    expect(ids("billPayments")).toEqual(["p-other"]);
    expect(ids("transactions")).toEqual([]);
  });

  it("deletes an ordinary expense on its own", async () => {
    seedPaidBill();
    put("transactions", "t-coffee", { userId: "u1", amount: 3, type: "expense" });

    await deleteTransaction("t-coffee");

    expect(ids("transactions")).toEqual(["t-bill"]);
    expect(ids("billPayments")).toEqual(["p-other", "p1"]);
  });

  it("refuses without a connection", async () => {
    seedPaidBill();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await expect(deleteTransaction("t-bill", { userId: "u1", paymentId: "p1" })).rejects.toThrow(/connection/);
    expect(ids("billPayments")).toEqual(["p-other", "p1"]);
  });
});

describe("updateTransaction", () => {
  it("corrects a bill's payment with its expense, leaving the period alone", async () => {
    seedPaidBill();

    await updateTransaction("t-bill", { amount: 95, date: day(12), description: "Power (June)" }, { userId: "u1", paymentId: "p1" });

    expect(fs.batches).toHaveLength(1);
    expect(fs.table("transactions").get("t-bill")).toMatchObject({ amount: 95, date: day(12), description: "Power (June)" });
    expect(fs.table("billPayments").get("p1")).toMatchObject({ amount: 95, paidDate: day(12), periodKey: "2026-06" });
    // The other month's payment is not this expense's.
    expect(fs.table("billPayments").get("p-other")).toMatchObject({ amount: 75 });
  });

  it("leaves payments alone for an ordinary transaction", async () => {
    seedPaidBill();
    put("transactions", "t-coffee", { userId: "u1", amount: 3, type: "expense" });

    await updateTransaction("t-coffee", { amount: 4 });

    expect(fs.batches).toHaveLength(0);
    expect(fs.table("transactions").get("t-coffee")).toMatchObject({ amount: 4 });
    expect(fs.table("billPayments").get("p1")).toMatchObject({ amount: 80 });
  });
});

// ─── Ids chosen before the write ─────────────────────────────────────────────

describe("creating under an id made up front", () => {
  it("writes each document under the id the screen already shows", async () => {
    const id = await createTransaction("u1", { amount: 5, type: "expense", categoryId: "c", date: day(1), description: "Bread" }, "tx-chosen");
    expect(id).toBe("tx-chosen");
    expect(fs.table("transactions").get("tx-chosen")).toMatchObject({ userId: "u1", amount: 5 });

    await markBillPaid("u1", { id: "b1", name: "Power", amount: 80, categoryId: "c1" }, "2026-06", day(10), undefined, undefined, { paymentId: "pay-chosen", transactionId: "tx-bill-chosen" });
    expect(fs.table("billPayments").get("pay-chosen")).toMatchObject({ transactionId: "tx-bill-chosen", amount: 80 });
    expect(fs.table("transactions").get("tx-bill-chosen")).toMatchObject({ billId: "b1", amount: 80 });

    await createContributionWithTransaction(
      "u1",
      { goalId: "gA", amount: 50, contributionType: "deposit", date: day(2) },
      { amount: 50, type: "investment", categoryId: "", date: day(2), description: "A", goalId: "gA" },
      { contributionId: "c-chosen", transactionId: "t-chosen" },
    );
    expect(ids("investmentContributions")).toEqual(["c-chosen"]);
    expect(fs.table("transactions").get("t-chosen")).toMatchObject({ goalId: "gA" });
  });
});

// ─── Account deletion ────────────────────────────────────────────────────────

describe("deleteAllUserData", () => {
  it("removes debts and their repayments along with everything else", async () => {
    for (const col of ["transactions", "investmentGoals", "investmentContributions", "budgets", "categories", "bills", "billPayments", "debts", "debtPayments"]) {
      put(col, `${col}-mine`, { userId: "u1" });
      put(col, `${col}-theirs`, { userId: "u2" });
    }
    put("users", "u1", { id: "u1" });

    await deleteAllUserData("u1");

    for (const col of ["transactions", "investmentGoals", "investmentContributions", "budgets", "categories", "bills", "billPayments", "debts", "debtPayments"]) {
      expect(ids(col)).toEqual([`${col}-theirs`]);
    }
    expect(ids("users")).toEqual([]);
  });
});

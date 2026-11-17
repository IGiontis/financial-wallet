import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { expectedByAccount, goalHeldTotal, projectedTotal, readCheckIns, type BalanceCheckIn, type MoneyAccount } from "../features/accounts/accountsUtils";
import { committedSplit, monthlyFlows } from "../features/analytics/analyticsUtils";
import { calculateMetrics, calculateMoneyLeft } from "../features/overview/overviewUtils";
import { buildLedger } from "../features/transactions/ledger";
import { computeGoalStats } from "../features/budget/investmentsUtils";
import type { InvestmentContribution, InvestmentGoal, Transaction } from "../shared/types/IndexTypes";
import { OWNED_COLLECTIONS } from "./ownedCollections";
import { ACCOUNT_DELETING, endAccountDeletion } from "./deletionGate";
import { createCategories, createUser, saveWorkspaceValue } from "./firestore";
import { createContributionWithTransaction, createTransaction, deleteAllUserData,deleteBill, deleteContribution, deleteInvestmentGoal, deleteTransaction, deleteTransfer, markBillPaid, syncDebtCash, unmarkBillPaid, updateBillPayment, updateTransaction } from "./firestore";
import type { DebtCashRecord } from "../features/debts/debtCash";
import { allDebtCashIds, debtCashRecords } from "../features/debts/debtCash";
import { closeInvestmentGoal, CoveredRepaidError, createCoveredFunding, deleteClosedDebts, deleteCoveredDebt, getDebtsByIds, type CoveredErase } from "./firestore";
import { computeDebtStatus, debtsByPerson } from "../features/debts/debtsUtils";
import { coveredFundingVars } from "../features/budget/coveredFunding";
import { goalLoans } from "../features/budget/goalLoans";
import { closingRecords } from "../features/budget/goalHolding";
import type { Debt, DebtPayment } from "../shared/types/IndexTypes";
import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { investmentKeys, useDeleteGoal } from "../features/budget/useInvestments";

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
  // As the security rules do: a delete of a document that is not there has no
  // owner to check, is refused, and fails the whole batch with it.
  const rules = { strictDeletes: false, deniedCollections: new Set<string>() };
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
      rules.deniedCollections.clear();
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
      // The server's answer: the same store here. `serverReads` lets a test
      // act between one read and the next, as another device would.
      getDocsFromServer: async (q: { col: string; filters: { field: string; value: unknown }[] }) => {
        // A collection the live rules have no block for: every read of it is refused.
        if (rules.deniedCollections.has(q.col)) throw Object.assign(new Error("PERMISSION_DENIED"), { code: "permission-denied" });
        const docs = [...table(q.col).entries()]
          .filter(([, d]) => q.filters.every((f) => d[f.field] === f.value))
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
vi.mock("../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));
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

  // The owner's report (2026-11-12): «delete goal» pressed again while the
  // first delete was still running → an error, although the goal was gone.
  // A second run names the goal the first one already deleted; the live rules
  // refuse a delete of a missing document and fail the whole batch. Why the
  // screen must never start it twice — `useOnceMutation`, `DeleteButton`.
  describe("run twice (a second press while the first is running)", () => {
    it("the second run is refused although the first deleted everything", async () => {
      seedGoals();
      fs.rules.strictDeletes = true;

      const first = deleteInvestmentGoal("u1", "gA");
      const second = deleteInvestmentGoal("u1", "gA");

      await expect(first).resolves.toBeDefined();
      await expect(second).rejects.toMatchObject({ code: "permission-denied" });
      // …and yet the goal and all it held went with the first.
      expect(ids("investmentGoals")).toEqual(["gB", "gC"]);
      expect(ids("investmentContributions")).toEqual(["c-b1", "c-c1", "c-other"]);
    });

    it("a run after the first one finished is refused too: the goal it names is gone", async () => {
      seedGoals();
      fs.rules.strictDeletes = true;

      await deleteInvestmentGoal("u1", "gA");
      await expect(deleteInvestmentGoal("u1", "gA")).rejects.toMatchObject({ code: "permission-denied" });
      expect(fs.batches).toHaveLength(1);
    });
  });

  // The fix, through the screen's own hook (`useDeleteGoal` → `useOnceMutation`)
  // against the same strict rules: the second press is never a second batch.
  describe("from the screen (useDeleteGoal), under the live rules", () => {
    const setup = () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      const goals = rows<InvestmentGoal>("investmentGoals").filter((g) => g.userId === "u1");
      client.setQueryData(investmentKeys.goals("u1"), goals);
      const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
      const { result } = renderHook(() => useDeleteGoal(), { wrapper });
      const listed = () => (client.getQueryData<InvestmentGoal[]>(investmentKeys.goals("u1")) ?? []).map((g) => g.id).sort();
      return { result, listed };
    };

    it("pressed twice while it runs: one batch, both presses hear the same success, no error", async () => {
      seedGoals();
      fs.rules.strictDeletes = true;
      const { result, listed } = setup();

      let first!: Promise<unknown>;
      let second!: Promise<unknown>;
      act(() => {
        first = result.current.mutateAsync("gA");
        second = result.current.mutateAsync("gA");
      });
      await act(async () => {
        await expect(first).resolves.toBeDefined();
        await expect(second).resolves.toBeDefined();
      });

      expect(fs.batches).toHaveLength(1);
      expect(ids("investmentGoals")).toEqual(["gB", "gC"]);
      expect(listed()).toEqual(["gB", "gC"]);
    });

    it("refused (offline): it says so, and the goal stays on screen and in the store", async () => {
      seedGoals();
      fs.rules.strictDeletes = true;
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      const { result, listed } = setup();

      let attempt!: Promise<unknown>;
      act(() => {
        attempt = result.current.mutateAsync("gA");
      });
      await act(async () => {
        await expect(attempt).rejects.toThrow(/connection/);
      });

      expect(fs.batches).toHaveLength(0);
      expect(listed()).toEqual(["gA", "gB", "gC"]);
      expect(ids("investmentGoals")).toEqual(["gA", "gB", "gC"]);
    });
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

    await deleteTransaction("u1", "t-bill", { userId: "u1", paymentId: "p1" });

    expect(fs.batches).toHaveLength(1);
    expect(ids("transactions")).toEqual([]);
    expect(ids("billPayments")).toEqual(["p-other"]);
  });

  it("still deletes the expense when another device already removed the payment the screen knew", async () => {
    seedPaidBill();
    fs.rules.strictDeletes = true; // production: a missing document fails the batch
    fs.table("billPayments").delete("p1");

    await deleteTransaction("u1", "t-bill", { userId: "u1", paymentId: "p1" });

    expect(ids("transactions")).toEqual([]);
    expect(ids("billPayments")).toEqual(["p-other"]);
  });

  it("finds the payment by its transaction when the screen did not know it", async () => {
    seedPaidBill();

    await deleteTransaction("u1", "t-bill", { userId: "u1" });

    expect(ids("billPayments")).toEqual(["p-other"]);
    expect(ids("transactions")).toEqual([]);
  });

  it("deletes an ordinary expense on its own", async () => {
    seedPaidBill();
    put("transactions", "t-coffee", { userId: "u1", amount: 3, type: "expense" });

    noted.deleted.length = 0;
    await deleteTransaction("u1", "t-coffee");

    expect(ids("transactions")).toEqual(["t-bill"]);
    expect(ids("billPayments")).toEqual(["p-other", "p1"]);
    // Other devices are told, or they would go on showing it.
    expect(noted.deleted).toEqual([["u1", "transactions", ["t-coffee"]]]);
  });

  it("refuses without a connection", async () => {
    seedPaidBill();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await expect(deleteTransaction("u1", "t-bill", { userId: "u1", paymentId: "p1" })).rejects.toThrow(/connection/);
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

// ─── Deleting a bill: its payments go, its expenses stay ─────────────────────

describe("deleteBill", () => {
  const ACCOUNTS: MoneyAccount[] = [
    { id: "eb", name: "Eurobank", kind: "bank", main: true },
    { id: "rev", name: "Revolut", kind: "bank" },
  ];
  // Read at noon on the 1st, before every record below.
  const CHECK_IN: BalanceCheckIn = { id: "ci", at: new Date(2026, 5, 1, 12).toISOString(), amounts: { eb: 400, rev: 100 } };

  /** Power: three paid months and one settled outside the app; Water: one; plus a coffee and a salary. */
  function seedBills() {
    put("bills", "b1", { userId: "u1", name: "Power", amount: 80 });
    put("bills", "b2", { userId: "u1", name: "Water", amount: 30 });
    const paid = (paymentId: string, txId: string, billId: string, amount: number, d: number, periodKey: string, accountId?: string) => {
      put("transactions", txId, { userId: "u1", amount, type: "expense", categoryId: "utilities", date: day(d), description: billId, billId, ...(accountId ? { accountId } : {}) });
      put("billPayments", paymentId, { userId: "u1", billId, periodKey, amount, paidDate: day(d), transactionId: txId });
    };
    paid("p1", "t1", "b1", 80, 2, "2026-03");
    paid("p2", "t2", "b1", 75, 3, "2026-04", "rev");
    paid("p3", "t3", "b1", 92, 4, "2026-05");
    // Settled outside the app: a payment with no expense behind it.
    put("billPayments", "p4", { userId: "u1", billId: "b1", periodKey: "2026-02", amount: 80, paidDate: day(1) });
    paid("pw", "tw", "b2", 30, 5, "2026-06");
    put("transactions", "t-coffee", { userId: "u1", amount: 3, type: "expense", categoryId: "food", date: day(6), description: "Coffee" });
    put("transactions", "t-salary", { userId: "u1", amount: 1000, type: "income", categoryId: "salary", date: day(7), description: "Salary" });
    // Someone else's payment under the same bill id is never touched.
    put("billPayments", "p-theirs", { userId: "u2", billId: "b1", periodKey: "2026-03", amount: 50, paidDate: day(2) });
  }

  /** Every figure the screens show, from the app's own functions. */
  function screens() {
    const txs = rows<Transaction>("transactions").filter((t) => t.userId === "u1");
    const metrics = calculateMetrics(txs);
    const ledger = buildLedger(txs, { from: day(1), to: day(30), now: day(30) });
    const latest = readCheckIns([CHECK_IN], ACCOUNTS, txs).at(-1)!;
    const committed = committedSplit(txs, monthlyFlows(txs, day(1), day(30)));
    return {
      overview: { income: metrics.totalIncome, expenses: metrics.totalExpenses, left: calculateMoneyLeft(txs) },
      transactions: { in: ledger.in, out: ledger.out, net: ledger.net, count: ledger.count },
      accounts: { total: projectedTotal(latest, txs), byAccount: expectedByAccount(ACCOUNTS, latest, txs) },
      analytics: { committed: committed.reduce((s, m) => s + m.committed, 0), free: committed.reduce((s, m) => s + m.free, 0) },
    };
  }

  /** The same figures summed by hand from the records seeded above. */
  const BY_HAND = (() => {
    const bills = 80 + 75 + 92 + 30;
    const expenses = bills + 3;
    return {
      overview: { income: 1000, expenses, left: 1000 - expenses },
      transactions: { in: 1000, out: expenses, net: 1000 - expenses, count: 6 },
      // Revolut paid the €75; every other record lands on the main account.
      accounts: { total: 400 + 100 + 1000 - expenses, byAccount: { eb: 400 + 1000 - (expenses - 75), rev: 100 - 75 } },
      analytics: { committed: bills, free: 3 },
    };
  })();

  it("deletes the bill and all its payments in one batch, and leaves every expense", async () => {
    seedBills();
    const expensesBefore = rows("transactions");

    const { paymentIds } = await deleteBill("u1", "b1");

    expect(fs.batches).toHaveLength(1);
    expect(fs.batches[0].map(([kind, r]) => `${kind} ${r.col}/${r.id}`)).toEqual([
      "delete billPayments/p1",
      "delete billPayments/p2",
      "delete billPayments/p3",
      "delete billPayments/p4",
      "delete bills/b1",
    ]);
    expect(paymentIds.sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(ids("bills")).toEqual(["b2"]);
    expect(ids("billPayments")).toEqual(["p-theirs", "pw"]);
    // The expenses are untouched, field for field — `billId` included.
    expect(rows("transactions")).toEqual(expensesBefore);
    expect(fs.table("transactions").get("t1")).toMatchObject({ billId: "b1", amount: 80 });
  });

  it("changes no total on Overview, Transactions, Banks & cash or Analytics", async () => {
    seedBills();
    expect(screens()).toEqual(BY_HAND);

    await deleteBill("u1", "b1");

    // Before and after both agree with the sum by hand.
    expect(screens()).toEqual(BY_HAND);
  });

  it("does not fail when another device already deleted one of the payments", async () => {
    seedBills();
    fs.rules.strictDeletes = true; // production: a missing document fails the batch
    fs.table("billPayments").delete("p2"); // this device's list still shows it

    const { paymentIds } = await deleteBill("u1", "b1");

    expect(paymentIds.sort()).toEqual(["p1", "p3", "p4"]);
    expect(fs.batches.flat().map(([, r]) => r.id)).not.toContain("p2");
    expect(ids("bills")).toEqual(["b2"]);
    expect(ids("billPayments")).toEqual(["p-theirs", "pw"]);
    expect(screens()).toEqual(BY_HAND);
  });

  it("tells other devices exactly what it removed, after the commit", async () => {
    seedBills();
    noted.deleted.length = 0;

    await deleteBill("u1", "b1");

    const logged = Object.fromEntries(noted.deleted.map(([user, list, listIds]) => [`${user} ${list}`, [...listIds].sort()]));
    expect(logged).toEqual({ "u1 bills": ["b1"], "u1 billPayments": ["p1", "p2", "p3", "p4"] });
    // A second way: what the log names is what left the store, and nothing else did.
    const removed = (col: string, before: string[]) => before.filter((id) => !ids(col).includes(id));
    expect(removed("billPayments", ["p1", "p2", "p3", "p4", "p-theirs", "pw"])).toEqual(logged["u1 billPayments"]);
    expect(removed("transactions", ["t1", "t2", "t3", "tw", "t-coffee", "t-salary"])).toEqual([]);
  });

  it("logs nothing when the batch is refused", async () => {
    seedBills();
    fs.rules.strictDeletes = true;
    fs.table("bills").delete("b1"); // gone already: the rules refuse the batch
    noted.deleted.length = 0;

    await expect(deleteBill("u1", "b1")).rejects.toThrow(/PERMISSION_DENIED/);
    expect(noted.deleted).toEqual([]);
    expect(ids("billPayments")).toEqual(["p-theirs", "p1", "p2", "p3", "p4", "pw"]);
  });

  it("deletes a bill never paid on its own, logging no payments", async () => {
    put("bills", "b9", { userId: "u1", name: "New", amount: 10 });
    noted.deleted.length = 0;

    const { paymentIds } = await deleteBill("u1", "b9");

    expect(paymentIds).toEqual([]);
    expect(fs.batches.map((b) => b.map(([, r]) => `${r.col}/${r.id}`))).toEqual([["bills/b9"]]);
    expect(noted.deleted).toEqual([["u1", "bills", ["b9"]]]);
  });

  it("stays under the 500-write batch limit, with the bill in the last batch", async () => {
    put("bills", "bBig", { userId: "u1", name: "Rent", amount: 500 });
    for (let i = 0; i < 600; i++) put("billPayments", `pb${i}`, { userId: "u1", billId: "bBig", periodKey: `k${i}`, amount: 1, paidDate: day(1) });

    await deleteBill("u1", "bBig");

    expect(fs.batches.length).toBeGreaterThan(1);
    for (const batch of fs.batches) expect(batch.length).toBeLessThan(500);
    expect(fs.batches.at(-1)!.at(-1)![1]).toEqual({ kind: "doc", col: "bills", id: "bBig" });
    expect(fs.batches.flat()).toHaveLength(601);
    expect(ids("billPayments")).toEqual([]);
  });

  it("refuses without a connection, and deletes nothing", async () => {
    seedBills();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await expect(deleteBill("u1", "b1")).rejects.toThrow(/connection/);
    expect(fs.batches).toHaveLength(0);
    expect(ids("billPayments")).toEqual(["p-theirs", "p1", "p2", "p3", "p4", "pw"]);
  });

  it("leaves expenses that edit and delete on their own once their bill is gone", async () => {
    seedBills();
    await deleteBill("u1", "b1");
    fs.rules.strictDeletes = true;
    fs.batches.length = 0;

    // What `useTransactions` sends for a row with a `billId` and no payment on screen.
    await updateTransaction("t1", { amount: 81 }, { userId: "u1" });
    await deleteTransaction("u1", "t3", { userId: "u1" });

    expect(fs.table("transactions").get("t1")).toMatchObject({ amount: 81, billId: "b1" });
    expect(ids("transactions")).not.toContain("t3");
    expect(fs.batches.flat().map(([kind, r]) => `${kind} ${r.col}/${r.id}`)).toEqual(["update transactions/t1", "delete transactions/t3"]);
    expect(ids("billPayments")).toEqual(["p-theirs", "pw"]);
  });

  it("leaves account deletion able to remove everything that is left", async () => {
    seedBills();
    put("users", "u1", { id: "u1" });
    await deleteBill("u1", "b1");
    fs.rules.strictDeletes = true;

    try {
      const wipe = await deleteAllUserData("u1");
      expect(wipe.leftovers).toBe(0);
      expect(wipe.profile).toBe(true);
    } finally {
      endAccountDeletion();
    }
    for (const col of OWNED_COLLECTIONS) expect(rows<{ userId?: string }>(col).filter((d) => d.userId === "u1")).toEqual([]);
    expect(ids("billPayments")).toEqual(["p-theirs"]);
  });
});

// ─── Ids chosen before the write ─────────────────────────────────────────────

describe("user text is cleaned on the way in", () => {
  it("stores names and notes without stray spaces, at any depth, and leaves ids alone", async () => {
    await createTransaction("u1", { amount: 5, type: "expense", categoryId: "c", date: day(1), description: "  Σκι   διακοπές  ", notes: "  α  \n\n\n  β " }, "tx-clean");
    expect(fs.table("transactions").get("tx-clean")).toMatchObject({ description: "Σκι διακοπές", notes: "α\n\nβ", categoryId: "c" });

    await markBillPaid("u1", { id: "b1", name: " Ρεύμα   ΔΕΗ ", amount: 80, categoryId: "c1" }, "2026-06", day(10), undefined, undefined, { paymentId: "pay-clean", transactionId: "tx-bill-clean" });
    expect(fs.table("transactions").get("tx-bill-clean")).toMatchObject({ description: "Ρεύμα ΔΕΗ" });
  });
});

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
  // As production: a delete of a document that is not there is refused.
  beforeEach(() => {
    fs.rules.strictDeletes = true;
  });
  // The deletion leaves the write gate shut on purpose; the other tests here write.
  afterEach(() => endAccountDeletion());

  const fill = (perCollection = 1) => {
    for (const col of OWNED_COLLECTIONS) {
      for (let i = 0; i < perCollection; i++) put(col, `${col}-mine-${i}`, { userId: "u1" });
      put(col, `${col}-theirs`, { userId: "u2" });
    }
    put("users", "u1", { id: "u1" });
    put("users", "u2", { id: "u2" });
  };
  const everythingOf = (userId: string) => OWNED_COLLECTIONS.flatMap((col) => rows<{ userId?: string }>(col).filter((d) => d.userId === userId));

  it("removes every owned collection and the profile, and nobody else's", async () => {
    fill();
    const wipe = await deleteAllUserData("u1");

    for (const col of OWNED_COLLECTIONS) expect(ids(col)).toEqual([`${col}-theirs`]);
    expect(ids("users")).toEqual(["u2"]);
    // Counted a second way: one per collection, nothing came back.
    expect(wipe).toEqual({ deleted: OWNED_COLLECTIONS.length, leftovers: 0, profile: true });
    expect(everythingOf("u1")).toEqual([]);
  });

  it("still deletes the account when the rules refuse a collection the owner has not opened yet", async () => {
    // A new collection is dead until its block is pasted in the console. Nobody
    // could have written there, so the refused read means "nothing of yours" —
    // it must not sink the whole deletion.
    fill();
    fs.table("businessEntries").clear();
    fs.rules.deniedCollections.add("businessEntries");
    const wipe = await deleteAllUserData("u1");
    for (const col of OWNED_COLLECTIONS.filter((c) => c !== "businessEntries")) expect(ids(col)).toEqual([`${col}-theirs`]);
    expect(ids("users")).toEqual(["u2"]);
    // Counted a second way: one per collection the rules let it read.
    expect(wipe).toEqual({ deleted: OWNED_COLLECTIONS.length - 1, leftovers: 0, profile: true });
  });

  it("still fails on any other refusal — a real error is never read as \"nothing there\"", async () => {
    fill();
    fs.hooks.afterServerRead = (col) => {
      if (col === "bills") throw Object.assign(new Error("UNAVAILABLE"), { code: "unavailable" });
    };
    await expect(deleteAllUserData("u1")).rejects.toMatchObject({ code: "unavailable" });
    expect(ids("users")).toContain("u1");
  });

  it("leaves the shared default categories, which carry no userId", async () => {
    fill();
    put("categories", "default-food", { isDefault: true, userId: null, name: "Food" });
    await deleteAllUserData("u1");
    expect(ids("categories")).toEqual(["categories-theirs", "default-food"]);
  });

  it("deletes in batches of 450 at most, the profile on its own after them", async () => {
    fill(500); // 4 500 documents
    const wipe = await deleteAllUserData("u1");
    expect(wipe.deleted).toBe(500 * OWNED_COLLECTIONS.length);
    expect(fs.batches.every((b) => b.length <= 450)).toBe(true);
    expect(fs.batches.reduce((n, b) => n + b.length, 0)).toBe(wipe.deleted);
    // The profile is never inside a batch: missing, it would sink the batch with it.
    expect(fs.batches.flat().some(([, r]) => r.col === "users")).toBe(false);
    expect(ids("users")).toEqual(["u2"]);
  });

  it("sweeps again and removes what arrived after the first sweep, counting it", async () => {
    fill();
    // Another device's queued write lands while the first sweep is under way.
    let landed = 0;
    fs.hooks.afterServerRead = (col) => {
      if (col === "bills" && landed++ === 0) put("transactions", "late", { userId: "u1" });
    };
    const wipe = await deleteAllUserData("u1");
    expect(ids("transactions")).toEqual(["transactions-theirs"]);
    expect(wipe).toEqual({ deleted: OWNED_COLLECTIONS.length, leftovers: 1, profile: true });
    // Read from the server only — never a copy that may still hold deleted documents.
    // Sweeps: the first, the leftover, the one that deletes the profile, the empty one.
    expect(fs.serverReads.filter((r) => r === "transactions")).toHaveLength(4);
    expect(fs.serverReads.filter((r) => r === "users/u1")).toHaveLength(4);
  });

  it("catches a profile written back after it was deleted (another tab still open)", async () => {
    fill();
    let transactionReads = 0;
    fs.hooks.afterServerRead = (col) => {
      // The third sweep starts after the profile went: another tab's save puts it back.
      if (col === "transactions" && ++transactionReads === 3) put("users", "u1", { id: "u1", workspace: { planner: 1 } });
    };
    const wipe = await deleteAllUserData("u1");
    expect(ids("users")).toEqual(["u2"]);
    expect(wipe).toEqual({ deleted: OWNED_COLLECTIONS.length, leftovers: 1, profile: true });
  });

  it("gives up, before the profile, when documents keep coming back", async () => {
    fill();
    let n = 0;
    fs.hooks.afterServerRead = (col) => {
      if (col === "debts") put("debts", `again-${n++}`, { userId: "u1" });
    };
    await expect(deleteAllUserData("u1")).rejects.toMatchObject({ code: "account/leftovers" });
    // The profile is still there: the account can be deleted again.
    expect(ids("users")).toEqual(["u1", "u2"]);
  });

  it("refuses the app's own writes while it runs, so a seeder or a save cannot put anything back", async () => {
    fill();
    const attempts: Promise<unknown>[] = [];
    fs.hooks.afterServerRead = (col) => {
      if (col !== "transactions") return;
      // What the running app does: a new expense, a planner save, a profile
      // made for a Google sign-in, the category seed's batch.
      attempts.push(createTransaction("u1", { amount: 5, type: "expense", categoryId: "c", date: new Date(), description: "coffee" } as never, "t-new"));
      attempts.push(saveWorkspaceValue("u1", "planner", { salary: 1 }));
      attempts.push(createUser("u1", { email: "a@b.c", username: "u1", firstName: "A", lastName: "B", locale: "el" }));
      attempts.push(createCategories("u1", { name: "Mine", icon: "x", color: "y" } as never, ["expense"]));
    };
    const wipe = await deleteAllUserData("u1");
    const settled = await Promise.allSettled(attempts);
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((s) => s.status === "rejected" && (s.reason as { code?: string }).code === ACCOUNT_DELETING)).toBe(true);
    expect(everythingOf("u1")).toEqual([]);
    expect(ids("users")).toEqual(["u2"]);
    expect(wipe.leftovers).toBe(0);
  });

  it("does not name a profile that is not there (the rules would refuse it)", async () => {
    for (const col of OWNED_COLLECTIONS) put(col, `${col}-mine`, { userId: "u1" });
    const wipe = await deleteAllUserData("u1");
    expect(wipe).toEqual({ deleted: OWNED_COLLECTIONS.length, leftovers: 0, profile: false });
    expect(everythingOf("u1")).toEqual([]);
  });

  it("is safe to run again after it stopped half-way", async () => {
    fill();
    // The first try is refused at its second sweep.
    let refused = false;
    fs.hooks.afterServerRead = (col) => {
      if (!refused && fs.serverReads.length > OWNED_COLLECTIONS.length) {
        refused = true;
        throw Object.assign(new Error("unavailable"), { code: "unavailable", col });
      }
    };
    await expect(deleteAllUserData("u1")).rejects.toMatchObject({ code: "unavailable" });
    expect(ids("users")).toEqual(["u1", "u2"]);
    endAccountDeletion();

    const again = await deleteAllUserData("u1");
    expect(again).toEqual({ deleted: 0, leftovers: 0, profile: true });
    expect(everythingOf("u1")).toEqual([]);
    expect(ids("users")).toEqual(["u2"]);
  });

  it("lets this device's queued writes land first, so the sweep sees them", async () => {
    fill();
    fs.hooks.pendingWrites = () => put("bills", "queued-offline", { userId: "u1" });
    const wipe = await deleteAllUserData("u1");
    expect(ids("bills")).toEqual(["bills-theirs"]);
    expect(wipe.deleted).toBe(OWNED_COLLECTIONS.length + 1);
  });
});

// ─── Undoing or correcting a bill's payment ───────────────────────────────────

describe("a bill payment whose expense is gone", () => {
  // His Claude subscription: the payment still pointed at an expense deleted
  // long before, the undo named it, and the rules refused the whole write.
  const payment = { id: "p1", transactionId: "t-gone" };
  beforeEach(() => {
    fs.rules.strictDeletes = true;
    put("billPayments", "p1", { userId: "u1", billId: "b1", amount: 250, transactionId: "t-gone" });
  });

  it("is undone: the payment goes, and no delete names the missing expense", async () => {
    const notedBefore = noted.deleted.length;
    await unmarkBillPaid("u1", payment);
    expect(ids("billPayments")).toEqual([]);
    expect(fs.batches[0].map(([kind, r]) => `${kind} ${r.col}/${r.id}`)).toEqual(["delete billPayments/p1"]);
    // The payment is logged for the other devices; the missing expense is not.
    expect(noted.deleted.slice(notedBefore)).toEqual([["u1", "billPayments", ["p1"]]]);
  });

  it("is corrected without touching the missing expense", async () => {
    await updateBillPayment(payment, { amount: 223 });
    expect(fs.table("billPayments").get("p1")).toMatchObject({ amount: 223 });
    expect(ids("transactions")).toEqual([]);
  });

  it("still takes an expense that is there with it", async () => {
    put("transactions", "t-gone", { userId: "u1", amount: 250, type: "expense" });
    await unmarkBillPaid("u1", payment);
    expect(ids("billPayments")).toEqual([]);
    expect(ids("transactions")).toEqual([]);
    expect(noted.deleted.slice(-2)).toEqual([
      ["u1", "billPayments", ["p1"]],
      ["u1", "transactions", ["t-gone"]],
    ]);
  });
});

// ─── A debt's money ───────────────────────────────────────────────────────────

describe("syncDebtCash", () => {
  const record = (id: string, amount: number) => ({ id, type: "income", amount, categoryId: "", date: day(10), description: "Maria", debtId: "d1", debtPart: "principal" }) as unknown as DebtCashRecord;

  it("deletes only the records that exist, so the rules do not refuse the whole write", async () => {
    fs.rules.strictDeletes = true;
    put("transactions", "debtpay_p1", { userId: "u1", amount: 150, type: "income" });
    // p2 is new; neither repayment carries interest, so no debtint_ was ever written.
    await syncDebtCash("u1", [record("debtpay_p2", 100)], ["debtpay_p1", "debtint_p1", "debtint_p2"], ["debtpay_p1"]);

    expect(ids("transactions")).toEqual(["debtpay_p2"]);
    expect(fs.table("transactions").get("debtpay_p2")).toMatchObject({ userId: "u1", amount: 100 });
    expect(fs.batches[0].filter(([kind]) => kind === "delete").map(([, r]) => r.id)).toEqual(["debtpay_p1"]);
    expect(noted.deleted.at(-1)).toEqual(["u1", "transactions", ["debtpay_p1"]]);
  });

  it("writes the new money even when nothing it might replace exists", async () => {
    fs.rules.strictDeletes = true;
    await syncDebtCash("u1", [record("debtpay_p9", 100)], ["debtint_p9"], []);
    expect(ids("transactions")).toEqual(["debtpay_p9"]);
  });

  it("never deletes an id it was told exists but was not asked to remove", async () => {
    put("transactions", "t-coffee", { userId: "u1", amount: 3 });
    await syncDebtCash("u1", [], ["debtint_p1"], ["t-coffee"]);
    expect(ids("transactions")).toEqual(["t-coffee"]);
    expect(fs.batches).toHaveLength(0);
  });
});

// ─── A transfer with a half missing ──────────────────────────────────────────
// Before transfer rows were locked, one half could be deleted alone from the
// table, so production can hold an orphan. The Transactions page deletes the
// pair through `deleteTransfer` only when both halves are there, and an orphan
// through the single-record delete — this pins down why.

describe("deleting what is left of a transfer", () => {
  beforeEach(() => {
    fs.rules.strictDeletes = true;
  });
  afterEach(() => {
    fs.rules.strictDeletes = false;
  });

  it("refuses the pair's batch when one half is already gone — the orphan would stay for good", async () => {
    put("transactions", "xfer_t1_out", { userId: "u1", amount: 50, type: "expense", transferId: "t1", transferPart: "out" });
    await expect(deleteTransfer("u1", "t1")).rejects.toMatchObject({ code: "permission-denied" });
    expect(ids("transactions")).toContain("xfer_t1_out");
  });

  it("removes the orphan through the single-record delete", async () => {
    put("transactions", "xfer_t1_out", { userId: "u1", amount: 50, type: "expense", transferId: "t1", transferPart: "out" });
    await deleteTransaction("u1", "xfer_t1_out");
    expect(ids("transactions")).not.toContain("xfer_t1_out");
  });

  it("still deletes a whole pair as one batch", async () => {
    put("transactions", "xfer_t2_out", { userId: "u1", amount: 50, type: "expense", transferId: "t2", transferPart: "out" });
    put("transactions", "xfer_t2_in", { userId: "u1", amount: 50, type: "income", transferId: "t2", transferPart: "in" });
    await deleteTransfer("u1", "t2");
    expect(ids("transactions").filter((id) => id.startsWith("xfer_t2"))).toEqual([]);
  });
});

// ─── A goal someone paid for, deleted with its loans ─────────────────────────
// The owner's report (2026-11-12): a goal deleted right after someone's payment
// was recorded sometimes left the debt in «Χρέη & δάνεια». Now each loan is
// answered: still owed (stays) or owed no more (erased with the goal, as if it
// never happened). He asked for 2+ loans on one goal to be tested per
// combination. Every case runs under the live rules' strict deletes: a batch
// that names a missing document fails whole.
//
// The trip (June 2026). Eurobank (main) 1.000 and Revolut 500, read on the 1st
// at noon. His own 200 set aside in Revolut on the 2nd. Then, as the app writes
// them (`createCoveredFunding` + the debt's cash, `debtCashRecords`):
//   n1  Nikos    300  on the 3rd   — answered «still owed»
//   m1  Maria    250  on the 4th   — refunded by the hotel: «owed no more»
//   n2  Nikos    100  on the 5th   — typed twice by mistake: «owed no more»
//   g1  Giorgos  150  on the 6th   — 50 paid back from Revolut on the 8th: stays, not asked
//   l1  Eleni     80  on the 7th   — deleted from «Χρέη» before the goal; the dialog's
//                                    stale list still names it «owed no more»
// and a 3 € coffee on Eurobank on the 9th.

describe("a goal someone paid for, deleted with its loans (2+ loans)", () => {
  const ACCOUNTS: MoneyAccount[] = [
    { id: "eb", name: "Eurobank", kind: "bank", main: true },
    { id: "rev", name: "Revolut", kind: "bank" },
  ];
  const CHECK_IN: BalanceCheckIn = { id: "ci", at: new Date(2026, 5, 1, 12).toISOString(), amounts: { eb: 1000, rev: 500 } };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const debtsNow = () => {
    const payments = rows<DebtPayment>("debtPayments");
    return rows<Debt>("debts").map((d) => computeDebtStatus(d, payments));
  };
  /** The debt's money, written as `useDebtRefresh().sync` writes it. */
  const writeCash = async (debtId: string) => {
    const debt = debtsNow().find((d) => d.id === debtId)!;
    const { records, remove } = debtCashRecords(debt);
    await syncDebtCash("u1", records, remove, remove.filter((id) => fs.table("transactions").has(id)));
  };
  const fund = async (debtId: string, who: string, amount: number, d: number, cash = true) => {
    const vars = coveredFundingVars({ goal: { id: "trip", name: "Trip" }, who, amount, date: day(d), categoryId: "travel", notes: "", expenseNotes: "" });
    await createCoveredFunding("u1", { contributionId: `c-${debtId}`, debtId, expenseId: `e-${debtId}` }, vars);
    if (cash) await writeCash(debtId);
  };

  async function seedTrip() {
    put("investmentGoals", "trip", { userId: "u1", name: "Trip", goalType: "targeted", isActive: true, isCompleted: false, createdAt: day(1) });
    contribute("trip", "own", 200, "deposit", day(2), true);
    fs.table("transactions").get("t-own")!.accountId = "rev";
    await fund("n1", "Nikos", 300, 3);
    await fund("m1", "Maria", 250, 4);
    await fund("n2", "Nikos", 100, 5);
    await fund("g1", "Giorgos", 150, 6);
    await fund("l1", "Eleni", 80, 7);
    put("debtPayments", "p-g1", { userId: "u1", debtId: "g1", amount: 50, date: day(8), accountId: "rev" });
    await writeCash("g1");
    put("transactions", "t-coffee", { userId: "u1", amount: 3, type: "expense", categoryId: "food", date: day(9), description: "Coffee", accountId: "eb" });
    // Eleni's, deleted from «Χρέη» as that page does: debt + deposit + expense, then its cash.
    await deleteCoveredDebt("u1", "l1", [], { contributionId: "c-l1", expenseId: "e-l1" });
    await syncDebtCash("u1", [], allDebtCashIds("l1", []), ["debt_l1"]);
    fs.batches.length = 0;
    noted.deleted.length = 0;
    fs.rules.strictDeletes = true;
  }

  /** Every figure the screens show, from the app's own functions. */
  function figures() {
    const txs = rows<Transaction>("transactions").filter((t) => t.userId === "u1");
    const latest = readCheckIns([CHECK_IN], ACCOUNTS, txs).at(-1)!;
    const byAccount = expectedByAccount(ACCOUNTS, latest, txs);
    const held = goalHeldTotal(txs);
    const goal = rows<InvestmentGoal>("investmentGoals").find((g) => g.id === "trip");
    const stats = goal ? computeGoalStats(goal, rows<InvestmentContribution>("investmentContributions").filter((c) => c.goalId === "trip")) : undefined;
    return {
      byAccount,
      spendable: round2(byAccount.eb + byAccount.rev - held),
      held,
      // «Χρωστάς» on «Χρέη & δάνεια»: what is still owed, person by person.
      owe: round2(debtsByPerson(debtsNow()).reduce((sum, p) => sum + p.owedByMe, 0)),
      covered: stats?.totalCovered ?? 0,
      saved: stats?.totalSaved ?? 0,
      spending: calculateMetrics(txs).totalExpenses,
    };
  }

  /** Nothing left pointing at nothing. */
  function orphans() {
    const debts = new Set(ids("debts"));
    const goals = new Set(ids("investmentGoals"));
    const txs = new Set(ids("transactions"));
    return [
      ...rows<InvestmentContribution>("investmentContributions").filter((c) => !goals.has(c.goalId)).map((c) => `contribution ${c.id} without its goal`),
      ...rows<Transaction>("transactions").filter((t) => t.debtId && !debts.has(t.debtId)).map((t) => `cash ${t.id} without its debt`),
      ...rows<DebtPayment>("debtPayments").filter((p) => !debts.has(p.debtId)).map((p) => `repayment ${p.id} without its debt`),
      ...rows<Debt>("debts").filter((d) => d.coveredExpenseId && !txs.has(d.coveredExpenseId)).map((d) => `debt ${d.id} without its expense`),
    ];
  }

  /** Spending of the trip's own deposit alone, as the Overview counts it (deposits gross). */
  const depositSpending = () => calculateMetrics(rows<Transaction>("transactions").filter((t) => t.id === "t-own")).totalExpenses;

  const ERASE: CoveredErase[] = [
    { debtId: "m1", expenseId: "e-m1" },
    { debtId: "n2", expenseId: "e-n2" },
    { debtId: "l1", expenseId: "e-l1" },
  ];

  it("before: the figures by hand", async () => {
    await seedTrip();
    const f = figures();
    // Eurobank: 1.000 + the four loans' records (300 + 250 + 100 + 150 = 800) − their four expenses (800) − coffee 3 = 997.
    // Revolut: 500 − 50 back to Giorgos = 450. The 200 set aside stays in Revolut (goal money stays in the banks).
    expect(f.byAccount).toEqual({ eb: 997, rev: 450 });
    expect(f.held).toBe(200);
    expect(f.spendable).toBe(997 + 450 - 200);
    // Owed: Nikos 300 + 100, Maria 250, Giorgos 150 − 50 = 750.
    expect(f.owe).toBe(750);
    // The goal: 200 his + 800 paid by others; Eleni's 80 went with her debt.
    expect(f.covered).toBe(800);
    expect(f.saved).toBe(1000);
    expect(orphans()).toEqual([]);
  });

  it("dropped — n1 kept, m1 and n2 erased, g1 repaid, l1 already gone: one batch of only what exists, every figure right", async () => {
    await seedTrip();
    const before = figures();
    const deposit = depositSpending();

    const gone = await deleteInvestmentGoal("u1", "trip", ERASE);

    // One batch, and nothing of Eleni's named in it — her debt, expense and cash were already gone.
    expect(fs.batches).toHaveLength(1);
    expect(fs.batches[0].map(([, r]) => `${r.col}/${r.id}`).sort()).toEqual(
      [
        "debts/m1",
        "debts/n2",
        "transactions/e-m1",
        "transactions/e-n2",
        "transactions/debt_m1",
        "transactions/debt_n2",
        "transactions/t-own",
        "investmentContributions/c-own",
        "investmentContributions/c-n1",
        "investmentContributions/c-m1",
        "investmentContributions/c-n2",
        "investmentContributions/c-g1",
        "investmentGoals/trip",
      ].sort(),
    );
    expect(gone.debtIds.sort()).toEqual(["m1", "n2"]);

    // What stays: Nikos' first loan and Giorgos', each whole — debt, expense, loan record (and Giorgos' repayment).
    expect(ids("debts")).toEqual(["g1", "n1"]);
    expect(ids("debtPayments")).toEqual(["p-g1"]);
    expect(ids("transactions")).toEqual(["debt_g1", "debt_n1", "debtpay_p-g1", "e-g1", "e-n1", "t-coffee"]);
    expect(ids("investmentContributions")).toEqual([]);
    expect(orphans()).toEqual([]);

    const after = figures();
    // No card moves: each erased expense went with the loan record beside it (−250 +250, −100 +100).
    expect(after.byAccount).toEqual(before.byAccount);
    // His own 200 is free again: 1.247 → 1.447.
    expect(after.held).toBe(0);
    expect(after.spendable).toBe(round2(before.spendable + 200));
    // Owed: 750 − Maria 250 − Nikos' second 100 = 400 (Nikos 300 + Giorgos 100).
    expect(after.owe).toBe(400);
    expect(debtsByPerson(debtsNow()).map((p) => [p.person, p.owedByMe])).toEqual(
      expect.arrayContaining([
        ["Nikos", 300],
        ["Giorgos", 100],
      ]),
    );
    // Spending: the two erased expenses (350) and the deposit's own share are gone — nothing else.
    expect(after.spending).toBe(round2(before.spending - 350 - deposit));
    expect(after.covered).toBe(0);

    // Every deleted id is logged for the other devices, Eleni's not among them.
    const logged = Object.fromEntries(noted.deleted.map(([, name, list]) => [name, [...list].sort()]));
    expect(logged.debts).toEqual(["m1", "n2"]);
    expect(logged.transactions).toEqual(["debt_m1", "debt_n2", "e-m1", "e-n2", "t-own"]);
    expect(logged.investmentGoals).toEqual(["trip"]);
  });

  it("all still owed: nothing of the loans is touched — as before this change", async () => {
    await seedTrip();
    const before = figures();
    await deleteInvestmentGoal("u1", "trip");
    expect(ids("debts")).toEqual(["g1", "m1", "n1", "n2"]);
    const after = figures();
    expect(after.owe).toBe(before.owe);
    expect(after.byAccount).toEqual(before.byAccount);
    // Only the goal's own deposit and its mirror went.
    expect(after.spendable).toBe(round2(before.spendable + 200));
    expect(orphans()).toEqual([]);
  });

  it("done (spent) — the same answers: the closing records, the erased loans and the goal in one batch", async () => {
    await seedTrip();
    const before = figures();
    const txs = rows<Transaction>("transactions").filter((t) => t.userId === "u1");
    const goal = computeGoalStats(rows<InvestmentGoal>("investmentGoals")[0], rows<InvestmentContribution>("investmentContributions"));
    const records = closingRecords(goal, txs, { bankAccountId: "rev", categoryId: "travel", date: day(10), note: "" }).map((data, i) => ({ id: `close-${i}`, data }));

    await closeInvestmentGoal("u1", "trip", records, ERASE);

    expect(fs.batches).toHaveLength(1);
    const deleted = fs.batches[0].filter(([kind]) => kind === "delete").map(([, r]) => `${r.col}/${r.id}`);
    expect(deleted.filter((p) => p.includes("l1"))).toEqual([]);
    expect(ids("debts")).toEqual(["g1", "n1"]);
    expect(orphans()).toEqual([]);

    const after = figures();
    // Only his own 200 leaves Revolut (450 → 250); Eurobank unchanged; spendable stays 1.247 — what was set aside was spent.
    expect(after.byAccount).toEqual({ eb: before.byAccount.eb, rev: round2(before.byAccount.rev - 200) });
    expect(after.held).toBe(0);
    expect(after.spendable).toBe(before.spendable);
    expect(after.owe).toBe(400);
  });

  it("a loan erased the moment after it was written — before its money was: names no record that is not there", async () => {
    put("investmentGoals", "trip", { userId: "u1", name: "Trip", goalType: "targeted", isActive: true, isCompleted: false, createdAt: day(1) });
    await fund("n1", "Nikos", 300, 3, false);
    fs.rules.strictDeletes = true;
    expect(fs.table("transactions").has("debt_n1")).toBe(false);

    await deleteInvestmentGoal("u1", "trip", [{ debtId: "n1", expenseId: "e-n1" }]);

    expect(ids("debts")).toEqual([]);
    expect(ids("transactions")).toEqual([]);
    expect(ids("investmentContributions")).toEqual([]);
  });

  it("the device's list never had the debt: read by id from the server, with its repayments", async () => {
    await seedTrip();
    const { debts, payments } = await getDebtsByIds("u1", ["n1", "g1", "l1"]);
    expect(debts.map((d) => d.id).sort()).toEqual(["g1", "n1"]);
    expect(payments.map((p) => p.id)).toEqual(["p-g1"]);
    // A second way: the loans the dialog builds from them — Nikos open at 300, Giorgos repaid with 100 left.
    const loans = goalLoans({ id: "trip", name: "Trip", covered: [{ person: "Nikos", amount: 300, debtIds: ["n1"] }, { person: "Giorgos", amount: 150, debtIds: ["g1"] }] }, debts.map((d) => computeDebtStatus(d, payments)), rows<Transaction>("transactions"));
    expect(loans.map((l) => [l.debtId, l.state, l.remaining, l.expenseId])).toEqual([
      ["n1", "open", 300, "e-n1"],
      ["g1", "repaid", 100, "e-g1"],
    ]);
  });

  it("refuses to erase a loan repaid since the dialog read it — nothing written, a card's money never undone", async () => {
    await seedTrip();
    put("debtPayments", "p-m1", { userId: "u1", debtId: "m1", amount: 20, date: day(9), accountId: "eb" });
    await writeCash("m1");
    fs.batches.length = 0;
    const before = figures();

    await expect(deleteInvestmentGoal("u1", "trip", ERASE)).rejects.toBeInstanceOf(CoveredRepaidError);

    expect(fs.batches).toHaveLength(0);
    expect(ids("investmentGoals")).toEqual(["trip"]);
    expect(figures()).toEqual(before);
  });

  it("refuses a debt of another goal named by mistake — nothing written", async () => {
    await seedTrip();
    put("debts", "x1", { userId: "u1", person: "Kostas", direction: "owed_by_me", amount: 40, date: day(3), forGoalId: "other", accountId: "" });
    await expect(deleteInvestmentGoal("u1", "trip", [{ debtId: "x1" }])).rejects.toThrow(/not a loan of goal/);
    expect(fs.batches).toHaveLength(0);
    expect(ids("debts")).toContain("x1");
  });

  it("past 450 writes: each loan's records stay in one batch, the goal last", async () => {
    await seedTrip();
    for (let i = 0; i < 448; i++) contribute("trip", `x${i}`, 1, "deposit", day(2), true);
    fs.batches.length = 0;

    await deleteInvestmentGoal("u1", "trip", ERASE);

    expect(fs.batches.length).toBeGreaterThan(1);
    for (const batch of fs.batches) expect(batch.length).toBeLessThanOrEqual(450);
    const batchOf = (id: string) => fs.batches.findIndex((b) => b.some(([, r]) => r.id === id));
    expect(batchOf("e-m1")).toBe(batchOf("debt_m1"));
    expect(batchOf("debt_m1")).toBe(batchOf("m1"));
    expect(batchOf("e-n2")).toBe(batchOf("n2"));
    expect(fs.batches.at(-1)!.at(-1)![1]).toEqual({ kind: "doc", col: "investmentGoals", id: "trip" });
    expect(ids("debts")).toEqual(["g1", "n1"]);
    expect(orphans()).toEqual([]);
  });

  it("from the screen (useDeleteGoal): the lists on the device lose exactly what went", async () => {
    await seedTrip();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(investmentKeys.goals("u1"), rows<InvestmentGoal>("investmentGoals"));
    client.setQueryData(["transactions", "u1"], rows<Transaction>("transactions"));
    client.setQueryData(["debts", "u1"], debtsNow());
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useDeleteGoal(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ goalId: "trip", erase: ERASE });
    });

    const listed = <T extends { id: string }>(key: readonly unknown[]) => (client.getQueryData<T[]>(key) ?? []).map((r) => r.id).sort();
    expect(listed(["debts", "u1"])).toEqual(ids("debts"));
    expect(listed(["transactions", "u1"])).toEqual(ids("transactions"));
    expect(listed(investmentKeys.goals("u1"))).toEqual([]);
  });
});

// ─── «Αρχείο» → delete closed debts, their money kept (owner, 2026-11-17) ─────

describe("deleteClosedDebts — the debts go, their money stays", () => {
  /** Each card's balance from the records on the server: income in, expense out ("" = the main account). */
  const balances = () => {
    const by = new Map<string, number>();
    for (const tx of rows<Transaction>("transactions")) {
      const key = tx.accountId ?? "";
      by.set(key, Math.round(((by.get(key) ?? 0) + (tx.type === "income" ? 1 : -1) * tx.amount) * 100) / 100);
    }
    return Object.fromEntries([...by.entries()].sort());
  };
  const debt = (id: string, extra: Data = {}) => put("debts", id, { userId: "u1", person: "Nikos", direction: "owed_by_me", amount: 100, date: day(1), ...extra });
  const repay = (id: string, debtId: string, amount: number) => put("debtPayments", id, { userId: "u1", debtId, amount, date: day(2) });
  const cash = (id: string, debtId: string, type: "income" | "expense", amount: number, accountId: string, debtPart = "principal") => put("transactions", id, { userId: "u1", debtId, debtPart, type, amount, accountId, date: day(2) });

  /** Five closed debts; three are picked. a, b: Piraeus; c: a friend paid part of a goal; d, e: left alone. */
  function seedFive() {
    for (const id of ["a", "b", "d", "e"]) debt(id);
    debt("c", { forGoalId: "g1", coveredExpenseId: "exp-c", accountId: "" });
    // a: borrowed 100 into Piraeus, paid back 60 + 40 from Piraeus.
    cash("debt_a", "a", "income", 100, "piraeus", "loan");
    repay("pa1", "a", 60);
    repay("pa2", "a", 40);
    cash("debtpay_pa1", "a", "expense", 60, "piraeus");
    cash("debtpay_pa2", "a", "expense", 40, "piraeus");
    // b: paid back 100 in cash, no loan record (the money never went through a card).
    repay("pb1", "b", 100);
    cash("debtpay_pb1", "b", "expense", 100, "cash");
    // c: a friend paid 100 of goal g1 — the expense and the loan record cancel on the main account.
    put("transactions", "exp-c", { userId: "u1", type: "expense", amount: 100, accountId: "", date: day(1), categoryId: "food" });
    cash("debt_c", "c", "income", 100, "", "loan");
    repay("pc1", "c", 100);
    cash("debtpay_pc1", "c", "expense", 100, "piraeus");
    put("investmentContributions", "dep-c", { userId: "u1", goalId: "g1", debtId: "c", coveredBy: "Nikos", amount: 100, contributionType: "deposit", date: day(1) });
    // d, e: not picked.
    repay("pd1", "d", 100);
    cash("debtpay_pd1", "d", "expense", 100, "piraeus");
    repay("pe1", "e", 100);
    put("transactions", "food", { userId: "u1", type: "expense", amount: 25, accountId: "piraeus", date: day(3), categoryId: "food" });
  }

  it("deletes 3 of 5 with their repayment records, and nothing of the other two", async () => {
    seedFive();
    fs.rules.strictDeletes = true; // production: a missing document fails the batch
    const done = await deleteClosedDebts("u1", ["a", "b", "c"]);
    expect(ids("debts")).toEqual(["d", "e"]);
    expect(ids("debtPayments")).toEqual(["pd1", "pe1"]);
    expect(done).toEqual({
      debtIds: ["a", "b", "c"],
      paymentIds: ["pa1", "pa2", "pb1", "pc1"],
      keptTransactionIds: ["debt_a", "debtpay_pa1", "debtpay_pa2", "debtpay_pb1", "debt_c", "debtpay_pc1"],
      unlinkedContributionIds: ["dep-c"],
      skipped: [],
    });
  });

  it("keeps every card's balance as it was — worked out by hand", async () => {
    seedFive();
    // Piraeus: +100 (a's loan) − 60 − 40 (a) − 100 (c repaid) − 100 (d) − 25 (food) = −225.
    // Cash: −100 (b). Main (""): −100 (c's expense) + 100 (c's loan record) = 0.
    const before = { "": 0, cash: -100, piraeus: -225 };
    expect(balances()).toEqual(before);
    await deleteClosedDebts("u1", ["a", "b", "c"]);
    expect(balances()).toEqual(before);
    // Not one transaction deleted: 6 kept of the debts, 1 of d, the goal's expense, the food.
    expect(ids("transactions")).toHaveLength(9);
  });

  it("marks the money kept, still a debt's (counted the same), and unlinks the friend's goal deposit", async () => {
    seedFive();
    await deleteClosedDebts("u1", ["a", "b", "c"]);
    const tx = (id: string) => fs.table("transactions").get(id)!;
    for (const id of ["debt_a", "debtpay_pa1", "debtpay_pa2", "debtpay_pb1", "debt_c", "debtpay_pc1"]) {
      expect(tx(id)).toMatchObject({ debtKept: true, updatedAt: "SERVER_TIME" });
      expect(tx(id).debtId).toBeDefined();
    }
    // d's money and the goal's expense untouched.
    expect(tx("debtpay_pd1").debtKept).toBeUndefined();
    expect(tx("exp-c")).toEqual({ userId: "u1", type: "expense", amount: 100, accountId: "", date: day(1), categoryId: "food" });
    // The deposit stays with the goal, its link to the debt taken off.
    expect(fs.table("investmentContributions").get("dep-c")).toMatchObject({ goalId: "g1", amount: 100, coveredBy: "Nikos", debtId: "DELETE_FIELD" });
  });

  it("tells the other devices once, of the debts and the repayments only", async () => {
    seedFive();
    noted.deleted.length = 0;
    await deleteClosedDebts("u1", ["a", "b", "c"]);
    expect(noted.deleted).toEqual([
      ["u1", "debts", ["a", "b", "c"]],
      ["u1", "debtPayments", ["pa1", "pa2", "pb1", "pc1"]],
    ]);
  });

  it("skips a debt deleted on another device meanwhile, naming nothing of it", async () => {
    seedFive();
    fs.table("debts").delete("b");
    fs.rules.strictDeletes = true;
    const done = await deleteClosedDebts("u1", ["a", "b"]);
    expect(done.skipped).toEqual(["b"]);
    expect(done.debtIds).toEqual(["a"]);
    // b's leftover repayment record is not named either (it is not ours to guess at).
    expect(ids("debtPayments")).toContain("pb1");
    expect(fs.batches.flat().some(([, r]) => r.id === "pb1" || r.id === "debtpay_pb1")).toBe(false);
  });

  it("keeps each debt's writes in one batch, ≤ 450 a batch", async () => {
    // Two debts of 300 repayments each: 301 + 301 writes cannot share a batch.
    for (const id of ["big1", "big2"]) {
      debt(id);
      for (let i = 0; i < 300; i++) repay(`${id}-p${i}`, id, 1);
    }
    await deleteClosedDebts("u1", ["big1", "big2"]);
    expect(fs.batches.map((b) => b.length)).toEqual([301, 301]);
    // Whose each write is: the debt itself, or a repayment named after it.
    for (const batch of fs.batches) expect(new Set(batch.map(([, r]) => (r.col === "debts" ? r.id : r.id.split("-p")[0])))).toEqual(new Set([batch.at(-1)![1].id]));
    expect(ids("debts")).toEqual([]);
    expect(ids("debtPayments")).toEqual([]);
  });

  it("sends a debt too big for one batch on its own, the debt itself last", async () => {
    debt("huge");
    for (let i = 0; i < 500; i++) repay(`huge-p${i}`, "huge", 1);
    await deleteClosedDebts("u1", ["huge"]);
    expect(fs.batches.map((b) => b.length)).toEqual([450, 51]);
    const last = fs.batches.at(-1)!;
    expect(last.at(-1)![1]).toMatchObject({ col: "debts", id: "huge" });
    expect(fs.batches[0].some(([, r]) => r.col === "debts")).toBe(false);
  });
});

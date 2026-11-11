import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { goalHeldTotal } from "../features/accounts/accountsUtils";
import { computeGoalStats } from "../features/budget/investmentsUtils";
import type { InvestmentContribution, InvestmentGoal, Transaction } from "../shared/types/IndexTypes";
import { OWNED_COLLECTIONS } from "./ownedCollections";
import { ACCOUNT_DELETING, endAccountDeletion } from "./deletionGate";
import { createCategories, createUser, saveWorkspaceValue } from "./firestore";
import { createContributionWithTransaction, createTransaction, deleteAllUserData,deleteContribution, deleteInvestmentGoal, deleteTransaction, deleteTransfer, markBillPaid, syncDebtCash, unmarkBillPaid, updateBillPayment, updateTransaction } from "./firestore";
import type { DebtCashRecord } from "../features/debts/debtCash";

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
// The delta sync's own bookkeeping is tested in `deltaSync.test.ts`; here
// only what reaches the collections matters.
const noted = vi.hoisted(() => ({ deleted: [] as [string, string, string[]][] }));
vi.mock("./syncList", () => ({
  syncedList: async () => [],
  noteDeleted: async (userId: string, name: string, ids: string[]) => void noted.deleted.push([userId, name, ids]),
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
    expect(noted.deleted).toHaveLength(notedBefore);
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
    expect(noted.deleted.at(-1)).toEqual(["u1", "transactions", ["t-gone"]]);
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

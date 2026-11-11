import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Every list on the delta path (item 100) ─────────────────────────────────
//
// The real data layer (`firestore.ts` + `syncList.ts`) on the demo's in-memory
// Firestore, with two "devices" — two copies of the store on the device — so a
// change made on one is checked as the other sees it at its next start.
//
// Every figure is reconciled a second way: what a start returns is compared
// with the server's own documents (`memoryCollection`), not with what the test
// expects the sync to have done; and the reads are counted from the read meter,
// the same labels the owner sees in the dev console.

vi.mock("../demo/demoMode", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isDemo: () => true,
}));
vi.mock("./config", () => ({ db: {} }));

/** The store on "the device": swapped to play another device. */
const disk = vi.hoisted(() => ({ current: new Map<string, unknown>() }));
vi.mock("../lib/localStore", () => ({
  localGet: async (key: string) => structuredClone(disk.current.get(key)),
  localSet: async (key: string, value: unknown) =>
    void disk.current.set(key, structuredClone(value)),
  localDelete: async (key: string) => void disk.current.delete(key),
  localDeletePrefix: async (prefix: string) => {
    for (const key of [...disk.current.keys()])
      if (key.startsWith(prefix)) disk.current.delete(key);
  },
}));

/** Each read as the dev console logs it: label and billed documents (an empty answer is one read). */
const meter = vi.hoisted(() => ({
  reads: [] as { label: string; billed: number }[],
}));
vi.mock("../lib/readMeter", () => ({
  meterRead: (label: string, docs: number) =>
    void meter.reads.push({ label, billed: Math.max(docs, 1) }),
  totalReads: () => 0,
}));

import {
  resetMemoryFirestore,
  memoryCollection,
} from "../demo/memoryFirestore";
import { endAccountDeletion } from "./deletionGate";
import { OWNED_COLLECTIONS } from "./ownedCollections";
import {
  getBills,
  getBillPayments,
  getDebts,
  getDebtPayments,
  getInvestmentGoals,
  getAllContributions,
  getCategories,
  getTransactions,
  updateBill,
  updateBillPayment,
  updateDebt,
  updateDebtPayment,
  updateInvestmentGoal,
  updateCategory,
  editCoveredDebt,
  deleteBill,
  deleteCategory,
  deleteDebtPayment,
  deleteContribution,
  unmarkBillPaid,
  deleteInvestmentGoal,
  deleteDebt,
  deleteCoveredDebt,
  deleteTransaction,
  closeInvestmentGoal,
  deleteAllUserData,
  createDebtPayment,
  markBillPaid,
} from "./firestore";
import type { InvestmentContribution } from "../shared/types/IndexTypes";

const U = "u1";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/**
 * Each test starts later than the one before: the user document a start-up
 * shares is kept for a few seconds by the clock, and a clock going backwards
 * would hand one test the last one's.
 */
let T0 = new Date(2026, 10, 1, 9, 0, 0).getTime();
/** A day well before the test, for dates on records. */
let old: Date;
/** Every seeded document a different hour, a month back — so only the newest falls in the cursor's overlap. */
let tick = 0;
const stamp = () => {
  const at = new Date(T0 - 30 * DAY + tick++ * HOUR);
  return { createdAt: at, updatedAt: at };
};
/** As `stamp`, from before a collection carried `updatedAt`. */
const created = () => ({ createdAt: stamp().createdAt });

/** The lists read at start-up, as the screens read them. */
const LISTS = [
  "transactions",
  "bills",
  "billPayments",
  "debts",
  "debtPayments",
  "investmentGoals",
  "investmentContributions",
  "categories",
] as const;
type List = (typeof LISTS)[number];

const readers: Record<List, (uid: string) => Promise<{ id: string }[]>> = {
  transactions: getTransactions,
  bills: getBills,
  billPayments: getBillPayments,
  debts: getDebts,
  debtPayments: getDebtPayments,
  investmentGoals: getInvestmentGoals,
  investmentContributions: getAllContributions,
  // Own categories only: the shared defaults have their own week-long keep.
  categories: async (uid) =>
    (await getCategories(uid)).filter(
      (c) => (c as { userId?: unknown }).userId === uid,
    ),
};

/** A small account for u1, a little of u2's beside it, and the shared defaults. */
function seed() {
  resetMemoryFirestore({
    users: { u1: { id: U }, u2: { id: "u2" } },
    transactions: {
      t1: { userId: U, amount: 12, type: "expense", date: old, ...stamp() },
      "t-pay1": {
        userId: U,
        amount: 40,
        type: "expense",
        date: old,
        billId: "b1",
        ...stamp(),
      },
      "t-c1": {
        userId: U,
        amount: 100,
        type: "investment",
        goalId: "g1",
        isInvestmentTransaction: true,
        contributionType: "deposit",
        date: old,
        ...stamp(),
      },
      "t-c2": {
        userId: U,
        amount: 50,
        type: "investment",
        goalId: "g1",
        isInvestmentTransaction: true,
        contributionType: "deposit",
        date: new Date(T0 - 20 * DAY),
        ...stamp(),
      },
      "t-cov": {
        userId: U,
        amount: 550,
        type: "expense",
        date: old,
        ...stamp(),
      },
      x1: { userId: "u2", amount: 9, type: "expense", date: old, ...stamp() },
    },
    bills: {
      b1: { userId: U, name: "Water", amount: 40, ...stamp() },
      b2: { userId: U, name: "Phone", amount: 20, ...stamp() },
      xb: { userId: "u2", name: "Theirs", amount: 1, ...stamp() },
    },
    billPayments: {
      // Written before payments carried `updatedAt`: only `createdAt`.
      p1: {
        userId: U,
        billId: "b1",
        periodKey: "2026-09",
        amount: 40,
        paidDate: old,
        transactionId: "t-pay1",
        ...created(),
      },
      p2: {
        userId: U,
        billId: "b2",
        periodKey: "2026-09",
        amount: 20,
        paidDate: old,
        ...created(),
      },
    },
    debts: {
      d1: {
        userId: U,
        person: "Maria",
        amount: 300,
        direction: "i_owe",
        ...stamp(),
      },
      d2: {
        userId: U,
        person: "Nikos",
        amount: 550,
        direction: "i_owe",
        coveredExpenseId: "t-cov",
        ...stamp(),
      },
    },
    debtPayments: {
      // Same: from before repayments carried `updatedAt`.
      r1: { userId: U, debtId: "d1", amount: 50, date: old, ...created() },
      r2: { userId: U, debtId: "d1", amount: 25, date: old, ...created() },
      r3: { userId: U, debtId: "d2", amount: 10, date: old, ...created() },
    },
    investmentGoals: {
      g1: { userId: U, name: "Car", targetAmount: 1000, ...stamp() },
      g2: { userId: U, name: "Trip", targetAmount: 500, ...stamp() },
    },
    investmentContributions: {
      c1: {
        userId: U,
        goalId: "g1",
        amount: 100,
        contributionType: "deposit",
        date: old,
        ...stamp(),
      },
      c2: {
        userId: U,
        goalId: "g1",
        amount: 50,
        contributionType: "deposit",
        date: new Date(T0 - 20 * DAY),
        ...stamp(),
      },
      c3: {
        userId: U,
        goalId: "g2",
        amount: 30,
        contributionType: "deposit",
        date: old,
        ...stamp(),
      },
      cov: {
        userId: U,
        goalId: "g2",
        amount: 550,
        contributionType: "deposit",
        date: old,
        debtId: "d2",
        ...stamp(),
      },
    },
    categories: {
      def1: {
        userId: null,
        isDefault: true,
        name: "Food",
        type: "expense",
        ...stamp(),
      },
      k1: {
        userId: U,
        isDefault: false,
        name: "Pets",
        type: "expense",
        ...stamp(),
      },
      k2: {
        userId: U,
        isDefault: false,
        name: "Side work",
        type: "income",
        ...stamp(),
      },
      kx: {
        userId: "u2",
        isDefault: false,
        name: "Theirs",
        type: "expense",
        ...stamp(),
      },
    },
  });
}

const byId = <T extends { id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.id.localeCompare(b.id));

/** The second way: the server's own documents of u1, straight from the store. */
const onServer = (name: List) =>
  byId(
    Object.entries(memoryCollection(name))
      .filter(([, data]) => data.userId === U)
      .map(([id, data]) => ({ id, ...data })),
  );

/** One app start on the current device: every list, as the screens ask for them together. */
async function start() {
  meter.reads.length = 0;
  const lists = await Promise.all(LISTS.map((name) => readers[name](U)));
  return Object.fromEntries(
    LISTS.map((name, i) => [name, byId(lists[i])]),
  ) as Record<List, { id: string }[]>;
}

const labels = () => meter.reads.map((r) => r.label).sort();
const billed = () => meter.reads.reduce((sum, r) => sum + r.billed, 0);

const laptop = new Map<string, unknown>();
const phone = new Map<string, unknown>();
const on = (device: Map<string, unknown>) => void (disk.current = device);
/** Moves the clock on; beyond the five seconds a start-up shares the user document for. */
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  T0 += 60 * DAY;
  old = new Date(T0 - 40 * DAY);
  tick = 0;
  vi.setSystemTime(T0);
  laptop.clear();
  phone.clear();
  seed();
});

afterEach(() => {
  endAccountDeletion();
  vi.useRealTimers();
});

describe("a warm start reads only what changed", () => {
  it("reads every list whole the first time, then only its changes query and the shared user document", async () => {
    on(laptop);
    const cold = await start();
    expect(labels()).toEqual(
      [...LISTS.map((n) => `${n} (whole)`), "categories (defaults)"].sort(),
    );
    for (const name of LISTS) expect(cold[name]).toEqual(onServer(name));
    const coldReads = billed();

    later(DAY);
    const warm = await start();
    // One changes query per list and the user document once for all of them —
    // no whole read, and the defaults kept on the device for a week.
    expect(labels()).toEqual(
      ["users (sync)", ...LISTS.map((n) => `${n} (changes)`)].sort(),
    );
    expect(billed()).toBe(1 + LISTS.length);
    expect(coldReads).toBeGreaterThan(billed());
    for (const name of LISTS) expect(warm[name]).toEqual(onServer(name));
    // The same rows as the cold start: nothing changed on the server.
    expect(warm).toEqual(cold);
  });

  it("keeps every list's copy under a name the account deletion also clears", async () => {
    on(laptop);
    await start();
    const synced = [...laptop.keys()]
      .filter((k) => k.startsWith(`sync:${U}:`))
      .map((k) => k.split(":")[2]);
    expect(synced.sort()).toEqual([...LISTS].sort());
    for (const name of synced) expect(OWNED_COLLECTIONS).toContain(name);
  });
});

describe("another device's writes reach this one", () => {
  it("an edit on the phone appears on the laptop, in every list", async () => {
    on(laptop);
    await start();
    on(phone);
    await start();

    later(HOUR);
    await updateBill("b1", { amount: 45 });
    await updateDebt("d1", { person: "Maria K." });
    await updateInvestmentGoal("g2", { targetAmount: 650 });
    await updateCategory("k1", { name: "Pets & vet" });
    await updateDebtPayment("r2", { amount: 30, date: old });
    await updateBillPayment({ id: "p2" }, { amount: 22 });
    await editCoveredDebt(
      "d2",
      { person: "Nikos", amount: 560, direction: "i_owe" } as never,
      { contribution: { id: "cov", set: { amount: 560 } } },
    );

    later(HOUR);
    on(laptop);
    const cursors = Object.fromEntries(
      LISTS.map((n) => [
        n,
        (laptop.get(`sync:${U}:${n}`) as { cursor: number }).cursor,
      ]),
    );
    const warm = await start();
    expect(labels()).not.toContain(expect.stringContaining("(whole)"));
    for (const name of LISTS) expect(warm[name]).toEqual(onServer(name));
    // The figures themselves, read back from what the laptop now shows.
    const find = (name: List, id: string) =>
      warm[name].find((r) => r.id === id) as Record<string, unknown>;
    expect(find("bills", "b1").amount).toBe(45);
    expect(find("debts", "d1").person).toBe("Maria K.");
    expect(find("investmentGoals", "g2").targetAmount).toBe(650);
    expect(find("categories", "k1").name).toBe("Pets & vet");
    expect(find("debtPayments", "r2").amount).toBe(30);
    expect(find("billPayments", "p2").amount).toBe(22);
    expect(find("investmentContributions", "cov").amount).toBe(560);
    // Each changes query read exactly what the server holds past the laptop's
    // cursor (less the minute of overlap): the edits, plus the newest document
    // it already had. Counted here from the server's own documents.
    const changed = Object.fromEntries(
      meter.reads
        .filter((r) => r.label.endsWith("(changes)"))
        .map((r) => [r.label.replace(" (changes)", ""), r.billed]),
    );
    const pastCursor = (name: List) =>
      onServer(name).filter((d) => {
        const at = (d as { updatedAt?: Date }).updatedAt;
        return at instanceof Date && at.getTime() > cursors[name] - 60_000;
      }).length;
    expect(changed).toEqual(
      Object.fromEntries(LISTS.map((n) => [n, Math.max(pastCursor(n), 1)])),
    );
    // By hand: two debts written; one record each elsewhere, plus the list's
    // newest already held where that was not the one edited (bills, categories);
    // the payments had no `updatedAt` before, so only the edited one is found.
    expect(changed).toEqual({
      transactions: 1,
      bills: 2,
      billPayments: 1,
      debts: 2,
      debtPayments: 1,
      investmentGoals: 1,
      investmentContributions: 1,
      categories: 2,
    });
  });

  it("new records written on the phone appear on the laptop", async () => {
    on(laptop);
    await start();
    on(phone);
    later(HOUR);
    const repayment = await createDebtPayment(U, {
      debtId: "d1",
      amount: 15,
      date: new Date(),
    } as never);
    const paid = await markBillPaid(
      U,
      { id: "b2", name: "Phone", amount: 20, categoryId: "k1" },
      "2026-10",
      new Date(),
    );

    later(HOUR);
    on(laptop);
    const warm = await start();
    for (const name of LISTS) expect(warm[name]).toEqual(onServer(name));
    expect(warm.debtPayments.map((r) => r.id)).toContain(repayment);
    expect(warm.billPayments.map((r) => r.id)).toContain(paid.paymentId);
    expect(warm.transactions.map((r) => r.id)).toContain(paid.transactionId);
  });

  it("a delete on the phone disappears from the laptop", async () => {
    on(laptop);
    await start();
    on(phone);
    await start();

    later(HOUR);
    await deleteBill(U, "b2");
    await deleteCategory(U, "k2");
    await deleteDebtPayment(U, "r1");
    await unmarkBillPaid(U, { id: "p1", transactionId: "t-pay1" });
    const contribution = {
      id: "c2",
      ...memoryCollection("investmentContributions").c2,
    } as unknown as InvestmentContribution;
    const { transactionId } = await deleteContribution(U, contribution);
    expect(transactionId).toBe("t-c2");

    later(HOUR);
    on(laptop);
    const warm = await start();
    expect(labels()).not.toContain(expect.stringContaining("(whole)"));
    for (const name of LISTS) expect(warm[name]).toEqual(onServer(name));
    const ids = (name: List) => warm[name].map((r) => r.id);
    expect(ids("bills")).not.toContain("b2");
    expect(ids("categories")).not.toContain("k2");
    expect(ids("debtPayments")).not.toContain("r1");
    expect(ids("billPayments")).not.toContain("p1");
    expect(ids("transactions")).not.toContain("t-pay1");
    expect(ids("investmentContributions")).not.toContain("c2");
    expect(ids("transactions")).not.toContain("t-c2");
  });

  it("a bill's expense deleted from the ledger takes its payment off the other device too", async () => {
    on(laptop);
    await start();
    on(phone);
    later(HOUR);
    await deleteTransaction(U, "t-pay1", { userId: U, paymentId: "p1" });

    later(HOUR);
    on(laptop);
    const warm = await start();
    expect(warm.billPayments).toEqual(onServer("billPayments"));
    expect(warm.billPayments.map((r) => r.id)).toEqual(["p2"]);
  });
});

describe("documents from before `updatedAt`", () => {
  it("an old payment edited later gets `updatedAt` and is picked up; the untouched one stays", async () => {
    expect(memoryCollection("billPayments").p2.updatedAt).toBeUndefined();
    expect(memoryCollection("debtPayments").r3.updatedAt).toBeUndefined();
    on(laptop);
    await start();

    on(phone);
    later(HOUR);
    await updateBillPayment({ id: "p2" }, { amount: 21 });
    await updateDebtPayment("r3", { amount: 12, date: old });
    expect(memoryCollection("billPayments").p2.updatedAt).toBeInstanceOf(Date);
    expect(memoryCollection("debtPayments").r3.updatedAt).toBeInstanceOf(Date);

    later(HOUR);
    on(laptop);
    const warm = await start();
    expect(warm.billPayments).toEqual(onServer("billPayments"));
    expect(warm.debtPayments).toEqual(onServer("debtPayments"));
    expect(
      (warm.billPayments.find((r) => r.id === "p2") as { amount?: number })
        .amount,
    ).toBe(21);
    expect(
      (warm.debtPayments.find((r) => r.id === "r3") as { amount?: number })
        .amount,
    ).toBe(12);
    // Never stamped and never changed: still there, from the first whole read.
    expect(warm.billPayments.map((r) => r.id)).toContain("p1");
    expect(warm.debtPayments.map((r) => r.id)).toEqual(
      expect.arrayContaining(["r1", "r2"]),
    );
  });

  it("a write that skips `updatedAt` (an old copy of the app) is healed by the weekly whole read", async () => {
    on(laptop);
    await start();
    // Written the old way, straight into the store: no `updatedAt`.
    resetMemoryFirestore({
      ...Object.fromEntries(
        ["users", ...LISTS].map((name) => [name, memoryCollection(name)]),
      ),
      debtPayments: {
        ...memoryCollection("debtPayments"),
        r9: {
          userId: U,
          debtId: "d1",
          amount: 5,
          date: new Date(),
          createdAt: new Date(),
        },
      },
    });

    later(DAY);
    expect((await start()).debtPayments.map((r) => r.id)).not.toContain("r9");
    later(7 * DAY);
    const weekly = await start();
    expect(labels()).toContain("debtPayments (whole)");
    expect(weekly.debtPayments).toEqual(onServer("debtPayments"));
    expect(weekly.debtPayments.map((r) => r.id)).toContain("r9");
  });
});

describe("cascading deletes leave nothing stale", () => {
  it("a goal with its contributions and their mirrors, a debt with its repayments, a covered debt", async () => {
    on(laptop);
    await start();
    on(phone);
    later(HOUR);
    const before = Object.fromEntries(
      LISTS.map((n) => [n, onServer(n).map((r) => r.id)]),
    );

    await deleteInvestmentGoal(U, "g1");
    await deleteDebt(U, "d1", ["r1", "r2"]);
    await deleteCoveredDebt(U, "d2", ["r3"], {
      contributionId: "cov",
      expenseId: "t-cov",
    });

    // The second way: every document that left the server is in the deletion log.
    const after = Object.fromEntries(
      LISTS.map((n) => [n, onServer(n).map((r) => r.id)]),
    );
    const gone = LISTS.flatMap((n) =>
      before[n]
        .filter((id) => !after[n].includes(id))
        .map((id) => `${n}__${id}`),
    );
    expect(gone.sort()).toEqual(
      [
        "investmentGoals__g1",
        "investmentContributions__c1",
        "investmentContributions__c2",
        "transactions__t-c1",
        "transactions__t-c2",
        "debts__d1",
        "debtPayments__r1",
        "debtPayments__r2",
        "debts__d2",
        "debtPayments__r3",
        "investmentContributions__cov",
        "transactions__t-cov",
      ].sort(),
    );
    const log = Object.keys(
      (memoryCollection("users").u1.syncDeletes ?? {}) as object,
    );
    expect(log.sort()).toEqual(gone.sort());

    later(HOUR);
    on(laptop);
    const warm = await start();
    expect(labels()).not.toContain(expect.stringContaining("(whole)"));
    for (const name of LISTS) expect(warm[name]).toEqual(onServer(name));
    expect(warm.investmentGoals.map((r) => r.id)).toEqual(["g2"]);
    expect(warm.investmentContributions.map((r) => r.id)).toEqual(["c3"]);
    expect(warm.debts).toEqual([]);
    expect(warm.debtPayments).toEqual([]);
  });

  it("closing a goal takes it and its contributions off the other device", async () => {
    on(laptop);
    await start();
    on(phone);
    later(HOUR);
    await closeInvestmentGoal(U, "g2", [
      {
        id: "t-close",
        data: { amount: 30, type: "expense", date: new Date() } as never,
      },
    ]);

    later(HOUR);
    on(laptop);
    const warm = await start();
    for (const name of LISTS) expect(warm[name]).toEqual(onServer(name));
    expect(warm.investmentGoals.map((r) => r.id)).toEqual(["g1"]);
    expect(warm.investmentContributions.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(warm.transactions.map((r) => r.id)).toContain("t-close");
  });

  it("each cascade costs one write to the user document for its log, not one per list", async () => {
    on(phone);
    await start();
    later(HOUR);
    const syncDeletes = () =>
      Object.keys((memoryCollection("users").u1.syncDeletes ?? {}) as object)
        .length;
    const usersBefore = memoryCollection("users").u1.syncDeletes;
    expect(usersBefore).toBeUndefined();
    await deleteDebt(U, "d1", ["r1", "r2"]);
    expect(syncDeletes()).toBe(3);
  });
});

describe("account deletion", () => {
  it("still removes every document of the account and every list kept on the device", async () => {
    on(laptop);
    await start();
    expect([...laptop.keys()].some((k) => k.startsWith(`sync:${U}:`))).toBe(
      true,
    );

    const wipe = await deleteAllUserData(U);
    for (const name of OWNED_COLLECTIONS) {
      expect(
        Object.values(memoryCollection(name)).filter((d) => d.userId === U),
      ).toEqual([]);
    }
    expect(memoryCollection("users").u1).toBeUndefined();
    // The other user and the shared defaults are untouched.
    expect(memoryCollection("transactions").x1).toBeDefined();
    expect(memoryCollection("categories").def1).toBeDefined();
    expect(
      [...laptop.keys()].filter((k) => k.startsWith(`sync:${U}:`)),
    ).toEqual([]);
    // Counted a second way: the seed's u1 documents across the owned collections.
    seed();
    const seeded = OWNED_COLLECTIONS.reduce(
      (n, name) =>
        n +
        Object.values(memoryCollection(name)).filter((d) => d.userId === U)
          .length,
      0,
    );
    expect(wipe.deleted).toBe(seeded);
  });
});

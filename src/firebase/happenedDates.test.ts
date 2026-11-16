import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { enterDemo, exitDemo } from "../demo/demoMode";
import { memoryCollection, resetMemoryFirestore } from "../demo/memoryFirestore";
import { FutureDateError } from "../shared/utils/dates";
import { transferRecords } from "../features/transactions/transfers";
import { coveredFundingVars } from "../features/budget/coveredFunding";
import type { CreateDebtDTO, CreateTransactionDTO } from "../shared/types/IndexTypes";

// Things that HAPPENED are dated today or earlier (owner, 2026-11-14): the
// money writers refuse a day after today BEFORE anything is written, with a
// day of slack for time zones (`happenedLimit`: the start of the day after
// tomorrow). PLANNED dates — a bill's anchor, a goal's deadline, a debt's due
// date — are left alone.
//
// The data layer runs against the demo's in-memory store, so "nothing
// written" below is what the store really holds afterwards.

vi.mock("firebase/firestore", () => ({}));
vi.mock("firebase/auth", () => ({ GoogleAuthProvider: class GoogleAuthProvider {} }));
vi.mock("firebase/app-check", () => ({}));
vi.mock("firebase/app", () => ({ initializeApp: () => ({}), FirebaseError: class FirebaseError extends Error {} }));

type Api = typeof import("./firestore");
type BusinessApi = typeof import("./business");
let api: Api;
let business: BusinessApi;

beforeAll(async () => {
  enterDemo();
  api = await import("./firestore");
  business = await import("./business");
});
afterAll(() => exitDemo());

// «Today» is 16 Nov 2026, mid-afternoon, on this device.
const NOW = new Date(2026, 10, 16, 15, 30);
const today = new Date(2026, 10, 16);
const lateToday = new Date(2026, 10, 16, 23, 59);
/** The form's own way of storing a day: `new Date("yyyy-MM-dd")`, UTC midnight. */
const todayAsUtc = new Date("2026-11-16");
/** Let through on purpose: another time zone's "today" (see `happenedLimit`). */
const tomorrow = new Date(2026, 10, 17, 20, 0);
const dayAfterTomorrow = new Date(2026, 10, 18);
const nextWeek = new Date(2026, 10, 23);

const count = (col: string) => Object.keys(memoryCollection(col)).length;
const expense = (date: Date): CreateTransactionDTO => ({ amount: 20, type: "expense", categoryId: "food", date, description: "Φούρνος" });
const debt = (date: Date, dueDate?: Date): CreateDebtDTO => ({ person: "Νίκος", direction: "owed_by_me", amount: 100, date, ...(dueDate ? { dueDate } : {}) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetMemoryFirestore({});
});
afterEach(() => vi.useRealTimers());

describe("transactions (new, edit, «Ήρθε», quick add — all through createTransaction)", () => {
  it("refuses a day after today and writes nothing", async () => {
    await expect(api.createTransaction("u1", expense(nextWeek))).rejects.toBeInstanceOf(FutureDateError);
    await expect(api.createTransaction("u1", expense(dayAfterTomorrow))).rejects.toBeInstanceOf(FutureDateError);
    expect(count("transactions")).toBe(0);
  });

  it("accepts today, at any hour and as the form stores it", async () => {
    await api.createTransaction("u1", expense(today), "a");
    await api.createTransaction("u1", expense(lateToday), "b");
    await api.createTransaction("u1", expense(todayAsUtc), "c");
    await api.createTransaction("u1", expense(tomorrow), "d");
    expect(count("transactions")).toBe(4);
  });

  it("an edit to a future day is refused, the record left as it was", async () => {
    await api.createTransaction("u1", expense(today), "t1");
    await expect(api.updateTransaction("t1", { date: nextWeek })).rejects.toBeInstanceOf(FutureDateError);
    expect((memoryCollection("transactions").t1 as { date: Date }).date).toEqual(today);
  });

  it("an edit that leaves a future day (written before the rule) alone still saves", async () => {
    resetMemoryFirestore({ transactions: { old: { userId: "u1", ...expense(nextWeek) } } });
    await api.updateTransaction("old", { amount: 25, date: undefined });
    const row = memoryCollection("transactions").old as { amount: number; date: Date };
    expect(row.amount).toBe(25);
    expect(row.date).toEqual(nextWeek);
  });
});

describe("transfers", () => {
  const pair = (date: Date) => transferRecords({ id: "tr1", from: "bank", to: "cash", amount: 50, date, label: "Τράπεζα → Μετρητά" });

  it("refuses a day after today, writing neither half", async () => {
    await expect(api.saveTransfer("u1", pair(nextWeek))).rejects.toBeInstanceOf(FutureDateError);
    expect(count("transactions")).toBe(0);
  });

  it("accepts today", async () => {
    await api.saveTransfer("u1", pair(today));
    expect(count("transactions")).toBe(2);
  });

  it("a correction may keep the future day it already had, but not move to another", async () => {
    await api.saveTransfer("u1", pair(nextWeek), today, nextWeek);
    expect(count("transactions")).toBe(2);
    await expect(api.saveTransfer("u1", pair(new Date(2026, 10, 25)), today, nextWeek)).rejects.toBeInstanceOf(FutureDateError);
  });
});

describe("goal and investment deposits, withdrawals, money paid for you", () => {
  const deposit = (date: Date) => ({ goalId: "g1", amount: 100, contributionType: "deposit" as const, date });

  it("a deposit dated next week is refused — the owner's report — with nothing written", async () => {
    await expect(api.createContributionWithTransaction("u1", deposit(nextWeek), expense(nextWeek))).rejects.toBeInstanceOf(FutureDateError);
    expect(count("investmentContributions")).toBe(0);
    expect(count("transactions")).toBe(0);
  });

  it("a deposit dated today is written, with its mirror", async () => {
    await api.createContributionWithTransaction("u1", deposit(today), expense(today));
    expect(count("investmentContributions")).toBe(1);
    expect(count("transactions")).toBe(1);
  });

  it("«πλήρωσε για μένα»: refused after today, all three or none; accepted today", async () => {
    const vars = (date: Date) => coveredFundingVars({ goal: { id: "g1", name: "Ταξίδι" }, who: "Νίκος", amount: 300, date, categoryId: "travel", notes: "", expenseNotes: "" });
    const ids = { contributionId: "c1", debtId: "d1", expenseId: "e1" };
    await expect(api.createCoveredFunding("u1", ids, vars(nextWeek))).rejects.toBeInstanceOf(FutureDateError);
    expect(count("investmentContributions") + count("debts") + count("transactions")).toBe(0);
    await api.createCoveredFunding("u1", ids, vars(today));
    expect(count("investmentContributions") + count("debts") + count("transactions")).toBe(3);
  });
});

describe("debts: creation, repayments, forgiveness", () => {
  it("a debt that began next week is refused; today is accepted", async () => {
    await expect(api.createDebt("u1", debt(nextWeek))).rejects.toBeInstanceOf(FutureDateError);
    expect(count("debts")).toBe(0);
    await api.createDebt("u1", debt(today), "d1");
    expect(count("debts")).toBe(1);
  });

  it("a repayment after today is refused; today is accepted", async () => {
    await expect(api.createDebtPayment("u1", { debtId: "d1", amount: 10, date: nextWeek })).rejects.toBeInstanceOf(FutureDateError);
    expect(count("debtPayments")).toBe(0);
    await api.createDebtPayment("u1", { debtId: "d1", amount: 10, date: today }, "p1");
    expect(count("debtPayments")).toBe(1);
  });

  it("a repayment correction may keep its stored future day, not move to one", async () => {
    resetMemoryFirestore({ debtPayments: { p1: { userId: "u1", debtId: "d1", amount: 10, date: nextWeek } } });
    await api.updateDebtPayment("p1", { amount: 12, date: nextWeek }, nextWeek);
    expect((memoryCollection("debtPayments").p1 as { amount: number }).amount).toBe(12);
    await expect(api.updateDebtPayment("p1", { amount: 12, date: nextWeek })).rejects.toBeInstanceOf(FutureDateError);
    await api.updateDebtPayment("p1", { amount: 12, date: today });
    expect((memoryCollection("debtPayments").p1 as { date: Date }).date).toEqual(today);
  });

  it("a forgiveness after today is refused; today is accepted", async () => {
    resetMemoryFirestore({ debts: { d1: { userId: "u1", ...debt(new Date(2026, 9, 1)) } } });
    await expect(api.updateDebt("d1", { forgiven: { date: nextWeek, amount: 100 } })).rejects.toBeInstanceOf(FutureDateError);
    expect((memoryCollection("debts").d1 as { forgiven?: unknown }).forgiven).toBeUndefined();
    await api.updateDebt("d1", { forgiven: { date: today, amount: 100 } });
    expect((memoryCollection("debts").d1 as { forgiven?: unknown }).forgiven).toBeDefined();
  });

  it("the loan form over a debt dated in the future before the rule: kept, it saves; moved later, it is refused", async () => {
    resetMemoryFirestore({ debts: { d1: { userId: "u1", ...debt(nextWeek) } } });
    await api.editDebt("d1", { ...debt(nextWeek), amount: 150 }, nextWeek);
    expect((memoryCollection("debts").d1 as { amount: number }).amount).toBe(150);
    await expect(api.editDebt("d1", debt(new Date(2026, 10, 30)), nextWeek)).rejects.toBeInstanceOf(FutureDateError);
  });
});

describe("bill payments: «Πληρώθηκε», corrections, settling overdue months", () => {
  const bill = { id: "b1", name: "ΔΕΗ", amount: 80, categoryId: "utilities" };

  it("«Πληρώθηκε» dated after today is refused with nothing written; today is accepted", async () => {
    await expect(api.markBillPaid("u1", bill, "2026-12", nextWeek)).rejects.toBeInstanceOf(FutureDateError);
    expect(count("billPayments") + count("transactions")).toBe(0);
    // Paying AHEAD is a later period, not a later day: December paid today is fine.
    await api.markBillPaid("u1", bill, "2026-12", today);
    expect(count("billPayments")).toBe(1);
    expect(count("transactions")).toBe(1);
  });

  it("a payment correction to a future day is refused; a day left out is not checked", async () => {
    resetMemoryFirestore({ billPayments: { p1: { userId: "u1", billId: "b1", periodKey: "2026-11", amount: 80, paidDate: nextWeek } } });
    await expect(api.updateBillPayment({ id: "p1" }, { paidDate: new Date(2026, 10, 30) })).rejects.toBeInstanceOf(FutureDateError);
    await api.updateBillPayment({ id: "p1" }, { amount: 75 });
    expect((memoryCollection("billPayments").p1 as { amount: number }).amount).toBe(75);
  });

  it("settling overdue months: refused if one is dated after today", async () => {
    const row = (id: string, paidDate: Date) => ({ id, billId: "b1", periodKey: id, amount: 80, paidDate });
    await expect(api.markBillPeriodsSettled("u1", [row("2026-09", new Date(2026, 8, 10)), row("2026-12", nextWeek)])).rejects.toBeInstanceOf(FutureDateError);
    expect(count("billPayments")).toBe(0);
    await api.markBillPeriodsSettled("u1", [row("2026-09", new Date(2026, 8, 10)), row("2026-10", new Date(2026, 9, 10))]);
    expect(count("billPayments")).toBe(2);
  });
});

describe("bank gap records and business closings", () => {
  const gap = (date: Date) => ({ transactions: [{ id: "g1", data: expense(date) }], transfers: [], debts: [], payments: [], debtCash: [] });

  it("gap records after today are refused, all or none; today is accepted", async () => {
    await expect(api.saveGapRecords("u1", gap(nextWeek))).rejects.toBeInstanceOf(FutureDateError);
    expect(count("transactions")).toBe(0);
    await api.saveGapRecords("u1", gap(today));
    expect(count("transactions")).toBe(1);
  });

  const closing = (date: Date) => ({
    entryId: "be1",
    closing: { businessId: "shop", date, incomes: [{ lineId: "in", amount: 300 }], expenses: [{ lineId: "out", amount: 100 }] },
    personal: { id: "tx1", data: { amount: 200, type: "income" as const, categoryId: "business", date, description: "Κέρδος · Φαρμακείο" } },
  });

  it("a closing after today is refused with nothing written; today is accepted", async () => {
    await expect(business.saveClosing("u1", closing(nextWeek))).rejects.toBeInstanceOf(FutureDateError);
    expect(count("businessEntries") + count("transactions")).toBe(0);
    await business.saveClosing("u1", closing(today));
    expect(count("businessEntries")).toBe(1);
    expect(count("transactions")).toBe(1);
  });
});

describe("PLANNED dates may be in the future", () => {
  it("a bill's anchor and first month, a goal's deadline, a debt's due date", async () => {
    await api.createBill("u1", { name: "Ασφάλεια", amount: 300, categoryId: "insurance", frequency: "yearly", anchorDate: nextWeek, startsOn: "2027-01" }, "b1");
    await api.createInvestmentGoal("u1", { name: "Ταξίδι", goalType: "targeted", targetAmount: 900, targetPeriod: "custom", deadline: new Date(2027, 6, 1), planFrom: "2027-01-01" }, true, "g1");
    await api.createDebt("u1", debt(today, new Date(2027, 2, 1)), "d1");
    expect(count("bills")).toBe(1);
    expect(count("investmentGoals")).toBe(1);
    expect(count("debts")).toBe(1);
  });
});

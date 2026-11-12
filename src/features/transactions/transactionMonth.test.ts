import { describe, it, expect } from "vitest";
import type { Transaction } from "../../shared/types/IndexTypes";
import { transactionMonth, transactionMonthRange } from "./transactionMonth";
import { computeFilterTotals, totalsSide } from "./filterTotals";

// The Transactions calendar's month, added up by hand from the records below.
//
// November 2026:
//   3rd   Salary +1.200 (income), Groceries −45,50 (expense)
//   5th   a transfer of 300 between two cards (both halves), Maria's loan +200 — neither counts
//   10th  Coffee −20 (expense), a goal deposit of 100 — the deposit does not count
//   12th  50 taken back out of the goal (counts in, as on the Overview), an ETF deposit of 70 (does not)
// and October's rent, −500, which is not November's.
//
// In:  1.200 + 50        = 1.250,00
// Out: 45,50 + 20        =    65,50
// Net: 1.250 − 65,50     = 1.184,50

const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour);
let n = 0;
const tx = (description: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, userId: "u", type: "expense", amount, categoryId: "c", description, date, createdAt: date, updatedAt: date, ...extra }) as Transaction;

const NOV = 10;
const salary = tx("Salary", 1200, at(NOV, 3, 9), { type: "income" });
const groceries = tx("Groceries", 45.5, at(NOV, 3, 18));
const moveOut = tx("To savings", 300, at(NOV, 5), { id: "xfer_tr1_out", transferId: "tr1", transferPart: "out", accountId: "a1" });
const moveIn = tx("To savings", 300, at(NOV, 5), { id: "xfer_tr1_in", type: "income", transferId: "tr1", transferPart: "in", accountId: "a2" });
const loan = tx("Loan from Maria", 200, at(NOV, 5), { type: "income", debtId: "d1" });
const coffee = tx("Coffee", 20, at(NOV, 10));
const goalIn = tx("Holiday", 100, at(NOV, 10), { type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, goalId: "g1", contributionType: "deposit" });
const goalOut = tx("Holiday", 50, at(NOV, 12), { type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, goalId: "g1", contributionType: "withdrawal" });
const etf = tx("ETF", 70, at(NOV, 12), { type: "investment", isInvestmentTransaction: true, goalId: "i1", contributionType: "deposit" });
const rent = tx("Rent", 500, at(9, 28));
const all = [salary, groceries, moveOut, moveIn, loan, coffee, goalIn, goalOut, etf, rent];

describe("transactionMonth", () => {
  const { days, totals } = transactionMonth(all, new Date(2026, NOV, 1));

  it("adds up the month as worked out by hand", () => {
    expect(totals.earned).toBe(1250);
    expect(totals.spent).toBe(65.5);
    expect(totals.net).toBe(1184.5);
  });

  it("the days add up to the month's tiles — a second way to the same figures", () => {
    const daysIn = [...days.values()].reduce((s, d) => s + d.in, 0);
    const daysOut = [...days.values()].reduce((s, d) => s + d.out, 0);
    expect(daysIn).toBe(totals.earned);
    expect(daysOut).toBe(totals.spent);
    // And record by record, through the rule each record is counted by.
    const inMonth = [...days.values()].flatMap((d) => d.records);
    const byRecord = inMonth.reduce((s, r) => s + (totalsSide(r) === "in" ? r.amount : totalsSide(r) === "out" ? -r.amount : 0), 0);
    expect(byRecord).toBe(totals.net);
  });

  it("equals the Transactions page's totals for the month's records", () => {
    const novemberAsTheListHasIt = all.filter((r) => r.date instanceof Date && r.date.getMonth() === NOV && r.id !== "xfer_tr1_in");
    expect(totals).toEqual(computeFilterTotals(novemberAsTheListHasIt));
  });

  it("each day by hand: what came in, went out and the net", () => {
    expect([...days.keys()].sort((a, b) => a - b)).toEqual([3, 5, 10, 12]);
    expect(days.get(3)).toMatchObject({ in: 1200, out: 45.5, net: 1154.5 });
    expect(days.get(10)).toMatchObject({ in: 0, out: 20, net: -20 });
    expect(days.get(12)).toMatchObject({ in: 50, out: 0, net: 50 });
  });

  it("leaves transfers and a loan's cash out, and lists a transfer once", () => {
    const fifth = days.get(5)!;
    expect(fifth).toMatchObject({ in: 0, out: 0, net: 0 });
    expect(fifth.records.map((r) => r.id).sort()).toEqual([loan.id, "xfer_tr1_out"].sort());
  });

  it("lists exactly the day's records, newest written first, and nothing from another month", () => {
    expect(days.get(3)!.records).toEqual([groceries, salary]);
    expect(days.get(10)!.records.map((r) => r.description).sort()).toEqual(["Coffee", "Holiday"]);
    expect([...days.values()].flatMap((d) => d.records)).not.toContain(rent);
  });

  it("October holds only its rent", () => {
    const october = transactionMonth(all, new Date(2026, 9, 1));
    expect(october.totals).toEqual({ earned: 0, spent: 500, net: -500, count: 1 });
    expect([...october.days.keys()]).toEqual([28]);
  });
});

describe("transactionMonthRange", () => {
  it("runs from the first record's month to the last's, and always takes in this month", () => {
    const { first, last } = transactionMonthRange(all, new Date(2026, NOV, 20));
    expect(first).toEqual(new Date(2026, 9, 1));
    expect(last).toEqual(new Date(2026, NOV, 1));
    const later = transactionMonthRange([], new Date(2027, 1, 3));
    expect(later).toEqual({ first: new Date(2027, 1, 1), last: new Date(2027, 1, 1) });
  });
});

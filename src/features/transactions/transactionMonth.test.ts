import { describe, it, expect } from "vitest";
import type { Transaction } from "../../shared/types/IndexTypes";
import { transactionMonth, transactionMonthRange } from "./transactionMonth";
import { computeFilterTotals, totalsSide } from "./filterTotals";
import { isDebtTransfer } from "../../shared/utils/moneyModel";

const round2 = (n: number) => Math.round(n * 100) / 100;

// The Transactions calendar's month, added up by hand from the records below.
//
// November 2026:
//   3rd   Salary +1.200 (income), Groceries −45,50 (expense)
//   5th   a transfer of 300 between two cards (both halves), Maria's loan +200 — neither counts
//   10th  Coffee −20 (expense), a goal deposit of 100 — the deposit does not count
//   12th  50 taken back out of the goal (counts in, as on the Overview), an ETF deposit of 70 (does not)
//   18th  Kostas lends 100 — the day's only record
//   19th  Kostas lends 100, and 45,50 + 31,60 of shopping
//   20th  a repayment: 60 off the debt and 4 of interest — the interest is a real cost
// and October's rent, −500, which is not November's.
//
// In:  1.200 + 50                            = 1.250,00
// Out: 45,50 + 20 + 45,50 + 31,60 + 4        =   146,60
// Net: 1.250 − 146,60                        = 1.103,40
//
// Borrowed, counted apart and in neither of those: 200 + 100 + 100 in, 60 out.

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
// A debt's own cash records, as `debtCashRecords` writes them: the sum
// borrowed (`loan`), the part of a repayment that came off the debt
// (`principal`) — neither earned nor spent — and the interest, which is a
// real cost.
const lentToMe = tx("Kostas", 100, at(NOV, 18), { id: "debt_d2", type: "income", debtId: "d2", debtPart: "loan" });
const lentAgain = tx("Kostas", 100, at(NOV, 19), { id: "debt_d3", type: "income", debtId: "d3", debtPart: "loan" });
const shopping = tx("Super market", 45.5, at(NOV, 19, 10));
const taxi = tx("Taxi", 31.6, at(NOV, 19, 20));
const repaid = tx("Kostas", 60, at(NOV, 20), { id: "debtpay_p1", debtId: "d2", debtPaymentId: "p1", debtPart: "principal" });
const repaidInterest = tx("Kostas", 4, at(NOV, 20), { id: "debtint_p1", debtId: "d2", debtPaymentId: "p1", debtPart: "interest" });
const all = [salary, groceries, moveOut, moveIn, loan, coffee, goalIn, goalOut, etf, rent, lentToMe, lentAgain, shopping, taxi, repaid, repaidInterest];

describe("transactionMonth", () => {
  const { days, totals } = transactionMonth(all, new Date(2026, NOV, 1));

  it("adds up the month as worked out by hand", () => {
    expect(totals.earned).toBe(1250);
    expect(totals.spent).toBe(146.6);
    expect(totals.net).toBe(1103.4);
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
    expect([...days.keys()].sort((a, b) => a - b)).toEqual([3, 5, 10, 12, 18, 19, 20]);
    expect(days.get(3)).toMatchObject({ in: 1200, out: 45.5, net: 1154.5 });
    expect(days.get(10)).toMatchObject({ in: 0, out: 20, net: -20 });
    expect(days.get(12)).toMatchObject({ in: 50, out: 0, net: 50 });
  });

  it("leaves transfers and a loan's cash out, and lists a transfer once", () => {
    const fifth = days.get(5)!;
    expect(fifth).toMatchObject({ in: 0, out: 0, net: 0 });
    expect(fifth.records.map((r) => r.id).sort()).toEqual([loan.id, "xfer_tr1_out"].sort());
  });

  // ── Borrowed money, counted apart (owner, 2026-11-24) ─────────────────────
  // What makes a record «δανεικά» is the debts feature's own cash marks
  // (`debtId` with `debtPart` other than interest) — the same rule that keeps
  // it out of `in`/`out`, so the day's own figure and the borrowed one can
  // never overlap or double-count a cent.

  it("a day whose only record is a loan: nothing of its own, 100 borrowed", () => {
    // By hand: 18 November holds one record, Kostas's 100 coming in.
    expect(days.get(18)).toMatchObject({ in: 0, out: 0, net: 0, borrowedIn: 100, borrowedOut: 0 });
    expect(days.get(18)!.records).toEqual([lentToMe]);
  });

  it("a day with a loan and ordinary records: its own money is the shopping alone", () => {
    const day = days.get(19)!;
    // By hand: −45,50 − 31,60 = −77,10, and the 100 borrowed beside it, not in it.
    expect(day).toMatchObject({ in: 0, out: 77.1, net: -77.1, borrowedIn: 100, borrowedOut: 0 });
    // A second, independent way: add the day's records up by the list's own
    // rule, then add the borrowed ones up by the debts' rule. Neither route
    // touches the figures above.
    const byRule = day.records.reduce((sum, r) => sum + (totalsSide(r) === "in" ? r.amount : totalsSide(r) === "out" ? -Math.abs(r.amount) : 0), 0);
    expect(round2(byRule)).toBe(day.net);
    expect(round2(byRule)).toBe(-(shopping.amount + taxi.amount));
    const borrowed = day.records.filter((r) => isDebtTransfer(r) && r.type === "income").reduce((sum, r) => sum + r.amount, 0);
    expect(borrowed).toBe(day.borrowedIn);
    expect(borrowed).toBe(lentAgain.amount);
    // And the two never meet: what is borrowed is in no side of the day's own.
    expect(day.in + day.out + day.borrowedIn).toBe(177.1);
  });

  it("a repayment day: the 60 off the debt is borrowed money out, the 4 of interest a real cost", () => {
    const day = days.get(20)!;
    expect(day).toMatchObject({ in: 0, out: 4, net: -4, borrowedIn: 0, borrowedOut: 60 });
    // A second way: the interest record is the only one the list counts, and
    // the principal is the only one the debts' rule claims.
    expect(day.records.filter((r) => totalsSide(r) !== null)).toEqual([repaidInterest]);
    expect(day.records.filter(isDebtTransfer).map((r) => r.id)).toEqual([repaid.id]);
  });

  it("a day with no borrowed money says nothing of any", () => {
    expect(days.get(3)).toMatchObject({ borrowedIn: 0, borrowedOut: 0 });
    expect(days.get(10)).toMatchObject({ borrowedIn: 0, borrowedOut: 0 });
    expect(days.get(12)).toMatchObject({ borrowedIn: 0, borrowedOut: 0 });
  });

  it("the month's borrowed money is the days' borrowed money, and none of it reaches the tiles", () => {
    const borrowedIn = round2([...days.values()].reduce((s, d) => s + d.borrowedIn, 0));
    const borrowedOut = round2([...days.values()].reduce((s, d) => s + d.borrowedOut, 0));
    // By hand: Maria's 200 on the 5th, Kostas's 100 on the 18th and 100 on the 19th; 60 repaid on the 20th.
    expect(borrowedIn).toBe(400);
    expect(borrowedOut).toBe(60);
    // A second, independent way: straight from the month's records.
    const fromRecords = all.filter((r) => r.date instanceof Date && r.date.getMonth() === NOV && isDebtTransfer(r));
    expect(round2(fromRecords.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0))).toBe(borrowedIn);
    expect(round2(fromRecords.filter((r) => r.type !== "income").reduce((s, r) => s + Math.abs(r.amount), 0))).toBe(borrowedOut);
    // The tiles would read 1.650 in and 206,60 out if a cent of it had leaked.
    expect(totals.earned).toBe(1250);
    expect(totals.spent).toBe(146.6);
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

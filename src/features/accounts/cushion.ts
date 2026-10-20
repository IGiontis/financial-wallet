import { firestoreToDate } from "../../shared/utils/dates";
import { currentRate, isLoan, monthlyInstalment } from "../debts/debtsUtils";
import { goalMonthlyTarget, plannableGoals } from "../plannerPage/plannerUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

// The cushion: how many months of what is already spoken for the money set
// aside would cover. Moved here from the old Allocation page, figures and all.

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What one debt claims from *this* month.
 *
 * The whole remaining balance is the wrong figure: a €655 loan due next June
 * taken out of this month in full made a solvent month look nearly broke. A
 * loan has its instalment; anything else is spread evenly over the months left
 * until it is due, and with no due date it stands as owed now.
 */
export function debtMonthlyShare(debt: Pick<DebtWithStatus, "remaining" | "dueDate" | "amount" | "interestRate" | "termMonths" | "interestFreeMonths" | "rateType" | "baseRate" | "margin">, now: Date = new Date()): number {
  // A loan already has a monthly figure, set by whoever lent the money.
  if (isLoan(debt)) return monthlyInstalment(debt.amount, currentRate(debt), debt.termMonths ?? 0, debt.interestFreeMonths ?? 0);

  if (!debt.dueDate) return round2(debt.remaining);

  const due = firestoreToDate(debt.dueDate);
  const monthsLeft = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());

  // Due this month, or the day has gone: all of it, now.
  if (monthsLeft <= 0) return round2(debt.remaining);
  return round2(debt.remaining / (monthsLeft + 1));
}

export interface Committed {
  bills: number;
  goals: number;
  debts: number;
  total: number;
}

/** What is already spoken for each month. */
export function committedMonthly(bills: BillWithStatus[], goals: InvestmentGoalWithStats[], debts: DebtWithStatus[], now: Date = new Date()): Committed {
  const billTotal = round2(bills.filter((b) => b.isActive).reduce((sum, b) => sum + b.monthlyEquivalent, 0));
  // The goals the Planner charges, and no others: a paused goal claims nothing.
  const goalTotal = round2(plannableGoals(goals).reduce((sum, g) => sum + goalMonthlyTarget(g, now), 0));
  // Only what you owe. Money owed *to* you is not income until it arrives.
  const debtTotal = round2(debts.filter((d) => d.direction === "owed_by_me" && !d.isSettled).reduce((sum, d) => sum + debtMonthlyShare(d, now), 0));

  return { bills: billTotal, goals: goalTotal, debts: debtTotal, total: round2(billTotal + goalTotal + debtTotal) };
}

/**
 * What a bad month still has to pay: the bills and the instalments. Not the
 * goals' monthly figures — those stop the day the income does, and counting
 * them asked the cushion to keep filling the very goals it is drawn from.
 */
export function cushionMonthly(committed: Pick<Committed, "bills" | "debts">): number {
  return round2(committed.bills + committed.debts);
}

/** Months of committed costs worth holding in cash. A common convention, not advice. */
export const EMERGENCY_MONTHS = 3;

/**
 * What a cushion would need to be. Measured against committed costs rather
 * than income: what a bad month has to cover is the rent and the bills, not
 * the salary that did not arrive.
 */
export function emergencyTarget(committed: Committed, months: number = EMERGENCY_MONTHS): number {
  return round2(cushionMonthly(committed) * Math.max(1, months));
}

/**
 * How long the money set aside would carry the month's fixed costs: whole
 * months from one up, days below it — "8 days" says what "0.26 months" hides.
 * Undefined with nothing fixed to cover.
 */
export function cushionLasts(saved: number, monthly: number): { months: number } | { days: number } | undefined {
  if (monthly <= 0) return undefined;
  const months = Math.max(saved, 0) / monthly;
  if (months >= 1) return { months: Math.floor(months * 10) / 10 };
  return { days: Math.floor(months * 30) };
}

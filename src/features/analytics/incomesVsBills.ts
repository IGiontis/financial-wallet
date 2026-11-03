import { monthForecast, periodTotals } from "../bills/billsUtils";
import { isActiveIncome, monthSummary, resolveIncomes, type Income } from "../incomes/incomesUtils";
import type { OccurrenceOverride } from "../plannerPage/plannerActuals";
import type { BillWithStatus, Transaction } from "../../shared/types/IndexTypes";

// «Έσοδα και πάγια, μήνα με μήνα»: a year of what the Incomes page brings in
// against what the Bills page asks to be paid, twelve months at once.
//
// Nothing here is a sum of its own. A month's incomes are the Incomes page's
// month (`monthSummary` over `resolveIncomes`), its bills the Bills page's
// month (`monthForecast`, which buckets an every-N-months bill into the months
// it lands in, whole) — so the figure for a month here is the figure the two
// pages show for it, and cannot drift from them. Both lists are already on
// hand (the user document and the bills query every screen holds): no read.

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Which figure a month shows.
 *
 *   actual     what came in («Ήρθε») and what was paid — only.
 *   scheduled  what the two pages say the month brings and costs: anything
 *              already settled at what it came to, the rest at what it is
 *              expected to be.
 *
 * THE one switch. Today: the months gone by are actual, this month and the
 * ones ahead scheduled. To show scheduled everywhere (or actual up to today),
 * change this function and nothing else — the chart, its legend, the table and
 * the totals all read the source off each month.
 */
export function monthSource(monthStart: Date, now: Date): YearSource {
  return monthStart < new Date(now.getFullYear(), now.getMonth(), 1) ? "actual" : "scheduled";
}

export type YearSource = "actual" | "scheduled";

export interface IncomesBillsMonth {
  /** "2026-03" */
  key: string;
  start: Date;
  source: YearSource;
  income: number;
  bills: number;
  /** income − bills: what the month leaves after its bills, or (negative) how far short it falls. */
  difference: number;
}

export interface IncomesBillsYear {
  year: number;
  months: IncomesBillsMonth[];
  income: number;
  bills: number;
  difference: number;
}

export interface IncomesBillsInput {
  incomes: Income[];
  /** The words said per occurrence («δεν θα έρθει», another amount) — shared with the Planner. */
  overrides?: Record<string, OccurrenceOverride>;
  transactions: Transaction[];
  bills: BillWithStatus[];
  now: Date;
}

export function incomesVsBills(year: number, { incomes, overrides, transactions, bills, now }: IncomesBillsInput): IncomesBillsYear {
  // An income or a bill switched off since still came in or was paid in the
  // months it ran: those are facts, so the actual months count them. What is
  // still to come is only what is still on.
  const everyIncome = incomes.map((income) => ({ ...income, active: true }));
  const statuses = resolveIncomes(everyIncome, { transactions, overrides, now }, new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59, 999));
  const activeIds = new Set(incomes.filter(isActiveIncome).map((i) => i.id));
  const scheduledStatuses = statuses.filter((s) => activeIds.has(s.incomeId));
  const everyBill = bills.map((bill) => ({ ...bill, isActive: true }));

  const months = Array.from({ length: 12 }, (_, m): IncomesBillsMonth => {
    const start = new Date(year, m, 1);
    const key = monthKey(start);
    const source = monthSource(start, now);
    const offset = (year - now.getFullYear()) * 12 + (m - now.getMonth());

    let income: number;
    let paidOut: number;
    if (source === "actual") {
      income = monthSummary(statuses, key).arrived;
      // Only what was paid; an unpaid time is not money that left.
      paidOut = periodTotals(monthForecast(everyBill, now, offset)).paid;
    } else {
      // What has already come in or been paid stays, whatever was switched
      // off since — an income that arrived on the 3rd and was archived on the
      // 5th still arrived. Only what is still to come asks whether it is on.
      const ahead = monthSummary(scheduledStatuses, key);
      income = monthSummary(statuses, key).arrived + ahead.missing + ahead.asking;
      paidOut = periodTotals(monthForecast(everyBill, now, offset)).paid + periodTotals(monthForecast(bills, now, offset)).due;
    }

    income = round2(income);
    const owed = round2(paidOut);
    return { key, start, source, income, bills: owed, difference: round2(income - owed) };
  });

  const income = round2(months.reduce((sum, m) => sum + m.income, 0));
  const billsTotal = round2(months.reduce((sum, m) => sum + m.bills, 0));
  return { year, months, income, bills: billsTotal, difference: round2(income - billsTotal) };
}

/** The years the picker offers: 2024 (or the first income's start, if earlier) to next year. */
export function incomesBillsYears(incomes: Income[], now: Date, first = 2024): number[] {
  let from = first;
  for (const income of incomes) {
    const year = Number(income.start?.slice(0, 4));
    if (Number.isFinite(year) && year > 1900 && year < from) from = year;
  }
  return Array.from({ length: now.getFullYear() + 1 - from + 1 }, (_, i) => from + i);
}

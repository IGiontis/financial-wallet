import { differenceInCalendarDays, endOfMonth, getDaysInMonth, startOfDay, startOfMonth } from "date-fns";
import type { Transaction } from "../../shared/types/IndexTypes";
import { expectedAmount, incomeOccurrences, incomeWindow, isActiveIncome, resolveIncomes, type Income, type IncomeStatus } from "../incomes/incomesUtils";
import { lookbackStart, type Actuals, type ResolvedOccurrence } from "./plannerActuals";
import type { PlannerEvent, PlanRow } from "./plannerUtils";

// The plan's money in, read from «Έσοδα».
//
// The Planner used to keep its own copy of what arrives — a salary field, with
// a detected figure standing in when it was left empty, and income lines typed
// as monthly rates — while the Incomes page kept another. Two lists of the same
// money, and two answers to "has it come?". Now there is one list, the incomes,
// and one answer: every time an income is expected is put through the same
// resolver the Incomes page uses (`resolveIncomes`), from the same first day,
// so the two screens cannot disagree about a single occurrence.
//
// What the resolver says, the plan does:
//
//   • arrived («Ήρθε», a record found for it, or «ήρθε» said) — already in the
//     money the plan starts from, so not counted again;
//   • not coming this time — not counted;
//   • asked about («ήταν ήδη στην τράπεζα;») — left out until answered, the
//     way the salary always was: under-counting for a day beats spending the
//     same pay twice;
//   • late — held on today, as the salary always was;
//   • still to come — on its day, or the day said for this time, at its figure
//     (a variable income: the mean of its last three «Ήρθε») or the amount said
//     for this time.
//
// An income carried over from the old Planner's monthly lines has no day yet.
// Its month's figure is spread over the days of the month, exactly as the line
// it came from was, so moving it across changes no figure in the plan.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One undated time, spread over the days of its month inside the window — day offsets, both included. */
export interface IncomeSpread {
  from: number;
  to: number;
  /** The month's figure; the walk adds a day's share of it. */
  amount: number;
}

export interface IncomePlan {
  rows: PlanRow[];
  events: PlannerEvent[];
  occurrences: ResolvedOccurrence[];
  spreads: IncomeSpread[];
  /** Records an income found as its own, which no one-off may claim again. */
  claimed: Set<string>;
}

export interface IncomePlanWindow {
  /** Local midnight of the first day. */
  today: Date;
  end: Date;
  /** Day offset of `end`. */
  days: number;
  skipIds: ReadonlySet<string>;
  now: Date;
  actuals?: Actuals;
}

/** The salary first, then the rest as «Έσοδα» lists them. */
const salaryFirst = (incomes: Income[]) => [...incomes.filter((i) => i.isSalary), ...incomes.filter((i) => !i.isSalary)];

/**
 * The last day a time still matters on: its own day, or for an undated one the
 * end of its month — it is expected anywhere in it, and this month's is still
 * owed on the 30th although its "date" is the 1st.
 */
const lastDayOf = (occurrence: { date: Date; undated?: boolean }) => (occurrence.undated ? endOfMonth(occurrence.date) : occurrence.date);

/** The times from today to the end, taken at their word — this month's undated one included. */
const timesAhead = (income: Income, today: Date, end: Date) => incomeOccurrences(income, startOfMonth(today), end).filter((o) => lastDayOf(o) >= today);

/** What the plan does with one time, by what the Incomes page says about it. */
function toResolved(status: IncomeStatus, income: Income, plain: number, today: Date, transactions: Transaction[]): ResolvedOccurrence {
  const base = { key: status.key, source: "income" as const, refId: income.id, label: income.name, amount: plain, date: status.date, pay: income.isSalary ? true : undefined, overridden: status.overridden };
  switch (status.state) {
    case "arrived":
    case "found": {
      const arrival = status.arrival!;
      const record = arrival.transactionIds.length > 0 ? transactions.find((tx) => tx.id === arrival.transactionIds[0]) : undefined;
      return {
        ...base,
        status: "received",
        plannedAmount: 0,
        matched: { date: arrival.date, amount: arrival.amount, label: record?.description || income.name, manual: arrival.manual, recorded: status.state === "arrived" && !arrival.manual ? true : undefined },
      };
    }
    case "skipped":
      return { ...base, status: "skipped", plannedAmount: 0 };
    case "ask":
      return { ...base, status: "unconfirmed", plannedAmount: 0 };
    case "missed":
      // Past the look-back with nothing said: given up on, as the plan has
      // always given up on what is that old.
      return { ...base, status: "assumed", plannedAmount: 0 };
    case "late":
      return { ...base, status: "late", plannedDate: today, plannedAmount: status.expected };
    case "due":
    case "upcoming": {
      const when = startOfDay(status.expectedDate);
      return { ...base, status: "due", plannedDate: when < today ? today : when, plannedAmount: status.expected };
    }
  }
}

/**
 * Every active income as a row of the plan, and each time it is still owed as
 * what the walk adds — see the note at the top.
 *
 * With records to check against (`actuals`), each time from the look-back on
 * is resolved, and what the user said about it, kept under
 * `income:{id}:{YYYY-MM-DD}` in `planner-occurrences`, is honoured. Without
 * them every time from today is taken at its word, as the plan always did.
 *
 * Switched off in the Planner (`planner-skip` holds its id) an income adds
 * nothing and is asked nothing — but it is still resolved with the rest, so
 * what it found as its own is not handed to a one-off instead.
 */
export function planIncomes(incomes: Income[], { today, end, days, skipIds, now, actuals }: IncomePlanWindow): IncomePlan {
  const active = incomes.filter(isActiveIncome);
  const rows: PlanRow[] = [];
  const events: PlannerEvent[] = [];
  const occurrences: ResolvedOccurrence[] = [];
  const spreads: IncomeSpread[] = [];
  const claimed = new Set<string>();
  const transactions = actuals?.transactions ?? [];
  const lookFrom = actuals ? lookbackStart(now) : today;

  // Resolved together and from the Incomes page's own first day, in its own
  // order, so a record goes to the same time here as there.
  const byIncome = new Map<string, IncomeStatus[]>();
  if (actuals) {
    const statuses = resolveIncomes(active, { transactions, overrides: actuals.overrides, lastReadingAt: actuals.lastReadingAt, now }, incomeWindow(now).from, end);
    for (const status of statuses) {
      if (status.arrival && !status.arrival.manual) for (const id of status.arrival.transactionIds) claimed.add(id);
      if (lastDayOf(status) < lookFrom) continue;
      const list = byIncome.get(status.incomeId) ?? [];
      list.push(status);
      byIncome.set(status.incomeId, list);
    }
  }

  for (const income of salaryFirst(active)) {
    const enabled = !skipIds.has(income.id);
    const plain = expectedAmount(income, transactions).amount;
    const pay = income.isSalary ? true : undefined;
    let total = 0;
    let count = 0;

    /** Its month's figure spread over the days of that month the window holds. */
    const spread = (date: Date, amount: number) => {
      const monthStart = startOfMonth(date);
      const from = Math.max(differenceInCalendarDays(monthStart, today), 0);
      const to = Math.min(differenceInCalendarDays(endOfMonth(monthStart), today), days);
      if (to < from) return;
      spreads.push({ from, to, amount });
      // Summed unrounded, rounded once below — as a budget line's total is.
      total += (amount * (to - from + 1)) / getDaysInMonth(monthStart);
      count += 1;
    };

    const place = (event: PlannerEvent) => {
      if (event.date > end) return;
      events.push(event);
      total += event.amount;
      count += 1;
    };

    if (enabled && actuals) {
      for (const status of byIncome.get(income.id) ?? []) {
        const resolved = toResolved(status, income, plain, today, transactions);
        occurrences.push(resolved);
        if (resolved.status !== "due" && resolved.status !== "late") continue;
        if (status.undated) spread(status.date, resolved.plannedAmount);
        else place({ kind: "income", label: income.name, amount: resolved.plannedAmount, date: resolved.plannedDate!, occurrenceKey: resolved.key, late: resolved.status === "late", expected: status.date, pay, incomeId: income.id });
      }
    } else if (enabled) {
      for (const occurrence of timesAhead(income, today, end)) {
        if (occurrence.undated) spread(occurrence.date, plain);
        else place({ kind: "income", label: income.name, amount: plain, date: occurrence.date, pay, incomeId: income.id });
      }
    }

    rows.push({
      id: income.id,
      source: "income",
      label: income.name,
      total: enabled ? round2(total) : 0,
      // Switched off, the times it would have brought from today on.
      occurrences: enabled ? count : timesAhead(income, today, end).length,
      each: plain,
      kind: "income",
      pay,
      enabled,
    });
  }

  return { rows, events, occurrences, spreads, claimed };
}

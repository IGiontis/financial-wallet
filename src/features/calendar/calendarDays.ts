import { endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { monthForecast } from "../bills/billsUtils";
import { isSettled, type IncomeStatus } from "../incomes/incomesUtils";
import { buildPlan, oneOffDates, type OneOff, type PlannerEvent } from "../plannerPage/plannerUtils";
import type { Actuals } from "../plannerPage/plannerActuals";
import { firestoreToDate } from "../../shared/utils/dates";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

// The calendar's days: what comes in and what goes out on each, from the same
// sources the rest of the app reads — bills, incomes, loan instalments, goals —
// so a day here and the same thing on its own page cannot disagree.
//
// Nothing is estimated that those pages do not already estimate. The one new
// piece is the arrangement by day, and the one new rule is that a figure is
// "done" when the money has moved (a bill paid, an income that came, an
// instalment that was paid) and "todo" when it is still on its way.

export type CalendarKind = "bill" | "income" | "debt" | "goal";

/** done: it happened. todo: still to come. late: its day has gone, or it wants an answer. */
export type CalendarState = "done" | "todo" | "late";

export interface CalendarItem {
  id: string;
  date: Date;
  kind: CalendarKind;
  /** Money in (income) or out (everything else). */
  direction: "in" | "out";
  label: string;
  /** Always positive: `direction` says which way it goes. */
  amount: number;
  state: CalendarState;
  /** An estimate — a variable bill or income nobody has given this time's figure for. */
  approximate?: boolean;
}

/** One side of a day — what came in, or what went out. */
export interface DaySide {
  total: number;
  count: number;
  /** Every item of this side has happened: drawn solid. Otherwise drawn as a tint. */
  allDone: boolean;
  /** Something of this side is overdue, or waits for an answer. */
  anyLate: boolean;
}

export interface CalendarDay {
  date: Date;
  items: CalendarItem[];
  in?: DaySide;
  out?: DaySide;
}

/** How far ahead the plans below look: the month on screen can be up to a year away. */
export const CALENDAR_AHEAD_MONTHS = 13;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole calendar months from `now`'s month to `month`'s — negative for the past. */
export const monthOffsetFrom = (now: Date, month: Date) => (month.getFullYear() - now.getFullYear()) * 12 + (month.getMonth() - now.getMonth());

const inMonth = (date: Date, month: Date) => date >= startOfMonth(month) && date <= endOfMonth(month);

/**
 * The instalments and the goals' deposits still to come, as the plan counts
 * them — worked out once for the whole year ahead rather than for each month
 * paged to.
 *
 * Two plans, one for each, because the plan reports both as the same kind of
 * event and nothing on an event says which it is. Neither holds a bill or an
 * income: those are read from their own pages' sources, where what has
 * already happened is also known.
 */
export function calendarPlans(input: {
  goals: InvestmentGoalWithStats[];
  debts: DebtWithStatus[];
  actuals: Actuals;
  skipIds?: Set<string>;
  now: Date;
}): { goalEvents: PlannerEvent[]; debtEvents: PlannerEvent[] } {
  const base = { bills: [] as BillWithStatus[], incomes: [], lines: [], oneOffs: [], skipIds: input.skipIds, now: input.now, horizon: CALENDAR_AHEAD_MONTHS };
  return {
    goalEvents: buildPlan({ ...base, goals: input.goals, debts: [] }).events.filter((e) => e.kind === "goal"),
    // With the records, so an instalment already paid this month is not listed again as to come.
    debtEvents: buildPlan({ ...base, goals: [], debts: input.debts, actuals: input.actuals }).events.filter((e) => e.kind === "goal"),
  };
}

export interface CalendarSources {
  now: Date;
  bills: BillWithStatus[];
  /** Every income's times, resolved — see `resolveIncomes`. */
  statuses: IncomeStatus[];
  incomeName: (incomeId: string) => string;
  /** The planner's own extra incomes, with the ones switched off already taken out. */
  oneOffs: OneOff[];
  /** What is owed by the user — loans and IOUs they pay back. */
  debts: DebtWithStatus[];
  goalEvents: PlannerEvent[];
  debtEvents: PlannerEvent[];
}

/** Every item that falls in `month`, earliest first. */
export function calendarItems(month: Date, sources: CalendarSources): CalendarItem[] {
  const { now } = sources;
  const today = startOfDay(now);
  const items: CalendarItem[] = [];

  // ── Bills: on the day each is due, settled or not ──────────────────────────
  for (const entry of monthForecast(sources.bills, now, monthOffsetFrom(now, month)).items) {
    items.push({
      id: `bill:${entry.bill.id}:${entry.periodKey}:${entry.installmentIndex ?? 0}`,
      date: startOfDay(entry.date),
      kind: "bill",
      direction: "out",
      label: entry.bill.name,
      amount: entry.amount,
      state: entry.isPaid ? "done" : startOfDay(entry.date) < today ? "late" : "todo",
      approximate: entry.isVariable && !entry.isPaid,
    });
  }

  // ── Incomes: on the day it came, or the day it is expected ─────────────────
  for (const status of sources.statuses) {
    if (isSettled(status) && status.arrival) {
      if (!inMonth(status.arrival.date, month)) continue;
      items.push({ id: `income:${status.key}`, date: startOfDay(status.arrival.date), kind: "income", direction: "in", label: sources.incomeName(status.incomeId), amount: status.arrival.amount, state: "done" });
      continue;
    }
    // Skipped, given up on, and the ones with no day of their own have no place on a day.
    if (status.undated || status.state === "skipped" || status.state === "missed" || !inMonth(status.expectedDate, month)) continue;
    items.push({
      id: `income:${status.key}`,
      date: startOfDay(status.expectedDate),
      kind: "income",
      direction: "in",
      label: sources.incomeName(status.incomeId),
      amount: status.expected,
      // Late, or waiting for the owner to say whether it came — either way it needs them.
      state: status.state === "late" || status.state === "ask" ? "late" : "todo",
      approximate: status.approximate,
    });
  }

  for (const oneOff of sources.oneOffs) {
    for (const date of oneOffDates(oneOff, startOfMonth(month), endOfMonth(month))) {
      const day = startOfDay(date);
      items.push({ id: `oneoff:${oneOff.id}:${day.getTime()}`, date: day, kind: "income", direction: "in", label: oneOff.label, amount: round2(oneOff.amount), state: day < today ? "done" : "todo" });
    }
  }

  // ── Loans and IOUs the user pays back ──────────────────────────────────────
  for (const debt of sources.debts) {
    for (const payment of debt.payments) {
      const date = startOfDay(firestoreToDate(payment.date));
      if (!inMonth(date, month)) continue;
      items.push({ id: `debt:${payment.id}`, date, kind: "debt", direction: "out", label: debt.label || debt.person, amount: round2(Math.abs(payment.amount)), state: "done" });
    }
  }
  sources.debtEvents.forEach((event, index) => {
    if (!inMonth(event.date, month)) return;
    items.push({ id: `debt-due:${event.occurrenceKey ?? index}`, date: startOfDay(event.date), kind: "debt", direction: "out", label: event.label, amount: round2(Math.abs(event.amount)), state: event.late ? "late" : "todo" });
  });

  // ── Goals: what the plan puts aside, where it puts it ──────────────────────
  sources.goalEvents.forEach((event, index) => {
    if (!inMonth(event.date, month)) return;
    items.push({ id: `goal:${event.label}:${startOfDay(event.date).getTime()}:${index}`, date: startOfDay(event.date), kind: "goal", direction: "out", label: event.label, amount: round2(Math.abs(event.amount)), state: "todo" });
  });

  return items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.direction.localeCompare(b.direction) || a.label.localeCompare(b.label));
}

const side = (items: CalendarItem[]): DaySide | undefined =>
  items.length === 0
    ? undefined
    : { total: round2(items.reduce((sum, item) => sum + item.amount, 0)), count: items.length, allDone: items.every((item) => item.state === "done"), anyLate: items.some((item) => item.state === "late") };

/** The month's items by day of the month (1–31), each day with its two sides. */
export function groupByDay(items: CalendarItem[]): Map<number, CalendarDay> {
  const days = new Map<number, CalendarDay>();
  for (const item of items) {
    const key = item.date.getDate();
    const day = days.get(key);
    if (day) day.items.push(item);
    else days.set(key, { date: item.date, items: [item] });
  }
  for (const day of days.values()) {
    day.in = side(day.items.filter((item) => item.direction === "in"));
    day.out = side(day.items.filter((item) => item.direction === "out"));
  }
  return days;
}

/** What the month brings and what it takes, settled and still to come apart. */
export function monthTotals(items: CalendarItem[]) {
  const sum = (match: (item: CalendarItem) => boolean) => round2(items.filter(match).reduce((total, item) => total + item.amount, 0));
  return {
    in: sum((i) => i.direction === "in"),
    inDone: sum((i) => i.direction === "in" && i.state === "done"),
    out: sum((i) => i.direction === "out"),
    outDone: sum((i) => i.direction === "out" && i.state === "done"),
  };
}

/**
 * The figure a day shows: what is still to happen on it, in less out — so it
 * goes down as things are paid — and, once everything on it has happened, the
 * whole day again (by then drawn pale and struck through, so the two cannot be
 * mistaken for each other). Bills of 50 and 120: 170, then 50 once the 120 is
 * paid, then 170 again once the 50 is.
 */
export function shownNet(day: Pick<CalendarDay, "items">): number {
  const pending = day.items.filter((item) => item.state !== "done");
  const counted = pending.length > 0 ? pending : day.items;
  return round2(counted.reduce((sum, item) => sum + (item.direction === "in" ? item.amount : -item.amount), 0));
}

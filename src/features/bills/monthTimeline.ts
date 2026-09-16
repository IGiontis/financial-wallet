import { monthForecast } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";

// The month as it actually happens, in order.
//
// The page could say what a month costs and which months are dear. Neither says
// *when* inside the month the money goes — and for anyone paid once a month that
// is the question that decides whether a month is comfortable or not. Rent on
// the 1st and pay on the 28th is a very different month from the same figures
// the other way round, and no total can tell them apart.
//
// Nothing is estimated here: bills carry their own dates, and the pay day comes
// from the same figure the planner uses, so the two screens cannot disagree.

export interface TimelineEvent {
  key: string;
  date: Date;
  label: string;
  /** Negative when money leaves, positive when it arrives. */
  amount: number;
  kind: "bill" | "income";
  /** Bills already settled, and income whose day has passed. */
  done: boolean;
  bill?: BillWithStatus;
}

/** When money arrives, as the caller knows it. */
export interface MonthIncome {
  amount: number;
  /** Day of the month. Clamped to the month's length, so 31 works in February. */
  dayOfMonth: number;
  label: string;
}

export interface MonthTimeline {
  monthStart: Date;
  /** Earliest first. */
  events: TimelineEvent[];
  /** Everything leaving this month, settled or not. Positive. */
  out: number;
  /** Everything arriving. */
  incoming: number;
  /** When the money arrives, if it does. */
  firstIncome?: Date;
  /**
   * What leaves before that day — the figure the whole view exists for, since it
   * is what has to be covered out of last month's money. Zero when nothing is
   * known to arrive.
   */
  beforeIncome: number;
  /**
   * Where today sits among the events, as the index to draw a marker before.
   *
   * Absent when the month on screen is not the one we are in, and — deliberately
   * — when something already falls due today: the day is marked by its own row,
   * and a second mark beside it would be two things pointing at one date.
   */
  todayAt?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The given day of a month, pulled back to the last one when the month is short. */
const dayWithin = (monthStart: Date, day: number) => {
  const last = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(Math.max(Math.round(day), 1), last));
};

export function monthTimeline(bills: BillWithStatus[], now: Date = new Date(), income?: MonthIncome, monthOffset = 0): MonthTimeline {
  const breakdown = monthForecast(bills, now, monthOffset);
  const monthStart = breakdown.monthStart;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const events: TimelineEvent[] = breakdown.items.map((item, index) => ({
    key: `${item.bill.id}-${item.periodKey}-${index}`,
    date: item.date,
    label: item.bill.name,
    amount: -item.amount,
    kind: "bill" as const,
    done: item.isPaid,
    bill: item.bill,
  }));

  const incomeDate = income ? dayWithin(monthStart, income.dayOfMonth) : undefined;
  if (income && incomeDate) {
    events.push({ key: "__income__", date: incomeDate, label: income.label, amount: income.amount, kind: "income", done: incomeDate <= today });
  }

  // Same day, money out first. Nobody knows the order within a day, and reading
  // it the other way would quietly shrink the gap this view is about.
  events.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "income" ? 1 : 0) - (b.kind === "income" ? 1 : 0));

  const out = events.filter((event) => event.kind === "bill").reduce((sum, event) => sum - event.amount, 0);
  const incoming = events.filter((event) => event.kind === "income").reduce((sum, event) => sum + event.amount, 0);

  const firstIncomeIndex = events.findIndex((event) => event.kind === "income");
  const beforeIncome = firstIncomeIndex === -1 ? 0 : events.slice(0, firstIncomeIndex).reduce((sum, event) => sum - Math.min(event.amount, 0), 0);

  const sameMonth = monthStart.getFullYear() === today.getFullYear() && monthStart.getMonth() === today.getMonth();
  const marked = events.some((event) => event.date.getTime() === today.getTime());
  // Everything before it has happened; the marker goes in front of the first
  // thing that has not.
  const after = events.findIndex((event) => event.date > today);
  const todayAt = !sameMonth || marked ? undefined : after === -1 ? events.length : after;

  return {
    monthStart,
    events,
    todayAt,
    out: round2(out),
    incoming: round2(incoming),
    firstIncome: firstIncomeIndex === -1 ? undefined : events[firstIncomeIndex].date,
    beforeIncome: round2(beforeIncome),
  };
}

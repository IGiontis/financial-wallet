import { amountDueNext, billUrgency, daysUntilDeadline } from "../bills/billsUtils";
import { SALARY_ROW_ID, type PlannerPlan } from "../plannerPage/plannerUtils";
import { firestoreToDate } from "../../shared/utils/dates";
import { isPlainExpense } from "./overviewUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// What the overview's tabs say, worked out away from the screen.
//
// Every figure here is read off the same helpers the page it comes from uses —
// the bills' urgency, the debts' remaining — so the overview can never say
// something the Bills or Debts page would contradict one tap later.

export interface AttentionItem {
  kind: "bill" | "debt";
  id: string;
  name: string;
  amount: number;
  /** Negative when it is already late. */
  days: number;
  late: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * What wants doing — late, or due within the week — most urgent first.
 *
 * Bills are picked by `billUrgency`, the same rule behind the number on the
 * menu, so the list under "Today" and that badge always count the same bills.
 * Debts join when their "back by" date is that close: only what you owe, since
 * money owed to you is not something you can act on today.
 */
export function attentionItems(bills: BillWithStatus[], debts: DebtWithStatus[], now: Date = new Date(), soonDays = 7): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const bill of bills) {
    if (!bill.isActive) continue;
    const urgency = billUrgency(bill, now);
    if (urgency !== "late" && urgency !== "soon") continue;
    const days = daysUntilDeadline(bill, now) ?? 0;
    // What is due by that date, which for a bill paid in parts is the part and
    // not the year: the gym's €120, not its €360.
    items.push({ kind: "bill", id: bill.id, name: bill.name, amount: amountDueNext(bill, now), days, late: urgency === "late" });
  }

  const today = startOfDay(now);
  for (const debt of debts) {
    if (debt.direction !== "owed_by_me" || debt.isSettled || !debt.dueDate) continue;
    const days = Math.round((startOfDay(firestoreToDate(debt.dueDate)).getTime() - today.getTime()) / DAY);
    if (days > soonDays) continue;
    items.push({ kind: "debt", id: debt.id, name: debt.label || debt.person, amount: debt.remaining, days, late: days < 0 });
  }

  return items.sort((a, b) => Number(b.late) - Number(a.late) || a.days - b.days);
}

/**
 * "Will I make it to pay day?" — answered from the Planner's own plan.
 *
 * The Overview used to answer this with a sum of its own, today's balance less
 * the bills before pay day, while the Planner one tap away followed every line,
 * one-off, goal and instalment on top. The two disagreed on the same screen
 * pair. Now there is one walk: the plan's day-by-day balance, read up to the
 * last day before the pay arrives, and taken apart into what made it.
 *
 * Pay day is the plan's next salary, wherever the plan has put it — a salary
 * already in early is gone from the plan, so the answer runs to the next one,
 * and a late one sits on today. With no salary planned the window runs to the
 * end of the month, and `known` says so.
 */
export interface PaydayOutlook {
  /** Pay day, or the month's last day when no pay is planned. */
  date: Date;
  known: boolean;
  /** Days in the window, today included — what "a day" divides by. */
  days: number;
  /** The plan's starting figure: the money there is now. */
  start: number;
  /** Money out before pay day, positive: bills, goals & instalments, the budget lines. */
  bills: number;
  commitments: number;
  lines: number;
  /** Anything arriving before pay day that is not the pay itself. */
  incoming: number;
  /** At the end of the last day before pay day. */
  left: number;
  lowest: number;
  /** The first day the balance goes under zero, and what tipped it, when one outgoing did. */
  breaksOn?: Date;
  breaksAt?: string;
  /** What is left per day of the window, never below zero. */
  perDay: number;
}

type PlanWalk = Pick<PlannerPlan, "openingBalance" | "points" | "events">;

export function paydayOutlook(plan: PlanWalk, now: Date): PaydayOutlook {
  const today = startOfDay(now);
  const nextPay = plan.events
    .filter((e) => e.label === SALARY_ROW_ID && e.amount > 0)
    .map((e) => startOfDay(e.date))
    .filter((d) => d.getTime() >= today.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const date = nextPay ?? new Date(today.getFullYear(), today.getMonth() + 1, 0);
  // Pay day itself is outside the window: the pay lands that day. Without one,
  // the month's last day is inside it.
  const endExclusive = nextPay ? nextPay.getTime() : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();

  const round = (n: number) => Math.round(n * 100) / 100;
  let bills = 0;
  let commitments = 0;
  let lines = 0;
  let incoming = 0;
  let left = plan.openingBalance;
  let lowest = plan.openingBalance;
  let breaksOn: Date | undefined;
  let breaksAt: string | undefined;

  for (const point of plan.points) {
    if (point.date.getTime() >= endExclusive) break;
    for (const event of point.events) {
      if (event.amount >= 0) incoming += event.amount;
      else if (event.kind === "bill") bills -= event.amount;
      else commitments -= event.amount;
    }
    lines += point.accruedOut;
    incoming += point.accruedIn;
    left = point.balance;
    lowest = Math.min(lowest, point.balance);
    if (!breaksOn && point.balance < 0) {
      breaksOn = point.date;
      // The biggest outgoing of the day, if there was one; a line's slow daily
      // drain has no single name to give.
      breaksAt = [...point.events].filter((e) => e.amount < 0).sort((a, b) => a.amount - b.amount)[0]?.label;
    }
  }

  const days = Math.max(1, Math.round((endExclusive - today.getTime()) / DAY));
  left = round(left);
  return {
    date,
    known: !!nextPay,
    days,
    start: round(plan.openingBalance),
    bills: round(bills),
    commitments: round(commitments),
    lines: round(lines),
    incoming: round(incoming),
    left,
    lowest: round(lowest),
    breaksOn,
    breaksAt,
    perDay: left > 0 ? Math.floor((left / days) * 100) / 100 : 0,
  };
}

/**
 * Where the month's spending went, biggest first, the tail folded into one.
 *
 * Counted with the dashboard's own test for an expense — so the parts here add
 * up to exactly the "went out" figure beside them, never to a second total.
 */
export function spendingByCategory(transactions: Transaction[], top = 4): { total: number; parts: { categoryId: string | null; amount: number }[] } {
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const tx of transactions) {
    if (!isPlainExpense(tx)) continue;
    const amount = Math.abs(tx.amount);
    total += amount;
    byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + amount);
  }
  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const round = (n: number) => Math.round(n * 100) / 100;
  const parts: { categoryId: string | null; amount: number }[] = sorted.slice(0, top).map(([categoryId, amount]) => ({ categoryId, amount: round(amount) }));
  const rest = sorted.slice(top).reduce((sum, [, amount]) => sum + amount, 0);
  // Null is "everything else" — only there when there is a tail to fold.
  if (rest > 0) parts.push({ categoryId: null, amount: round(rest) });
  return { total: round(total), parts };
}

/**
 * How far along the goals with a target are, together: what is saved against
 * what they aim for. Open-ended goals have no target to be a share of, so they
 * are left out rather than counted as 0% done.
 */
export function goalsProgress(goals: InvestmentGoalWithStats[]): { saved: number; target: number; percent: number } {
  let saved = 0;
  let target = 0;
  for (const goal of goals) {
    if (!goal.isActive || goal.isCompleted || !goal.targetAmount || goal.targetAmount <= 0) continue;
    saved += Math.min(goal.totalSaved, goal.targetAmount);
    target += goal.targetAmount;
  }
  return { saved: Math.round(saved * 100) / 100, target: Math.round(target * 100) / 100, percent: target > 0 ? Math.floor((saved / target) * 100) : 0 };
}

import { billUrgency, currentPause, daysUntilDeadline, expectedAmount } from "../bills/billsUtils";
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
    items.push({ kind: "bill", id: bill.id, name: bill.name, amount: expectedAmount(bill), days, late: urgency === "late" });
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
 * What is left of today's balance once the bills due before pay day are paid.
 *
 * Deliberately simpler than the planner, which starts from a figure you type
 * and follows every line and one-off you have set up: this starts from the
 * balance the app actually holds and takes off only the bills, so it answers
 * one plain question without claiming to be the plan. Bills switched off for
 * the season are not owed and are left out.
 */
export function untilPayday(balance: number, bills: BillWithStatus[], payday: Date): { owed: number; left: number; count: number } {
  let owed = 0;
  let count = 0;
  const end = startOfDay(payday).getTime() + DAY - 1;

  for (const bill of bills) {
    if (!bill.isActive || bill.isPaidThisPeriod || !bill.nextDueDate) continue;
    const state = currentPause(bill)?.state;
    if (state === "paused" || state === "ended") continue;
    if (bill.nextDueDate.getTime() > end) continue;
    owed += expectedAmount(bill);
    count += 1;
  }

  owed = Math.round(owed * 100) / 100;
  return { owed, left: Math.round((balance - owed) * 100) / 100, count };
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

// Pinned to the owner's time zone before any date exists: a year of days walks
// through both of its clock changes, and the readings sit at fixed hours.
process.env.TZ = "Europe/Athens";

import { describe, it, expect } from "vitest";
import { addDays, addHours, startOfMonth, subMonths } from "date-fns";
import { ALLOCATION_MOVED_KEY, DEMO_IDS, DEMO_UNLOGGED, demoCollections, demoData, type DemoData, type DemoLanguage } from "./fixtures";
import { DEMO_UID } from "./demoUser";
import { billOverdue, billUrgency, billsNeedingAttention, computeBillStatus, daysUntilDeadline } from "../features/bills/billsUtils";
import { ACCOUNTS_KEY, CHECK_INS_KEY, accountOf, balanceAnchors, mainAccount, projectedTotal, readCheckIns, realDelta, type BalanceCheckIn, type MoneyAccount } from "../features/accounts/accountsUtils";
import { currentBalance, isAfterReading } from "../shared/utils/balance";
import { computeDebtStatus } from "../features/debts/debtsUtils";
import { debtCashDrift } from "../features/debts/debtCash";
import { INCOMES_KEY, lateCount, resolveIncomes, type Income } from "../features/incomes/incomesUtils";
import { computeGoalStats } from "../features/budget/investmentsUtils";
import { fillParts, partsTotals } from "../features/budget/goalParts";
import { BUSINESS_CATEGORY_ID, VIRTUAL_CATEGORIES } from "../shared/utils/categories";
import { isSpending } from "../shared/utils/moneyModel";
import { PLANNER_KEYS } from "../features/plannerPage/plannerInputs";
import { ALLOCATION_KEYS } from "../features/plannerPage/allocationMigration";
import { TOUR_SEEN_KEY } from "../features/tour/tourState";
import { firestoreToDate, toISODay } from "../shared/utils/dates";
import { closingFigures, closingLineIds, forBusiness, monthByExpenseLine, monthSummary, personalMove } from "../features/business/businessSummary";
import { BUSINESSES_KEY, BUSINESS_ON_KEY } from "../features/business/businessKeys";
import { carriesPayee } from "../features/names/payeeNames";
import type { Business } from "../shared/types/IndexTypes";

// The demo's account has to look like a real one on whatever day it is opened:
// every reference pointing at something that exists, nothing dated in the
// future, one bill late and one due soon, the bank readings adding up to what
// the records say. Each of those is checked here by the app's own functions —
// the same ones the screens use — and then again a second way where the money
// allows it, across every day of a year, so a month end or a February cannot
// break it.

const round2 = (n: number) => Math.round(n * 100) / 100;
const workspaceOf = (data: DemoData) => data.user.workspace as Record<string, unknown>;
const accountsOf = (data: DemoData) => workspaceOf(data)[ACCOUNTS_KEY] as MoneyAccount[];
const checkInsOf = (data: DemoData) => workspaceOf(data)[CHECK_INS_KEY] as BalanceCheckIn[];
const incomesOf = (data: DemoData) => workspaceOf(data)[INCOMES_KEY] as Income[];

/** Everything that must hold of the account built on `now`. Returns what failed, so a year of days reports at once. */
function problems(data: DemoData, now: Date): string[] {
  const out: string[] = [];
  const fail = (what: string) => out.push(`${now.toISOString()}: ${what}`);
  const ids = <T extends { id: string }>(rows: T[]) => new Set(rows.map((r) => r.id));
  const accounts = accountsOf(data);
  const accountIds = ids(accounts);
  const categoryIds = ids(data.categories);
  const transactionIds = ids(data.transactions);

  // ── Every id points at something ──
  if (transactionIds.size !== data.transactions.length) fail("duplicate transaction ids");
  for (const tx of data.transactions) {
    if (tx.categoryId && !categoryIds.has(tx.categoryId) && !VIRTUAL_CATEGORIES[tx.categoryId]) fail(`transaction ${tx.id} has unknown category ${tx.categoryId}`);
    if (!tx.categoryId && !tx.isInvestmentTransaction) fail(`transaction ${tx.id} has no category`);
    if (tx.accountId && !accountIds.has(tx.accountId)) fail(`transaction ${tx.id} has unknown account ${tx.accountId}`);
    if (tx.billId && !data.bills.some((b) => b.id === tx.billId)) fail(`transaction ${tx.id} names a missing bill`);
    if (tx.goalId && !data.investmentGoals.some((g) => g.id === tx.goalId)) fail(`transaction ${tx.id} names a missing goal`);
    if (tx.incomeId && !incomesOf(data).some((i) => i.id === tx.incomeId)) fail(`transaction ${tx.id} names a missing income`);
    if (tx.debtId && !data.debts.some((d) => d.id === tx.debtId)) fail(`transaction ${tx.id} names a missing debt`);
    if (tx.date.getTime() > now.getTime()) fail(`transaction ${tx.id} is in the future`);
    if (!(tx.amount > 0)) fail(`transaction ${tx.id} has amount ${tx.amount}`);
    if (tx.userId !== DEMO_UID) fail(`transaction ${tx.id} belongs to ${tx.userId}`);
  }
  for (const p of data.billPayments) {
    if (!data.bills.some((b) => b.id === p.billId)) fail(`payment ${p.id} names a missing bill`);
    const mirror = data.transactions.find((t) => t.id === p.transactionId);
    if (!mirror) fail(`payment ${p.id} has no expense`);
    else if (mirror.amount !== p.amount || mirror.date.getTime() !== p.paidDate.getTime()) fail(`payment ${p.id} disagrees with its expense`);
    if (p.paidDate.getTime() > now.getTime()) fail(`payment ${p.id} is in the future`);
  }
  for (const c of data.investmentContributions) {
    if (!data.investmentGoals.some((g) => g.id === c.goalId)) fail(`contribution ${c.id} names a missing goal`);
    if (c.date.getTime() > now.getTime()) fail(`contribution ${c.id} is in the future`);
    if (c.accountId && !accountIds.has(c.accountId)) fail(`contribution ${c.id} has unknown account`);
  }
  for (const p of data.debtPayments) {
    if (!data.debts.some((d) => d.id === p.debtId)) fail(`debt payment ${p.id} names a missing debt`);
    if (p.date.getTime() > now.getTime()) fail(`debt payment ${p.id} is in the future`);
  }
  for (const income of incomesOf(data)) if (income.categoryId && !categoryIds.has(income.categoryId)) fail(`income ${income.id} has unknown category`);

  // ── The businesses: every closing names its business's lines, and it and its personal record name each other and agree ──
  const businesses = workspaceOf(data)[BUSINESSES_KEY] as Business[];
  const words = data.user.locale === "el" ? { profit: "Κέρδος", loss: "Ζημιά" } : { profit: "Profit", loss: "Loss" };
  if (categoryIds.has(BUSINESS_CATEGORY_ID)) fail("a categories document stands for «Δουλειά»");
  for (const e of data.businessEntries) {
    if (e.date.getTime() > now.getTime() || e.createdAt.getTime() > now.getTime()) fail(`closing ${e.id} is in the future`);
    if (e.userId !== DEMO_UID) fail(`closing ${e.id} belongs to ${e.userId}`);
    const business = businesses.find((b) => b.id === e.businessId);
    if (!business) {
      fail(`closing ${e.id} names a missing business ${e.businessId}`);
      continue;
    }
    if (e.incomes.length + e.expenses.length === 0) fail(`closing ${e.id} has no amount`);
    if (e.incomes.length > 30 || e.expenses.length > 30) fail(`closing ${e.id} has too many lines`);
    for (const l of e.incomes) {
      if (!(l.amount > 0)) fail(`closing ${e.id} has an income of ${l.amount}`);
      if (!business.incomeLines.some((x) => x.id === l.lineId)) fail(`closing ${e.id} names an income line ${l.lineId} not of ${business.name}`);
    }
    for (const l of e.expenses) {
      if (!(l.amount > 0)) fail(`closing ${e.id} has an expense of ${l.amount}`);
      if (l.lineId ? !business.expenseLines.some((x) => x.id === l.lineId) : !l.name?.trim()) fail(`closing ${e.id} has an expense with neither a line of ${business.name} nor a name`);
    }
    if (JSON.stringify(e.lineIds) !== JSON.stringify(closingLineIds(e))) fail(`closing ${e.id} has lineIds out of step`);
    const move = personalMove(closingFigures(e).profit);
    const record = data.transactions.find((t) => t.id === e.linkedTransactionId);
    if (!move) {
      if (e.linkedTransactionId) fail(`closing ${e.id} at zero names a record`);
    } else if (!record) fail(`closing ${e.id} has no personal record`);
    else if (record.businessEntryId !== e.id || record.businessId !== e.businessId || record.type !== move.type || record.amount !== move.amount || record.date.getTime() !== e.date.getTime() || record.accountId !== e.accountId) fail(`closing ${e.id} disagrees with its record`);
    else if (record.categoryId !== BUSINESS_CATEGORY_ID) fail(`closing ${e.id}'s record is filed under ${record.categoryId}`);
    else if (record.description !== `${move.type === "income" ? words.profit : words.loss} · ${business.name}`) fail(`closing ${e.id}'s record reads ${record.description}`);
  }
  for (const tx of data.transactions.filter((t) => t.businessEntryId)) {
    if (!data.businessEntries.some((e) => e.id === tx.businessEntryId && e.linkedTransactionId === tx.id)) fail(`record ${tx.id} names a missing closing`);
    if (carriesPayee(tx)) fail(`closing record ${tx.id} is counted as a payee`);
  }
  // Nothing else is filed under «Δουλειά».
  for (const tx of data.transactions) if (tx.categoryId === BUSINESS_CATEGORY_ID && !tx.businessEntryId) fail(`record ${tx.id} is filed under «Δουλειά» with no closing`);

  // ── Bills: the internet late by days, not months; the phone soon; nothing else asking ──
  const statuses = data.bills.map((b) => computeBillStatus(b, data.billPayments, now));
  for (const status of statuses) {
    const urgency = billUrgency(status, now);
    if (status.id === DEMO_IDS.lateBill) {
      const overdue = billOverdue(status, now);
      if (urgency !== "late" || overdue.count !== 1) fail(`the late bill is ${urgency} with ${overdue.count} overdue`);
      const late = -(daysUntilDeadline(status, now) ?? 0);
      if (late < 1 || late > 10) fail(`the late bill is ${late} days late`);
    } else if (status.id === DEMO_IDS.soonBill) {
      if (urgency !== "soon") fail(`the soon bill is ${urgency}`);
      const days = daysUntilDeadline(status, now) ?? -1;
      if (days < 0 || days > 3) fail(`the soon bill is due in ${days} days`);
    } else if (urgency === "late" || urgency === "soon") fail(`bill ${status.id} is ${urgency}`);
  }
  if (billsNeedingAttention(statuses, now) !== 2) fail(`${billsNeedingAttention(statuses, now)} bills need attention`);

  // ── Incomes: a salary that has come, and nothing late ──
  const salary = incomesOf(data).find((i) => i.isSalary);
  if (!salary) fail("no salary");
  const salaries = data.transactions.filter((t) => t.incomeId === DEMO_IDS.incomes.salary);
  if (salaries.length < 5) fail(`only ${salaries.length} salaries recorded`);
  const latest = readCheckIns(checkInsOf(data), accounts, data.transactions).at(-1);
  const incomeStatuses = resolveIncomes(incomesOf(data), { transactions: data.transactions, now, lastReadingAt: latest?.at }, subMonths(now, 6), now);
  if (lateCount(incomeStatuses) !== 0) fail(`${lateCount(incomeStatuses)} incomes late`);

  // ── Banks & cash: the first reading is where the records begin, the latest finds the coffee ──
  const readings = readCheckIns(checkInsOf(data), accounts, data.transactions);
  if (readings.length !== 2) fail(`${readings.length} readings`);
  else {
    // No spending or income before it — every month the demo shows is counted
    // from a reading. (Goals' deposits from before the records began are in
    // the goals, which the reading's savings account holds.)
    const before = data.transactions.filter((tx) => !isAfterReading(tx, readings[0].at) && !tx.isGoalTransaction && !tx.isInvestmentTransaction);
    if (before.length) fail(`${before.length} records before the first reading`);
    if (readings[1].unlogged !== DEMO_UNLOGGED) fail(`latest reading finds ${readings[1].unlogged} unrecorded`);
    const ageDays = (now.getTime() - readings[1].at.getTime()) / 86_400_000;
    if (ageDays < 2 || ageDays > 4) fail(`latest reading is ${ageDays.toFixed(1)} days old`);
  }

  // A second way: walk every account through every record after the first
  // reading, from the figures it found, and check none ever goes below zero —
  // a card the demo overdraws is not a real person's card.
  const main = mainAccount(accounts);
  const first = checkInsOf(data)[0];
  const balances: Record<string, number> = { ...first.amounts };
  for (const tx of data.transactions) {
    if (!isAfterReading(tx, new Date(first.at))) continue;
    const account = accountOf(tx, accounts, main)!;
    balances[account] = round2(balances[account] + realDelta(tx));
    if (balances[account] < 0) fail(`${account} goes to ${balances[account]} on ${toDay(tx.date)}`);
  }
  // And the spendable balance the Overview opens with is a sensible figure.
  const spendable = currentBalance(data.transactions, balanceAnchors(readings, data.transactions).at(-1));
  if (spendable < 500 || spendable > 10_000) fail(`spendable balance is ${spendable}`);
  if (readings[1] && Math.abs(projectedTotal(readings[1], data.transactions) - Object.values(balances).reduce((a, b) => a + b, 0) - DEMO_UNLOGGED) > 0.01) fail("the readings and the walk disagree");

  // ── Debts: nothing for the Debts page to heal on open, and what is owed makes sense ──
  const debts = data.debts.map((d) => computeDebtStatus(d, data.debtPayments, now));
  const drift = debtCashDrift(debts, data.transactions, now);
  if (drift.records.length || drift.remove.length) fail(`debt money drifts: ${drift.records.map((r) => r.id).join(", ")} / ${drift.remove.join(", ")}`);
  const debt = (id: string) => debts.find((d) => d.id === id)!;
  if (!(debt(DEMO_IDS.debts.car).remaining > 3000 && debt(DEMO_IDS.debts.car).remaining < 8000)) fail(`car loan remaining ${debt(DEMO_IDS.debts.car).remaining}`);
  if (debt(DEMO_IDS.debts.friend).remaining !== 300 || debt(DEMO_IDS.debts.friend).direction !== "owed_to_me") fail("the friend does not owe 300");
  if (debt(DEMO_IDS.debts.covered).remaining !== 160) fail("the share of the rooms is not owed");

  // ── Goals: the trip on its way, part of it paid by the friend ──
  const trip = computeGoalStats(data.investmentGoals.find((g) => g.id === DEMO_IDS.goals.trip)!, data.investmentContributions.filter((c) => c.goalId === DEMO_IDS.goals.trip));
  if (trip.totalCovered !== 160) fail(`trip covered ${trip.totalCovered}`);
  if (!(trip.totalSaved > 300 && trip.totalSaved < 1200)) fail(`trip saved ${trip.totalSaved}`);
  // The parts read the way the story tells it (item 43): filled in order, every «από» first —
  // and counted a second way, by hand, from the parts and what is saved. The friend's 160 is
  // told as a share of the rooms, never as «the ferry», which the in-order fill could not show.
  const tripGoal = data.investmentGoals.find((g) => g.id === DEMO_IDS.goals.trip)!;
  const fill = fillParts(tripGoal.parts ?? [], trip.totalSaved);
  let left = trip.totalSaved;
  const byHand = (tripGoal.parts ?? []).map((p) => { const take = Math.min(left, p.min); left -= take; return take; });
  (tripGoal.parts ?? []).forEach((p, i) => { const more = Math.min(left, p.max - byHand[i]); left -= more; byHand[i] += more; });
  if (fill.some((p, i) => Math.abs(p.filled - byHand[i]) > 0.005)) fail(`trip parts ${fill.map((p) => p.filled)} vs ${byHand}`);
  if (Math.abs(fill.reduce((sum, p) => sum + p.filled, 0) - Math.min(trip.totalSaved, partsTotals(tripGoal.parts ?? []).max)) > 0.005) fail("trip parts do not add up");
  const coveredNote = data.investmentContributions.find((c) => c.goalId === DEMO_IDS.goals.trip && c.coveredBy)?.notes ?? "";
  if (/πλοί|ferry/i.test(coveredNote)) fail(`the friend's share is told as the ferry: ${coveredNote}`);

  // ── Transactions: a real person's months ──
  const spentIn = new Set(data.transactions.filter(isSpending).map((t) => t.categoryId));
  if (spentIn.size < 10) fail(`only ${spentIn.size} expense categories used`);
  for (let k = 1; k <= 11; k++) {
    const month = subMonths(startOfMonth(now), k);
    const next = startOfMonth(addDays(month, 32));
    // The shop's daily closings are counted on their own page, not as the person's own records.
    const count = data.transactions.filter((t) => t.date >= month && t.date < next && !t.transferPart && !t.isInvestmentTransaction && !t.businessEntryId).length;
    // A busy month — a summer one with a four-monthly bill and the holidays — runs to the high thirties.
    if (count < 15 || count > 40) fail(`${toDay(month)} has ${count} records`);
  }
  return out;
}

const toDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("demoData", () => {
  const now = new Date(2026, 9, 28, 17, 40);

  /**
   * The businesses' figures from the raw closings, a second way: the month by
   * its "YYYY-MM" text (not the timestamps `inMonth` compares), the profit as
   * one signed walk over every amount in cents (+each income, −each expense).
   */
  const byHand = (data: DemoData, key: string, businessId?: string) => {
    const mine = data.businessEntries.filter((e) => toISODay(e.date).slice(0, 7) === key && (!businessId || e.businessId === businessId));
    const turnover = mine.reduce((s, e) => s + e.incomes.reduce((t, l) => t + Math.round(l.amount * 100), 0), 0);
    const out = mine.reduce((s, e) => s + e.expenses.reduce((t, l) => t + Math.round(l.amount * 100), 0), 0);
    let walk = 0;
    for (const e of mine) {
      for (const l of e.incomes) walk += Math.round(l.amount * 100);
      for (const l of e.expenses) walk -= Math.round(l.amount * 100);
    }
    return { turnover, out, walk, days: mine.length };
  };

  it.each([new Date(2026, 9, 28, 17, 40), new Date(2026, 10, 10, 22, 0)])("runs two businesses on «Δουλειά» whose figures reconcile a second way, and whose profit reaches the owner's money (%s)", (when) => {
    const data = demoData("el", when);
    const workspace = workspaceOf(data);
    expect(workspace[BUSINESS_ON_KEY]).toBe(true);
    const businesses = workspace[BUSINESSES_KEY] as Business[];
    // Two businesses she made, with her own lines — nothing ready-made.
    expect(businesses.map((b) => b.name)).toEqual(["Φαρμακείο", "Λαϊκή"]);
    expect(businesses[0].incomeLines.map((l) => l.name)).toEqual(["Ταμείο", "Συνταγές ΕΟΠΥΥ"]);
    expect(businesses[0].expenseLines.map((l) => l.name)).toEqual(["Εμπορεύματα", "Ενοίκιο", "Υπάλληλος", "Εφορία + ΕΦΚΑ"]);
    expect(businesses[1].incomeLines.map((l) => l.name)).toEqual(["Πωλήσεις"]);
    // About three weeks, nothing after now, never on a Sunday; the market only on Wednesdays and Saturdays.
    expect(data.businessEntries.every((e) => e.date <= when && e.date.getDay() !== 0 && (when.getTime() - e.date.getTime()) / 86_400_000 < 21)).toBe(true);
    expect(data.businessEntries.filter((e) => e.businessId === businesses[1].id).every((e) => [3, 6].includes(e.date.getDay()))).toBe(true);
    expect(data.businessEntries.filter((e) => e.businessId === businesses[0].id).length).toBeGreaterThanOrEqual(16);

    const months = [...new Set(data.businessEntries.map((e) => toISODay(e.date).slice(0, 7)))].map((key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
    let losses = 0;
    let days = 0;
    for (const month of months) {
      const key = toISODay(month).slice(0, 7);
      // «Όλες»: the page's tiles.
      const all = monthSummary(data.businessEntries, month);
      const hand = byHand(data, key);
      expect(all.days).toBe(hand.days);
      expect(Math.round(all.turnover * 100)).toBe(hand.turnover);
      expect(Math.round(all.expenses * 100)).toBe(hand.out);
      expect(Math.round(all.profit * 100)).toBe(hand.walk);
      // «Όλες» is the businesses added together, figure by figure — each business's tiles also checked by hand.
      const each = businesses.map((b) => monthSummary(forBusiness(data.businessEntries, b.id), month));
      businesses.forEach((b, i) => {
        const h = byHand(data, key, b.id);
        expect([Math.round(each[i].turnover * 100), Math.round(each[i].expenses * 100), Math.round(each[i].profit * 100), each[i].days]).toEqual([h.turnover, h.out, h.walk, h.days]);
      });
      expect(each.reduce((s, m) => s + Math.round(m.turnover * 100), 0)).toBe(hand.turnover);
      expect(each.reduce((s, m) => s + Math.round(m.expenses * 100), 0)).toBe(hand.out);
      expect(each.reduce((s, m) => s + Math.round(m.profit * 100), 0)).toBe(hand.walk);
      expect(each.reduce((s, m) => s + m.days, 0)).toBe(hand.days);
      // «Πού πήγαν τα έξοδα»: the bars add up to the tile, for all and for each.
      expect(monthByExpenseLine(data.businessEntries, month).reduce((s, b) => s + Math.round(b.total * 100), 0)).toBe(hand.out);
      for (const b of businesses) expect(monthByExpenseLine(forBusiness(data.businessEntries, b.id), month).reduce((s, r) => s + Math.round(r.total * 100), 0)).toBe(byHand(data, key, b.id).out);
      // A third way, from the owner's own money: the month's records, incomes in and expenses out, are the month's profit — all, and each business.
      const personal = data.transactions.filter((t) => t.businessEntryId && toISODay(t.date).slice(0, 7) === key);
      const signedSum = (rows: typeof personal) => rows.reduce((s, t) => s + (t.type === "income" ? 1 : -1) * Math.round(t.amount * 100), 0);
      expect(signedSum(personal)).toBe(hand.walk);
      for (const b of businesses) expect(signedSum(personal.filter((t) => t.businessId === b.id))).toBe(byHand(data, key, b.id).walk);
      // Filed under «Δουλειά», never under a category of hers, into the main bank.
      expect(personal.every((t) => t.categoryId === BUSINESS_CATEGORY_ID && t.accountId === DEMO_IDS.accounts.main && (t.type === "income" || t.type === "expense"))).toBe(true);
      expect(data.categories.some((c) => c.id === BUSINESS_CATEGORY_ID)).toBe(false);
      losses += personal.filter((t) => t.type === "expense").length;
      days += all.days;
    }
    expect(days).toBe(data.businessEntries.length);
    // Some days close at a loss — the pharmacy's rent and tax days, the rained-off market — and come out of her money.
    expect(losses).toBeGreaterThanOrEqual(2);
    expect(data.businessEntries.some((e) => e.businessId === businesses[1].id && closingFigures(e).profit < 0)).toBe(true);
    // One one-off «άλλο έξοδο», with its own name and no line.
    expect(data.businessEntries.flatMap((e) => e.expenses).filter((l) => !l.lineId).map((l) => l.name)).toEqual(["Επισκευή ψυγείου"]);
    // The whole three weeks a profit: what reached her money, a second way, is the sum of the days' profits.
    const total = data.businessEntries.reduce((s, e) => s + Math.round(closingFigures(e).profit * 100), 0);
    expect(total).toBeGreaterThan(0);
    expect(data.transactions.filter((t) => t.businessEntryId).reduce((s, t) => s + (t.type === "income" ? 1 : -1) * Math.round(t.amount * 100), 0)).toBe(total);
    // Nothing of the business's own money reaches the personal records but the closings' own.
    const businessIds = new Set(data.businessEntries.map((e) => e.id));
    expect(data.transactions.filter((t) => t.businessEntryId && !businessIds.has(t.businessEntryId))).toEqual([]);
    expect(Object.keys(demoCollections(data).businessEntries)).toHaveLength(data.businessEntries.length);
  });

  it.each<DemoLanguage>(["el", "en"])("builds a whole account in %s that holds together", (lang) => {
    expect(problems(demoData(lang, now), now)).toEqual([]);
  });

  it("holds together on every day of a year, morning and night", () => {
    const failures: string[] = [];
    for (let day = new Date(2026, 0, 1); day < new Date(2027, 0, 1); day = addDays(day, 1)) {
      for (const hour of [6, 23]) {
        const at = addHours(day, hour);
        failures.push(...problems(demoData("el", at), at));
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
    // Seven hundred accounts built and checked: about forty seconds alone, and over a minute while the whole suite runs beside it.
  }, 180_000);

  it("holds together through a leap year's February", () => {
    const failures: string[] = [];
    for (let day = new Date(2028, 0, 1); day < new Date(2028, 3, 1); day = addDays(day, 1)) {
      for (const hour of [0, 12]) {
        const at = addHours(day, hour);
        failures.push(...problems(demoData("en", at), at));
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
  }, 60_000);

  it("is in the time zone it was pinned to", () => {
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-180);
  });

  it("writes nothing dated after now — not even a minute after", () => {
    const at = new Date(2026, 9, 28, 8, 17);
    const data = demoData("el", at);
    for (const tx of data.transactions) expect(tx.createdAt.getTime()).toBeLessThanOrEqual(at.getTime());
  });

  it("is the same account in both languages, in other words", () => {
    const el = demoData("el", now);
    const en = demoData("en", now);
    const shape = (d: DemoData) => d.transactions.map((t) => [t.id, t.amount, t.date.getTime(), t.categoryId, t.accountId]);
    expect(shape(en)).toEqual(shape(el));
    expect(el.bills.map((b) => b.name)).toContain("ΔΕΗ");
    expect(en.bills.map((b) => b.name)).toContain("Electricity");
    expect(el.user.locale).toBe("el");
    expect(en.user.locale).toBe("en");
  });

  it("is the same account when built twice for the same moment", () => {
    expect(demoData("el", now)).toEqual(demoData("el", now));
  });

  it("carries what the app reads off the user document", () => {
    const { user } = demoData("en", now);
    const workspace = user.workspace as Record<string, unknown>;
    expect(user).toMatchObject({ id: DEMO_UID, currency: "EUR", baseCurrency: "EUR" });
    expect(workspace[TOUR_SEEN_KEY]).toBe(true);
    // Nothing for the Planner to move on its first open: a write there would
    // keep the account from being made again in the other language.
    expect(ALLOCATION_MOVED_KEY).toBe(ALLOCATION_KEYS.moved);
    expect(workspace[ALLOCATION_KEYS.moved]).toBe(true);
    expect((workspace[PLANNER_KEYS.lines] as unknown[]).length).toBeGreaterThan(0);
    expect((workspace[PLANNER_KEYS.oneOffs] as unknown[]).length).toBeGreaterThan(0);
    expect(accountsOf(demoData("en", now)).filter((a) => a.kind === "bank").length).toBeGreaterThanOrEqual(2);
    expect(accountsOf(demoData("en", now)).some((a) => a.kind === "cash")).toBe(true);
  });

  it("varies like real spending: supermarket bills are not round, fuel is 45–60", () => {
    const { transactions } = demoData("el", now);
    const groceries = transactions.filter((t) => t.categoryId === "cat-expense-groceries").map((t) => t.amount);
    expect(new Set(groceries).size).toBeGreaterThan(groceries.length * 0.8);
    expect(groceries.filter((a) => Number.isInteger(a)).length).toBeLessThan(3);
    const fuel = transactions.filter((t) => t.categoryId === "cat-expense-fuel");
    for (const t of fuel) {
      expect(t.amount).toBeGreaterThanOrEqual(45);
      expect(t.amount).toBeLessThanOrEqual(60);
      expect(t.metadata?.quantity).toBeCloseTo(t.amount / t.metadata!.pricePerUnit, 1);
    }
    expect(transactions.some((t) => t.categoryId === "cat-income-freelance")).toBe(true);
  });

  it("goes into the store with no undefined fields and the id as the document name", () => {
    const collections = demoCollections(demoData("el", now));
    for (const rows of Object.values(collections)) {
      for (const fields of Object.values(rows)) for (const value of Object.values(fields)) expect(value).not.toBeUndefined();
    }
    expect(collections.transactions[Object.keys(collections.transactions)[0]]).not.toHaveProperty("id");
    expect(collections.users[DEMO_UID]).toMatchObject({ id: DEMO_UID });
    // Dates stay Dates, which every reader takes.
    expect(firestoreToDate(collections.bills[DEMO_IDS.bills.rent].createdAt)).toBeInstanceOf(Date);
  });
});

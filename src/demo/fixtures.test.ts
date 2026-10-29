// Pinned to the owner's time zone before any date exists: a year of days walks
// through both of its clock changes, and the readings sit at fixed hours.
process.env.TZ = "Europe/Athens";

import { describe, it, expect } from "vitest";
import { addDays, addHours, startOfMonth, subMonths } from "date-fns";
import { ALLOCATION_MOVED_KEY, DEMO_IDS, DEMO_UNLOGGED, demoCollections, demoData, type DemoData, type DemoLanguage } from "./fixtures";
import { DEMO_UID } from "./demoUser";
import { billOverdue, billUrgency, billsNeedingAttention, computeBillStatus, daysUntilDeadline } from "../features/bills/billsUtils";
import { ACCOUNTS_KEY, CHECK_INS_KEY, accountOf, mainAccount, projectedTotal, readCheckIns, realDelta, type BalanceCheckIn, type MoneyAccount } from "../features/accounts/accountsUtils";
import { currentBalance, isAfterReading } from "../shared/utils/balance";
import { computeDebtStatus } from "../features/debts/debtsUtils";
import { debtCashDrift } from "../features/debts/debtCash";
import { INCOMES_KEY, lateCount, resolveIncomes, type Income } from "../features/incomes/incomesUtils";
import { quickFavorites } from "../features/transactions/quickEntry";
import { computeGoalStats } from "../features/budget/investmentsUtils";
import { VIRTUAL_CATEGORIES } from "../shared/utils/categories";
import { isSpending } from "../shared/utils/moneyModel";
import { PLANNER_KEYS } from "../features/plannerPage/plannerInputs";
import { ALLOCATION_KEYS } from "../features/plannerPage/allocationMigration";
import { TOUR_SEEN_KEY } from "../features/tour/tourState";
import { firestoreToDate } from "../shared/utils/dates";

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
  // The Settings figure, as `useMoneyAccounts` hands it to the readings.
  const legacy = { amount: data.user.openingBalance!, date: data.user.openingBalanceDate! };
  const latest = readCheckIns(checkInsOf(data), accounts, data.transactions, legacy).at(-1);
  const incomeStatuses = resolveIncomes(incomesOf(data), { transactions: data.transactions, now, lastReadingAt: latest?.at }, subMonths(now, 6), now);
  if (lateCount(incomeStatuses) !== 0) fail(`${lateCount(incomeStatuses)} incomes late`);

  // ── Banks & cash: the first reading agrees with the app, the latest finds the coffee ──
  const readings = readCheckIns(checkInsOf(data), accounts, data.transactions, legacy);
  if (readings.length !== 2) fail(`${readings.length} readings`);
  else {
    if (readings[0].appSaid !== readings[0].total) fail(`first reading: banks ${readings[0].total}, app ${readings[0].appSaid}`);
    if (readings[1].unlogged !== DEMO_UNLOGGED) fail(`latest reading finds ${readings[1].unlogged} unrecorded`);
    const ageDays = (now.getTime() - readings[1].at.getTime()) / 86_400_000;
    if (ageDays < 2 || ageDays > 4) fail(`latest reading is ${ageDays.toFixed(1)} days old`);
  }

  // A second way: walk every account through every record since the start,
  // from the figures the first reading implies, and check none ever goes
  // below zero — a card the demo overdraws is not a real person's card.
  const start = startOfMonth(subMonths(now, 6));
  const main = mainAccount(accounts);
  const first = checkInsOf(data)[0];
  const balances: Record<string, number> = { ...first.amounts };
  for (const tx of data.transactions) if (tx.date >= start && !isAfterReading(tx, new Date(first.at))) balances[accountOf(tx, accounts, main)!] -= realDelta(tx);
  for (const tx of data.transactions) {
    if (tx.date < start) continue;
    const account = accountOf(tx, accounts, main)!;
    balances[account] = round2(balances[account] + realDelta(tx));
    if (balances[account] < 0) fail(`${account} goes to ${balances[account]} on ${toDay(tx.date)}`);
  }
  // And the spendable balance the Overview opens with is a sensible figure.
  const spendable = currentBalance(data.transactions, legacy);
  if (spendable < 500 || spendable > 10_000) fail(`spendable balance is ${spendable}`);
  if (readings[1] && Math.abs(projectedTotal(readings[1], data.transactions) - Object.values(balances).reduce((a, b) => a + b, 0) - DEMO_UNLOGGED) > 0.01) fail("the readings and the walk disagree");

  // ── Debts: nothing for the Debts page to heal on open, and what is owed makes sense ──
  const debts = data.debts.map((d) => computeDebtStatus(d, data.debtPayments, now));
  const drift = debtCashDrift(debts, data.transactions, now);
  if (drift.records.length || drift.remove.length) fail(`debt money drifts: ${drift.records.map((r) => r.id).join(", ")} / ${drift.remove.join(", ")}`);
  const debt = (id: string) => debts.find((d) => d.id === id)!;
  if (!(debt(DEMO_IDS.debts.car).remaining > 3000 && debt(DEMO_IDS.debts.car).remaining < 8000)) fail(`car loan remaining ${debt(DEMO_IDS.debts.car).remaining}`);
  if (debt(DEMO_IDS.debts.friend).remaining !== 300 || debt(DEMO_IDS.debts.friend).direction !== "owed_to_me") fail("the friend does not owe 300");
  if (debt(DEMO_IDS.debts.covered).remaining !== 160) fail("the ferry is not owed");

  // ── Goals: the trip on its way, part of it paid by the friend ──
  const trip = computeGoalStats(data.investmentGoals.find((g) => g.id === DEMO_IDS.goals.trip)!, data.investmentContributions.filter((c) => c.goalId === DEMO_IDS.goals.trip));
  if (trip.totalCovered !== 160) fail(`trip covered ${trip.totalCovered}`);
  if (!(trip.totalSaved > 300 && trip.totalSaved < 1200)) fail(`trip saved ${trip.totalSaved}`);

  // ── Transactions: a real person's months ──
  const coffee = quickFavorites(data.transactions, now).find((f) => f.categoryId === "cat-expense-coffee");
  if (coffee?.fixedAmount !== 3.5) fail(`coffee chip is ${coffee?.fixedAmount}`);
  const spentIn = new Set(data.transactions.filter(isSpending).map((t) => t.categoryId));
  if (spentIn.size < 10) fail(`only ${spentIn.size} expense categories used`);
  for (let k = 1; k <= 11; k++) {
    const month = subMonths(startOfMonth(now), k);
    const next = startOfMonth(addDays(month, 32));
    const count = data.transactions.filter((t) => t.date >= month && t.date < next && !t.transferPart && !t.isInvestmentTransaction).length;
    // A busy month — a summer one with a four-monthly bill and the holidays — runs to the high thirties.
    if (count < 15 || count > 40) fail(`${toDay(month)} has ${count} records`);
  }
  return out;
}

const toDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("demoData", () => {
  const now = new Date(2026, 9, 28, 17, 40);

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
    // Seven hundred accounts built and checked: seconds, not the default five.
  }, 60_000);

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

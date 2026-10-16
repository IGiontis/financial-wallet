import { describe, it, expect } from "vitest";
import { calendarItems, calendarPlans, groupByDay, monthOffsetFrom, monthTotals, shownNet, type CalendarItem, type CalendarSources } from "./calendarDays";
import { goalMonthlyTarget } from "../plannerPage/plannerUtils";
import { resolveIncomes } from "../incomes/incomesUtils";
import { monthlyIncome, monthlySalary } from "../../test/incomes";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

// 16 October 2026: the owner's day when the 600 he typed for today showed 0,00 €.
const NOW = new Date(2026, 9, 16, 12);
const OCT = new Date(2026, 9, 1);

const bill = (over: Partial<BillWithStatus> = {}): BillWithStatus =>
  ({
    id: `b${Math.random()}`,
    userId: "u",
    name: "Bill",
    amount: 50,
    categoryId: "c",
    frequency: "monthly",
    dueDay: 5,
    isActive: true,
    createdAt: new Date(2026, 0, 1),
    anchorDate: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    currentPeriodKey: "2026-10",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 50,
    ...over,
  }) as BillWithStatus;

const paidOct = (b: BillWithStatus, amount: number) =>
  ({ ...b, isPaidThisPeriod: true, payments: [{ id: "p", userId: "u", billId: b.id, periodKey: "2026-10", amount, paidDate: new Date(2026, 9, 4), createdAt: new Date(2026, 9, 4) }] }) as BillWithStatus;

const sources = (over: Partial<CalendarSources> = {}): CalendarSources => ({
  now: NOW,
  bills: [],
  statuses: [],
  incomeName: (id) => id,
  oneOffs: [],
  debts: [],
  goalEvents: [],
  debtEvents: [],
  ...over,
});

const item = (over: Partial<CalendarItem>): CalendarItem => ({ id: "x", date: new Date(2026, 9, 13), kind: "bill", direction: "out", label: "x", amount: 10, state: "todo", ...over });

describe("which month a page of the calendar is", () => {
  it("counts whole months from the one we are in, across year ends", () => {
    expect(monthOffsetFrom(NOW, OCT)).toBe(0);
    expect(monthOffsetFrom(NOW, new Date(2026, 8, 1))).toBe(-1);
    expect(monthOffsetFrom(NOW, new Date(2027, 1, 1))).toBe(4);
    expect(monthOffsetFrom(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBe(1);
  });
});

describe("bills on the calendar", () => {
  it("puts each on its due day — the paid one for what was paid, the unpaid for what it asks", () => {
    const rent = paidOct(bill({ name: "Ενοίκιο", amount: 400, dueDay: 5 }), 410);
    const phone = bill({ name: "Κινητό", amount: 25, dueDay: 28 });
    const items = calendarItems(OCT, sources({ bills: [rent, phone] }));

    expect(items.map((i) => [i.label, i.date.getDate(), i.amount, i.state, i.direction])).toEqual([
      ["Ενοίκιο", 5, 410, "done", "out"],
      ["Κινητό", 28, 25, "todo", "out"],
    ]);
  });

  it("calls one unpaid whose day has gone late, not to-do", () => {
    const water = bill({ name: "Νερό", dueDay: 2 });
    expect(calendarItems(OCT, sources({ bills: [water] }))[0]).toMatchObject({ label: "Νερό", state: "late" });
  });

  it("pages to other months: next month's bills are to-do, last month's paid ones stay done", () => {
    const gym = bill({ name: "Γυμναστήριο", dueDay: 10 });
    expect(calendarItems(new Date(2026, 10, 1), sources({ bills: [gym] })).map((i) => [i.date.getMonth(), i.state])).toEqual([[10, "todo"]]);
  });
});

describe("incomes on the calendar", () => {
  const range = { from: new Date(2026, 8, 1), to: new Date(2026, 11, 31) };
  const resolved = (incomes = [monthlyIncome("edessaikos", "Edessaikos", 250, 24)]) =>
    resolveIncomes(incomes, { transactions: [], overrides: {}, lastReadingAt: new Date(2026, 9, 14), now: NOW }, range.from, range.to);

  it("puts an income on its expected day, to-do — the 24th is not asked about on the 16th", () => {
    const items = calendarItems(OCT, sources({ statuses: resolved(), incomeName: () => "Edessaikos" }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "income", direction: "in", amount: 250, state: "todo" });
    expect(items[0].date.getDate()).toBe(24);
  });

  it("puts one that came on the day it came, done, for what came", () => {
    const came = resolveIncomes(
      [monthlyIncome("e", "Edessaikos", 250, 24)],
      { transactions: [], overrides: { "income:e:2026-10-24": { state: "received", date: "2026-10-15", amount: 240 } }, now: NOW },
      range.from,
      range.to,
    );
    const items = calendarItems(OCT, sources({ statuses: came, incomeName: () => "Edessaikos" }));
    expect(items[0]).toMatchObject({ amount: 240, state: "done" });
    expect(items[0].date.getDate()).toBe(15);
  });

  it("leaves out one that was skipped", () => {
    const skipped = resolveIncomes([monthlyIncome("e", "E", 250, 24)], { transactions: [], overrides: { "income:e:2026-10-24": { state: "skipped" } }, now: NOW }, range.from, range.to);
    expect(calendarItems(OCT, sources({ statuses: skipped }))).toEqual([]);
  });

  it("puts the planner's extra income on its day: the 600 typed for today counts, whatever the reading", () => {
    const extra = { id: "x", label: "Έκτακτο", amount: 600, date: "2026-10-16" };
    const items = calendarItems(OCT, sources({ oneOffs: [extra] }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "income", amount: 600, state: "todo" });
    expect(items[0].date.getDate()).toBe(16);
    // A past one has happened; nothing of it is in another month.
    expect(calendarItems(OCT, sources({ oneOffs: [{ ...extra, date: "2026-10-03" }] }))[0].state).toBe("done");
    expect(calendarItems(new Date(2026, 10, 1), sources({ oneOffs: [extra] }))).toEqual([]);
  });

  it("keeps the salary's bank question: asked about, so it needs the owner (late)", () => {
    const pay = resolveIncomes([monthlySalary(1450, 20, { id: "sal" })], { transactions: [], overrides: {}, lastReadingAt: new Date(2026, 9, 14), now: NOW }, range.from, range.to);
    expect(calendarItems(OCT, sources({ statuses: pay }))[0]).toMatchObject({ amount: 1450, state: "late" });
  });
});

describe("loans and goals on the calendar", () => {
  const loan = {
    id: "car",
    userId: "u",
    person: "Εθνική",
    direction: "owed_by_me",
    label: "Αυτοκίνητο",
    amount: 6000,
    date: new Date(2026, 0, 10),
    interestRate: 7,
    termMonths: 36,
    payments: [{ id: "p1", userId: "u", debtId: "car", amount: 185.26, date: new Date(2026, 9, 10), createdAt: new Date(2026, 9, 10) }],
    paid: 185.26,
    remaining: 5900,
    isSettled: false,
    createdAt: new Date(2026, 0, 10),
    updatedAt: new Date(2026, 0, 10),
  } as unknown as DebtWithStatus;
  const actuals = { transactions: [], debts: [loan], overrides: {} };

  it("shows a paid instalment done, and the next one on its day to come", () => {
    const plans = calendarPlans({ goals: [], debts: [loan], actuals, now: NOW });
    const oct = calendarItems(OCT, sources({ debts: [loan], ...plans }));
    expect(oct.filter((i) => i.kind === "debt").map((i) => [i.date.getDate(), i.state])).toEqual([[10, "done"]]);

    const nov = calendarItems(new Date(2026, 10, 1), sources({ debts: [loan], ...plans }));
    const due = nov.filter((i) => i.kind === "debt");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ date: new Date(2026, 10, 10), state: "todo", direction: "out" });
    // The instalment, to the cent, as the loan itself says.
    expect(due[0].amount).toBeCloseTo(185.26, 1);
  });

  it("puts a goal's monthly deposit on the 1st of each month still ahead", () => {
    const goal: InvestmentGoalWithStats = { id: "g", name: "Laptop", isActive: true, isCompleted: false, goalType: "targeted", targetAmount: 1200, totalSaved: 0, remaining: 1200, currentPeriodSaved: 0, deadline: new Date(2027, 2, 1), createdAt: new Date(2026, 8, 1), monthlyRequired: 300 } as unknown as InvestmentGoalWithStats;
    const plans = calendarPlans({ goals: [goal], debts: [], actuals: { transactions: [], debts: [], overrides: {} }, now: NOW });
    const dec = calendarItems(new Date(2026, 11, 1), sources(plans));
    const goals = dec.filter((i) => i.kind === "goal");
    expect(goals.map((i) => [i.label, i.date.getDate(), i.direction])).toEqual([["Laptop", 1, "out"]]);
    // The amount is the plan's own monthly figure for the goal, not a second opinion.
    expect(goals[0].amount).toBe(goalMonthlyTarget(goal, NOW));
    expect(goals[0].amount).toBeGreaterThan(0);
    // Past its deadline month, nothing is asked.
    expect(calendarItems(new Date(2027, 5, 1), sources(plans)).filter((i) => i.kind === "goal")).toEqual([]);
  });
});

describe("a day's two sides", () => {
  it("splits a day into what came in and what went out, each with its total", () => {
    const days = groupByDay([item({ id: "a", kind: "income", direction: "in", amount: 600, state: "done" }), item({ id: "b", amount: 40, state: "todo" }), item({ id: "c", amount: 60, state: "late" })]);
    const day = days.get(13)!;
    expect(day.in).toEqual({ total: 600, count: 1, allDone: true, anyLate: false });
    expect(day.out).toEqual({ total: 100, count: 2, allDone: false, anyLate: true });
  });

  it("has no side for what is not there, and keeps days apart", () => {
    const days = groupByDay([item({ date: new Date(2026, 9, 3), direction: "in", kind: "income" }), item({ date: new Date(2026, 9, 5) })]);
    expect(days.get(3)!.out).toBeUndefined();
    expect(days.get(5)!.in).toBeUndefined();
    expect([...days.keys()]).toEqual([3, 5]);
  });

  it("adds to the cent where floats would not: 0.1 and 0.2", () => {
    expect(groupByDay([item({ amount: 0.1 }), item({ amount: 0.2 })]).get(13)!.out!.total).toBe(0.3);
  });
});

describe("the month's totals", () => {
  it("reconciles a second way: settled plus still-to-come is the whole, on each side", () => {
    const items = [
      item({ direction: "in", kind: "income", amount: 1450, state: "done" }),
      item({ direction: "in", kind: "income", amount: 600, state: "todo" }),
      item({ amount: 410, state: "done" }),
      item({ amount: 85.5, state: "late" }),
      item({ amount: 25, state: "todo" }),
    ];
    const totals = monthTotals(items);
    expect(totals).toEqual({ in: 2050, inDone: 1450, out: 520.5, outDone: 410 });
    // And the same sums from the days.
    const byDay = [...groupByDay(items).values()];
    expect(byDay.reduce((s, d) => s + (d.in?.total ?? 0), 0)).toBe(totals.in);
    expect(byDay.reduce((s, d) => s + (d.out?.total ?? 0), 0)).toBe(totals.out);
  });
});

describe("the figure on a day", () => {
  it("counts down as things are paid, and shows the whole again once all are", () => {
    const fifty = item({ id: "a", amount: 50 });
    const hundredTwenty = item({ id: "b", amount: 120 });
    expect(shownNet({ items: [fifty, hundredTwenty] })).toBe(-170);
    expect(shownNet({ items: [fifty, { ...hundredTwenty, state: "done" }] })).toBe(-50);
    expect(shownNet({ items: [{ ...fifty, state: "done" }, { ...hundredTwenty, state: "done" }] })).toBe(-170);
  });

  it("nets what is left both ways: the income that came drops out, the bills still due stay", () => {
    const pay = item({ id: "p", kind: "income", direction: "in", amount: 1000 });
    const bills = [item({ id: "x", amount: 300 }), item({ id: "y", amount: 500 })];
    expect(shownNet({ items: [pay, ...bills] })).toBe(200);
    expect(shownNet({ items: [{ ...pay, state: "done" }, ...bills] })).toBe(-800);
    // A late one is still to happen.
    expect(shownNet({ items: [{ ...pay, state: "done" }, { ...bills[0], state: "late" }, { ...bills[1], state: "done" }] })).toBe(-300);
  });
});

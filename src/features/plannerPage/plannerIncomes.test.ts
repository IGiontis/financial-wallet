import { describe, it, expect } from "vitest";
import { buildPlan, type BudgetLine, type OneOff, type PlannerPlan } from "./plannerUtils";
import { answerUnconfirmed } from "./plannerInputs";
import { payCycles } from "./payCycles";
import type { Actuals, OccurrenceOverride } from "./plannerActuals";
import { PAYDAY_HORIZON, paydayOutlook } from "../overview/overviewTabs";
import { currentBalance } from "../../shared/utils/balance";
import { incomeOccurrenceKey, type Income } from "../incomes/incomesUtils";
import { monthlyIncome, monthlySalary, undatedIncome } from "../../test/incomes";
import type { Transaction } from "../../shared/types/IndexTypes";

// The plan's money in comes from «Έσοδα» now. Every figure here is worked out
// by hand first — each time listed and added up — and the plan has to land on
// it; then the same money is checked a second way (the walk, the rows, the
// Overview's own answer, the balance the plan starts from).
//
// The owner's case: Wednesday 30 September 2026. Salary 1.450 on the 30th, the
// rent he collects 400 on the 5th, an allowance of 70 on the 20th. Three
// months from today run to 31 December.

const NOW = new Date(2026, 8, 30, 10);
const SALARY = monthlySalary(1450, 30);
const RENT = monthlyIncome("rent", "Rent I collect", 400, 5);
const ALLOWANCE = monthlyIncome("allow", "Allowance", 70, 20);
const INCOMES = [SALARY, RENT, ALLOWANCE];

const day = (month: number, date: number, year = 2026) => new Date(year, month - 1, date);
const cents = (n: number) => Math.round(n * 100) / 100;

let n = 0;
/** A record written by «Ήρθε»: an ordinary income carrying the income and the time it is for. */
const came = (income: Pick<Income, "id">, due: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, userId: "u", type: "income", amount, categoryId: "c", description: "came", date, createdAt: date, updatedAt: date, incomeId: income.id, incomeDue: due, ...extra }) as Transaction;
/** An income record nobody tagged. */
const plainIncome = (amount: number, date: Date): Transaction =>
  ({ id: `p${++n}`, userId: "u", type: "income", amount, categoryId: "c", description: "income", date, createdAt: date, updatedAt: date }) as Transaction;

/** September as «Έσοδα» has it: the rent on the 5th, the allowance a day late, the salary five days early. */
const SEPTEMBER = [came(RENT, "2026-09-05", 400, day(9, 5)), came(ALLOWANCE, "2026-09-20", 70, day(9, 21)), came(SALARY, "2026-09-30", 1450, day(9, 25))];
const actuals = (over: Partial<Actuals> = {}): Actuals => ({ transactions: SEPTEMBER, debts: [], overrides: {}, ...over });

const plan = (over: Partial<Parameters<typeof buildPlan>[0]> = {}) => buildPlan({ bills: [], goals: [], incomes: INCOMES, openingBalance: 1000, horizon: 3, now: NOW, ...over });
const incomeEvents = (p: PlannerPlan) => p.events.filter((e) => e.kind === "income").map((e) => [e.date.toDateString(), e.label, e.amount]);
const row = (p: PlannerPlan, id: string) => p.rows.find((r) => r.id === id)!;
const balanceOn = (p: PlannerPlan, date: Date) => cents(p.daily.balance[Math.round((date.getTime() - p.start.getTime()) / 864e5)]);

describe("the incomes in the plan, taken at their word", () => {
  const p = plan();

  it("puts every time on its own day: 4 salaries, 3 rents, 3 allowances — 7.210", () => {
    // By hand, today included — today is a pay day.
    const byHand: [Date, string, number][] = [
      [day(9, 30), "Salary", 1450],
      [day(10, 5), "Rent I collect", 400],
      [day(10, 20), "Allowance", 70],
      [day(10, 30), "Salary", 1450],
      [day(11, 5), "Rent I collect", 400],
      [day(11, 20), "Allowance", 70],
      [day(11, 30), "Salary", 1450],
      [day(12, 5), "Rent I collect", 400],
      [day(12, 20), "Allowance", 70],
      [day(12, 30), "Salary", 1450],
    ];
    expect(incomeEvents(p)).toEqual(byHand.map(([d, label, amount]) => [d.toDateString(), label, amount]));
    expect(byHand.reduce((sum, [, , amount]) => sum + amount, 0)).toBe(7210);
    expect(4 * 1450 + 3 * 400 + 3 * 70).toBe(7210);
    expect(p.incomeTotal).toBe(7210);
    expect(p.endingBalance).toBe(1000 + 7210);
  });

  it("gives each income a row, the salary first, that adds up to its events", () => {
    expect(p.rows.map((r) => [r.id, r.source, r.total, r.occurrences, r.each, r.pay ?? false])).toEqual([
      ["salary", "income", 5800, 4, 1450, true],
      ["rent", "income", 1200, 3, 400, false],
      ["allow", "income", 210, 3, 70, false],
    ]);
    for (const r of p.rows) expect(cents(p.events.filter((e) => e.incomeId === r.id).reduce((s, e) => s + e.amount, 0))).toBe(r.total);
  });

  it("walks the balance day by day through them", () => {
    // A second route: the walk, read on the days around each arrival.
    expect(balanceOn(p, day(9, 30))).toBe(2450);
    expect(balanceOn(p, day(10, 4))).toBe(2450);
    expect(balanceOn(p, day(10, 5))).toBe(2850);
    expect(balanceOn(p, day(10, 29))).toBe(2920);
    expect(balanceOn(p, day(10, 30))).toBe(4370);
    expect(balanceOn(p, day(12, 31))).toBe(8210);
  });

  it("marks only the salary's times as pay — the pay cycles are cut there", () => {
    expect(p.events.filter((e) => e.pay).map((e) => e.date.getDate())).toEqual([30, 30, 30, 30]);
    expect(payCycles(p).map((c) => c.start.toDateString())).toEqual([day(9, 30), day(10, 30), day(11, 30), day(12, 30)].map((d) => d.toDateString()));
  });
});

describe("the incomes, checked against what came", () => {
  it("does not count again what «Ήρθε» already recorded: 7.210 less September's 1.450 — 5.760", () => {
    const p = plan({ actuals: actuals() });
    // Rent of the 5th, allowance of the 20th and the salary of the 30th are in.
    const status = (key: string) => p.occurrences.find((o) => o.key === key)?.status;
    expect(status(incomeOccurrenceKey("salary", "2026-09-30"))).toBe("received");
    expect(status(incomeOccurrenceKey("rent", "2026-09-05"))).toBe("received");
    expect(status(incomeOccurrenceKey("allow", "2026-09-20"))).toBe("received");
    // By hand: three salaries, three rents, three allowances.
    expect(3 * 1450 + 3 * 400 + 3 * 70).toBe(5760);
    expect(p.incomeTotal).toBe(5760);
    expect(row(p, "salary")).toMatchObject({ total: 4350, occurrences: 3 });
    expect(p.endingBalance).toBe(1000 + 5760);
    // The salary's record settled the salary, and nothing in the plan is dated before today.
    expect(p.events.every((e) => e.date >= day(9, 30))).toBe(true);
  });

  it("does not count pay already in the bank reading — whichever way it was answered", () => {
    // Read on the 29th at 20:00: 1.000, the early salary already inside it,
    // never written down. The rent and the allowance were recorded before.
    const reading = day(9, 29, 2026);
    reading.setHours(20);
    const opening = { amount: 1000, date: day(9, 29), at: reading };
    const before = [SEPTEMBER[0], SEPTEMBER[1]];

    // Not answered yet: asked about, and counted nowhere. So is the rent of
    // 5 October — it may have come up to ten days early, inside the same
    // reading — so by hand: three salaries, two rents, three allowances.
    const asked = plan({ actuals: actuals({ transactions: before, lastReadingAt: reading }) });
    const statusOf = (p: PlannerPlan, key: string) => p.occurrences.find((o) => o.key === key)?.status;
    expect(statusOf(asked, incomeOccurrenceKey("salary", "2026-09-30"))).toBe("unconfirmed");
    expect(statusOf(asked, incomeOccurrenceKey("rent", "2026-10-05"))).toBe("unconfirmed");
    expect(3 * 1450 + 2 * 400 + 3 * 70).toBe(5360);
    expect(asked.incomeTotal).toBe(5360);

    // «Ναι, ήταν μέσα» on «Έσοδα»: a record dated on the reading's day, marked
    // as inside it. The balance stays 1.000 and the plan still counts it nowhere.
    const inReading = came(SALARY, "2026-09-30", 1450, day(9, 29), { inReading: true, createdAt: NOW });
    const answered = plan({ actuals: actuals({ transactions: [...before, inReading], lastReadingAt: reading }) });
    expect(currentBalance([...before, inReading], opening)).toBe(1000);
    expect(statusOf(answered, incomeOccurrenceKey("salary", "2026-09-30"))).toBe("received");
    expect(answered.incomeTotal).toBe(5360);
    expect(currentBalance([...before, inReading], opening) + answered.incomeTotal).toBe(6360);
    // Without the mark the same record, written after the reading, would be
    // counted in the balance as well — the subtlety `inReading` exists for.
    expect(currentBalance([...before, { ...inReading, inReading: undefined }], opening)).toBe(2450);

    // «Ήρθε» from the Planner's own question: kept as words, not a record — the same plan.
    const key = incomeOccurrenceKey("salary", "2026-09-30");
    const said = plan({ actuals: actuals({ transactions: before, lastReadingAt: reading, overrides: { [key]: answerUnconfirmed(asked.occurrences.find((o) => o.key === key)!, true, NOW) } }) });
    expect(statusOf(said, key)).toBe("received");
    expect(said.incomeTotal).toBe(5360);

    // «Όχι ακόμα»: back on its day — today — and counted: 5.360 + 1.450.
    const notYet = plan({ actuals: actuals({ transactions: before, lastReadingAt: reading, overrides: { [key]: answerUnconfirmed(asked.occurrences.find((o) => o.key === key)!, false, NOW) } }) });
    expect(notYet.events.find((e) => e.pay && e.date.getTime() === day(9, 30).getTime())?.amount).toBe(1450);
    expect(notYet.incomeTotal).toBe(5360 + 1450);
  });

  it("holds a late one on today, and says when it was due", () => {
    // The allowance of the 20th has not come: ten days late.
    const p = plan({ actuals: actuals({ transactions: [SEPTEMBER[0], SEPTEMBER[2]] }) });
    const late = p.events.find((e) => e.incomeId === "allow" && e.late);
    expect(late).toMatchObject({ amount: 70, date: day(9, 30), expected: day(9, 20) });
    expect(p.incomeTotal).toBe(5760 + 70);
  });

  it("finds an untagged record of about the size, and no one-off may take it again", () => {
    // The salary landed on the 28th, written down by hand without «Ήρθε»; a
    // one-off of the same size was due on the 29th and has not come.
    const bonus: OneOff = { id: "bonus", label: "Bonus", amount: 1450, date: "2026-09-29" };
    const p = plan({ oneOffs: [bonus], actuals: actuals({ transactions: [SEPTEMBER[0], SEPTEMBER[1], plainIncome(1450, day(9, 28))] }) });
    expect(p.occurrences.find((o) => o.key === incomeOccurrenceKey("salary", "2026-09-30"))?.status).toBe("received");
    expect(p.occurrences.find((o) => o.refId === "bonus")?.status).toBe("late");
    // So the bonus is still owed, on today: 5.760 + 1.450.
    expect(p.incomeTotal).toBe(5760 + 1450);
  });

  it("never lets a one-off claim a record «Ήρθε» wrote for an income — even one archived since", () => {
    // A second job, archived after its last pay of 400 on the 6th: no income
    // resolves that record any more, but the user said what it was.
    const oldJob = monthlyIncome("job", "Old job", 400, 6, { active: false });
    const deposit: OneOff = { id: "deposit", label: "Deposit back", amount: 400, date: "2026-09-06" };
    const p = plan({ incomes: [...INCOMES, oldJob], oneOffs: [deposit], actuals: actuals({ transactions: [...SEPTEMBER, came(oldJob, "2026-09-06", 400, day(9, 6))] }) });
    expect(p.occurrences.find((o) => o.refId === "deposit")?.status).toBe("late");
    // So the deposit is still owed, held on today: 5.760 + 400.
    expect(p.incomeTotal).toBe(5760 + 400);
  });
});

describe("switching an income off", () => {
  it("takes exactly its money out, and keeps its row", () => {
    const on = plan({ actuals: actuals() });
    const off = plan({ actuals: actuals(), skipIds: new Set(["rent"]) });
    expect(row(off, "rent")).toMatchObject({ enabled: false, total: 0, occurrences: 3 });
    expect(on.incomeTotal - off.incomeTotal).toBe(1200);
    expect(on.endingBalance - off.endingBalance).toBe(1200);
    expect(off.events.some((e) => e.incomeId === "rent")).toBe(false);
    // Asked nothing about it either.
    expect(off.occurrences.some((o) => o.refId === "rent")).toBe(false);
  });

  it("switched off, the salary leaves no pay day to cut at", () => {
    const off = plan({ actuals: actuals(), skipIds: new Set(["salary"]) });
    expect(off.incomeTotal).toBe(5760 - 3 * 1450);
    expect(paydayOutlook(off, NOW).known).toBe(false);
  });
});

describe("what was said about one time", () => {
  const said = (overrides: Record<string, OccurrenceOverride>) => plan({ actuals: actuals({ overrides }) });

  it("not this time: one allowance less", () => {
    const p = said({ [incomeOccurrenceKey("allow", "2026-11-20")]: { state: "skipped" } });
    expect(p.incomeTotal).toBe(5760 - 70);
    expect(p.occurrences.find((o) => o.key === incomeOccurrenceKey("allow", "2026-11-20"))?.status).toBe("skipped");
  });

  it("another amount this time: November's salary 1.500, so 50 more", () => {
    const p = said({ [incomeOccurrenceKey("salary", "2026-11-30")]: { amount: 1500 } });
    expect(p.incomeTotal).toBe(5760 + 50);
    expect(p.events.find((e) => e.pay && e.date.getMonth() === 10)?.amount).toBe(1500);
  });

  it("another day this time: October's rent on the 7th — the same money, two days later", () => {
    const p = said({ [incomeOccurrenceKey("rent", "2026-10-05")]: { date: "2026-10-07" } });
    expect(p.incomeTotal).toBe(5760);
    expect(p.events.find((e) => e.incomeId === "rent" && e.date.getMonth() === 9)).toMatchObject({ date: day(10, 7), expected: day(10, 5) });
    expect(balanceOn(p, day(10, 6))).toBe(1000);
    expect(balanceOn(p, day(10, 7))).toBe(1400);
  });

  it("moved past the window's end: not counted in it", () => {
    const p = said({ [incomeOccurrenceKey("salary", "2026-12-30")]: { date: "2027-01-02" } });
    expect(p.incomeTotal).toBe(5760 - 1450);
    expect(cents(p.rows.reduce((s, r) => s + r.total, 0))).toBe(p.incomeTotal);
  });
});

describe("which incomes, and when", () => {
  it("counts no archived income", () => {
    const p = plan({ incomes: [SALARY, RENT, { ...ALLOWANCE, active: false }] });
    expect(p.rows.map((r) => r.id)).toEqual(["salary", "rent"]);
    expect(p.incomeTotal).toBe(5800 + 1200);
  });

  it("skips the months a paused income is off: tutoring, July and August off every year", () => {
    const tutoring = monthlyIncome("tut", "Tutoring", 300, 28, { pause: { from: "2026-07", to: "2026-08", yearly: true } });
    const p = plan({ incomes: [tutoring], horizon: 12 });
    // Twelve months from 30 Sep 2026 close on 30 Sep 2027. By hand: October to
    // June, then September — not July, not August.
    const months = p.events.map((e) => `${e.date.getFullYear()}-${e.date.getMonth() + 1}`);
    expect(months).toEqual(["2026-10", "2026-11", "2026-12", "2027-1", "2027-2", "2027-3", "2027-4", "2027-5", "2027-6", "2027-9"]);
    expect(p.incomeTotal).toBe(10 * 300);
  });

  it("puts a weekly income on every one of its weekdays, and every other one when it is every two weeks", () => {
    // Fridays from 4 September; one month from 30 Sep closes on 31 Oct.
    const weekly = monthlyIncome("wk", "Weekly", 50, 5, { frequency: "weekly", start: "2026-09-04" });
    const p = plan({ incomes: [weekly], horizon: 1 });
    expect(p.events.map((e) => e.date.getDate())).toEqual([2, 9, 16, 23, 30]);
    expect(p.incomeTotal).toBe(5 * 50);
    // Every two weeks from the 4th: 4 Sep, 18 Sep, 2 Oct, 16 Oct, 30 Oct.
    const fortnightly = plan({ incomes: [{ ...weekly, every: 2 }], horizon: 1 });
    expect(fortnightly.events.map((e) => e.date.getDate())).toEqual([2, 16, 30]);
    expect(fortnightly.incomeTotal).toBe(3 * 50);
  });

  it("plans a variable income at the mean of its last three «Ήρθε»", () => {
    const tutoring = monthlyIncome("tut", "Tutoring", 300, 28, { variable: true });
    const records = [came(tutoring, "2026-07-28", 320, day(7, 28)), came(tutoring, "2026-08-28", 340, day(8, 28)), came(tutoring, "2026-09-28", 300, day(9, 28))];
    const p = plan({ incomes: [tutoring], actuals: actuals({ transactions: records }) });
    // (320 + 340 + 300) / 3 = 320, for October, November and December.
    expect((320 + 340 + 300) / 3).toBe(320);
    expect(p.events.map((e) => e.amount)).toEqual([320, 320, 320]);
    expect(row(p, "tut")).toMatchObject({ each: 320, total: 960 });
  });

  it("spreads an income with no day over the days of its month, as the old income line was", () => {
    // 300 a month: one day of September (300 / 30), then October to December.
    const room = undatedIncome("room", "Room", 300);
    const withRecords = plan({ incomes: [room], actuals: actuals({ transactions: [] }) });
    expect(row(withRecords, "room").total).toBe(cents(300 / 30 + 3 * 300));
    // The same figure as a cost line of the same size, the other way round.
    const line: BudgetLine = { id: "l", label: "Line", amount: 300, kind: "expense" };
    const asLine = buildPlan({ bills: [], goals: [], lines: [line], openingBalance: 0, horizon: 3, now: NOW });
    expect(row(withRecords, "room").total).toBe(-row(asLine, "l").total);
    expect(cents(withRecords.endingBalance - 1000)).toBe(-asLine.endingBalance);
  });
});

describe("the Overview's pay-day figure is the Planner's", () => {
  it("reads 1.179,35 on the eve of October's pay, from either plan", () => {
    // 300 a month of one's own: today's 10, then 29 days of October at 300 / 31.
    const own: BudgetLine = { id: "own", label: "Mine", amount: 300, kind: "expense" };
    const overview = paydayOutlook(plan({ lines: [own], horizon: PAYDAY_HORIZON, actuals: actuals() }), NOW);
    const planner = payCycles(plan({ lines: [own], horizon: 12, actuals: actuals() }));
    // By hand: 1.000 + the rent of 5 Oct + the allowance of 20 Oct − 10 − 29 × 300 / 31.
    const byHand = cents(1000 + 400 + 70 - 10 - (29 * 300) / 31);
    expect(byHand).toBe(1179.35);
    expect(overview).toMatchObject({ known: true, date: day(10, 30), left: byHand, incoming: 470 });
    expect(planner[0].close).toBe(byHand);
    expect(planner[0].end).toEqual(day(10, 29));
  });
});

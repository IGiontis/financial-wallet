import { describe, expect, it } from "vitest";
import { createResolver, daysLate, occurrenceKey, type Actuals, type PlannedOccurrence } from "./plannerActuals";
import { buildPlan, type OneOff } from "./plannerUtils";
import { answerUnconfirmed } from "./plannerInputs";
import { incomeOccurrenceKey } from "../incomes/incomesUtils";
import { toISODay } from "../../shared/utils/dates";
import { monthlySalary, SALARY_ID } from "../../test/incomes";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// The scenario on the mockup. Today is Saturday 26 September 2026. Pay is set
// for the 30th and arrived on the 25th; the room rent, due on the 22nd, has not
// come; the car loan's instalment on the 14th was repaid on the 13th.
//
// The salary is an income on «Έσοδα» now, resolved by the Incomes page's own
// resolver inside the plan (`planIncomes`). `createResolver` is left with the
// one-offs and the loans, so its own tests below ask about a dated income of
// 1,700 entered as a one-off — the same arithmetic the salary had there.

const NOW = new Date(2026, 8, 26, 10);
const incomes = [monthlySalary(1700, 30)];
/** The plan's key for one time of the salary — what `planner-occurrences` holds it under. */
const salaryKey = (date: Date) => incomeOccurrenceKey(SALARY_ID, toISODay(date));

let n = 0;
const income = (amount: number, month: number, day: number, description = "Μισθός"): Transaction =>
  ({ id: `i${n++}`, userId: "u", type: "income", amount, categoryId: "c", description, date: new Date(2026, month, day), createdAt: new Date(2026, month, day), updatedAt: new Date(2026, month, day) }) as Transaction;

const rent: OneOff = { id: "rent", label: "Ενοίκιο δωματίου", amount: 250, date: "2026-06-22", every: 1 };

const occurrence = (over: Partial<PlannedOccurrence> & { date: Date }): PlannedOccurrence => {
  const source = over.source ?? "oneoff";
  const refId = over.refId ?? "pay";
  return { key: occurrenceKey(source, refId, over.date), source, refId, label: over.label ?? "Μισθός", amount: over.amount ?? 1700, ...over };
};

const actuals = (over: Partial<Actuals> = {}): Actuals => ({ transactions: [], debts: [], overrides: {}, ...over });

// Last month's pay, recorded — the evidence that pay is something this user writes down.
const august = income(1700, 7, 28);
const early = income(1700, 8, 25);

describe("createResolver", () => {
  it("finds a salary that came early, and says when", () => {
    const resolve = createResolver(actuals({ transactions: [august, early] }), NOW);
    const r = resolve(occurrence({ date: new Date(2026, 8, 30) }));
    expect(r.status).toBe("received");
    expect(r.plannedDate).toBeUndefined();
    expect(r.matched).toMatchObject({ date: new Date(2026, 8, 25), amount: 1700, manual: false });
  });

  it("keeps one that has not come as late, from today, when pay is normally recorded", () => {
    const resolve = createResolver(actuals({ transactions: [august] }), new Date(2026, 9, 3, 10));
    const r = resolve(occurrence({ date: new Date(2026, 8, 30) }));
    expect(r.status).toBe("late");
    expect(r.plannedDate).toEqual(new Date(2026, 9, 3));
    expect(r.plannedAmount).toBe(1700);
    expect(daysLate(r, new Date(2026, 9, 3))).toBe(3);
  });

  it("takes it as come, the old way, for someone who never records pay", () => {
    const resolve = createResolver(actuals(), new Date(2026, 9, 3, 10));
    expect(resolve(occurrence({ date: new Date(2026, 8, 30) })).status).toBe("assumed");
  });

  it("does not take a much smaller income for the salary", () => {
    // 1,400 is 18% under 1,700 — outside the ±15% band.
    const resolve = createResolver(actuals({ transactions: [august, income(1400, 8, 25, "Επιστροφή")] }), NOW);
    expect(resolve(occurrence({ date: new Date(2026, 8, 30) })).status).toBe("due");
    // 1,500 is 11.8% under — inside it.
    const resolve2 = createResolver(actuals({ transactions: [august, income(1500, 8, 25)] }), NOW);
    expect(resolve2(occurrence({ date: new Date(2026, 8, 30) })).matched?.amount).toBe(1500);
  });

  it("does not reach further than ten days", () => {
    const resolve = createResolver(actuals({ transactions: [august, income(1700, 8, 19)] }), NOW);
    // The 19th is eleven days before the 30th.
    expect(resolve(occurrence({ date: new Date(2026, 8, 30) })).status).toBe("due");
  });

  it("lets one record settle one thing only", () => {
    const resolve = createResolver(actuals({ transactions: [august, early] }), NOW);
    const salaryCame = resolve(occurrence({ date: new Date(2026, 8, 30) }));
    const bonus = resolve(occurrence({ source: "oneoff", refId: "bonus", label: "Μπόνους", date: new Date(2026, 8, 28) }));
    expect(salaryCame.status).toBe("received");
    expect(bonus.status).toBe("due");
  });

  it("does not count savings coming back as income", () => {
    const withdrawal = { ...income(1700, 8, 25), type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "withdrawal" } as Transaction;
    const resolve = createResolver(actuals({ transactions: [august, withdrawal] }), NOW);
    expect(resolve(occurrence({ date: new Date(2026, 8, 30) })).status).toBe("due");
  });

  it("finds a loan instalment among that loan's repayments", () => {
    const loan = { id: "loan", person: "Εθνική", label: "Δάνειο", payments: [{ id: "p1", amount: 322.45, date: new Date(2026, 8, 13) }] } as unknown as DebtWithStatus;
    const resolve = createResolver(actuals({ debts: [loan] }), NOW);
    const r = resolve(occurrence({ source: "loan", refId: "loan", label: "Δάνειο", amount: -322.45, date: new Date(2026, 8, 14) }));
    expect(r.status).toBe("received");
    expect(r.matched?.amount).toBe(-322.45);
  });

  describe("the user's word on one occurrence", () => {
    const at = new Date(2026, 8, 30);
    const key = occurrenceKey("oneoff", "pay", at);

    it("skips it", () => {
      const r = createResolver(actuals({ overrides: { [key]: { state: "skipped" } } }), NOW)(occurrence({ date: at }));
      expect(r).toMatchObject({ status: "skipped", plannedAmount: 0, overridden: true });
    });

    it("marks it come, on a day and for an amount", () => {
      const r = createResolver(actuals({ overrides: { [key]: { state: "received", date: "2026-09-24", amount: 1650 } } }), NOW)(occurrence({ date: at }));
      expect(r.status).toBe("received");
      expect(r.matched).toMatchObject({ date: new Date(2026, 8, 24), amount: 1650, manual: true });
    });

    it("ignores a wrong match when told to wait", () => {
      const r = createResolver(actuals({ transactions: [august, early], overrides: { [key]: { state: "waiting" } } }), NOW)(occurrence({ date: at }));
      expect(r.status).toBe("due");
      expect(r.plannedDate).toEqual(at);
    });

    it("moves it, this time only", () => {
      const r = createResolver(actuals({ overrides: { [key]: { date: "2026-10-02" } } }), NOW)(occurrence({ date: at }));
      expect(r).toMatchObject({ status: "due", plannedDate: new Date(2026, 9, 2), plannedAmount: 1700 });
    });

    it("changes the amount, this time only, keeping the sign", () => {
      const r = createResolver(actuals({ overrides: { [key]: { amount: 1500 } } }), NOW)(occurrence({ date: at }));
      expect(r.plannedAmount).toBe(1500);
      const k = occurrenceKey("loan", "l", at);
      const loanR = createResolver(actuals({ overrides: { [k]: { amount: 300 } } }), NOW)(occurrence({ source: "loan", refId: "l", amount: -322.45, date: at }));
      expect(loanR.plannedAmount).toBe(-300);
    });

    it("keeps a moved one that has now passed as late, even with no records at all", () => {
      const r = createResolver(actuals({ overrides: { [key]: { date: "2026-09-24" } } }), NOW)(occurrence({ date: at }));
      expect(r.status).toBe("late");
    });
  });
});

describe("the plan, checked against the records", () => {
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], incomes, oneOffs: [rent], openingBalance: 2420, horizon: 2, now: NOW };
  const records = actuals({ transactions: [august, early, income(250, 7, 22, "Ενοίκιο")] });

  it("neither counts the early salary twice nor forgets the late rent", () => {
    const blind = buildPlan(base);
    const checked = buildPlan({ ...base, actuals: records });

    // Second route, by hand: the 1,700 on the 30th goes, the 250 from the 22nd comes back.
    expect(checked.endingBalance - blind.endingBalance).toBeCloseTo(-1700 + 250, 2);

    // Two months from 26 Sep close on 30 Nov (25 Nov, rounded out): the 30th
    // of September is settled by the 25th's record, October's and November's remain.
    const salaryEvents = checked.events.filter((e) => e.pay);
    expect(salaryEvents.map((e) => e.date)).toEqual([new Date(2026, 9, 30), new Date(2026, 10, 30)]);
    expect(blind.events.filter((e) => e.pay)).toHaveLength(salaryEvents.length + 1);
    const lateRent = checked.events.find((e) => e.label === "Ενοίκιο δωματίου" && e.late);
    expect(lateRent).toMatchObject({ amount: 250, date: new Date(2026, 8, 26), expected: new Date(2026, 8, 22) });
  });

  it("keeps each row's total equal to the events it put in the plan", () => {
    const plan = buildPlan({ ...base, actuals: records });
    for (const id of [SALARY_ID, "rent"]) {
      const row = plan.rows.find((r) => r.id === id)!;
      const events = plan.events.filter((e) => (id === SALARY_ID ? e.pay : e.label === "Ενοίκιο δωματίου"));
      expect(events).toHaveLength(row.occurrences!);
      expect(Math.round(events.reduce((s, e) => s + e.amount, 0) * 100) / 100).toBe(row.total);
    }
  });

  it("reports what became of each one near today", () => {
    const plan = buildPlan({ ...base, actuals: records });
    const bySource = (key: string) => plan.occurrences.find((o) => o.key === key)?.status;
    expect(bySource(salaryKey(new Date(2026, 8, 30)))).toBe("received");
    expect(bySource(occurrenceKey("oneoff", "rent", new Date(2026, 8, 22)))).toBe("late");
    expect(bySource(occurrenceKey("oneoff", "rent", new Date(2026, 9, 22)))).toBe("due");
  });

  it("settles a loan instalment repaid a day early", () => {
    const loan = {
      id: "loan",
      userId: "u1",
      person: "Εθνική",
      label: "Αυτοκίνητο",
      direction: "owed_by_me",
      amount: 10000,
      remaining: 9801.99,
      interestRate: 7,
      termMonths: 60,
      date: new Date(2026, 7, 14),
      isSettled: false,
      payments: [{ id: "p1", amount: 198.01, date: new Date(2026, 8, 13) }],
      paid: 198.01,
      createdAt: new Date(2026, 7, 14),
      updatedAt: new Date(2026, 7, 14),
    } as unknown as DebtWithStatus;
    const plan = buildPlan({ ...base, oneOffs: [], debts: [loan], actuals: actuals({ debts: [loan] }) });
    const instalments = plan.events.filter((e) => e.label === "Αυτοκίνητο");
    // 14 September settled by the 13th; 14 October and 14 November still to
    // come — two months from 26 September close on 30 November.
    expect(instalments.map((e) => e.date)).toEqual([new Date(2026, 9, 14), new Date(2026, 10, 14)]);
    expect(plan.occurrences.find((o) => o.source === "loan")?.status).toBe("received");
  });

  it("sees last month's instalment early in the new month, and keeps it late when unpaid", () => {
    // Today is 3 October; the instalment was due on 28 September and has not
    // been repaid, though July's and August's were.
    const today = new Date(2026, 9, 3, 10);
    const loan = {
      id: "loan",
      userId: "u1",
      person: "Εθνική",
      label: "Αυτοκίνητο",
      direction: "owed_by_me",
      amount: 10000,
      remaining: 9600,
      interestRate: 7,
      termMonths: 60,
      date: new Date(2026, 2, 28),
      isSettled: false,
      payments: [
        { id: "p7", amount: 198.01, date: new Date(2026, 6, 28) },
        { id: "p8", amount: 198.01, date: new Date(2026, 7, 28) },
      ],
      paid: 396.02,
      createdAt: new Date(2026, 2, 28),
      updatedAt: new Date(2026, 2, 28),
    } as unknown as DebtWithStatus;
    const plan = buildPlan({ ...base, oneOffs: [], incomes: [], debts: [loan], now: today, actuals: actuals({ debts: [loan] }) });
    const late = plan.events.find((e) => e.label === "Αυτοκίνητο" && e.late);
    expect(late).toMatchObject({ date: new Date(2026, 9, 3), expected: new Date(2026, 8, 28) });
    expect(late?.amount).toBeCloseTo(-198.01, 2);
  });

  it("is exactly the old plan when there is nothing to check against", () => {
    const plan = buildPlan(base);
    expect(plan.occurrences).toEqual([]);
    expect(plan.events.some((e) => e.late || e.occurrenceKey)).toBe(false);
  });
});

// ─── Pay that only shows in a bank reading ──────────────────────────────────
// Wednesday 30 September 2026. October's salary, due on the 1st, came early on
// the 28th and was never written down; the banks were read on the 29th, so
// the plan's starting figure already holds it. Counting it again on 1 October
// put the same 1,700 in twice.

describe("pay a bank reading may already hold", () => {
  const today = new Date(2026, 8, 30, 9);
  const firstOfMonth = [monthlySalary(1700, 1)];
  const october1 = new Date(2026, 9, 1);
  // The resolver's key for the dated income of the unit checks, and the plan's
  // for the salary itself: an answer is kept under each.
  const key = occurrenceKey("oneoff", "pay", october1);
  const planKey = salaryKey(october1);
  const readOn = (day: Date) => actuals({ transactions: [august], lastReadingAt: day });
  // Two months from the 30th run to 30 November: pay on 1 October and 1 November.
  const plan = (records: Actuals | undefined, horizon = 2) => buildPlan({ bills: [], goals: [], incomes: firstOfMonth, openingBalance: 1200, horizon, now: today, actuals: records });
  const status = (p: ReturnType<typeof plan>, at = october1) => p.occurrences.find((o) => o.key === salaryKey(at))?.status;

  it("asks rather than counts it, when the reading was taken after it could have come", () => {
    const r = createResolver(readOn(new Date(2026, 8, 29, 20)), today)(occurrence({ date: october1 }));
    expect(r).toMatchObject({ status: "unconfirmed", plannedAmount: 0, overridden: false });
    expect(r.plannedDate).toBeUndefined();

    const checked = plan(readOn(new Date(2026, 8, 29, 20)));
    const blind = plan(actuals({ transactions: [august] }));
    expect(status(checked)).toBe("unconfirmed");
    expect(status(blind)).toBe("due");
    // Not in the plan: no event on the 1st, and the row counts November's pay only.
    expect(checked.events.filter((e) => e.pay).map((e) => e.date)).toEqual([new Date(2026, 10, 1)]);
    expect(checked.rows.find((r) => r.id === SALARY_ID)).toMatchObject({ occurrences: 1, total: 1700 });
    // Reconciled a second way: exactly one salary less, on every total that holds it.
    expect(blind.incomeTotal - checked.incomeTotal).toBe(1700);
    expect(blind.endingBalance - checked.endingBalance).toBe(1700);
    // What is in hand (the early pay already in it), and November's.
    expect(checked.endingBalance).toBe(1200 + 1700);
  });

  it("takes «it came» as received — still not counted again", () => {
    const came = answerUnconfirmed({ amount: 1700, plannedAmount: 0 }, true, today);
    const answered = actuals({ transactions: [august], lastReadingAt: new Date(2026, 8, 29, 20), overrides: { [key]: came, [planKey]: came } });
    const r = createResolver(answered, today)(occurrence({ date: october1 }));
    expect(r).toMatchObject({ status: "received", plannedAmount: 0, overridden: true });
    expect(r.matched).toMatchObject({ date: new Date(2026, 8, 30), amount: 1700, manual: true });
    expect(plan(answered).endingBalance).toBe(plan(readOn(new Date(2026, 8, 29, 20))).endingBalance);
  });

  it("takes «not yet» as waiting — counted on its day again", () => {
    const notYet = answerUnconfirmed({ amount: 1700, plannedAmount: 0 }, false, today);
    const answered = actuals({ transactions: [august], lastReadingAt: new Date(2026, 8, 29, 20), overrides: { [key]: notYet, [planKey]: notYet } });
    expect(answered.overrides[key]).toEqual({ state: "waiting" });
    const r = createResolver(answered, today)(occurrence({ date: october1 }));
    expect(r).toMatchObject({ status: "due", plannedDate: october1, plannedAmount: 1700 });
    // The same plan as one that never saw the reading.
    expect(plan(answered).endingBalance).toBe(plan(actuals({ transactions: [august] })).endingBalance);
    expect(plan(answered).endingBalance).toBe(1200 + 2 * 1700);
  });

  it("does not ask when the reading came before the earliest day it could have", () => {
    // Ten days early is 21 September. Read on the 20th, late in the evening:
    // the pay cannot be in it, so it is due as before.
    expect(status(plan(readOn(new Date(2026, 8, 20, 23, 59))))).toBe("due");
    // Read on the 21st, first thing: it could be.
    expect(status(plan(readOn(new Date(2026, 8, 21, 0, 1))))).toBe("unconfirmed");
  });

  it("still matches a salary that was written down, and asks nothing", () => {
    const logged = actuals({ transactions: [august, income(1700, 8, 28)], lastReadingAt: new Date(2026, 8, 29, 20) });
    const r = createResolver(logged, today)(occurrence({ date: october1 }));
    expect(r.status).toBe("received");
    expect(r.matched).toMatchObject({ date: new Date(2026, 8, 28), amount: 1700, manual: false });
    expect(plan(logged).occurrences.some((o) => o.status === "unconfirmed")).toBe(false);
  });

  it("asks about income one-offs too, but never about a loan instalment going out", () => {
    const resolve = createResolver(readOn(new Date(2026, 8, 29, 20)), today);
    expect(resolve(occurrence({ source: "oneoff", refId: "rent", label: "Ενοίκιο δωματίου", amount: 250, date: new Date(2026, 9, 3) })).status).toBe("unconfirmed");
    const instalment = resolve(occurrence({ source: "loan", refId: "loan", label: "Δάνειο", amount: -322.45, date: new Date(2026, 9, 3) }));
    expect(instalment).toMatchObject({ status: "due", plannedAmount: -322.45 });
  });

  it("asks about a past one the reading may hold, and keeps it late once told it has not come", () => {
    // Pay due the 25th, not recorded; read on the 26th, today the 30th.
    const at = new Date(2026, 8, 25);
    const k = occurrenceKey("oneoff", "pay", at);
    const read = { transactions: [august], lastReadingAt: new Date(2026, 8, 26, 12) };
    expect(createResolver(actuals(read), today)(occurrence({ date: at })).status).toBe("unconfirmed");
    // Without the reading it was late, from today.
    expect(createResolver(actuals({ transactions: [august] }), today)(occurrence({ date: at })).status).toBe("late");
    const waiting = createResolver(actuals({ ...read, overrides: { [k]: { state: "waiting" } } }), today)(occurrence({ date: at }));
    expect(waiting).toMatchObject({ status: "late", plannedDate: new Date(2026, 8, 30), plannedAmount: 1700 });
  });

  it("leaves a past one of a kind never recorded as assumed, without asking", () => {
    // Nothing of the kind is ever written down, and its day has gone: it was
    // already left out of the plan as having come, so a question would change
    // no figure. The same pay still to come is asked about.
    const resolve = createResolver(actuals({ lastReadingAt: new Date(2026, 8, 29, 20) }), today);
    expect(resolve(occurrence({ date: new Date(2026, 8, 25) }))).toMatchObject({ status: "assumed", plannedAmount: 0 });
    expect(resolve(occurrence({ date: october1 })).status).toBe("unconfirmed");
  });

  it("measures the ten days on the calendar — month ends, a leap February, the year end", () => {
    const cases: [Date, Date][] = [
      [new Date(2026, 9, 31), new Date(2026, 9, 21)], // the 31st
      [new Date(2026, 10, 30), new Date(2026, 10, 20)], // the 30th
      [new Date(2027, 1, 28), new Date(2027, 1, 18)], // the 28th of an ordinary February
      [new Date(2028, 1, 29), new Date(2028, 1, 19)], // the 29th of a leap one
      [new Date(2028, 2, 3), new Date(2028, 1, 22)], // early March, reaching back across 29 Feb
      [new Date(2027, 0, 5), new Date(2026, 11, 26)], // across the year end
    ];
    for (const [expected, firstDay] of cases) {
      const ask = (reading: Date) => createResolver(actuals({ lastReadingAt: reading }), firstDay)(occurrence({ date: expected })).status;
      expect(ask(new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate(), 8)), expected.toDateString()).toBe("unconfirmed");
      expect(ask(new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() - 1, 22)), expected.toDateString()).toBe("due");
    }
  });
});

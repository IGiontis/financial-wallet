import { describe, expect, it } from "vitest";
import { createResolver, daysLate, occurrenceKey, type Actuals, type PlannedOccurrence } from "./plannerActuals";
import { buildPlan, SALARY_ROW_ID, type OneOff } from "./plannerUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// The scenario on the mockup. Today is Saturday 26 September 2026. Pay is set
// for the 30th and arrived on the 25th; the room rent, due on the 22nd, has not
// come; the car loan's instalment on the 14th was repaid on the 13th.

const NOW = new Date(2026, 8, 26, 10);
const salary = { amount: 1700, dayOfMonth: 30, occurrences: 4 };

let n = 0;
const income = (amount: number, month: number, day: number, description = "Μισθός"): Transaction =>
  ({ id: `i${n++}`, userId: "u", type: "income", amount, categoryId: "c", description, date: new Date(2026, month, day), createdAt: new Date(2026, month, day), updatedAt: new Date(2026, month, day) }) as Transaction;

const rent: OneOff = { id: "rent", label: "Ενοίκιο δωματίου", amount: 250, date: "2026-06-22", every: 1 };

const occurrence = (over: Partial<PlannedOccurrence> & { date: Date }): PlannedOccurrence => {
  const source = over.source ?? "salary";
  const refId = over.refId ?? SALARY_ROW_ID;
  return { key: occurrenceKey(source, refId, over.date), source, refId, label: over.label ?? SALARY_ROW_ID, amount: over.amount ?? 1700, ...over };
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
    const key = occurrenceKey("salary", SALARY_ROW_ID, at);

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
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, oneOffs: [rent], openingBalance: 2420, horizon: 2, now: NOW };
  const records = actuals({ transactions: [august, early, income(250, 7, 22, "Ενοίκιο")] });

  it("neither counts the early salary twice nor forgets the late rent", () => {
    const blind = buildPlan(base);
    const checked = buildPlan({ ...base, actuals: records });

    // Second route, by hand: the 1,700 on the 30th goes, the 250 from the 22nd comes back.
    expect(checked.endingBalance - blind.endingBalance).toBeCloseTo(-1700 + 250, 2);

    const salaryEvents = checked.events.filter((e) => e.label === SALARY_ROW_ID);
    expect(salaryEvents.map((e) => e.date)).toEqual([new Date(2026, 9, 30)]);
    const lateRent = checked.events.find((e) => e.label === "Ενοίκιο δωματίου" && e.late);
    expect(lateRent).toMatchObject({ amount: 250, date: new Date(2026, 8, 26), expected: new Date(2026, 8, 22) });
  });

  it("keeps each row's total equal to the events it put in the plan", () => {
    const plan = buildPlan({ ...base, actuals: records });
    for (const id of [SALARY_ROW_ID, "rent"]) {
      const row = plan.rows.find((r) => r.id === id)!;
      const events = plan.events.filter((e) => (id === SALARY_ROW_ID ? e.label === SALARY_ROW_ID : e.label === "Ενοίκιο δωματίου"));
      expect(events).toHaveLength(row.occurrences!);
      expect(Math.round(events.reduce((s, e) => s + e.amount, 0) * 100) / 100).toBe(row.total);
    }
  });

  it("reports what became of each one near today", () => {
    const plan = buildPlan({ ...base, actuals: records });
    const bySource = (key: string) => plan.occurrences.find((o) => o.key === key)?.status;
    expect(bySource(occurrenceKey("salary", SALARY_ROW_ID, new Date(2026, 8, 30)))).toBe("received");
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
    // 14 September settled by the 13th; 14 October still to come — the window closes on 31 October.
    expect(instalments.map((e) => e.date)).toEqual([new Date(2026, 9, 14)]);
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
    const plan = buildPlan({ ...base, oneOffs: [], salary: undefined, debts: [loan], now: today, actuals: actuals({ debts: [loan] }) });
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

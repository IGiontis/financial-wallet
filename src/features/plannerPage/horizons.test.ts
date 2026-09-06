import { describe, it, expect } from "vitest";
import { asHorizon, billOccurrences, buildPlan, horizonEnd, horizonMonths, oneOffDate, type BudgetLine, type OneOff, pointStepFor } from "./plannerUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

const now = new Date(2026, 7, 14); // 14 Aug 2026
const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };

const bill = (overrides: Partial<BillWithStatus> = {}): BillWithStatus =>
  ({
    id: `b${Math.random()}`,
    userId: "u1",
    name: "Bill",
    amount: 50,
    categoryId: "c1",
    frequency: "monthly",
    isActive: true,
    createdAt: new Date(2026, 0, 1),
    anchorDate: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    currentPeriodKey: "2026-08",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 50,
    ...overrides,
  }) as BillWithStatus;

const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };
const round = (n: number) => Math.round(n * 100) / 100;

describe("horizonEnd", () => {
  it("covers whole calendar months, the current one included", () => {
    expect(horizonEnd(1, now)).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
    expect(horizonEnd(3, now).getMonth()).toBe(9); // through October
    expect(horizonEnd(6, now).getMonth()).toBe(0); // through January
    expect(horizonEnd(6, now).getFullYear()).toBe(2027);
  });

  it("reports the months it stands for", () => {
    expect([horizonMonths(1), horizonMonths(3), horizonMonths(6), horizonMonths(12)]).toEqual([1, 3, 6, 12]);
  });

  it("still understands the names the old set used", () => {
    // "3m" and friends are sitting in browsers that have not been opened since.
    expect(asHorizon("3m")).toBe(3);
    expect(asHorizon("12m")).toBe(12);
  });

  it("takes any month count, so three years is a question that can be asked", () => {
    expect(asHorizon(36)).toBe(36);
    expect(horizonEnd(36, now).getFullYear()).toBe(2029);
    // Clamped at both ends rather than trusted.
    expect(asHorizon(0)).toBe(1);
    expect(asHorizon(9999)).toBe(120);
  });

  it("survives a horizon left behind by an older version", () => {
    // The horizon is persisted, so browsers still hand back "payday" and
    // "month" from a set that no longer exists. Unguarded that reached
    // addMonths as NaN and every date on the page became invalid.
    for (const stale of ["payday", "month", "", null, undefined, NaN]) {
      expect(asHorizon(stale)).toBe(1);
      expect(Number.isNaN(horizonEnd(stale as never, now).getTime())).toBe(false);
      expect(Number.isNaN(buildPlan({ ...base, horizon: stale as never }).end.getTime())).toBe(false);
    }
  });
});

describe("billOccurrences", () => {
  it("repeats a monthly bill once per month across the window", () => {
    const dates = billOccurrences(bill({ dueDay: 20 }), new Date(2026, 7, 14), new Date(2026, 9, 31)).map((o) => o.date);

    expect(dates).toEqual([new Date(2026, 7, 20), new Date(2026, 8, 20), new Date(2026, 9, 20)]);
  });

  it("respects a custom interval", () => {
    const water = bill({ dueDay: 10, intervalCount: 2, anchorDate: new Date(2026, 0, 1) });
    const dates = billOccurrences(water, new Date(2026, 7, 14), new Date(2026, 11, 31)).map((o) => o.date.getMonth());

    // Anchored at January, so buckets are Jul+Aug, Sep+Oct, Nov+Dec.
    expect(dates).toEqual([6, 8, 10]);
  });

  it("skips a period that has already been paid", () => {
    const paid = bill({
      dueDay: 20,
      payments: [{ id: "p", userId: "u1", billId: "x", periodKey: "2026-08", amount: 50, paidDate: new Date(2026, 7, 3), createdAt: new Date(2026, 7, 3) }],
    } as Partial<BillWithStatus>);

    const months = billOccurrences(paid, new Date(2026, 7, 14), new Date(2026, 9, 31)).map((o) => o.date.getMonth());
    expect(months).toEqual([8, 9]); // August dropped, September and October kept
  });

  it("keeps an unpaid bill whose date has already gone", () => {
    // A late bill still has to be paid; dropping it would be the one omission
    // the plan cannot afford.
    const late = billOccurrences(bill({ dueDay: 9 }), new Date(2026, 7, 14), new Date(2026, 7, 31));
    expect(late[0].date).toEqual(new Date(2026, 7, 9));
  });

  it("returns nothing when the bill has no due day", () => {
    expect(billOccurrences(bill(), new Date(2026, 7, 14), new Date(2026, 9, 31))).toEqual([]);
  });
});

describe("buildPlan across months", () => {
  it("credits a payday in every month, without which a long window is a fiction", () => {
    const paydays = buildPlan({ ...base, horizon: 3 }).events.filter((e) => e.kind === "income");

    expect(paydays.map((e) => e.date)).toEqual([new Date(2026, 7, 20), new Date(2026, 8, 20), new Date(2026, 9, 20)]);
    expect(paydays.every((e) => e.amount === 2000)).toBe(true);
  });

  it("carries a bill's real grace window and last day", () => {
    const plan = buildPlan({ ...base, horizon: 1, bills: [bill({ name: "Ρεύμα", amount: 100, dueDay: 20, graceDays: 25 })] });
    const [electricity] = plan.events.filter((e) => e.kind === "bill");

    expect(electricity.graceDays).toBe(25);
    expect(electricity.deadline).toEqual(new Date(2026, 8, 14)); // 20 Aug + 25 days
  });

  it("gives no slack to a strict bill, wherever it falls in the window", () => {
    // The trap: a subscription due after payday is not thereby deferrable. Grace
    // has to come from the bill, not from where it sits in the calendar.
    const occurrences = buildPlan({ ...base, horizon: 3, bills: [bill({ name: "Netflix", amount: 12, dueDay: 22 })] }).events.filter((e) => e.kind === "bill");

    expect(occurrences.length).toBeGreaterThan(1);
    expect(occurrences.every((e) => e.graceDays === 0)).toBe(true);
    expect(occurrences.every((e) => e.deadline?.getTime() === e.date.getTime())).toBe(true);
  });
});

describe("bills paid in instalments", () => {
  const gym = (payments: BillWithStatus["payments"] = []) =>
    ({
      ...bill({
        id: "gym",
        name: "Γυμναστήριο",
        amount: 360,
        frequency: "yearly",
        dueMonth: 7,
        dueDay: 20,
        installmentCount: 3,
        anchorDate: new Date(2026, 0, 1),
      }),
      payments,
    }) as BillWithStatus;

  it("charges the parts on their own months, not the total in one hit", () => {
    // A €360 year taken in three would otherwise blow a hole in August that the
    // month never actually sees.
    const events = buildPlan({ ...base, horizon: 6, bills: [gym()] }).events.filter((e) => e.kind === "bill");

    expect(events.map((e) => [e.date.getMonth(), e.amount])).toEqual([
      [7, -120],
      [8, -120],
      [9, -120],
    ]);
  });

  it("counts the whole year once, however it is split", () => {
    expect(buildPlan({ ...base, horizon: 6, bills: [gym()] }).billsTotal).toBe(360);
  });

  it("stops asking for an instalment already paid", () => {
    const paid = [{ id: "p0", userId: "u1", billId: "gym", periodKey: "2026", installmentIndex: 0, amount: 120, paidDate: new Date(2026, 7, 20), createdAt: new Date(2026, 7, 20) }];
    const plan = buildPlan({ ...base, horizon: 6, bills: [gym(paid as BillWithStatus["payments"])] });

    expect(plan.events.filter((e) => e.kind === "bill").map((e) => e.date.getMonth())).toEqual([8, 9]);
    expect(plan.billsTotal).toBe(240);
  });

  it("leaves an ordinary bill charged in full on its own date", () => {
    const plan = buildPlan({ ...base, horizon: 1, bills: [bill({ name: "Netflix", amount: 12.99, dueDay: 22 })] });
    expect(plan.events.filter((e) => e.kind === "bill").map((e) => e.amount)).toEqual([-12.99]);
  });
});

describe("debts in the plan", () => {
  const owed = (over: Partial<DebtWithStatus> = {}): DebtWithStatus =>
    ({
      id: "d1",
      userId: "u1",
      person: "Αδερφός",
      direction: "owed_by_me",
      amount: 200,
      date: new Date(2026, 2, 4),
      createdAt: new Date(2026, 2, 4),
      updatedAt: new Date(2026, 2, 4),
      payments: [],
      paid: 0,
      remaining: 200,
      isSettled: false,
      ...over,
    }) as DebtWithStatus;

  it("charges what is left, not what was borrowed", () => {
    const plan = buildPlan({ ...base, horizon: 1, debts: [owed({ amount: 200, paid: 120, remaining: 80 })] });

    expect(plan.debtsTotal).toBe(80);
    expect(plan.rows.find((r) => r.source === "debt")).toMatchObject({ total: -80, label: "Αδερφός" });
  });

  it("charges an undated debt straight away", () => {
    // It is owed now. Waiting for a date it may never get would keep it out of
    // every window, which is the one thing a debt must not do.
    const plan = buildPlan({ ...base, horizon: 1, debts: [owed()] });
    expect(plan.events.find((e) => e.amount === -200)?.date).toEqual(new Date(2026, 7, 14));
  });

  it("charges a dated one on its day", () => {
    const plan = buildPlan({ ...base, horizon: 3, debts: [owed({ dueDate: new Date(2026, 8, 20) })] });
    expect(plan.events.find((e) => e.amount === -200)?.date).toEqual(new Date(2026, 8, 20));
  });

  it("pulls an overdue debt onto today rather than a date that has gone", () => {
    const plan = buildPlan({ ...base, horizon: 1, debts: [owed({ dueDate: new Date(2026, 5, 1) })] });
    expect(plan.events.find((e) => e.amount === -200)?.date).toEqual(new Date(2026, 7, 14));
  });

  it("leaves one falling outside the window alone", () => {
    const plan = buildPlan({ ...base, horizon: 1, debts: [owed({ dueDate: new Date(2027, 5, 1) })] });
    expect(plan.debtsTotal).toBe(0);
    expect(plan.rows.some((r) => r.source === "debt")).toBe(false);
  });

  it("frees its money when switched off, like every other row", () => {
    const input = { ...base, horizon: 1 as const, debts: [owed()] };
    const on = buildPlan(input);
    const off = buildPlan({ ...input, skipIds: new Set(["d1"]) });

    expect(off.debtsTotal).toBe(0);
    expect(off.endingBalance).toBeCloseTo(on.endingBalance + 200, 2);
  });
});

describe("the user's own budget lines", () => {
  const food = (over: Partial<BudgetLine> = {}): BudgetLine => ({ id: "l1", label: "Φαγητό", amount: 200, kind: "expense", ...over });

  it("keeps a row for a line whose amount is momentarily zero", () => {
    // The state every line passes through while its figure is being retyped.
    // The page groups by `kind`, so the row has to keep saying which side it is
    // on even when the sign of its total says nothing — grouping by sign made
    // it vanish from both lists mid-keystroke and read as deleted.
    const row = buildPlan({ ...base, horizon: 1, lines: [food({ amount: 0 })] }).rows.find((r) => r.source === "line");

    expect(row).toMatchObject({ id: "l1", kind: "expense", total: 0 });
  });

  it("names the side for both kinds, switched on or off", () => {
    const lines = [food(), food({ id: "l2", label: "Ενοίκιο σπιτιού", amount: 300, kind: "income" })];
    const plan = buildPlan({ ...base, horizon: 1, lines, skipIds: new Set(["l2"]) });

    expect(plan.rows.filter((r) => r.source === "line").map((r) => r.kind)).toEqual(["expense", "income"]);
  });
});

describe("dated one-offs", () => {
  const extra = (over: Partial<OneOff> = {}): OneOff => ({ id: "o1", label: "14ος μισθός", amount: 700, date: "2026-09-20", ...over });

  it("reads a stored date at local midnight", () => {
    expect(oneOffDate("2026-04-20")).toEqual(new Date(2026, 3, 20));
  });

  it("rejects a date that does not exist rather than rolling it forward", () => {
    // `new Date(2026, 1, 31)` quietly becomes 3 March, which would put a
    // fourteenth salary in the wrong month without a word.
    expect(oneOffDate("2026-02-31")).toBeUndefined();
    expect(oneOffDate("nonsense")).toBeUndefined();
    expect(oneOffDate("")).toBeUndefined();
  });

  it("lands on its own day rather than being spread over the months", () => {
    const plan = buildPlan({ ...base, horizon: 3, oneOffs: [extra()] });
    const event = plan.events.find((e) => e.label === "14ος μισθός");

    expect(event?.date).toEqual(new Date(2026, 8, 20));
    expect(event?.amount).toBe(700);
  });

  it("counts one-off income in the income total", () => {
    const withIt = buildPlan({ ...base, horizon: 3, oneOffs: [extra()] });
    const without = buildPlan({ ...base, horizon: 3 });

    expect(round(withIt.incomeTotal - without.incomeTotal)).toBe(700);
  });

  it("leaves the outgoings alone — it is income, and only income", () => {
    const withIt = buildPlan({ ...base, horizon: 3, oneOffs: [extra()] });
    const without = buildPlan({ ...base, horizon: 3 });

    expect(withIt.outgoingTotal).toBe(without.outgoingTotal);
    expect(withIt.net).toBe(round(without.net + 700));
  });

  it("leaves one outside the window alone", () => {
    const plan = buildPlan({ ...base, horizon: 1, oneOffs: [extra({ date: "2027-04-20" })] });
    expect(plan.rows.some((r) => r.source === "oneoff")).toBe(false);
  });

  it("ignores one whose day has already gone", () => {
    // Unlike a bill, there is nothing left to pay or collect: it either
    // happened or it did not, and the plan is about what is still ahead.
    const plan = buildPlan({ ...base, horizon: 1, oneOffs: [extra({ date: "2026-08-01" })] });
    expect(plan.rows.some((r) => r.source === "oneoff")).toBe(false);
  });

  it("frees its money when switched off, like every other row", () => {
    const input = { ...base, horizon: 3 as const, oneOffs: [extra()] };
    const off = buildPlan({ ...input, skipIds: new Set(["o1"]) });

    expect(off.rows.find((r) => r.source === "oneoff")?.total).toBe(0);
    expect(off.incomeTotal).toBe(buildPlan({ ...base, horizon: 3 }).incomeTotal);
  });

  it("sits with the income rows, which is where the page lists it", () => {
    const plan = buildPlan({ ...base, horizon: 3, oneOffs: [extra(), extra({ id: "o2", amount: 1400, date: "2026-09-25" })] });
    const rows = plan.rows.filter((r) => r.source === "oneoff");

    expect(rows.map((r) => r.kind)).toEqual(["income", "income"]);
    expect(rows.every((r) => r.total > 0)).toBe(true);
  });
});

describe("how finely the line is sampled", () => {
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  it("keeps a point per day only while the window is short", () => {
    expect(pointStepFor(30)).toBe("day");
    expect(pointStepFor(92)).toBe("day");
    expect(pointStepFor(93)).toBe("week");
    expect(pointStepFor(550)).toBe("week");
    expect(pointStepFor(551)).toBe("month");
  });

  it("draws a three-year plan in months rather than in days", () => {
    // 1,100 nodes of SVG for a line whose shape is monthly anyway is what made
    // the page stall — and unreadable at the same time.
    const plan = buildPlan({ ...base, horizon: 36 });

    expect(plan.pointStep).toBe("month");
    expect(plan.points.length).toBeLessThan(45);
    expect(plan.points.length).toBeGreaterThan(30);
  });

  it("ends on the last day of the window whatever the step", () => {
    for (const horizon of [1, 6, 36]) {
      const plan = buildPlan({ ...base, horizon });
      // `end` is the last instant of the window and a point is a midnight, so
      // they are the same day rather than the same value.
      expect(plan.points[plan.points.length - 1].date.toDateString()).toBe(plan.end.toDateString());
    }
  });

  it("reaches the same closing balance at every resolution", () => {
    // The proof that thinning the line is a drawing decision and not an
    // arithmetic one: the walk underneath is still daily.
    const daily = buildPlan({ ...base, horizon: 3, bills: [bill({ name: "Rent", amount: 400, dueDay: 5 })] });
    const monthly = buildPlan({ ...base, horizon: 36, bills: [bill({ name: "Rent", amount: 400, dueDay: 5 })] });

    expect(daily.pointStep).toBe("day");
    expect(monthly.pointStep).toBe("month");
    // Same monthly arithmetic, so the first three months of the long plan must agree.
    expect(monthly.incomeTotal / 36).toBeCloseTo(daily.incomeTotal / 3, 2);
  });

  it("keeps every event, folded into the period it happened in", () => {
    // A bill landing mid-month must not vanish because no point sits on its day.
    const plan = buildPlan({ ...base, horizon: 24, bills: [bill({ name: "Rent", amount: 400, dueDay: 14 })] });
    const inPoints = plan.points.flatMap((p) => p.events).filter((e) => e.kind === "bill").length;

    expect(inPoints).toBe(plan.events.filter((e) => e.kind === "bill").length);
    expect(inPoints).toBeGreaterThan(20);
  });

  it("still finds the day the balance breaks, on a coarse line", () => {
    const plan = buildPlan({ ...base, horizon: 24, openingBalance: 0, bills: [bill({ name: "Huge", amount: 9000, dueDay: 2 })] });

    expect(plan.breaksOn).toBeDefined();
    expect(plan.dip).toBeGreaterThan(0);
  });
});

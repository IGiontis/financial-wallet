import { describe, it, expect } from "vitest";
import {
  asHorizon,
  billOccurrences,
  buildPlan,
  horizonEnd,
  horizonMonths,
  nextOneOffDate,
  oneOffDate,
  lineRanges,
  oneOffDates,
  type BudgetLine,
  type OneOff,
  pointStepFor,
  planPeriods,
  SALARY_ROW_ID,
} from "./plannerUtils";
import { differenceInCalendarDays } from "date-fns";
import { getPeriodDueDate, getPeriodKey } from "../bills/billsUtils";
import { computeDebtStatus, loanPayoff, loanState } from "../debts/debtsUtils";
import type { Actuals } from "./plannerActuals";
import type { BillWithStatus, Debt, DebtPayment, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

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

/** The last instant of a local calendar day — what `horizonEnd` returns. */
const endOfDayOn = (year: number, month: number, day: number) => new Date(year, month, day, 23, 59, 59, 999);

/**
 * The same rule worked out a second way, without `addMonths` or `endOfMonth`:
 * from the 1st, N months is N calendar months; from any other day it is the
 * rest of this month and N whole months after it. `new Date(y, m + k + 1, 0)`
 * is the last day of month m + k, rolling the year over on its own.
 */
const expectedEnd = (today: Date, months: number) => {
  const ahead = today.getDate() === 1 ? months - 1 : months;
  const last = new Date(today.getFullYear(), today.getMonth() + ahead + 1, 0);
  return endOfDayOn(last.getFullYear(), last.getMonth(), last.getDate());
};

describe("horizonEnd", () => {
  it("runs to the end of the month holding the day before today plus N months", () => {
    // 14 Aug: +1 month −1 day is 13 Sep; +3 is 13 Nov; +6 is 13 Feb 2027.
    expect(horizonEnd(1, now)).toEqual(endOfDayOn(2026, 8, 30));
    expect(horizonEnd(3, now)).toEqual(endOfDayOn(2026, 10, 30));
    // Six months from mid-August closes on February's last day, not January's:
    // the old rule counted the rest of August as one of the six.
    expect(horizonEnd(6, now)).toEqual(endOfDayOn(2027, 1, 28));
    for (const months of [1, 3, 6, 12, 36]) expect(horizonEnd(months, now)).toEqual(expectedEnd(now, months));
  });

  it("gives the owner's 30 September a month ahead, not a day", () => {
    // The case behind the confusing figure: "1 month" on the 30th was the
    // 30th alone, so the plan's verdict was about tomorrow.
    const lastOfSeptember = new Date(2026, 8, 30, 21, 15);
    expect(horizonEnd(1, lastOfSeptember)).toEqual(endOfDayOn(2026, 9, 31));
    expect(horizonEnd(3, lastOfSeptember)).toEqual(endOfDayOn(2026, 11, 31));
    expect(buildPlan({ ...base, horizon: 1, now: lastOfSeptember }).days).toBe(31); // 30 Sep → 31 Oct, 32 days with today
  });

  it("from the 1st, is exactly the calendar months asked for", () => {
    const first = new Date(2026, 8, 1);
    expect(horizonEnd(1, first)).toEqual(endOfDayOn(2026, 8, 30));
    expect(horizonEnd(3, first)).toEqual(endOfDayOn(2026, 10, 30));
    expect(horizonEnd(12, first)).toEqual(endOfDayOn(2027, 7, 31));
  });

  it("closes on February's own last day, the 29th in a leap year", () => {
    expect(horizonEnd(1, new Date(2027, 0, 15))).toEqual(endOfDayOn(2027, 1, 28));
    expect(horizonEnd(1, new Date(2028, 0, 15))).toEqual(endOfDayOn(2028, 1, 29));
    // From 31 January a month on is clamped to February, not rolled into March.
    expect(horizonEnd(1, new Date(2028, 0, 31))).toEqual(endOfDayOn(2028, 1, 29));
    expect(horizonEnd(6, new Date(2027, 7, 31))).toEqual(endOfDayOn(2028, 1, 29));
    // From 29 February, a year on is 28 February of an ordinary year.
    expect(horizonEnd(12, new Date(2028, 1, 29))).toEqual(endOfDayOn(2029, 1, 28));
  });

  it("crosses the year end", () => {
    expect(horizonEnd(1, new Date(2026, 11, 31))).toEqual(endOfDayOn(2027, 0, 31));
    expect(horizonEnd(1, new Date(2026, 11, 1))).toEqual(endOfDayOn(2026, 11, 31));
    expect(horizonEnd(3, new Date(2026, 10, 20))).toEqual(endOfDayOn(2027, 1, 28));
  });

  it("agrees with the rule worked out by hand, on every day of four years", () => {
    // Every start day from 2026 to 2029, leap February included, against the
    // helper above — which shares no date code with `horizonEnd`.
    for (let d = new Date(2026, 0, 1); d < new Date(2030, 0, 1); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      for (const months of [1, 2, 3, 6, 12]) {
        const end = horizonEnd(months, d);
        expect(end, `${d.toDateString()} +${months}`).toEqual(expectedEnd(d, months));
        // And the property the rule exists for: at least N months of calendar ahead.
        expect(end.getTime()).toBeGreaterThanOrEqual(new Date(d.getFullYear(), d.getMonth() + months, Math.min(d.getDate(), 28)).getTime() - 24 * 3600 * 1000);
      }
    }
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

    // Three months from 14 Aug run to 30 Nov: the rest of August, then
    // September, October and November — four twentieths.
    expect(paydays.map((e) => e.date)).toEqual([new Date(2026, 7, 20), new Date(2026, 8, 20), new Date(2026, 9, 20), new Date(2026, 10, 20)]);
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
    // One month from 14 Aug runs to 30 Sep, so 22 Aug and 22 Sep — each in full.
    const plan = buildPlan({ ...base, horizon: 1, bills: [bill({ name: "Netflix", amount: 12.99, dueDay: 22 })] });
    const charged = plan.events.filter((e) => e.kind === "bill");
    expect(charged.map((e) => e.amount)).toEqual([-12.99, -12.99]);
    expect(charged.map((e) => e.date)).toEqual([new Date(2026, 7, 22), new Date(2026, 8, 22)]);
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

describe("extra pay that keeps coming back", () => {
  const coupon = (over: Partial<OneOff> = {}): OneOff => ({ id: "c1", label: "Coupon", amount: 250, date: "2026-09-15", every: 3, ...over });

  it("lands on every date its cadence reaches inside the window", () => {
    const plan = buildPlan({ ...base, horizon: 12, oneOffs: [coupon()] });
    const dates = plan.events.filter((e) => e.label === "Coupon").map((e) => e.date);

    // 15 Sep, 15 Dec, 15 Mar, 15 Jun — twelve months from 14 August close on
    // 31 August 2027, and the next, 15 Sep 2027, is past it.
    expect(dates).toEqual([new Date(2026, 8, 15), new Date(2026, 11, 15), new Date(2027, 2, 15), new Date(2027, 5, 15)]);
    // The row totals what the window holds, not one payment of it.
    expect(plan.rows.find((r) => r.source === "oneoff")).toMatchObject({ occurrences: 4, total: 1000 });
  });

  it("stops on the day it is told to", () => {
    const plan = buildPlan({ ...base, horizon: 12, oneOffs: [coupon({ until: "2027-03-15" })] });
    expect(plan.rows.find((r) => r.source === "oneoff")?.occurrences).toBe(3);
  });

  it("counts what is still to come from a repeat entered long ago", () => {
    // Written down in February and never touched since: the entry is old, the
    // money is not, and the plan is about what is still ahead.
    const plan = buildPlan({ ...base, horizon: 12, oneOffs: [coupon({ date: "2026-02-15" })] });
    const dates = plan.events.filter((e) => e.label === "Coupon").map((e) => e.date);

    // Every third month from 15 Feb that lands between today (14 Aug) and the
    // window's close on 31 Aug 2027: five of them, the last on 15 Aug 2027.
    expect(dates).toEqual([new Date(2026, 7, 15), new Date(2026, 10, 15), new Date(2027, 1, 15), new Date(2027, 4, 15), new Date(2027, 7, 15)]);
    expect(plan.rows.find((r) => r.source === "oneoff")).toMatchObject({ occurrences: 5, total: 5 * 250 });
  });

  it("keeps the day of the month instead of drifting back off the 31st", () => {
    // Stepping a month at a time from the last date would pin it to the 28th
    // the first time it crossed February and leave it there for good.
    const monthly: OneOff = { id: "m", label: "m", amount: 10, date: "2026-12-31", every: 1 };
    const dates = oneOffDates(monthly, new Date(2026, 11, 1), new Date(2027, 3, 30));

    expect(dates.map((d) => d.getDate())).toEqual([31, 31, 28, 31, 30]);
  });

  it("treats an interval it cannot use as no repeat at all", () => {
    for (const every of [0, -3, 99, NaN]) {
      const plan = buildPlan({ ...base, horizon: 12, oneOffs: [coupon({ every })] });
      expect(plan.rows.find((r) => r.source === "oneoff")?.occurrences).toBe(1);
    }
  });

  it("leaves an entry with no cadence landing exactly once", () => {
    const plan = buildPlan({ ...base, horizon: 12, oneOffs: [coupon({ every: undefined })] });
    expect(plan.rows.find((r) => r.source === "oneoff")?.occurrences).toBe(1);
  });

  it("knows when the next one is due, and when there will not be another", () => {
    const today = new Date(2026, 7, 14);

    expect(nextOneOffDate(coupon({ date: "2026-02-15" }), today)).toEqual(new Date(2026, 7, 15));
    // Finished: the list says "passed" rather than "not in this window".
    expect(nextOneOffDate(coupon({ date: "2026-02-15", until: "2026-06-30" }), today)).toBeUndefined();
    // Not a repeat, and its day has gone.
    expect(nextOneOffDate(coupon({ date: "2026-02-15", every: undefined }), today)).toBeUndefined();
  });

  it("frees every occurrence when the row is switched off", () => {
    const input = { ...base, horizon: 12, oneOffs: [coupon()] };
    const off = buildPlan({ ...input, skipIds: new Set(["c1"]) });

    expect(off.rows.find((r) => r.source === "oneoff")?.total).toBe(0);
    expect(off.incomeTotal).toBe(buildPlan({ ...base, horizon: 12 }).incomeTotal);
  });
});

describe("how finely the line is sampled", () => {
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  it("keeps a point per day only while the window is short", () => {
    expect(pointStepFor(30)).toBe("day");
    // Four of the longest months back to back: 31 + 31 + 30 + 31 (Jul–Oct).
    expect(pointStepFor(123)).toBe("day");
    expect(pointStepFor(124)).toBe("week");
    expect(pointStepFor(550)).toBe("week");
    expect(pointStepFor(551)).toBe("month");
  });

  it("draws every three-month window a day at a time, whatever day it starts on", () => {
    // Since the rest of this month comes on top of the three, the window is up
    // to 121 days (2 July to 31 October). At the old threshold of 92 days a
    // three-month plan from mid-month drew weekly points and its readout
    // jumped a week at a time.
    let longest = 0;
    for (let d = new Date(2026, 0, 1); d < new Date(2030, 0, 1); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const days = differenceInCalendarDays(horizonEnd(3, d), d);
      longest = Math.max(longest, days);
      expect(pointStepFor(days), d.toDateString()).toBe("day");
    }
    expect(longest).toBe(121);
    expect(buildPlan({ ...base, horizon: 3, now: new Date(2026, 6, 2) })).toMatchObject({ days: 121, pointStep: "day" });
    // Six months is where the line thins out.
    expect(buildPlan({ ...base, horizon: 6 }).pointStep).toBe("week");
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
    // The long plan's point on the short plan's last day (30 Nov) is the short
    // plan's closing balance — month ends are always kept, at any step.
    const sameDay = monthly.points.find((p) => p.date.toDateString() === daily.end.toDateString());
    expect(sameDay?.balance).toBe(daily.endingBalance);
    // Worked out by hand: four paydays (20 Aug, Sep, Oct, Nov) against four
    // rents — 5 Sep, Oct and Nov, and August's, unpaid and pulled onto today.
    expect(daily.endingBalance).toBe(4 * 2000 - 4 * 400);
    // Same monthly arithmetic: 37 paydays over 14 Aug 2026 – 31 Aug 2029, 2,000 each.
    expect(monthly.incomeTotal / monthly.rows.find((r) => r.id === SALARY_ROW_ID)!.occurrences!).toBe(daily.incomeTotal / 4);
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

describe("planPeriods", () => {
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  it("splits each month into what arrived and what left", () => {
    // Netted into one line, a month where the same pay met twice the outgoings
    // looks exactly like a month with no pay — which is the whole reason the
    // expanded chart draws the two sides apart.
    const plan = buildPlan({ ...base, horizon: 3, bills: [bill({ name: "Rent", amount: 500, dueDay: 5 })] });
    const periods = planPeriods(plan);

    // The rest of August, then September, October and November.
    expect(periods.map((p) => p.key)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(periods[1]).toMatchObject({ income: 2000, outgoing: 500 });
  });

  it("adds up to the same totals the plan reports", () => {
    const plan = buildPlan({ ...base, horizon: 6, bills: [bill({ name: "Rent", amount: 500, dueDay: 5 }), bill({ name: "Power", amount: 90, dueDay: 12 })] });
    const periods = planPeriods(plan);

    const income = periods.reduce((sum, p) => sum + p.income, 0);
    const outgoing = periods.reduce((sum, p) => sum + p.outgoing, 0);

    expect(round(income)).toBe(plan.incomeTotal);
    // Budget lines accrue by the day and never land on a date, so the bars are
    // the dated part of the outgoings — here, all of it.
    expect(round(outgoing)).toBe(plan.outgoingTotal);
  });

  it("ends each period on the balance the walk reached", () => {
    const plan = buildPlan({ ...base, horizon: 3, openingBalance: 100, bills: [bill({ name: "Rent", amount: 500, dueDay: 5 })] });
    const periods = planPeriods(plan);

    expect(periods[periods.length - 1].balance).toBe(plan.endingBalance);
  });

  it("buckets into quarters once there are too many months to draw", () => {
    // Three years is seventy-two bars; on a phone that is five pixels each.
    const plan = buildPlan({ ...base, horizon: 36, bills: [bill({ name: "Rent", amount: 500, dueDay: 5 })] });
    const periods = planPeriods(plan);

    expect(periods.length).toBeLessThanOrEqual(13);
    expect(periods[0].key).toMatch(/-Q[1-4]$/);
  });

  it("keeps months while the window is short enough to show them", () => {
    const periods = planPeriods(buildPlan({ ...base, horizon: 12 }));

    // August 2026 to August 2027 inclusive: the part-month this is, and twelve whole ones.
    expect(periods).toHaveLength(13);
    expect(periods[0].key).toBe("2026-08");
    expect(periods[12].key).toBe("2027-08");
    expect(periods[0].key).toMatch(/^\d{4}-\d{2}$/);
  });

  it("carries the balance through a period nothing happens in", () => {
    // Without this the line drops to zero in a quiet stretch, which reads as
    // the money having gone.
    const plan = buildPlan({ ...base, horizon: 3, salary: undefined, openingBalance: 400 });
    const periods = planPeriods(plan);

    expect(periods.every((p) => p.balance === 400)).toBe(true);
  });
});

describe("a budget line that runs for part of the year", () => {
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  // €200 a month for skiing, December to April. Today is 14 Aug 2026.
  const ski = (over: Partial<BudgetLine> = {}): BudgetLine => ({ id: "ski", label: "Σκι", amount: 200, kind: "expense", from: "2026-12", to: "2027-04", ...over });

  it("charges only the months of the season", () => {
    // Dec, Jan, Feb, Mar, Apr — five months at 200.
    const plan = buildPlan({ ...base, horizon: 12, lines: [ski()] });
    const row = plan.rows.find((r) => r.source === "line");

    expect(row?.total).toBe(-1000);
  });

  it("charges nothing at all when the window ends before the season starts", () => {
    // A flat monthly line would have taken €200 out of September for a lift
    // pass, and made the whole year look worse than it is.
    const plan = buildPlan({ ...base, horizon: 3, lines: [ski()] });
    const row = plan.rows.find((r) => r.source === "line");

    expect(row?.total).toBe(0);
    expect(row?.note).toBe("outofseason");
  });

  it("charges the part of the season the window reaches", () => {
    // Six months from 14 Aug close on 28 Feb 2027: Dec, Jan and Feb of a
    // December-to-April season, at 200 each.
    const plan = buildPlan({ ...base, horizon: 6, lines: [ski()] });
    expect(plan.rows.find((r) => r.source === "line")?.total).toBe(-3 * 200);
    // One month less stops at 31 Jan, and takes February's 200 with it.
    expect(buildPlan({ ...base, horizon: 5, lines: [ski()] }).rows.find((r) => r.source === "line")?.total).toBe(-2 * 200);
  });

  it("keeps a line with no season running the whole window", () => {
    const flat = buildPlan({ ...base, horizon: 3, lines: [ski({ from: undefined, to: undefined })] });
    const seasonal = buildPlan({ ...base, horizon: 3, lines: [ski()] });

    expect(flat.rows.find((r) => r.source === "line")!.total).toBeLessThan(0);
    expect(seasonal.rows.find((r) => r.source === "line")!.total).toBe(0);
  });

  it("runs to the end of the closing month, not to its first day", () => {
    // "to April" means all of April, which is how anyone reads it.
    const toApril = buildPlan({ ...base, horizon: 12, lines: [ski({ from: "2027-04", to: "2027-04" })] });
    expect(toApril.rows.find((r) => r.source === "line")?.total).toBe(-200);
  });

  it("only bends the balance while the season is running", () => {
    const withSki = buildPlan({ ...base, horizon: 12, lines: [ski()] });
    const without = buildPlan({ ...base, horizon: 12 });

    // The whole season comes off the closing balance...
    expect(round(without.endingBalance - withSki.endingBalance)).toBe(1000);

    // ...but a November day is untouched, because nothing is charged yet.
    const november = (plan: typeof withSki) => plan.points.find((p) => p.date.getMonth() === 10)!;
    expect(round(november(withSki).balance)).toBe(round(november(without).balance));
  });

  it("takes the whole season off the outgoings, once", () => {
    const plan = buildPlan({ ...base, horizon: 12, lines: [ski()] });
    expect(plan.budgetTotal).toBe(1000);
  });
});

describe("naming an income event", () => {
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  it("marks the salary by its row id, leaving every other income its own name", () => {
    // Matching on `kind === "income"` relabelled a fourteenth salary, a room
    // rent and every other named line as "Salary" on the chart and timeline.
    const plan = buildPlan({ ...base, horizon: 12, oneOffs: [{ id: "o1", label: "Δώρο Χριστουγέννων", amount: 1400, date: "2026-12-20" }] });
    const income = plan.events.filter((e) => e.kind === "income");

    expect(income.some((e) => e.label === SALARY_ROW_ID)).toBe(true);
    expect(income.some((e) => e.label === "Δώρο Χριστουγέννων")).toBe(true);
    expect(income.filter((e) => e.label === SALARY_ROW_ID).length).toBeLessThan(income.length);
  });
});

describe("a season that comes back every year", () => {
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  // Skiing: 200 a month, December to April, every year. Today is 14 Aug 2026.
  const ski = (over: Partial<BudgetLine> = {}): BudgetLine => ({ id: "ski", label: "Ski", amount: 200, kind: "expense", from: "2026-12", to: "2027-04", yearly: true, ...over });

  it("charges the same months again in every year the window reaches", () => {
    // Three winters inside three years: 15 months at 200.
    const plan = buildPlan({ ...base, horizon: 36, lines: [ski()] });
    expect(plan.rows.find((r) => r.source === "line")?.total).toBe(-3000);
  });

  it("stops in the month it is told to", () => {
    const plan = buildPlan({ ...base, horizon: 36, lines: [ski({ until: "2028-04" })] });
    expect(plan.rows.find((r) => r.source === "line")?.total).toBe(-2000);
  });

  it("cuts the last winter short when the end lands inside it", () => {
    // Dec 26 to Apr 27, then Dec 27 to Feb 28: five months and three.
    const plan = buildPlan({ ...base, horizon: 36, lines: [ski({ until: "2028-02" })] });
    expect(plan.rows.find((r) => r.source === "line")?.total).toBe(-1600);
  });

  it("treats a yearly season with no closing month as that one month", () => {
    // The trip case: one in September, every year, rather than September onwards.
    const trip = ski({ id: "trip", label: "Trip", amount: 1500, from: "2026-09", to: undefined });
    const plan = buildPlan({ ...base, horizon: 36, lines: [trip] });

    expect(plan.rows.find((r) => r.source === "line")?.total).toBe(-4500);
  });

  it("comes back this year even when it was written down years ago", () => {
    // Entered in 2020 and never touched: the season is old, the winter is not.
    const plan = buildPlan({ ...base, horizon: 12, lines: [ski({ from: "2020-12", to: "2021-04" })] });
    expect(plan.rows.find((r) => r.source === "line")?.total).toBe(-1000);
  });

  it("leaves the balance alone between two winters", () => {
    const withSki = buildPlan({ ...base, horizon: 36, lines: [ski()] });
    const without = buildPlan({ ...base, horizon: 36 });
    const november = (plan: typeof withSki) => plan.points.filter((p) => p.date.getMonth() === 10 && p.date.getFullYear() === 2027).pop()!;

    // One winter has been paid for by then, and only one.
    expect(round(without.endingBalance - withSki.endingBalance)).toBe(3000);
    expect(round(november(without).balance - november(withSki).balance)).toBe(1000);
  });

  it("keeps a plain season running once, as it always did", () => {
    const once = buildPlan({ ...base, horizon: 36, lines: [ski({ yearly: false })] });
    expect(once.rows.find((r) => r.source === "line")?.total).toBe(-1000);
  });

  it("ignores the repeat when there is no month to repeat from", () => {
    // Nothing to add a year to, so the line keeps its plain behaviour rather
    // than quietly costing nothing.
    const openEnded = buildPlan({ ...base, horizon: 12, lines: [ski({ from: undefined, to: "2026-10" })] });
    expect(openEnded.rows.find((r) => r.source === "line")?.total).toBeLessThan(0);
  });

  it("returns one stretch per winter, and none once it has stopped", () => {
    const days = 365 * 3;
    expect(lineRanges(ski(), now, days)).toHaveLength(3);
    expect(lineRanges(ski({ until: "2027-04" }), now, days)).toHaveLength(1);
    expect(lineRanges(ski({ from: "2020-12", to: "2021-04", until: "2021-04" }), now, days)).toEqual([]);
  });
});

describe("the same date reads the same however far ahead you look", () => {
  // Bills early in the month, pay late in it: the shape that makes a month dip
  // under and recover, which is the case a monthly sample hides.
  const salary = { amount: 1800, dayOfMonth: 25, occurrences: 4 };
  const tight = [bill({ name: "Rent", amount: 700, dueDay: 5 }), bill({ name: "Power", amount: 180, dueDay: 8 }), bill({ name: "Card", amount: 400, dueDay: 10 })];
  const lines: BudgetLine[] = [{ id: "food", label: "Food", amount: 450, kind: "expense" }];
  const input = { bills: tight, goals: [] as InvestmentGoalWithStats[], lines, salary, openingBalance: 900, now };

  it("gives a date the same balance at every horizon", () => {
    // A day can only be affected by what happened before it, so looking
    // further ahead must not change it. Each horizon's own ending balance is
    // computed with no knowledge of later months; the long plan must agree.
    const long = buildPlan({ ...input, horizon: 36 });
    const byDate = new Map(long.points.map((p) => [p.date.toDateString(), p.balance]));

    for (let months = 1; months <= 24; months++) {
      const short = buildPlan({ ...input, horizon: months });
      const seen = byDate.get(short.end.toDateString());
      if (seen !== undefined) expect(round(seen)).toBe(round(short.endingBalance));
    }
  });

  it("gives 31 October the same balance from 30 September at 1, 3, 6, 12 and 36 months", () => {
    // The day the horizon rule changed for: on the 30th, "one month" is now
    // October too, and October's last day must not move when the view widens.
    const lastOfSeptember = new Date(2026, 8, 30, 9);
    const octoberEnd = (horizon: number) => {
      const plan = buildPlan({ ...input, now: lastOfSeptember, horizon });
      return plan.points.find((p) => p.date.toDateString() === new Date(2026, 9, 31).toDateString())?.balance;
    };

    // By hand: 900 in hand; September's three bills are unpaid and overdue, so
    // charged on the 30th (700 + 180 + 400); October's three on the 5th, 8th
    // and 10th; one salary, 25 Oct; food at 450 a month for one day of
    // September (450 / 30) and all of October (450).
    const byHand = round(900 - 2 * (700 + 180 + 400) + 1800 - (450 / 30 + 450));
    expect(byHand).toBe(-325);
    for (const horizon of [1, 3, 6, 12, 36]) expect(octoberEnd(horizon), `${horizon} months`).toBe(byHand);
    // At one month it is the last day, so it is also where the plan ends.
    expect(buildPlan({ ...input, now: lastOfSeptember, horizon: 1 }).endingBalance).toBe(byHand);
  });

  it("keeps a month's dip on the line even when sampling by month", () => {
    // The dip is the whole reason the page exists. Sampling kept the last day
    // of each month, which with pay on the 25th is the best day of it — so a
    // March that spent a fortnight under zero drew as a comfortable line as
    // soon as the horizon passed eighteen months.
    const march = (horizon: number) => buildPlan({ ...input, horizon }).points.filter((p) => p.date.getMonth() === 2 && p.date.getFullYear() === 2027);

    expect(march(12).some((p) => p.balance < 0)).toBe(true);
    expect(march(24).some((p) => p.balance < 0)).toBe(true);
    expect(march(36).some((p) => p.balance < 0)).toBe(true);
  });

  it("closes a month on its last day, not on whichever sample came last", () => {
    // At weekly sampling the closing balance was read off the last Sunday —
    // up to six days early, and on the wrong side of payday. The same February
    // then read as overdrawn on a one-year view and healthy on a two-year one.
    const weekly = buildPlan({ ...input, horizon: 12 });
    const monthly = buildPlan({ ...input, horizon: 24 });
    const february = (plan: typeof weekly) => planPeriods(plan).find((p) => p.key === "2027-02");

    expect(weekly.pointStep).toBe("week");
    expect(monthly.pointStep).toBe("month");
    expect(february(weekly)?.balance).toBeGreaterThan(0);
    // The monthly plan buckets by quarter above eighteen months, so February
    // is inside 2027-Q1 there; what matters is the point itself agreeing.
    const lastDay = (plan: typeof weekly) => plan.points.filter((p) => p.date.getMonth() === 1 && p.date.getFullYear() === 2027).pop()!;
    expect(lastDay(weekly).date.getDate()).toBe(28);
    expect(round(lastDay(weekly).balance)).toBe(round(lastDay(monthly).balance));
  });

  it("does not double the drawn points on a plan that never dips", () => {
    // The extra point is only worth its cost when there is a dip to show.
    const calm = { ...input, bills: [] as BillWithStatus[], lines: [] as BudgetLine[], openingBalance: 5000 };
    const plan = buildPlan({ ...calm, horizon: 36 });

    expect(plan.points.length).toBeLessThanOrEqual(38);
  });
});

describe("a loan in the plan is a monthly instalment, not a lump", () => {
  const salary = { amount: 2000, dayOfMonth: 25, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  // 10,000 at 7% over five years, taken out today: €198.01 a month.
  const carLoan = (over: Partial<DebtWithStatus> = {}): DebtWithStatus =>
    ({
      id: "loan",
      userId: "u1",
      person: "Τράπεζα",
      label: "Αυτοκίνητο",
      direction: "owed_by_me",
      amount: 10000,
      remaining: 10000,
      interestRate: 7,
      termMonths: 60,
      date: new Date(2026, 7, 14),
      isSettled: false,
      payments: [],
      paid: 0,
      createdAt: new Date(2026, 7, 14),
      updatedAt: new Date(2026, 7, 14),
      ...over,
    }) as DebtWithStatus;

  it("charges the instalment once a month rather than the balance once", () => {
    const plan = buildPlan({ ...base, horizon: 12, debts: [carLoan()] });
    const row = plan.rows.find((r) => r.source === "debt")!;
    const payments = plan.events.filter((e) => e.label === "Αυτοκίνητο");

    // On the 14th, from today to the window's close on 31 Aug 2027: 14 Aug 2026
    // and every month after it through 14 Aug 2027 — thirteen.
    expect(payments.map((e) => e.date)).toEqual(Array.from({ length: 13 }, (_, i) => new Date(2026, 7 + i, 14)));
    expect(row.occurrences).toBe(13);
    expect(row.perMonth).toBe(-198.01);
    expect(row.total).toBeCloseTo(-198.01 * 13, 2);
    expect(payments.every((e) => Math.abs(e.amount) === 198.01)).toBe(true);
  });

  it("does not drop five years of debt into a single day", () => {
    // The old behaviour: the whole balance charged on the due date, which made
    // every month before it look comfortable and that one month impossible.
    const plan = buildPlan({ ...base, horizon: 12, debts: [carLoan()] });
    const biggest = Math.max(...plan.events.filter((e) => e.amount < 0).map((e) => Math.abs(e.amount)));

    expect(biggest).toBeLessThan(500);
  });

  it("stops at the end of the loan, not at the end of the window", () => {
    // Six months left to run, on a three-year view.
    const nearlyDone = carLoan({ amount: 1200, interestRate: 6, termMonths: 6, date: new Date(2026, 7, 14) });
    const plan = buildPlan({ ...base, horizon: 36, debts: [nearlyDone] });

    expect(plan.rows.find((r) => r.source === "debt")!.occurrences).toBe(6);
  });

  it("leaves money lent between people charged as it always was", () => {
    const iou = carLoan({ id: "iou", label: "Δανεικά", amount: 400, remaining: 400, interestRate: undefined, termMonths: undefined, dueDate: new Date(2026, 10, 20) });
    const plan = buildPlan({ ...base, horizon: 12, debts: [iou] });
    const row = plan.rows.find((r) => r.source === "debt")!;

    expect(row.occurrences).toBe(1);
    expect(row.total).toBe(-400);
  });

  it("still frees the money when the row is switched off", () => {
    const input = { ...base, horizon: 12, debts: [carLoan()] };
    const off = buildPlan({ ...input, skipIds: new Set(["loan"]) });

    expect(off.rows.find((r) => r.source === "debt")!.total).toBe(0);
    expect(off.events.some((e) => e.label === "Αυτοκίνητο")).toBe(false);
  });
});

// ─── A loan's last instalment ────────────────────────────────────────────────
// The walk used to stop after as many *months* as the balance had payments
// left, counted from this one. When this month's instalment was already paid,
// the last one fell off the end of the plan.

describe("a loan whose instalment this month is already paid", () => {
  // Twelve interest-free instalments of €100 on the 5th, from February. Eight
  // are paid, September's included; today is 29 September 2026.
  const TODAY = new Date(2026, 8, 29, 10);
  const loanDoc = (over: Partial<Debt> = {}) =>
    ({ id: "loan", userId: "u1", person: "Κατάστημα", label: "Ψυγείο", direction: "owed_by_me", amount: 1200, interestRate: 0, termMonths: 12, date: new Date(2026, 0, 5), createdAt: new Date(2026, 0, 5), updatedAt: new Date(2026, 0, 5), ...over }) as unknown as Debt;
  const repay = (date: Date, amount = 100) => ({ id: `r${date.getTime()}`, userId: "u1", debtId: "loan", amount, date, createdAt: date }) as unknown as DebtPayment;
  const paidThrough = (months: number) => Array.from({ length: months }, (_, i) => repay(new Date(2026, 1 + i, 5)));
  const loan = (payments = paidThrough(8), over: Partial<Debt> = {}) => computeDebtStatus(loanDoc(over), payments, TODAY);
  const records = (debt: DebtWithStatus): Actuals => ({ transactions: [], debts: [debt], overrides: {} });
  const run = (debt: DebtWithStatus, extra: Partial<Parameters<typeof buildPlan>[0]> = {}) => buildPlan({ bills: [], goals: [], debts: [debt], horizon: 6, now: TODAY, ...extra });
  const rowOf = (plan: ReturnType<typeof buildPlan>) => plan.rows.find((r) => r.source === "debt")!;
  const instalmentDates = (plan: ReturnType<typeof buildPlan>) => plan.events.filter((e) => e.label === "Ψυγείο").map((e) => e.date);

  it("plans all four instalments left, not three", () => {
    const plan = run(loan());

    expect(rowOf(plan)).toMatchObject({ total: -400, occurrences: 4 });
    expect(instalmentDates(plan)).toEqual([new Date(2026, 9, 5), new Date(2026, 10, 5), new Date(2026, 11, 5), new Date(2027, 0, 5)]);
  });

  it("plans exactly what the debts screen says is left", () => {
    const debt = loan();
    expect(-rowOf(run(debt)).total).toBe(debt.remaining);
    expect(-rowOf(run(debt)).total).toBe(loanState(debt, TODAY)!.balance);
    expect(rowOf(run(debt)).occurrences).toBe(loanPayoff(debt, 0, TODAY)!.months);
  });

  it("covers an interest-bearing loan's balance and the interest still to come", () => {
    // €10,000 at 7% over five years, a year of it paid.
    const taken = new Date(2025, 8, 12);
    const payments = Array.from({ length: 12 }, (_, i) => repay(new Date(2025, 9 + i, 12), 198.01));
    const debt = computeDebtStatus(loanDoc({ amount: 10000, interestRate: 7, termMonths: 60, date: taken }), payments, TODAY);
    const payoff = loanPayoff(debt, 0, TODAY)!;
    const row = rowOf(run(debt, { horizon: 120 }));

    expect(row.occurrences).toBe(payoff.months);
    // Payment for payment, the schedule the debts screen draws — the last one
    // included, which is smaller than an instalment.
    const scheduled = Math.round(payoff.schedule.reduce((sum, r) => sum + r.payment, 0) * 100) / 100;
    expect(-row.total).toBe(scheduled);
    expect(payoff.schedule.at(-1)!.payment).toBeLessThan(198.01);
    // And the balance plus the interest still to come, give or take the
    // rounding of each row's interest to the cent.
    expect(Math.abs(-row.total - (debt.remaining + payoff.interestToCome))).toBeLessThanOrEqual(0.005 * payoff.months);
  });

  it("does not change with the horizon once the window reaches the last instalment", () => {
    // From 29 Sep, N months close at the end of month N ahead: 4 → 31 Jan,
    // which is the last instalment's month, so four and more all hold it.
    for (const horizon of [4, 5, 6, 12, 36]) expect(rowOf(run(loan(), { horizon }))).toMatchObject({ total: -400, occurrences: 4 });
    // A shorter window holds what fits in it, and no more: 1 → 31 Oct holds
    // 5 Oct; 2 → 30 Nov adds 5 Nov; 3 → 31 Dec adds 5 Dec.
    expect(rowOf(run(loan(), { horizon: 1 }))).toMatchObject({ total: -100, occurrences: 1 });
    expect(rowOf(run(loan(), { horizon: 2 }))).toMatchObject({ total: -200, occurrences: 2 });
    expect(rowOf(run(loan(), { horizon: 3 }))).toMatchObject({ total: -300, occurrences: 3 });
  });

  it("finds September's instalment in the records and still plans four", () => {
    const debt = loan();
    const plan = run(debt, { actuals: records(debt) });

    expect(plan.occurrences.find((o) => o.key.endsWith("2026-09-05"))?.status).toBe("received");
    expect(instalmentDates(plan)).toEqual([new Date(2026, 9, 5), new Date(2026, 10, 5), new Date(2026, 11, 5), new Date(2027, 0, 5)]);
  });

  it("keeps an unpaid September in the plan, with the checks or without them", () => {
    // Seven paid: €500 left, five instalments.
    const debt = loan(paidThrough(7));
    const plain = run(debt);
    const checked = run(debt, { actuals: records(debt) });

    expect(debt.remaining).toBe(500);
    expect(rowOf(plain)).toMatchObject({ total: -500, occurrences: 5 });
    expect(rowOf(checked)).toMatchObject({ total: -500, occurrences: 5 });
    // Checked, September is late and held from today rather than pushed to the end.
    expect(instalmentDates(checked)[0]).toEqual(new Date(2026, 8, 29));
  });

  it("keeps a loan taken on the 31st on the month's last day, across the year end", () => {
    // September's instalment (due the 30th) was paid early, on the 25th.
    const days = [new Date(2026, 1, 28), new Date(2026, 2, 31), new Date(2026, 3, 30), new Date(2026, 4, 31), new Date(2026, 5, 30), new Date(2026, 6, 31), new Date(2026, 7, 31), new Date(2026, 8, 25)];
    const debt = loan(days.map((d) => repay(d)), { date: new Date(2026, 0, 31) });
    const checked = run(debt, { actuals: records(debt) });

    expect(instalmentDates(checked)).toEqual([new Date(2026, 9, 31), new Date(2026, 10, 30), new Date(2026, 11, 31), new Date(2027, 0, 31)]);
    expect(rowOf(checked).total).toBe(-400);
    // Without the records the plan cannot know September's went early; it still
    // plans the €400 that is owed, only a month sooner.
    expect(rowOf(run(debt)).total).toBe(-400);
  });

  it("frees every instalment when switched off, and still counts them", () => {
    const plan = run(loan(), { skipIds: new Set(["loan"]) });

    expect(rowOf(plan)).toMatchObject({ total: 0, occurrences: 4 });
    expect(instalmentDates(plan)).toEqual([]);
  });
});

// ─── A bill due at the end of the month ─────────────────────────────────────
// Stepping a date a month at a time keeps the first month's clamp: a bill due
// on the 31st seen from September sat on the 30th for good.

describe("billOccurrences for a bill due on the 29th to the 31st", () => {
  const eom = (dueDay: number, over: Partial<BillWithStatus> = {}) => bill({ id: "eom", name: "Κάρτα", dueDay, ...over });
  const datesOf = (b: BillWithStatus, from: Date, to: Date) => billOccurrences(b, from, to).map((o) => o.date);

  it("lands on each month's own last day, seen from a 30-day month", () => {
    expect(datesOf(eom(31), new Date(2026, 8, 29), new Date(2027, 1, 28))).toEqual([
      new Date(2026, 8, 30),
      new Date(2026, 9, 31),
      new Date(2026, 10, 30),
      new Date(2026, 11, 31),
      new Date(2027, 0, 31),
      new Date(2027, 1, 28),
    ]);
  });

  it("does not stay on the 28th after February", () => {
    expect(datesOf(eom(31), new Date(2027, 1, 10), new Date(2027, 5, 30))).toEqual([new Date(2027, 1, 28), new Date(2027, 2, 31), new Date(2027, 3, 30), new Date(2027, 4, 31), new Date(2027, 5, 30)]);
  });

  it("gives a month the same date whichever month it is seen from", () => {
    const fromSeptember = datesOf(eom(31), new Date(2026, 8, 29), new Date(2027, 5, 30));
    const fromFebruary = datesOf(eom(31), new Date(2027, 1, 10), new Date(2027, 5, 30));

    expect(fromSeptember.slice(-fromFebruary.length)).toEqual(fromFebruary);
  });

  it("puts every occurrence on the due date the bills screen gives its period, once per period", () => {
    for (const dueDay of [29, 30, 31]) {
      const b = eom(dueDay);
      const dates = datesOf(b, new Date(2026, 8, 29), new Date(2028, 2, 31));
      const keys = dates.map((d) => getPeriodKey(b, d));

      for (const date of dates) expect(date).toEqual(getPeriodDueDate(b, date));
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toHaveLength(19); // September 2026 to March 2028
    }
  });

  it("uses the 29th of a leap February, and the 28th otherwise", () => {
    expect(datesOf(eom(31), new Date(2028, 0, 2), new Date(2028, 2, 31)).map((d) => d.getDate())).toEqual([31, 29, 31]);
    expect(datesOf(eom(29), new Date(2027, 1, 1), new Date(2027, 2, 31)).map((d) => d.getDate())).toEqual([28, 29]);
    expect(datesOf(eom(30), new Date(2027, 1, 1), new Date(2027, 3, 30)).map((d) => d.getDate())).toEqual([28, 30, 30]);
  });

  it("keeps a custom interval on its months and its day", () => {
    const everyOther = eom(31, { intervalCount: 2, anchorDate: new Date(2026, 0, 1) });
    expect(datesOf(everyOther, new Date(2026, 0, 5), new Date(2026, 11, 31))).toEqual([
      new Date(2026, 0, 31),
      new Date(2026, 2, 31),
      new Date(2026, 4, 31),
      new Date(2026, 6, 31),
      new Date(2026, 8, 30),
      new Date(2026, 10, 30),
    ]);
  });

  it("puts a yearly bill due on 29 February on the 28th in an ordinary year", () => {
    const yearly = eom(29, { frequency: "yearly", dueMonth: 1 });
    expect(datesOf(yearly, new Date(2027, 0, 1), new Date(2028, 11, 31))).toEqual([new Date(2027, 1, 28), new Date(2028, 1, 29)]);
  });

  it("keeps a weekly bill seven days apart through the clock change", () => {
    const weekly = eom(1, { frequency: "weekly" }); // Mondays
    const dates = datesOf(weekly, new Date(2026, 9, 1), new Date(2026, 10, 30));

    expect(dates.length).toBeGreaterThan(7);
    for (let i = 1; i < dates.length; i++) expect(differenceInCalendarDays(dates[i], dates[i - 1])).toBe(7);
    expect(dates.every((d) => d.getDay() === 1 && d.getHours() === 0)).toBe(true);
  });

  it("charges the plan on those days, and the same total", () => {
    // Six months from 29 Sep close on 31 Mar: September to March is seven month ends.
    const plan = buildPlan({ bills: [eom(31, { amount: 50 })], goals: [], horizon: 6, now: new Date(2026, 8, 29, 10) });

    expect(plan.events.filter((e) => e.kind === "bill").map((e) => e.date.getDate())).toEqual([30, 31, 30, 31, 31, 28, 31]);
    expect(plan.billsTotal).toBe(7 * 50);
  });
});

import { describe, it, expect } from "vitest";
import { netWorthSeries, repaymentsOutsideCash } from "./netWorthUtils";
import { computeDebtStatus, debtsByPerson, debtTotals, loanPayoff } from "../debts/debtsUtils";
import type { Debt, DebtPayment, DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";

// What you are worth, month by month.
//
// This is the first thing in the app that adds four separate ledgers together —
// the current account, the goals, the money lent out and the money borrowed —
// so the thing worth pinning down is that the sum stays honest at the seams:
// that saving moves money without creating any, that a backfilled receipt is
// not deducted twice, and that a debt does not exist before it was taken out.

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    amount: 10,
    type: "expense",
    categoryId: "food",
    date: new Date("2026-03-10"),
    description: "Shop",
    createdAt: new Date("2026-03-10"),
    updatedAt: new Date("2026-03-10"),
    ...overrides,
  }) as Transaction;

const debt = (overrides: Partial<DebtWithStatus> = {}): DebtWithStatus =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    person: "Bank",
    direction: "owed_by_me",
    amount: 10000,
    date: new Date("2026-01-10"),
    payments: [],
    paid: 0,
    remaining: 10000,
    isSettled: false,
    createdAt: new Date("2026-01-10"),
    updatedAt: new Date("2026-01-10"),
    ...overrides,
  }) as DebtWithStatus;

const pay = (amount: number, date: string) => ({ id: Math.random().toString(), userId: "u1", debtId: "d", amount, date: new Date(date), createdAt: new Date(date) });

const FROM = new Date("2026-01-01");
const TO = new Date("2026-04-15");

/** The sum again, from the parts the chart draws. Not the production formula. */
const reconcile = (p: { cash: number; saved: number; owedToMe: number; owedByMe: number }) => p.cash + p.saved + p.owedToMe - p.owedByMe;

describe("netWorthSeries", () => {
  it("adds the four ledgers to the figure it reports", () => {
    const points = netWorthSeries(
      [tx({ type: "income", amount: 2000, date: new Date("2026-01-05") }), tx({ amount: 300, date: new Date("2026-02-08") }), tx({ amount: 500, date: new Date("2026-03-03"), isGoalTransaction: true, contributionType: "deposit" })],
      [debt({ amount: 4000, payments: [pay(1000, "2026-02-20")] }), debt({ direction: "owed_to_me", amount: 250, date: new Date("2026-01-02") })],
      undefined,
      FROM,
      TO,
    );

    expect(points).toHaveLength(4);
    for (const point of points) expect(point.net).toBeCloseTo(reconcile(point), 2);
  });

  it("does not create money when money is put aside", () => {
    const before = netWorthSeries([tx({ type: "income", amount: 1000, date: new Date("2026-01-05") })], [], undefined, FROM, TO);
    const after = netWorthSeries(
      [tx({ type: "income", amount: 1000, date: new Date("2026-01-05") }), tx({ amount: 400, date: new Date("2026-02-05"), isInvestmentTransaction: true, contributionType: "deposit" })],
      [],
      undefined,
      FROM,
      TO,
    );

    const last = (p: typeof before) => p[p.length - 1];
    // The cash fell by exactly what the investment gained, and the total held.
    expect(last(after).cash).toBeCloseTo(last(before).cash - 400, 2);
    expect(last(after).saved).toBeCloseTo(400, 2);
    expect(last(after).net).toBeCloseTo(last(before).net, 2);
  });

  it("gives a withdrawal back to the cash it came from", () => {
    const points = netWorthSeries(
      [
        tx({ amount: 400, date: new Date("2026-01-05"), isGoalTransaction: true, contributionType: "deposit" }),
        tx({ amount: 150, date: new Date("2026-03-05"), isGoalTransaction: true, contributionType: "withdrawal" }),
      ],
      [],
      undefined,
      FROM,
      TO,
    );

    const last = points[points.length - 1];
    expect(last.saved).toBeCloseTo(250, 2);
    expect(last.cash).toBeCloseTo(-250, 2);
    expect(last.net).toBeCloseTo(0, 2);
  });

  it("counts a debt from the month it was taken out, not before", () => {
    const points = netWorthSeries([], [debt({ amount: 5000, date: new Date("2026-03-04") })], undefined, FROM, TO);

    expect(points.map((p) => p.owedByMe)).toEqual([0, 0, 5000, 5000]);
  });

  it("owes less as it is repaid, and never less than nothing", () => {
    const points = netWorthSeries([], [debt({ amount: 1000, payments: [pay(400, "2026-02-10"), pay(900, "2026-03-10")] })], undefined, FROM, TO);

    expect(points.map((p) => p.owedByMe)).toEqual([1000, 600, 0, 0]);
  });

  it("counts what you are owed as yours and what you owe as not", () => {
    const lent = netWorthSeries([], [debt({ direction: "owed_to_me", amount: 800 })], undefined, FROM, TO);
    const borrowed = netWorthSeries([], [debt({ direction: "owed_by_me", amount: 800 })], undefined, FROM, TO);

    expect(lent[0].net).toBe(800);
    expect(borrowed[0].net).toBe(-800);
  });

  it("carries in everything that happened before the window", () => {
    // A position is cumulative: the window says which months to draw, not which
    // records exist.
    const points = netWorthSeries([tx({ type: "income", amount: 5000, date: new Date("2025-06-01") })], [], undefined, FROM, TO);

    expect(points[0].cash).toBe(5000);
  });

  it("ignores records the opening balance already speaks for", () => {
    // The trap the balance card was built around: enter "I had €5,000", then
    // backfill last year's rent, and a naive sum deducts it twice.
    const opening = { amount: 5000, date: new Date("2026-01-01") };
    const points = netWorthSeries([tx({ amount: 700, date: new Date("2025-11-04") }), tx({ amount: 100, date: new Date("2026-02-04") })], [], opening, FROM, TO);

    expect(points[0].cash).toBe(5000);
    expect(points[1].cash).toBe(4900);
  });

  it("refuses to draw months the opening balance cannot speak for", () => {
    const opening = { amount: 5000, date: new Date("2026-03-01") };
    const points = netWorthSeries([], [], opening, FROM, TO);

    // January and February would be the opening figure repeated — a flat run
    // that never happened.
    expect(points.map((p) => p.key)).toEqual(["2026-03", "2026-04"]);
  });

  it("returns nothing rather than guessing when the window is empty", () => {
    expect(netWorthSeries([], [], { amount: 100, date: new Date("2027-01-01") }, FROM, TO)).toEqual([]);
  });
});

describe("repaymentsOutsideCash", () => {
  it("matches a repayment to the spending entered beside it", () => {
    const result = repaymentsOutsideCash([debt({ payments: [pay(250, "2026-02-10")] })], [tx({ amount: 250, date: new Date("2026-02-11") })]);

    expect(result).toEqual({ matched: 1, unmatched: 0 });
  });

  it("does not let one payment vouch for a year of instalments", () => {
    // Same amount every month, one expense recorded. Eleven are still missing.
    const payments = Array.from({ length: 12 }, (_, i) => pay(250, `2026-${String(i + 1).padStart(2, "0")}-10`));
    const result = repaymentsOutsideCash([debt({ payments })], [tx({ amount: 250, date: new Date("2026-05-10") })]);

    expect(result).toEqual({ matched: 1, unmatched: 11 });
  });

  it("does not count money lent out as a repayment of yours", () => {
    const result = repaymentsOutsideCash([debt({ direction: "owed_to_me", payments: [pay(100, "2026-02-10")] })], []);

    expect(result).toEqual({ matched: 0, unmatched: 0 });
  });

  it("will not accept a goal deposit as the instalment", () => {
    const result = repaymentsOutsideCash([debt({ payments: [pay(250, "2026-02-10")] })], [tx({ amount: 250, date: new Date("2026-02-10"), isGoalTransaction: true, contributionType: "deposit" })]);

    expect(result).toEqual({ matched: 0, unmatched: 1 });
  });
});

// ─── A loan is owed at its amortised balance ────────────────────────────────
// "Borrowed less repaid" is right between people and wrong for a bank: part of
// every instalment is interest, so the subtraction falls faster than the debt.
// Net worth has to owe what the debts screen says is owed.

describe("netWorthSeries — a loan carrying interest", () => {
  // €10,000 at 7% over five years, taken on 30 September 2025, and a year of
  // €198.01 instalments on the 30th (the 28th in February). Today is 30 Sep 2026.
  const TAKEN = new Date(2025, 8, 30);
  const TODAY = new Date(2026, 8, 30, 12);
  const loanDoc = { id: "loan", userId: "u1", person: "Εθνική", direction: "owed_by_me", amount: 10000, interestRate: 7, termMonths: 60, date: TAKEN, createdAt: TAKEN, updatedAt: TAKEN } as unknown as Debt;
  const instalments = Array.from(
    { length: 12 },
    (_, i) => ({ id: `p${i}`, userId: "u1", debtId: "loan", amount: 198.01, date: new Date(2025, 9 + i, i === 4 ? 28 : 30), createdAt: TAKEN }) as unknown as DebtPayment,
  );
  /** The debt exactly as the debts screen builds it. */
  const asOnDebtsScreen = (payments: DebtPayment[] = instalments, now = TODAY) => computeDebtStatus(loanDoc, payments, now);

  /**
   * The balance again, walked by hand rather than through `loanState`: interest
   * accrues daily at actual/365 on what is owed, and each payment comes off
   * after the interest since the one before.
   */
  const byHand = (payments: DebtPayment[], asOf: Date) => {
    const days = (a: Date, b: Date) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
    let owed = 10000;
    let since = TAKEN;
    for (const p of [...payments].sort((a, b) => a.date.getTime() - b.date.getTime())) {
      owed += (owed * 0.07 * days(since, p.date)) / 365 - p.amount;
      since = p.date;
    }
    return Math.round((owed + (owed * 0.07 * days(since, asOf)) / 365) * 100) / 100;
  };

  it("owes the amortised balance, not borrowed less repaid", () => {
    const points = netWorthSeries([], [asOnDebtsScreen()], undefined, new Date(2026, 0, 1), TODAY);
    const september = points[points.length - 1];

    expect(september.owedByMe).toBe(8268.75);
    // What the subtraction said: €644.87 of interest paid, missing from the debt.
    expect(Math.round((10000 - 12 * 198.01) * 100) / 100).toBe(7623.88);
    expect(september.owedByMe).toBe(byHand(instalments, TODAY));
  });

  it("owes today exactly what the debts screen totals", () => {
    // A loan, a debt between people, and money lent out — each on its own rule.
    const iou = computeDebtStatus(
      { ...loanDoc, id: "iou", person: "Νίκος", amount: 400, interestRate: undefined, termMonths: undefined } as unknown as Debt,
      [{ id: "q", userId: "u1", debtId: "iou", amount: 150, date: new Date(2026, 6, 2), createdAt: TAKEN } as unknown as DebtPayment],
      TODAY,
    );
    const lent = computeDebtStatus({ ...loanDoc, id: "lent", person: "Μαρία", direction: "owed_to_me", amount: 250, interestRate: undefined, termMonths: undefined } as unknown as Debt, [], TODAY);
    const debts = [asOnDebtsScreen(), iou, lent];

    const now = netWorthSeries([], debts, undefined, new Date(2026, 5, 1), TODAY).at(-1)!;
    const screen = debtTotals(debtsByPerson(debts));

    expect(now.owedByMe).toBe(screen.owedByMe);
    expect(now.owedToMe).toBe(screen.owedToMe);
    expect(screen.owedByMe).toBe(8518.75); // 8,268.75 to the bank + 250 to Νίκος
  });

  it("reads each past month end off the payments made by then", () => {
    // March closes at midnight on 1 April: six instalments made by then.
    const points = netWorthSeries([], [asOnDebtsScreen()], undefined, new Date(2026, 0, 1), TODAY);
    const march = points.find((p) => p.key === "2026-03")!;
    const madeBy = instalments.filter((p) => p.date < new Date(2026, 3, 1));

    expect(madeBy).toHaveLength(6);
    expect(march.owedByMe).toBe(byHand(madeBy, new Date(2026, 3, 1)));
    // Falling every month as the instalments go in.
    for (let i = 1; i < points.length; i++) expect(points[i].owedByMe).toBeLessThan(points[i - 1].owedByMe);
  });

  it("gives a month the same figure whatever window it is drawn in, and whatever order the payments are in", () => {
    const wide = netWorthSeries([], [asOnDebtsScreen()], undefined, new Date(2025, 9, 1), TODAY);
    const narrow = netWorthSeries([], [asOnDebtsScreen([...instalments].reverse())], undefined, new Date(2026, 6, 1), TODAY);

    expect(narrow).toHaveLength(3);
    for (const point of narrow) expect(point.owedByMe).toBe(wide.find((p) => p.key === point.key)!.owedByMe);
  });

  it("does not charge the month still running interest it has not been charged yet", () => {
    // Seen on the 15th, September owes interest to the 15th — not to the 30th.
    const mid = new Date(2026, 8, 15, 12);
    const paidByMid = instalments.filter((p) => p.date < mid);
    const point = netWorthSeries([], [asOnDebtsScreen(paidByMid, mid)], undefined, new Date(2026, 8, 1), mid).at(-1)!;

    expect(point.owedByMe).toBe(asOnDebtsScreen(paidByMid, mid).remaining);
    expect(point.owedByMe).toBe(byHand(paidByMid, mid));
  });

  it("reads an interest-free instalment loan the same both ways", () => {
    // Twelve άτοκες δόσεις: a loan by its term, but with nothing charged the
    // amortised balance and borrowed-less-repaid are the same number.
    const free = { ...loanDoc, id: "free", amount: 1200, interestRate: 0, termMonths: 12 } as unknown as Debt;
    const paid = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, userId: "u1", debtId: "free", amount: 100, date: new Date(2025, 10 + i, 5), createdAt: TAKEN }) as unknown as DebtPayment);
    const point = netWorthSeries([], [computeDebtStatus(free, paid, TODAY)], undefined, new Date(2026, 8, 1), TODAY).at(-1)!;

    expect(point.owedByMe).toBe(400);
  });

  it("owes nothing once the loan is paid off, and nothing before it was taken", () => {
    const status = asOnDebtsScreen();
    const cleared = computeDebtStatus(loanDoc, [...instalments, { id: "all", userId: "u1", debtId: "loan", amount: status.remaining, date: new Date(2026, 8, 30), createdAt: TAKEN } as unknown as DebtPayment], TODAY);

    expect(loanPayoff(status, 0, TODAY)!.months).toBeGreaterThan(0);
    expect(netWorthSeries([], [cleared], undefined, new Date(2026, 8, 1), TODAY).at(-1)!.owedByMe).toBe(0);
    expect(netWorthSeries([], [status], undefined, new Date(2025, 7, 1), new Date(2025, 8, 15))[0].owedByMe).toBe(0);
  });

  it("leaves money between people as borrowed less repaid", () => {
    const points = netWorthSeries([], [debt({ amount: 1000, payments: [pay(400, "2026-02-10")] })], undefined, FROM, TO);
    expect(points.map((p) => p.owedByMe)).toEqual([1000, 600, 600, 600]);
  });
});

// ─── A holding is never worth less than nothing ─────────────────────────────
// A withdrawal may take out more than went in — that is a profit — and the
// whole of it has already arrived in the cash. The pot is empty, not negative.

describe("netWorthSeries — gains taken out of an investment", () => {
  const into = (goalId: string, amount: number, date: string, contributionType: "deposit" | "withdrawal" = "deposit") =>
    tx({ amount, type: "investment", isInvestmentTransaction: true, goalId, contributionType, date: new Date(date) });

  it("adds the realised gain to net worth", () => {
    const points = netWorthSeries(
      [tx({ type: "income", amount: 1000, date: new Date("2026-01-05") }), into("g1", 1000, "2026-02-05"), into("g1", 1200, "2026-03-05", "withdrawal")],
      [],
      undefined,
      FROM,
      TO,
    );
    const [january, february, march] = points;

    expect(february).toMatchObject({ cash: 0, saved: 1000, net: 1000 });
    // It used to be saved -200 here, and a net worth that never moved.
    expect(march).toMatchObject({ cash: 1200, saved: 0, net: 1200 });
    // Another way round: what came in, plus the gain the sale realised.
    expect(march.net - january.net).toBe(200);
    for (const point of points) expect(point.net).toBeCloseTo(reconcile(point), 2);
  });

  it("does not let one pot's gain eat into another pot", () => {
    const points = netWorthSeries([into("g1", 1000, "2026-01-05"), into("g2", 500, "2026-01-06"), into("g1", 1200, "2026-02-05", "withdrawal")], [], undefined, FROM, TO);

    // Pooled, g1's -200 took g2 down to 300.
    expect(points[1].saved).toBe(500);
  });

  it("starts an emptied pot again from nothing", () => {
    // Cashed out with a €200 gain in February; €500 goes back in in March.
    const points = netWorthSeries([into("g1", 1000, "2026-01-05"), into("g1", 1200, "2026-02-05", "withdrawal"), into("g1", 500, "2026-03-05")], [], undefined, FROM, TO);

    expect(points.map((p) => p.saved)).toEqual([1000, 0, 500, 500]);
  });

  it("settles the months before the window as well", () => {
    // The same history a year earlier: the first point carries it all in.
    const points = netWorthSeries([into("g1", 1000, "2025-01-05"), into("g1", 1200, "2025-02-05", "withdrawal"), into("g1", 500, "2025-03-05")], [], undefined, FROM, TO);

    expect(points[0].saved).toBe(500);
  });

  it("is not fooled by a withdrawal dated before its deposit in the same month", () => {
    // Out on the 3rd, in on the 20th: the pot never ended a month below
    // nothing, so there is no gain to find.
    const points = netWorthSeries([into("g1", 1000, "2026-02-20"), into("g1", 1000, "2026-02-03", "withdrawal")], [], undefined, FROM, TO);

    expect(points[1]).toMatchObject({ saved: 0, net: 0 });
  });

  it("changes nothing when what came out is exactly what went in", () => {
    const points = netWorthSeries([tx({ type: "income", amount: 1000, date: new Date("2026-01-05") }), into("g1", 600, "2026-01-10"), into("g1", 600, "2026-02-10", "withdrawal")], [], undefined, FROM, TO);

    expect(points.map((p) => p.net)).toEqual([1000, 1000, 1000, 1000]);
    expect(points[1].saved).toBe(0);
  });
});

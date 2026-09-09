import { describe, it, expect } from "vitest";
import { computeDebtStatus, debtTotals, debtsByPerson, isLoan, loanPayoff, loanState, monthlyInstalment, payoffSaving, plannableDebts } from "./debtsUtils";
import type { Debt, DebtPayment, DebtWithStatus } from "../../shared/types/IndexTypes";

const round2 = (n: number) => Math.round(n * 100) / 100;

const debt = (over: Partial<Debt> = {}): Debt =>
  ({
    id: `d${Math.random()}`,
    userId: "u1",
    person: "Αδερφός",
    direction: "owed_by_me",
    amount: 100,
    date: new Date(2026, 2, 4),
    createdAt: new Date(2026, 2, 4),
    updatedAt: new Date(2026, 2, 4),
    ...over,
  }) as Debt;

const repay = (debtId: string, amount: number, date: Date): DebtPayment =>
  ({ id: `p${Math.random()}`, userId: "u1", debtId, amount, date, createdAt: date }) as DebtPayment;

describe("computeDebtStatus", () => {
  it("counts repayments down to what is left", () => {
    const d = debt({ id: "d1", amount: 200 });
    const status = computeDebtStatus(d, [repay("d1", 60, new Date(2026, 3, 12)), repay("d1", 40, new Date(2026, 4, 3))]);

    expect(status.paid).toBe(100);
    expect(status.remaining).toBe(100);
    expect(status.isSettled).toBe(false);
  });

  it("settles at zero and never turns negative", () => {
    // Paying back more than was borrowed is not a debt the other way; that
    // would be a new loan, which the user can say for themselves.
    const status = computeDebtStatus(debt({ id: "d1", amount: 100 }), [repay("d1", 130, new Date(2026, 3, 1))]);

    expect(status.remaining).toBe(0);
    expect(status.isSettled).toBe(true);
  });

  it("ignores repayments belonging to another loan", () => {
    const status = computeDebtStatus(debt({ id: "d1", amount: 100 }), [repay("other", 50, new Date(2026, 3, 1))]);
    expect(status.remaining).toBe(100);
  });

  it("lists repayments newest first", () => {
    const status = computeDebtStatus(debt({ id: "d1", amount: 300 }), [repay("d1", 10, new Date(2026, 3, 1)), repay("d1", 20, new Date(2026, 5, 1))]);
    expect(status.payments.map((p) => p.amount)).toEqual([20, 10]);
  });
});

describe("debtsByPerson", () => {
  const withStatus = (d: Debt, payments: DebtPayment[] = []) => computeDebtStatus(d, payments);

  it("adds up both directions without netting them away", () => {
    // Owing someone €150 while they owe you €80 is two facts, not one €70 fact.
    const rows = [
      withStatus(debt({ id: "a", person: "Αδερφός", amount: 100 })),
      withStatus(debt({ id: "b", person: "Αδερφός", amount: 50 })),
      withStatus(debt({ id: "c", person: "Αδερφός", direction: "owed_to_me", amount: 80 })),
    ];

    const [brother] = debtsByPerson(rows);
    expect(brother).toMatchObject({ owedByMe: 150, owedToMe: 80, net: -70, openCount: 3 });
  });

  it("treats one person spelled two ways as one person", () => {
    const rows = [withStatus(debt({ person: "Νίκος" })), withStatus(debt({ person: " νίκος " }))];
    const people = debtsByPerson(rows);

    expect(people).toHaveLength(1);
    expect(people[0].owedByMe).toBe(200);
  });

  it("drops settled loans from the balance but keeps them on the record", () => {
    const rows = [
      withStatus(debt({ id: "a", amount: 100 }), [repay("a", 100, new Date(2026, 4, 1))]),
      withStatus(debt({ id: "b", amount: 60 })),
    ];

    const [person] = debtsByPerson(rows);
    expect(person.owedByMe).toBe(60);
    expect(person.openCount).toBe(1);
    expect(person.debts).toHaveLength(2);
  });

  it("puts people who still owe something above those settled up", () => {
    const settled = withStatus(debt({ id: "s", person: "Παλιός", amount: 100 }), [repay("s", 100, new Date(2026, 4, 1))]);
    const open = withStatus(debt({ id: "o", person: "Νέος", amount: 20 }));

    expect(debtsByPerson([settled, open]).map((p) => p.person)).toEqual(["Νέος", "Παλιός"]);
  });
});

describe("debtTotals", () => {
  it("reports the two sides separately", () => {
    const rows = [
      computeDebtStatus(debt({ id: "a", person: "Α", amount: 150 }), []),
      computeDebtStatus(debt({ id: "b", person: "Β", direction: "owed_to_me", amount: 80 }), []),
    ];

    expect(debtTotals(debtsByPerson(rows))).toEqual({ owedByMe: 150, owedToMe: 80, net: -70 });
  });

  it("is all zeroes with nothing on record", () => {
    expect(debtTotals([])).toEqual({ owedByMe: 0, owedToMe: 0, net: 0 });
  });
});

describe("plannableDebts", () => {
  it("takes what you owe and leaves what is owed to you", () => {
    // Money owed to you is not income until it arrives; a plan that spent it in
    // advance would be making the same promise as an unmade sale.
    const rows = [
      computeDebtStatus(debt({ id: "a", amount: 100 }), []),
      computeDebtStatus(debt({ id: "b", direction: "owed_to_me", amount: 80 }), []),
      computeDebtStatus(debt({ id: "c", amount: 50 }), [repay("c", 50, new Date(2026, 4, 1))]),
    ];

    expect(plannableDebts(rows).map((d) => d.id)).toEqual(["a"]);
  });
});

describe("debtsByPerson — the order the list is read in", () => {
  it("puts anyone still owing above anyone settled up", () => {
    // A settled person is history, and history belongs at the bottom however
    // large the sums involved were.
    const settled = computeDebtStatus(debt({ id: "s1", person: "Παλιός", amount: 5000 }), [repay("s1", 5000, new Date(2026, 3, 1))]);
    const open = computeDebtStatus(debt({ id: "o1", person: "Νέος", amount: 50 }), []);

    expect(debtsByPerson([settled, open]).map((p) => p.person)).toEqual(["Νέος", "Παλιός"]);
  });

  it("puts the largest position first among those still open", () => {
    const small = computeDebtStatus(debt({ id: "a", person: "Μικρός", amount: 100 }), []);
    const big = computeDebtStatus(debt({ id: "b", person: "Μεγάλος", amount: 900 }), []);

    expect(debtsByPerson([small, big]).map((p) => p.person)).toEqual(["Μεγάλος", "Μικρός"]);
  });

  it("falls back to the name when two positions are the same size", () => {
    // Without a last tie-break the order depends on the order they arrived in,
    // and the list reshuffles itself for no reason the reader can see.
    const anna = computeDebtStatus(debt({ id: "a", person: "Άννα", amount: 200 }), []);
    const basil = computeDebtStatus(debt({ id: "b", person: "Βασίλης", amount: 200 }), []);

    expect(debtsByPerson([basil, anna]).map((p) => p.person)).toEqual(["Άννα", "Βασίλης"]);
    expect(debtsByPerson([anna, basil]).map((p) => p.person)).toEqual(["Άννα", "Βασίλης"]);
  });
});

// ─── Loans ───────────────────────────────────────────────────────────────────
// These figures are claims about money that will actually be paid, so each one
// is checked against a second route: the instalment against the schedule it is
// supposed to clear, the schedule against the principal it is supposed to
// repay, and the saving against the two runs it is the difference of.

const NOW = new Date(2026, 8, 9); // 9 September 2026

const loan = (over: Partial<Debt> = {}, payments: DebtPayment[] = []): DebtWithStatus =>
  computeDebtStatus(
    debt({ id: "l1", person: "Τράπεζα", amount: 10000, interestRate: 7, termMonths: 60, date: new Date(2026, 8, 9), ...over }),
    payments,
  );

describe("monthlyInstalment", () => {
  it("is the annuity payment that clears the loan over its term", () => {
    // 10,000 at 7% over five years.
    expect(monthlyInstalment(10000, 7, 60)).toBe(198.01);
    expect(monthlyInstalment(250000, 3.4, 360)).toBe(1108.7);
  });

  it("splits the principal evenly when nothing is charged for it", () => {
    // The limit of the formula as the rate goes to zero, and the case that
    // would otherwise divide by zero.
    expect(monthlyInstalment(1200, 0, 12)).toBe(100);
    expect(monthlyInstalment(1200, 0, 5)).toBe(240);
  });

  it("has nothing to work out without a principal or a term", () => {
    expect(monthlyInstalment(0, 7, 60)).toBe(0);
    expect(monthlyInstalment(10000, 7, 0)).toBe(0);
    expect(monthlyInstalment(-500, 7, 60)).toBe(0);
  });

  it("costs more per month the shorter the term, and more the higher the rate", () => {
    expect(monthlyInstalment(10000, 7, 36)).toBeGreaterThan(monthlyInstalment(10000, 7, 60));
    expect(monthlyInstalment(10000, 12, 60)).toBeGreaterThan(monthlyInstalment(10000, 7, 60));
  });
});

describe("a loan is a debt that costs money", () => {
  it("is a loan when it is repaid on a schedule, rate or no rate", () => {
    // The term decides it. Twelve άτοκες δόσεις charge nothing and are still a
    // fixed payment with a known end, which is what the rest of the app needs.
    expect(isLoan({ termMonths: 60 })).toBe(true);
    expect(isLoan({ termMonths: 12 })).toBe(true);
    expect(isLoan({ termMonths: undefined })).toBe(false);
    expect(isLoan({ termMonths: 0 })).toBe(false);
  });

  it("leaves money lent between people exactly as it was", () => {
    // The whole register was built for this case, and none of it may change.
    const iou = computeDebtStatus(debt({ id: "d1", amount: 200 }), [repay("d1", 50, new Date(2026, 8, 20))]);

    expect(iou.remaining).toBe(150);
    expect(loanState(iou, NOW)).toBeUndefined();
    expect(loanPayoff(iou, 0, NOW)).toBeUndefined();
    expect(payoffSaving(iou, 100, NOW)).toBeUndefined();
  });
});

describe("loanPayoff — the schedule that clears it", () => {
  it("clears the loan in exactly its term when the instalment is paid", () => {
    const payoff = loanPayoff(loan(), 0, NOW)!;

    expect(payoff.months).toBe(60);
    expect(payoff.schedule[payoff.schedule.length - 1].balance).toBe(0);
  });

  it("repays the principal and nothing more, whatever the split", () => {
    // The reconciliation: every euro of every payment is either interest or
    // principal, and the principal adds up to what was borrowed.
    const payoff = loanPayoff(loan(), 0, NOW)!;
    const principal = payoff.schedule.reduce((sum, row) => sum + row.principal, 0);
    const interest = payoff.schedule.reduce((sum, row) => sum + row.interest, 0);
    const paid = payoff.schedule.reduce((sum, row) => sum + row.payment, 0);

    expect(principal).toBeCloseTo(10000, 1);
    expect(paid).toBeCloseTo(principal + interest, 1);
    expect(interest).toBeCloseTo(payoff.interestToCome, 1);
    // Every row ties on its own, so adding up the columns of the table on
    // screen gives the totals under it.
    for (const row of payoff.schedule) expect(round2(row.interest + row.principal), `row ${row.number}`).toBe(row.payment);
    // The whole point: it costs more than it lent.
    expect(paid).toBeGreaterThan(10000);
    expect(interest).toBeCloseTo(1880, -1);
  });

  it("charges interest first, so the early payments barely touch the debt", () => {
    const payoff = loanPayoff(loan(), 0, NOW)!;
    const first = payoff.schedule[0];
    const last = payoff.schedule[payoff.schedule.length - 1];

    expect(first.interest).toBeCloseTo(58.33, 1); // 10,000 at 7% for a month
    expect(first.principal).toBeLessThan(first.payment / 2 + 60);
    // By the end it is almost all principal — the shape of every amortised loan.
    expect(last.principal).toBeGreaterThan(last.interest * 20);
  });

  it("never claims to finish a loan the payment cannot clear", () => {
    // A payment smaller than the interest leaves the balance growing for ever;
    // reporting a finish date for it would be a lie.
    const hopeless = loan({ amount: 10000, interestRate: 60, termMonths: 600 });
    expect(loanPayoff(hopeless, 0, NOW)).toBeUndefined();
  });
});

describe("payoffSaving — what an extra payment buys", () => {
  it("takes months off the end and interest off the total", () => {
    const saving = payoffSaving(loan(), 100, NOW)!;

    expect(saving.monthsSaved).toBeGreaterThan(20);
    expect(saving.interestSaved).toBeGreaterThan(600);
    expect(saving.finishDate.getTime()).toBeLessThan(loanPayoff(loan(), 0, NOW)!.finishDate.getTime());
  });

  it("saves nothing when nothing extra is paid", () => {
    const saving = payoffSaving(loan(), 0, NOW)!;

    expect(saving.monthsSaved).toBe(0);
    expect(saving.interestSaved).toBe(0);
  });

  it("never gets slower by paying more", () => {
    // Monotonic, or the calculator is telling someone that paying more costs
    // them time.
    let previous = loanPayoff(loan(), 0, NOW)!.months;
    for (const extra of [50, 100, 200, 500]) {
      const months = loanPayoff(loan(), extra, NOW)!.months;
      expect(months, `extra ${extra}`).toBeLessThanOrEqual(previous);
      previous = months;
    }
  });

  it("agrees with the difference between the two runs it compares", () => {
    const base = loanPayoff(loan(), 0, NOW)!;
    const faster = loanPayoff(loan(), 150, NOW)!;
    const saving = payoffSaving(loan(), 150, NOW)!;

    expect(saving.monthsSaved).toBe(base.months - faster.months);
    expect(saving.interestSaved).toBeCloseTo(base.interestToCome - faster.interestToCome, 2);
  });
});

describe("loanState — where a loan actually stands", () => {
  it("grows the balance while nothing is paid", () => {
    // Six months of silence on a 7% loan: the debt is larger than it was.
    const state = loanState(loan(), new Date(2027, 2, 9))!;

    expect(state.balance).toBeGreaterThan(10000);
    expect(state.interestPaid).toBeGreaterThan(300);
    expect(state.principalPaid).toBe(0);
  });

  it("splits each payment into the interest it met and the debt it cleared", () => {
    const withPayment = loan({}, [repay("l1", 198.01, new Date(2026, 9, 9))]);
    const state = loanState(withPayment, new Date(2026, 9, 9))!;

    // A month of interest on 10,000 at 7%, and the rest off the principal.
    expect(state.interestPaid).toBeCloseTo(57.53, 0); // 30 days, actual/365
    expect(state.balance).toBeLessThan(10000);
    expect(state.balance).toBeGreaterThan(9800);
    expect(round2(state.principalPaid + (10000 - state.balance) * 0)).toBeCloseTo(198.01, 1);
  });

  it("reports the contractual payment, not a guess at one", () => {
    expect(loanState(loan(), NOW)!.instalment).toBe(198.01);
  });

  it("never reports a debt below zero once it is overpaid", () => {
    const cleared = loan({}, [repay("l1", 20000, new Date(2026, 9, 9))]);
    expect(loanState(cleared, new Date(2027, 0, 1))!.balance).toBe(0);
  });
});

describe("a loan's balance is what is owed, not what is left of the principal", () => {
  it("owes more than the difference between borrowed and repaid", () => {
    // Twelve months of an amortised loan: the payments went mostly on interest,
    // so the debt is higher than "10,000 less what was handed over" suggests.
    const payments = Array.from({ length: 12 }, (_, i) => repay("l1", 198.01, new Date(2026, 9 + i, 9)));
    const status = computeDebtStatus(
      debt({ id: "l1", amount: 10000, interestRate: 7, termMonths: 60, date: new Date(2026, 8, 9) }),
      payments,
      new Date(2027, 8, 9),
    );

    expect(status.paid).toBeCloseTo(2376.12, 2);
    // What the old arithmetic would have said, and what is actually owed.
    expect(round2(10000 - status.paid)).toBeCloseTo(7623.88, 2);
    expect(status.remaining).toBeGreaterThan(8200);
    expect(status.remaining).toBeLessThan(8350);
  });

  it("grows while nothing is paid, because that is what interest does", () => {
    const untouched = debt({ id: "l2", amount: 5000, interestRate: 12, termMonths: 36, date: new Date(2026, 0, 1) });

    const atStart = computeDebtStatus(untouched, [], new Date(2026, 0, 1)).remaining;
    const aYearOn = computeDebtStatus(untouched, [], new Date(2027, 0, 1)).remaining;

    expect(atStart).toBe(5000);
    expect(aYearOn).toBeGreaterThan(5550); // roughly a year of 12%
    expect(aYearOn).toBeLessThan(5650);
  });

  it("leaves an interest-free debt exactly where it was", () => {
    const iou = computeDebtStatus(debt({ id: "d9", amount: 300 }), [repay("d9", 100, new Date(2026, 8, 20))], new Date(2028, 0, 1));

    expect(iou.remaining).toBe(200);
    expect(iou.isSettled).toBe(false);
  });

  it("settles when the balance reaches zero, interest included", () => {
    const settled = computeDebtStatus(
      debt({ id: "l3", amount: 1000, interestRate: 10, termMonths: 12, date: new Date(2026, 0, 1) }),
      [repay("l3", 1100, new Date(2026, 6, 1))],
      new Date(2026, 8, 1),
    );

    expect(settled.remaining).toBe(0);
    expect(settled.isSettled).toBe(true);
  });
});

// ─── Interest-free instalments ───────────────────────────────────────────────
// The shop's twelve payments, and the card offer that runs out. Both are a
// stretch at the start that costs nothing, and a rate that applies to whatever
// is still owed afterwards.

describe("άτοκες δόσεις — nothing charged, at least to begin with", () => {
  it("splits the debt evenly when the whole term is free", () => {
    // Twelve interest-free instalments on a €1,200 phone.
    expect(monthlyInstalment(1200, 0, 12, 12)).toBe(100);
    expect(monthlyInstalment(1200, 18.9, 12, 12)).toBe(100);
    // A rate that never gets to apply changes nothing.
    expect(monthlyInstalment(1200, 18.9, 12, 24)).toBe(100);
  });

  it("charges less per month the longer the free stretch runs", () => {
    const none = monthlyInstalment(10000, 7, 60, 0);
    const year = monthlyInstalment(10000, 7, 60, 12);
    const half = monthlyInstalment(10000, 7, 60, 30);

    expect(none).toBe(198.01);
    expect(year).toBeLessThan(none);
    expect(half).toBeLessThan(year);
    // And never below the interest-free floor of principal ÷ term.
    expect(half).toBeGreaterThanOrEqual(10000 / 60);
  });

  it("still clears the loan in exactly its term", () => {
    // The point of the formula: an opening that charges nothing must not leave
    // a tail of payments at the end.
    const promo = loan({ interestFreeMonths: 12 });
    const payoff = loanPayoff(promo, 0, NOW)!;

    expect(payoff.months).toBe(60);
    expect(payoff.schedule[payoff.schedule.length - 1].balance).toBe(0);
    expect(payoff.schedule.reduce((sum, row) => sum + row.principal, 0)).toBeCloseTo(10000, 1);
  });

  it("charges nothing at all until the offer runs out", () => {
    const promo = loan({ interestFreeMonths: 12 });
    const payoff = loanPayoff(promo, 0, NOW)!;

    for (const row of payoff.schedule.slice(0, 12)) expect(row.interest, `payment ${row.number}`).toBe(0);
    expect(payoff.schedule[12].interest).toBeGreaterThan(0);
    // Every euro of the opening payments comes straight off the debt.
    expect(payoff.schedule[0].principal).toBe(payoff.schedule[0].payment);
  });

  it("costs less in total than the same loan charged from day one", () => {
    const plain = loanPayoff(loan(), 0, NOW)!;
    const promo = loanPayoff(loan({ interestFreeMonths: 12 }), 0, NOW)!;
    const free = loanPayoff(loan({ interestFreeMonths: 60 }), 0, NOW)!;

    expect(promo.interestToCome).toBeLessThan(plain.interestToCome);
    expect(free.interestToCome).toBe(0);
  });

  it("leaves the balance alone while the offer lasts, then starts charging", () => {
    // Nothing paid and nothing charged for a year; the debt has not moved.
    const promo = loan({ interestFreeMonths: 12, date: new Date(2026, 8, 9) });

    expect(loanState(promo, new Date(2027, 2, 9))!.balance).toBe(10000);
    expect(loanState(promo, new Date(2027, 8, 9))!.balance).toBe(10000);
    // Six months past the offer, it has.
    expect(loanState(promo, new Date(2028, 2, 9))!.balance).toBeGreaterThan(10300);
  });

  it("takes a plain interest-free plan without a rate at all", () => {
    const phone = computeDebtStatus(
      debt({ id: "p1", amount: 1200, termMonths: 12, date: new Date(2026, 8, 9) }),
      [repay("p1", 100, new Date(2026, 9, 9))],
      new Date(2027, 2, 9),
    );

    expect(loanState(phone, new Date(2027, 2, 9))!.instalment).toBe(100);
    expect(loanState(phone, new Date(2027, 2, 9))!.interestPaid).toBe(0);
    expect(phone.remaining).toBe(1100);
  });
});

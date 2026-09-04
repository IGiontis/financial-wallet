import { describe, it, expect } from "vitest";
import { computeDebtStatus, debtTotals, debtsByPerson, plannableDebts } from "./debtsUtils";
import type { Debt, DebtPayment } from "../../shared/types/IndexTypes";

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

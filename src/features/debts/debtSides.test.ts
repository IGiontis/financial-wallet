import { describe, it, expect } from "vitest";
import { archivedDebts, balanceShares, closedDeletePlan, closedOn, debtSides, loanPath, personPath } from "./debtSides";
import { computeDebtStatus, debtTotals, debtsByPerson } from "./debtsUtils";
import type { Debt, DebtPayment } from "../../shared/types/IndexTypes";

// The «Ζυγαριά» overview must show exactly what the old tiles showed: the side
// totals ARE `debtTotals`, and the rows under each side add up to it. Every
// figure below is worked out by hand from the records, not from the code.

const day = (m: number, d: number) => new Date(2026, m, d);
const debt = (id: string, person: string, direction: Debt["direction"], amount: number, date: Date, extra: Partial<Debt> = {}): Debt => ({
  id,
  userId: "u",
  person,
  direction,
  amount,
  date,
  createdAt: date,
  updatedAt: date,
  ...extra,
});
const pay = (id: string, debtId: string, amount: number, date: Date): DebtPayment => ({ id, userId: "u", debtId, amount, date, createdAt: date });

const records: Debt[] = [
  debt("rent", "Nikos", "owed_by_me", 500, day(2, 3), { label: "March rent" }),
  debt("lunch", "Nikos", "owed_to_me", 40, day(3, 1)),
  debt("trip", "Maria", "owed_by_me", 300, day(4, 1)),
  debt("phone", "Maria", "owed_by_me", 200.55, day(5, 1)),
  debt("loan", " maria ", "owed_to_me", 1000, day(1, 1)),
  // Paid off in full on 20 Jun.
  debt("concert", "Nikos", "owed_by_me", 60, day(5, 1)),
  // Let go of on 1 Oct.
  debt("gift", "Eleni", "owed_to_me", 75, day(6, 1), { forgiven: { amount: 75, date: day(9, 1) } }),
];
const payments: DebtPayment[] = [
  pay("r1", "rent", 120, day(3, 10)),
  pay("r2", "rent", 80, day(4, 2)),
  pay("l1", "loan", 250.25, day(2, 1)),
  pay("c1", "concert", 60, day(5, 20)),
];
const debts = records.map((d) => computeDebtStatus(d, payments, day(10, 16)));
const people = debtsByPerson(debts);

describe("the two sides of the scale", () => {
  const sides = debtSides(people);

  it("totals are the page's old tiles, to the cent", () => {
    // You owe: rent 500 − 200 = 300, trip 300, phone 200.55 → 800.55.
    // Owed to you: lunch 40, loan 1000 − 250.25 = 749.75 → 789.75.
    expect(sides.totals).toEqual({ owedByMe: 800.55, owedToMe: 789.75, net: -10.8 });
    expect(sides.totals).toEqual(debtTotals(people));
  });

  it("each side's rows add up to its total", () => {
    const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    expect(sum(sides.owe)).toBe(sides.totals.owedByMe);
    expect(sum(sides.owed)).toBe(sides.totals.owedToMe);
  });

  it("puts a person on each side they are open on, largest first", () => {
    // Maria owes nothing back on the «owe» side but 300 + 200.55 = 500.55 is hers; Nikos 300.
    expect(sides.owe.map((r) => [r.person, r.amount, r.count])).toEqual([
      ["Maria", 500.55, 2],
      ["Nikos", 300, 1],
    ]);
    // « maria » is the same person as Maria (one group); 749.75 before Nikos's 40.
    expect(sides.owed.map((r) => [r.person, r.amount, r.count])).toEqual([
      ["Maria", 749.75, 1],
      ["Nikos", 40, 1],
    ]);
  });

  it("names the one open debt, never a closed one, and opens on it", () => {
    const nikos = sides.owe.find((r) => r.person === "Nikos")!;
    // The concert is newer but settled: the row is the rent alone.
    expect(nikos).toMatchObject({ label: "March rent", debtId: "rent", ids: ["rent"] });
    expect(sides.owe.find((r) => r.person === "Maria")!.label).toBeUndefined();
  });

  it("draws how much is gone as the old list did: repaid over started", () => {
    // Rent: 200 of 500 = 40%. Maria's two: nothing of 500.55 = 0%. Loan: 250.25 of 1000 = 25%.
    expect(sides.owe.find((r) => r.person === "Nikos")!.cleared).toBe(40);
    expect(sides.owe.find((r) => r.person === "Maria")!.cleared).toBe(0);
    expect(sides.owed.find((r) => r.person === "Maria")!.cleared).toBe(25);
  });

  it("leaves a fully closed person off both sides", () => {
    expect([...sides.owe, ...sides.owed].some((r) => r.person === "Eleni")).toBe(false);
  });

  it("is empty both ways with nothing open", () => {
    const closed = debtSides(debtsByPerson(debts.filter((d) => d.isSettled)));
    expect(closed).toEqual({ owe: [], owed: [], totals: { owedByMe: 0, owedToMe: 0, net: 0 } });
  });
});

describe("the balance bar", () => {
  it("splits by what is open both ways", () => {
    // 800.55 of 1590.30 = 50.34%.
    const { owe, owed } = balanceShares({ owedByMe: 800.55, owedToMe: 789.75 });
    expect(owe).toBeCloseTo(50.34, 2);
    expect(owe + owed).toBeCloseTo(100, 10);
  });

  it("draws one colour when only one side is open, and nothing with neither", () => {
    expect(balanceShares({ owedByMe: 10, owedToMe: 0 })).toEqual({ owe: 100, owed: 0 });
    expect(balanceShares({ owedByMe: 0, owedToMe: 0 })).toEqual({ owe: 0, owed: 0 });
  });
});

describe("the archive", () => {
  const archive = archivedDebts(debts);

  it("holds every closed debt and nothing open, the latest closed first", () => {
    // Forgiven 1 Oct, then paid off 20 Jun.
    expect(archive.map((d) => d.id)).toEqual(["gift", "concert"]);
    expect(closedOn(archive[0])).toEqual(day(9, 1));
    expect(closedOn(archive[1])).toEqual(day(5, 20));
  });

  it("with the open ones makes the whole list — nothing dropped, nothing twice", () => {
    const open = debts.filter((d) => !d.isSettled).map((d) => d.id);
    expect([...open, ...archive.map((d) => d.id)].sort()).toEqual(debts.map((d) => d.id).sort());
  });
});

describe("a bank loan on a row of its own", () => {
  // Nikos: 500 rent (200 back) between people, and a 6,000 car loan at 7% over 36 months.
  const withLoan = [...records, debt("car", "Nikos", "owed_by_me", 6000, day(0, 10), { label: "Car", interestRate: 7, termMonths: 36 })].map((d) => computeDebtStatus(d, payments, day(10, 16)));
  const sides = debtSides(debtsByPerson(withLoan));

  it("leads to the loan's page, the person's other debts to theirs", () => {
    const nikos = sides.owe.filter((r) => r.person === "Nikos");
    expect(nikos.map((r) => [r.loan, r.to, r.ids])).toEqual(
      expect.arrayContaining([
        [false, personPath("Nikos"), ["rent"]],
        [true, loanPath("car"), ["car"]],
      ]),
    );
  });

  it("still adds up to the old tile: the person's rows together are their whole side", () => {
    const sum = Math.round(sides.owe.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    expect(sum).toBe(sides.totals.owedByMe);
    // The car's own figure is its balance, the rent's 300: together Nikos's owedByMe.
    const nikos = debtsByPerson(withLoan).find((p) => p.person === "Nikos")!;
    const rows = sides.owe.filter((r) => r.person === "Nikos");
    expect(Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100).toBe(nikos.owedByMe);
  });
});

describe("what deleting closed debts says before it is done", () => {
  it("counts the debts, their repayments and the money that stays, from the device", () => {
    const closed = archivedDebts(debts);
    const plan = closedDeletePlan(closed, [
      { debtId: "concert" },
      { debtId: "concert" },
      // Already kept from an earlier delete — not counted again; another debt's — not this one's.
      { debtId: "concert", debtKept: true },
      { debtId: "rent" },
      {},
    ]);
    // The gift (forgiven, no repayment) and the concert (1 repayment): 2 debts, 1 repayment, 2 records.
    expect(plan).toEqual({ debts: 2, repayments: 1, keptMoney: 2, covered: 0 });
  });

  it("names a debt a friend took on for a goal", () => {
    const covered = computeDebtStatus(debt("cov", "Nikos", "owed_by_me", 50, day(1, 1), { forGoalId: "g1" }), [pay("cp", "cov", 50, day(1, 2))]);
    expect(closedDeletePlan([covered], []).covered).toBe(1);
  });
});

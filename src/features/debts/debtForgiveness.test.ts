import { describe, it, expect } from "vitest";
import { computeDebtStatus, debtTotals, debtsByPerson, forgiveness, plannableDebts } from "./debtsUtils";
import { netWorthSeries } from "../analytics/netWorthUtils";
import type { Debt, DebtPayment } from "../../shared/types/IndexTypes";

// A debt let go of. Nikos lent 500, 300 was paid back, and he forgave the
// other 200: the debt stays, with its history, and closes as forgiven — no
// payment of 200 that was never made, no card that moved.

const debt = (over: Partial<Debt> = {}): Debt =>
  ({
    id: "nikos",
    userId: "u",
    person: "Νίκος",
    direction: "owed_by_me",
    amount: 500,
    date: new Date(2026, 6, 1),
    createdAt: new Date(2026, 6, 1),
    updatedAt: new Date(2026, 6, 1),
    ...over,
  }) as Debt;

const paid300: DebtPayment = { id: "p1", userId: "u", debtId: "nikos", amount: 300, date: new Date(2026, 7, 10), createdAt: new Date(2026, 7, 10) } as DebtPayment;
const NOW = new Date(2026, 9, 21);

describe("forgiving a debt", () => {
  it("lets go of what was still owed — 200 of the 500, after 300 was paid", () => {
    const open = computeDebtStatus(debt(), [paid300], NOW);
    expect(open.remaining).toBe(200);
    const forgiven = forgiveness(open, NOW, "  δεν τα θέλει πίσω ");
    expect(forgiven).toEqual({ date: NOW, amount: 200, note: "δεν τα θέλει πίσω" });
  });

  it("closes the debt with nothing owed, and keeps what was paid as it was", () => {
    const closed = computeDebtStatus(debt({ forgiven: { date: NOW, amount: 200 } }), [paid300], NOW);
    expect(closed).toMatchObject({ remaining: 0, isSettled: true, paid: 300 });
    // A second way: what was paid and what was let go are the whole of what was lent.
    expect(closed.paid + closed.forgiven!.amount).toBe(closed.amount);
  });

  it("drops out of what you owe and out of the plan, in either direction", () => {
    const mine = computeDebtStatus(debt({ forgiven: { date: NOW, amount: 200 } }), [paid300], NOW);
    const theirs = computeDebtStatus(debt({ id: "maria", person: "Μαρία", direction: "owed_to_me", amount: 150, forgiven: { date: NOW, amount: 150 } }), [], NOW);
    expect(debtTotals(debtsByPerson([mine, theirs]))).toEqual({ owedByMe: 0, owedToMe: 0, net: 0 });
    expect(plannableDebts([mine, theirs])).toEqual([]);
  });

  it("leaves no note when none was given", () => {
    expect(forgiveness({ remaining: 80 }, NOW, "   ")).toEqual({ date: NOW, amount: 80 });
  });

  it("still counts in the net position for every month before the day it was forgiven", () => {
    // Forgiven on 21 October: still owed at the end of September, gone at the end of October.
    const status = computeDebtStatus(debt({ forgiven: { date: NOW, amount: 200 } }), [paid300], NOW);
    const points = netWorthSeries([], [status], undefined, new Date(2026, 8, 1), NOW);
    const [september, october] = points;
    expect(september.owedByMe).toBe(200);
    expect(october.owedByMe).toBe(0);
    // And so the net rises by exactly what was let go — the second way.
    expect(october.net - september.net).toBe(200);
  });
});

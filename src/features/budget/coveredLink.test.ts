import { describe, it, expect } from "vitest";
import { coveredEdit, coveredExpenses, coveredLinkOf, isEmptyEdit, renamedIn, sameText, type CoveredEdit } from "./coveredLink";
import { coveredFundingVars } from "./coveredFunding";
import { computeGoalStats } from "./investmentsUtils";
import { computeDebtStatus, forgiveness } from "../debts/debtsUtils";
import { debtCashRecords } from "../debts/debtCash";
import { firestoreToDate } from "../../shared/utils/dates";
import type { CreateDebtDTO, Debt, DebtPayment, InvestmentContribution, InvestmentGoal, Transaction } from "../../shared/types/IndexTypes";

// His case: a ski trip goal of 700. He put in 150 himself; Nikos paid the hotel,
// 550, from the debt form («πήγαν σε στόχο»). Later the hotel turned out to be
// 400, and he corrected the debt from the Debts page.

const DAY = new Date(2026, 9, 20);
const GOAL: InvestmentGoal = { id: "ski", userId: "u", name: "Σκι διακοπές ", targetAmount: 700, isActive: true, createdAt: DAY, updatedAt: DAY } as InvestmentGoal;

/** The three records as the app writes them, with the 150 he put in himself. */
function world() {
  const vars = coveredFundingVars({ goal: GOAL, who: "Νίκος", amount: 550, date: DAY, categoryId: "travel", notes: "Πλήρωσε: Νίκος", expenseNotes: "Πλήρωσε: Νίκος · χρέος" });
  const own: InvestmentContribution = { id: "own", userId: "u", goalId: "ski", amount: 150, contributionType: "deposit", date: new Date(2026, 9, 1), createdAt: DAY, updatedAt: DAY };
  const contribution: InvestmentContribution = { ...vars.contribution, id: "c1", userId: "u", debtId: "d1", createdAt: DAY, updatedAt: DAY };
  const debt: Debt = { ...vars.debt, id: "d1", userId: "u", coveredExpenseId: "e1", createdAt: DAY, updatedAt: DAY };
  const expense = { ...vars.expense, id: "e1", userId: "u", createdAt: DAY, updatedAt: DAY } as Transaction;
  const other = { id: "e2", userId: "u", type: "expense", amount: 30, categoryId: "food", description: "Καφές", date: DAY, createdAt: DAY, updatedAt: DAY } as Transaction;
  return { contributions: [own, contribution], debt, transactions: [expense, other] };
}

/** The form's answer: the debt as saved, with whatever the user changed. */
const form = (debt: Debt, over: Partial<CreateDebtDTO> = {}): CreateDebtDTO => ({
  person: debt.person,
  direction: debt.direction,
  label: debt.label,
  amount: debt.amount,
  date: firestoreToDate(debt.date),
  accountId: debt.accountId,
  ...over,
});

/** What the batch would leave, applied to the records in memory — the writes, played. */
function apply(w: ReturnType<typeof world>, next: CreateDebtDTO, edit: CoveredEdit) {
  const debt: Debt = { ...w.debt, ...next, ...(edit.coveredExpenseId ? { coveredExpenseId: edit.coveredExpenseId } : {}) };
  const contributions = w.contributions.map((c) => (c.id === edit.contribution?.id ? { ...c, ...edit.contribution.set } : c));
  const transactions = w.transactions.map((t) => (t.id === edit.expense?.id ? { ...t, ...edit.expense.set } : t));
  return { contributions, debt, transactions };
}

/** Every figure that has to agree, read back from the records — not from the edit. */
function reconcile(w: ReturnType<typeof world>, payments: DebtPayment[] = []) {
  const goal = computeGoalStats(GOAL, w.contributions);
  const debt = computeDebtStatus(w.debt, payments, new Date(2026, 11, 31));
  const expense = w.transactions.find((t) => t.id === "e1");
  // A second way to the goal's total: the contributions summed by hand.
  const byHand = w.contributions.reduce((sum, c) => sum + (c.contributionType === "deposit" ? c.amount : -c.amount), 0);
  expect(goal.totalSaved).toBeCloseTo(byHand, 2);
  // What the goal says Nikos paid is what the debt says was borrowed, and what was spent.
  expect(goal.totalCovered).toBeCloseTo(w.debt.amount, 2);
  expect(expense?.amount).toBeCloseTo(w.debt.amount, 2);
  // The loan's money and the expense cancel on the main account: no card moved.
  const loan = debtCashRecords(debt).records.find((r) => r.debtPart === "loan");
  expect(loan?.accountId).toBeUndefined();
  expect((loan?.amount ?? 0) - (expense?.amount ?? 0)).toBeCloseTo(0, 2);
  // And they are all on one day.
  expect(firestoreToDate(expense!.date).toDateString()).toBe(firestoreToDate(w.debt.date).toDateString());
  return { goal, debt };
}

describe("names compared as a reader would", () => {
  it("ignores a trailing space, doubled spaces, case and accents — and matches nothing empty", () => {
    expect(sameText("Σκι διακοπές ", "Σκι διακοπές")).toBe(true);
    expect(sameText("  σκι   ΔΙΑΚΟΠΕΣ", "Σκι διακοπές")).toBe(true);
    expect(sameText("Σκι", "Σκι διακοπές")).toBe(false);
    expect(sameText("", "")).toBe(false);
    expect(sameText(undefined, "x")).toBe(false);
  });

  it("finds an older debt's expense though the goal's name had a trailing space", () => {
    // The debt's label was trimmed by the form; the expense kept the goal's raw name.
    const expense = { id: "e9", type: "expense", amount: 550, description: "Σκι διακοπές ", date: new Date(2026, 9, 20, 15) } as Transaction;
    const debt = { id: "d9", forGoalId: "ski", amount: 550, date: DAY, label: "Σκι διακοπές" };
    const coveredExpenseOf = (d: typeof debt, name: string | undefined, txs: Transaction[]) => coveredExpenses([d], txs, () => name).get(d.id);
    expect(coveredExpenseOf(debt, "Σκι διακοπές ", [expense])).toBe("e9");
    // Either name will do: the label edited later still finds it by the goal's.
    expect(coveredExpenseOf({ ...debt, label: "Ξενοδοχείο" }, "Σκι διακοπές", [expense])).toBe("e9");
    // Not another day, not another amount, not a goal's own record.
    expect(coveredExpenseOf({ ...debt, date: new Date(2026, 9, 21) }, undefined, [expense])).toBeUndefined();
    expect(coveredExpenseOf({ ...debt, amount: 549 }, undefined, [expense])).toBeUndefined();
    expect(coveredExpenseOf(debt, undefined, [{ ...expense, goalId: "ski" }])).toBeUndefined();
  });

  it("writes the goal's name trimmed, wherever the covered funding is told from", () => {
    const { debt, transactions } = world();
    expect(transactions[0].description).toBe("Σκι διακοπές");
    expect(debt.label).toBe("Σκι διακοπές");
    const spaced = coveredFundingVars({ goal: { id: "g", name: " A  trip " }, who: " Nikos ", amount: 1, date: DAY, categoryId: "c", notes: "", expenseNotes: "", debt: { label: "  " } });
    expect([spaced.expense.description, spaced.debt.label, spaced.debt.person, spaced.contribution.coveredBy]).toEqual(["A trip", "A trip", "Nikos", "Nikos"]);
  });

  it("swaps a name only where it stands as a word", () => {
    expect(renamedIn("Πλήρωσε: Νίκος · χρέος", "Νίκος", "Γιώργος")).toBe("Πλήρωσε: Γιώργος · χρέος");
    expect(renamedIn("Νικόστρατος", "Νίκος", "Γιώργος")).toBe("Νικόστρατος");
    expect(renamedIn("Paid by Nikos (Nikos.)", "Nikos", "Nick")).toBe("Paid by Nick (Nick.)");
    expect(renamedIn(undefined, "Nikos", "Nick")).toBeUndefined();
  });
});

describe("a covered debt edited from the Debts page", () => {
  it("as written, every figure already agrees", () => {
    const w = world();
    const { goal } = reconcile(w);
    expect(goal.totalSaved).toBe(700);
    expect(goal.covered).toEqual([{ person: "Νίκος", amount: 550, debtIds: ["d1"] }]);
  });

  it("finds the deposit and the expense, and nothing for a debt that paid no goal", () => {
    const w = world();
    const link = coveredLinkOf(w.debt, [w.debt], w.contributions, w.transactions, [GOAL]);
    expect(link?.contribution?.id).toBe("c1");
    expect(link?.expense?.id).toBe("e1");
    expect(link?.expenseUnnamed).toBe(false);
    expect(coveredLinkOf({ ...w.debt, forGoalId: undefined }, [{ ...w.debt, forGoalId: undefined }], w.contributions, w.transactions, [GOAL])).toBeUndefined();
  });

  it("550 → 400: the goal's deposit and the expense follow, in the same write", () => {
    const w = world();
    const next = form(w.debt, { amount: 400 });
    const plan = coveredEdit(w.debt, next, coveredLinkOf(w.debt, [w.debt], w.contributions, w.transactions, [GOAL]));
    expect(plan).toEqual({ ok: true, edit: { contribution: { id: "c1", set: { amount: 400 } }, expense: { id: "e1", set: { amount: 400 } } } });
    const after = apply(w, next, plan.ok ? plan.edit : {});
    const { goal } = reconcile(after);
    // 150 of his own + 400 Nikos paid, worked out from the figures typed, not the code's.
    expect(goal.totalSaved).toBe(150 + 400);
    expect(goal.totalCovered).toBe(400);
    // The other expense is untouched.
    expect(after.transactions[1]).toBe(w.transactions[1]);
  });

  it("and back to 550: everything is as it was", () => {
    const w = world();
    const link = (x: ReturnType<typeof world>) => coveredLinkOf(x.debt, [x.debt], x.contributions, x.transactions, [GOAL]);
    const down = form(w.debt, { amount: 400 });
    const p1 = coveredEdit(w.debt, down, link(w));
    const mid = apply(w, down, p1.ok ? p1.edit : {});
    const up = form(mid.debt, { amount: 550 });
    const p2 = coveredEdit(mid.debt, up, link(mid));
    const back = apply(mid, up, p2.ok ? p2.edit : {});
    expect(back.contributions.map((c) => c.amount)).toEqual(w.contributions.map((c) => c.amount));
    expect(back.transactions.map((t) => t.amount)).toEqual(w.transactions.map((t) => t.amount));
    expect(reconcile(back).goal.totalSaved).toBe(700);
  });

  it("a new day and a new name reach the deposit, the expense and their notes", () => {
    const w = world();
    const day = new Date(2026, 9, 22);
    const next = form(w.debt, { date: day, person: " Γιώργος " });
    const plan = coveredEdit(w.debt, { ...next, person: next.person.trim() }, coveredLinkOf(w.debt, [w.debt], w.contributions, w.transactions, [GOAL]));
    expect(plan.ok && plan.edit.contribution?.set).toEqual({ date: day, coveredBy: "Γιώργος", notes: "Πλήρωσε: Γιώργος" });
    expect(plan.ok && plan.edit.expense?.set).toEqual({ date: day, notes: "Πλήρωσε: Γιώργος · χρέος" });
    const after = apply(w, { ...next, person: "Γιώργος" }, plan.ok ? plan.edit : {});
    const { goal } = reconcile(after);
    expect(goal.covered).toEqual([{ person: "Γιώργος", amount: 550, debtIds: ["d1"] }]);
  });

  it("an unchanged save writes nothing besides the debt", () => {
    const w = world();
    const plan = coveredEdit(w.debt, form(w.debt, { label: "Ξενοδοχείο", dueDate: new Date(2026, 11, 1) }), coveredLinkOf(w.debt, [w.debt], w.contributions, w.transactions, [GOAL]));
    expect(plan.ok && isEmptyEdit(plan.edit)).toBe(true);
  });

  it("puts right a deposit an earlier edit left behind — his data as it stands", () => {
    // The debt was already changed to 400 before this fix; the deposit and the expense still say 550.
    const w = world();
    const drifted = { ...w, debt: { ...w.debt, amount: 400 } };
    const plan = coveredEdit(drifted.debt, form(drifted.debt), coveredLinkOf(drifted.debt, [drifted.debt], drifted.contributions, drifted.transactions, [GOAL]));
    const after = apply(drifted, form(drifted.debt), plan.ok ? plan.edit : {});
    expect(reconcile(after).goal.totalSaved).toBe(550);
  });

  it("an older debt's expense, found by its figures, is named on the debt from then on", () => {
    const w = world();
    const old = { ...w, debt: { ...w.debt, coveredExpenseId: undefined } };
    const link = coveredLinkOf(old.debt, [old.debt], old.contributions, old.transactions, [GOAL]);
    expect(link?.expense?.id).toBe("e1");
    const plan = coveredEdit(old.debt, form(old.debt, { amount: 500 }), link);
    expect(plan.ok && plan.edit.coveredExpenseId).toBe("e1");
    const after = apply(old, form(old.debt, { amount: 500 }), plan.ok ? plan.edit : {});
    expect(after.debt.coveredExpenseId).toBe("e1");
    reconcile(after);
  });

  it("refuses another direction or a card: the loan's money would no longer cancel the expense", () => {
    const w = world();
    const link = coveredLinkOf(w.debt, [w.debt], w.contributions, w.transactions, [GOAL]);
    expect(coveredEdit(w.debt, form(w.debt, { direction: "owed_to_me" }), link)).toEqual({ ok: false, reason: "direction" });
    expect(coveredEdit(w.debt, form(w.debt, { accountId: "eurobank" }), link)).toEqual({ ok: false, reason: "card" });
    expect(coveredEdit(w.debt, form(w.debt, { accountId: undefined }), link)).toEqual({ ok: false, reason: "card" });
  });

  it("only names what is still there: the goal deleted, the expense refunded", () => {
    const w = world();
    // Goal deleted with the refund: deposit and expense both gone — the debt is free to change.
    const bare = coveredLinkOf(w.debt, [w.debt], [w.contributions[0]], [w.transactions[1]], []);
    expect(bare?.contribution).toBeUndefined();
    expect(bare?.expense).toBeUndefined();
    expect(coveredEdit(w.debt, form(w.debt, { amount: 10, accountId: "card" }), bare)).toEqual({ ok: true, edit: {} });
    // Goal closed (its contributions gone), expense kept: only the expense follows.
    const closed = coveredLinkOf(w.debt, [w.debt], [], w.transactions, [GOAL]);
    const plan = coveredEdit(w.debt, form(w.debt, { amount: 500 }), closed);
    expect(plan).toEqual({ ok: true, edit: { expense: { id: "e1", set: { amount: 500 } } } });
  });
});

describe("the rest of the Debts page on a covered debt", () => {
  it("a repayment leaves the goal funded and the mark shows what is still owed", () => {
    const w = world();
    const payment: DebtPayment = { id: "p1", userId: "u", debtId: "d1", amount: 200, date: new Date(2026, 10, 5), accountId: "eurobank", createdAt: DAY };
    const { goal, debt } = reconcile(w, [payment]);
    expect(goal.totalSaved).toBe(700);
    expect(debt.remaining).toBe(350);
    // The 200 leaves his card as a repayment, not as spending: the expense is not doubled.
    const records = debtCashRecords(debt).records;
    expect(records.find((r) => r.debtPart === "principal")).toMatchObject({ amount: 200, accountId: "eurobank", type: "expense" });
    expect(records.filter((r) => r.debtPart !== "loan" && r.debtPart !== "principal")).toEqual([]);
  });

  it("forgiven: nothing owed, the goal still funded, the expense and the loan still cancel", () => {
    const w = world();
    const open = computeDebtStatus(w.debt, []);
    const forgiven = { ...w, debt: { ...w.debt, forgiven: forgiveness(open, new Date(2026, 10, 1), "δώρο") } };
    const { goal, debt } = reconcile(forgiven);
    expect(debt.isSettled).toBe(true);
    expect(debt.remaining).toBe(0);
    expect(goal.totalSaved).toBe(700);
  });
});

describe("two friends who paid on the same day — debts written before the link existed", () => {
  // Nikos and Maria paid 100 each for the trip on the 20th. Neither debt names
  // its expense; the two expenses are alike in everything.
  const pair = () => {
    const make = (id: string, who: string, expenseId: string) => {
      const vars = coveredFundingVars({ goal: GOAL, who, amount: 100, date: DAY, categoryId: "travel", notes: `Πλήρωσε: ${who}`, expenseNotes: `Πλήρωσε: ${who} · χρέος` });
      return {
        debt: { ...vars.debt, id, userId: "u", createdAt: DAY, updatedAt: DAY } as Debt,
        contribution: { ...vars.contribution, id: `c-${id}`, userId: "u", debtId: id, createdAt: DAY, updatedAt: DAY } as InvestmentContribution,
        expense: { ...vars.expense, id: expenseId, userId: "u", createdAt: DAY, updatedAt: DAY } as Transaction,
      };
    };
    const nikos = make("dn", "Νίκος", "X");
    const maria = make("dm", "Μαρία", "Y");
    const own: InvestmentContribution = { id: "own", userId: "u", goalId: "ski", amount: 150, contributionType: "deposit", date: DAY, createdAt: DAY, updatedAt: DAY };
    return { debts: [nikos.debt, maria.debt], contributions: [own, nikos.contribution, maria.contribution], transactions: [nikos.expense, maria.expense] };
  };
  const linkOf = (s: ReturnType<typeof pair>, id: string) => coveredLinkOf(s.debts.find((d) => d.id === id)!, s.debts, s.contributions, s.transactions, [GOAL]);

  it("each debt gets its own expense, in one fixed order, never the same one", () => {
    const s = pair();
    const ids = [linkOf(s, "dn")?.expense?.id, linkOf(s, "dm")?.expense?.id];
    expect(new Set(ids).size).toBe(2);
    // Asked in either order, the answer is the same.
    expect(coveredExpenses([...s.debts].reverse(), s.transactions, () => GOAL.name)).toEqual(coveredExpenses(s.debts, s.transactions, () => GOAL.name));
  });

  it("edit Maria, then delete Nikos: each touches only its own expense, and the totals reconcile", () => {
    let s = pair();
    // Maria's 100 was really 80.
    const maria = s.debts.find((d) => d.id === "dm")!;
    const mLink = linkOf(s, "dm")!;
    const next = form(maria, { amount: 80 });
    const plan = coveredEdit(maria, next, mLink);
    if (!plan.ok) throw new Error("refused");
    expect(plan.edit.coveredExpenseId).toBe(mLink.expense!.id);
    s = {
      debts: s.debts.map((d) => (d.id === "dm" ? { ...d, ...next, coveredExpenseId: plan.edit.coveredExpenseId } : d)),
      contributions: s.contributions.map((c) => (c.id === plan.edit.contribution?.id ? { ...c, ...plan.edit.contribution.set } : c)),
      transactions: s.transactions.map((t) => (t.id === plan.edit.expense?.id ? { ...t, ...plan.edit.expense.set } : t)),
    };

    // Nikos is deleted: the delete names his deposit and an expense that is not Maria's.
    const nLink = linkOf(s, "dn")!;
    expect(nLink.expense!.id).not.toBe(plan.edit.coveredExpenseId);
    expect(nLink.expense!.amount).toBe(100);
    s = {
      debts: s.debts.filter((d) => d.id !== "dn"),
      contributions: s.contributions.filter((c) => c.id !== nLink.contribution!.id),
      transactions: s.transactions.filter((t) => t.id !== nLink.expense!.id),
    };

    // What is left says one thing: Maria 80, three ways.
    const goal = computeGoalStats(GOAL, s.contributions);
    expect(goal.totalSaved).toBe(150 + 80);
    expect(goal.covered).toEqual([{ person: "Μαρία", amount: 80, debtIds: ["dm"] }]);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0]).toMatchObject({ id: plan.edit.coveredExpenseId, amount: 80 });
    // And Maria's debt still finds that one expense.
    expect(linkOf(s, "dm")?.expense?.id).toBe(s.transactions[0].id);
  });

  it("an expense one debt names is never matched to another, even one that looks just like it", () => {
    const s = pair();
    // Maria names Y. Nikos, unnamed, may only have X — and once X is gone, nothing.
    s.debts[1] = { ...s.debts[1], coveredExpenseId: "Y" };
    expect(linkOf(s, "dn")?.expense?.id).toBe("X");
    const noX = { ...s, transactions: s.transactions.filter((t) => t.id !== "X") };
    expect(linkOf(noX, "dn")?.expense).toBeUndefined();
    expect(linkOf(noX, "dm")?.expense?.id).toBe("Y");
  });

  it("a debt whose named expense is gone falls back to its figures, among the unclaimed only", () => {
    const s = pair();
    s.debts[0] = { ...s.debts[0], coveredExpenseId: "deleted-long-ago" };
    s.debts[1] = { ...s.debts[1], coveredExpenseId: "Y" };
    const link = linkOf(s, "dn")!;
    expect(link.expense?.id).toBe("X");
    // Found by its figures: the right id is written on the debt with the next save.
    expect(link.expenseUnnamed).toBe(true);
  });
});

describe("names in notes", () => {
  it("are swapped literally, whatever characters the new name has", () => {
    expect(renamedIn("Paid by Nikos", "Nikos", "A$&B $1")).toBe("Paid by A$&B $1");
  });

  it("are not renamed twice when the new name contains the old one", () => {
    expect(renamedIn("Πλήρωσε: Νίκος", ["Νίκος", "Νίκος"], "Νίκος Παπάς")).toBe("Πλήρωσε: Νίκος Παπάς");
  });

  it("the expense's note follows from the debt's own person, though the deposit was renamed already", () => {
    const w = world();
    // An earlier save renamed the deposit to «Γιώργος»; the expense still says «Νίκος», as does the debt.
    const contributions = w.contributions.map((c) => (c.id === "c1" ? { ...c, coveredBy: "Γιώργος", notes: "Πλήρωσε: Γιώργος" } : c));
    const plan = coveredEdit(w.debt, form(w.debt, { person: "Γιώργος" }), coveredLinkOf(w.debt, [w.debt], contributions, w.transactions, [GOAL]));
    expect(plan.ok && plan.edit.expense?.set.notes).toBe("Πλήρωσε: Γιώργος · χρέος");
    expect(plan.ok && plan.edit.contribution).toBeUndefined();
  });
});

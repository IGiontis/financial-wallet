import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { GoalDeleteModal } from "./GoalDeleteModal";
import type { InvestmentGoalWithStats, Transaction } from "../../../shared/types/IndexTypes";
import { expectNoErrors } from "../../../test/noEarlyErrors";

// Deleting a goal with money in it: what became of the money, then a check —
// card by card — then delete. The owner's case: 500 of the trip handed to
// Athanasia from Eurobank, 200 kept in his own bank (Revolut).

// What someone paid of a goal is read from its loans (`useGoalLoans`); none of these goals has any open.
const debtList = vi.hoisted(() => ({ data: [] as unknown[], loading: false }));
vi.mock("../useGoalLoans", () => ({ useGoalLoans: () => ({ debts: debtList.data, loading: debtList.loading }) }));
vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
// The picker stands in as one card; its own error (item 97a) shows when the form says the step was tried.
vi.mock("../../accounts/AccountPicker", () => ({
  default: ({ onChoose, invalid }: { onChoose: (id: string) => void; invalid?: boolean }) => (
    <>
      <button type="button" onClick={() => onChoose("revolut")}>
        Revolut
      </button>
      {invalid && <p>card required</p>}
    </>
  ),
}));
const store = vi.hoisted(() => ({ transactions: [] as unknown[] }));
vi.mock("../../accounts/useMoneyAccounts", () => {
  const accounts = [
    { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
    { id: "revolut", name: "Revolut", kind: "bank" },
  ];
  // Read before either deposit.
  const latest = { at: new Date(2026, 9, 14), checkIn: { id: "c", at: new Date(2026, 9, 14).toISOString(), amounts: { eurobank: 2000, revolut: 900 } } };
  return { useMoneyAccounts: () => ({ accounts, latest, transactions: store.transactions }) };
});
vi.mock("../../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: [{ id: "other", name: "Other Expense", type: "expense", icon: "🧾", isDefault: true, userId: null }] }),
  useCreateCategoryScope: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const day = new Date(2026, 9, 15, 10);
const mirror = (id: string, amount: number, accountId: string, heldBy?: string) =>
  ({ id, userId: "u", type: "investment", amount, categoryId: "", description: "Trip", date: day, createdAt: day, updatedAt: day, isInvestmentTransaction: true, isGoalTransaction: true, goalId: "trip", goalName: "Trip", contributionType: "deposit", accountId, heldBy }) as Transaction;

const goal = (totalSaved: number) => ({ id: "trip", name: "Trip", icon: "✈️", totalSaved }) as unknown as InvestmentGoalWithStats;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  debtList.data = [];
  debtList.loading = false;
  store.transactions = [mirror("m1", 500, "eurobank", "Athanasia"), mirror("m2", 200, "revolut")];
});

const next = () => userEvent.click(screen.getByRole("button", { name: /Next/ }));
const check = () => screen.getByRole("group", { name: "What will happen" });

describe("deleting a goal", () => {
  it("with nothing in it, just asks to delete", async () => {
    store.transactions = [];
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(0)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    expect(screen.queryByRole("radio")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  it("with money in it, says who holds what and waits for an answer", async () => {
    render(<GoalDeleteModal goal={goal(700)} isDeleting={false} onConfirm={vi.fn()} onClose={() => {}} />);
    // Item 97b: nothing red before an answer was asked for — nor once «spent» opens its card question.
    expectNoErrors(screen.getByRole("dialog"));
    expect(screen.getByText(/€500.00 held by Athanasia/)).toHaveTextContent("€200.00 in your bank");
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    await next();
    expect(screen.getByText("Choose what became of the money")).toBeInTheDocument();
    // A new answer opens fresh: its own card question is not wrong yet.
    await userEvent.click(screen.getByRole("radio", { name: /money was spent/ }));
    expect(screen.queryByText("Choose what became of the money")).toBeNull();
    expect(screen.queryByText("card required")).toBeNull();
  });

  it("given up on: Athanasia gives back 500 into Eurobank, the 200 is freed — then delete", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(700)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /not doing it/ }));
    await next();
    expect(onConfirm).not.toHaveBeenCalled();

    expect(check()).toHaveTextContent("Athanasia gives back€500.00");
    // Eurobank went down 500 when it was handed over (2.000 → 1.500); it comes back.
    expect(check()).toHaveTextContent("€1500.00 → €2000.00");
    // Spendable: 2.400 in the banks, 200 of it set aside — plus the goal's 700.
    expect(check()).toHaveTextContent("€2200.00 → €2900.00");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  it("done: Eurobank does not go down again; only Revolut's 200 leaves — then the closing records", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(700)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /money was spent/ }));
    await next();
    // A card is asked for the bank's part only.
    expect(screen.getByText("card required")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revolut" }));
    await next();

    expect(check()).toHaveTextContent("Athanasia already had it");
    expect(check()).toHaveTextContent("€900.00 → €700.00");
    expect(check()).toHaveTextContent("stays €2200.00");

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete & record the expense" }));
    const { close } = onConfirm.mock.calls[0][0];
    const expenses = close.filter((r: { type: string }) => r.type === "expense");
    expect(expenses.map((e: { amount: number; accountId?: string }) => [e.amount, e.accountId])).toEqual([
      [500, "eurobank"],
      [200, "revolut"],
    ]);
  });
});

// 200 of his own in Revolut, 550 paid by Nikos: the 550 was never set aside, so
// giving the goal up frees the 200 and no more, and closing it spends the 200.
describe("deleting a goal someone else paid part of", () => {
  const covered = () => ({ ...goal(750), totalCovered: 550, covered: [{ person: "Nikos", amount: 550, debtIds: ["d1"] }] }) as unknown as InvestmentGoalWithStats;
  beforeEach(() => {
    store.transactions = [mirror("m2", 200, "revolut")];
  });

  it("given up on: only his own 200 comes back to spendable", async () => {
    render(<GoalDeleteModal goal={covered()} isDeleting={false} onConfirm={vi.fn()} onClose={() => {}} />);
    // The choice says the 200, not the 750.
    expect(screen.getByRole("radio", { name: /not doing it/ })).toHaveTextContent("€200.00");
    await userEvent.click(screen.getByRole("radio", { name: /not doing it/ }));
    await next();
    // 2.900 in the banks, 200 of it set aside: 2.700 → 2.900 — the banks' whole total, as it must be once nothing is set aside.
    expect(check()).toHaveTextContent("€2700.00 → €2900.00");
  });

  it("done: the 200 leaves Revolut, and that is the only expense", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={covered()} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /money was spent/ }));
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Revolut" }));
    await next();
    expect(check()).toHaveTextContent("€900.00 → €700.00");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete & record the expense" }));
    const { close } = onConfirm.mock.calls[0][0];
    expect(close.filter((r: { type: string }) => r.type === "expense").map((e: { amount: number }) => e.amount)).toEqual([200]);
  });
});

describe("deleting a goal someone else paid for", () => {
  // The ski trip: Keki paid the hotel, 180 €, and the hotel refunded him in full.
  const covered = { id: "ski", name: "Ski", icon: "🎿", totalSaved: 180, totalCovered: 180, covered: [{ person: "Keki", amount: 180, debtIds: ["d1"] }] } as unknown as InvestmentGoalWithStats;
  const expense = { id: "e1", userId: "u", type: "expense", amount: 180, categoryId: "other", description: "Ski", date: day, createdAt: day, updatedAt: day } as Transaction;

  beforeEach(() => {
    store.transactions = [expense];
    debtList.data = [{ id: "d1", person: "Keki", direction: "owed_by_me", label: "Ski", amount: 180, date: day, payments: [], paid: 0, remaining: 180, isSettled: false, coveredExpenseId: "e1" }];
  });

  it("asks what became of Keki's 180, and nothing of money of his own he never put in", () => {
    render(<GoalDeleteModal goal={covered} isDeleting={false} onConfirm={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText("What became of the €180.00 Keki paid?")).toBeInTheDocument();
    // The old question about his own money, at 0,00 €, is gone.
    expect(screen.queryByText(/What became of the €180.00 of the goal/)).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("owed no more: the debt and its expense are erased, said before it is done", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={covered} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    // Nothing picked for him: this answer moves money off the books.
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    await userEvent.click(screen.getByRole("radio", { name: /I owe nothing — erase it/ }));
    await next();
    expect(check()).toHaveTextContent("Debt · Keki · €180.00erased");
    expect(check()).toHaveTextContent("Expense €180.00erased");
    // No money of his own: nothing was asked of it, and spendable does not move.
    expect(check()).not.toHaveTextContent("Spendable");
    expect(screen.queryByText("Choice")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({ erase: [{ debtId: "d1", expenseId: "e1" }], erasedNames: ["Keki"] });
  });

  it("still owed: the debt and the expense stay, and nothing is erased", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={covered} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /I still owe it/ }));
    await next();
    expect(check()).toHaveTextContent("Debt · Keki · €180.00stays — you still owe it");
    expect(check()).toHaveTextContent("Expense €180.00stays");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({ keptNames: ["Keki"] });
  });

  it("asks nothing and deletes nothing until its loans are known (the owner's report, 2026-11-12)", async () => {
    debtList.data = [];
    debtList.loading = true;
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={covered} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    // Still reading: no question, no way past it.
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// He asked for 2+ loans on one goal (2026-11-12). The trip, 1.000 €: 200 of his
// own in Revolut; Nikos paid 300 (1 Nov) and again 100 (5 Nov, typed twice by
// mistake); Maria paid 250 (refunded by the hotel); Giorgos paid 150 and has had
// 50 back already. 200 + 300 + 100 + 250 + 150 = 1.000.
describe("deleting a goal with several loans", () => {
  const on = (d: number) => new Date(2026, 10, d, 10);
  const loan = (id: string, person: string, amount: number, d: number, paid = 0) => ({
    id,
    person,
    direction: "owed_by_me",
    label: "Trip",
    amount,
    date: on(d),
    payments: paid ? [{ id: `p-${id}`, debtId: id, amount: paid, date: on(d + 2) }] : [],
    paid,
    remaining: amount - paid,
    isSettled: false,
    forGoalId: "trip",
    coveredExpenseId: `e-${id}`,
  });
  const spent = (id: string, amount: number, d: number) => ({ id, userId: "u", type: "expense", amount, categoryId: "other", description: "Trip", date: on(d), createdAt: on(d), updatedAt: on(d) }) as Transaction;
  const trip = {
    ...goal(1000),
    totalCovered: 800,
    covered: [
      { person: "Nikos", amount: 400, debtIds: ["n1", "n2"] },
      { person: "Maria", amount: 250, debtIds: ["m1"] },
      { person: "Giorgos", amount: 150, debtIds: ["g1"] },
    ],
  } as unknown as InvestmentGoalWithStats;

  beforeEach(() => {
    debtList.data = [loan("n1", "Nikos", 300, 1), loan("n2", "Nikos", 100, 5), loan("m1", "Maria", 250, 3), loan("g1", "Giorgos", 150, 4, 50)];
    // Each loan's record on the main account (+) beside its expense (−), and Giorgos' 50 back from Revolut — as `debtCashRecords` writes them.
    const cash = (id: string, debtId: string, type: "income" | "expense", amount: number, d: number, debtPart: string, accountId?: string) =>
      ({ id, userId: "u", type, amount, categoryId: "debt", description: "Trip", date: on(d), createdAt: on(d), updatedAt: on(d), debtId, debtPart, accountId }) as Transaction;
    store.transactions = [
      mirror("m2", 200, "revolut"),
      ...[["n1", 300, 1], ["n2", 100, 5], ["m1", 250, 3], ["g1", 150, 4]].flatMap(([id, amount, d]) => [spent(`e-${id}`, amount as number, d as number), cash(`debt_${id}`, id as string, "income", amount as number, d as number, "loan")]),
      cash("debtpay_p-g1", "g1", "expense", 50, 6, "principal", "revolut"),
    ];
  });

  it("asks per loan — Nikos twice, each with its day — and says Giorgos' stays, with what was paid back", () => {
    render(<GoalDeleteModal goal={trip} isDeleting={false} onConfirm={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText("What became of the €300.00 Nikos paid on 1 Nov?")).toBeInTheDocument();
    expect(screen.getByText("What became of the €100.00 Nikos paid on 5 Nov?")).toBeInTheDocument();
    expect(screen.getByText("What became of the €250.00 Maria paid?")).toBeInTheDocument();
    // Giorgos: 150 − 50 = 100 left; not asked — erasing it would erase a repayment that moved a card.
    expect(screen.queryByText(/Giorgos paid\?/)).toBeNull();
    expect(screen.getByText(/Giorgos paid €150.00 and you've already paid back €50.00: the debt \(€100.00 left\)/)).toBeInTheDocument();
    // Three loans × two answers + his own money's two.
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    expect(screen.getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("one kept, two erased, one repaid: the review lists each with its amount, and only the two erased are sent", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={trip} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    const answer = (question: string, choice: RegExp) => userEvent.click(within(screen.getByRole("radiogroup", { name: question })).getByRole("radio", { name: choice }));
    await answer("What became of the €300.00 Nikos paid on 1 Nov?", /I still owe it/);
    await answer("What became of the €100.00 Nikos paid on 5 Nov?", /I owe nothing/);
    // Not all answered yet: no way on.
    await next();
    expect(screen.getAllByText("Choose what became of the money").length).toBeGreaterThan(0);
    await answer("What became of the €250.00 Maria paid?", /I owe nothing/);
    await userEvent.click(screen.getByRole("radio", { name: /not doing it/ }));
    await next();

    const review = check();
    expect(review).toHaveTextContent("Debt · Nikos · €300.00stays — you still owe it");
    expect(review).toHaveTextContent("Debt · Nikos · €100.00erased");
    expect(review).toHaveTextContent("Debt · Maria · €250.00erased");
    expect(review).toHaveTextContent("Debt · Giorgos · €100.00stays — you owe the rest");
    // By hand: Eurobank 2.000 + 800 (loan records) − 800 (expenses) = 2.000; Revolut 900 − 50 (Giorgos) = 850;
    // 2.850 in the banks, 200 of it set aside → spendable 2.650; giving the goal up frees his 200 → 2.850.
    // The loans add nothing: each expense and its loan record cancel on the main account, erased or kept.
    expect(review).toHaveTextContent("€2650.00 → €2850.00");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      erase: [
        { debtId: "m1", expenseId: "e-m1" },
        { debtId: "n2", expenseId: "e-n2" },
      ],
      erasedNames: ["Maria", "Nikos"],
      keptNames: ["Nikos", "Giorgos"],
    });
    // A second way: what is erased plus what stays is every loan, each once — 100 + 250 + 300 + 150 = 800 covered.
    const { erase } = onConfirm.mock.calls[0][0];
    expect(erase.map((e: { debtId: string }) => e.debtId).sort()).toEqual(["m1", "n2"]);
    expect([100, 250, 300, 150].reduce((a, b) => a + b, 0)).toBe(trip.totalCovered);
  });
});

// The owner's report (2026-11-12): «delete goal» pressed again while the first
// delete was still running → an error, although the goal was gone. The second
// press sent a second batch naming what the first had deleted, and the live
// rules refused it (firestore.test.ts, "run twice").
describe("while the delete runs", () => {
  it("runs once however fast it is pressed, says it is working, and cannot be closed", async () => {
    store.transactions = [];
    let answer!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (answer = resolve)));
    const onClose = vi.fn();
    render(<GoalDeleteModal goal={goal(0)} isDeleting={false} onConfirm={onConfirm} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    const del = within(dialog).getByRole("button", { name: "Delete" });

    act(() => {
      fireEvent.click(del);
      fireEvent.click(del);
    });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    // No ✕, and Esc does nothing.
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape", keyCode: 27 });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => answer());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("free again once the answer is in — a failure leaves it there to try again", async () => {
    store.transactions = [];
    let refuse!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (refuse = resolve)));
    render(<GoalDeleteModal goal={goal(0)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    // The page's handler toasts the failure and resolves; the dialog stays.
    await act(async () => refuse());
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});

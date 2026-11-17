import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { DebtPersonPage } from "./DebtPersonPage";
import { personKey, personPath } from "./debtSides";
import { computeDebtStatus, debtsByPerson, loanSplits, loanState } from "./debtsUtils";
import type { Debt, DebtPayment, DebtWithStatus } from "../../shared/types/IndexTypes";

// One person's debts on a page of their own (`/debts/person/:key`).
//
// What is checked is what can go wrong with money on this sheet: the right loan
// in front, payments newest first with the loan's own split of each one, a
// payment button that fills in the figure actually due, a correction that
// writes what was typed, a delete that only happens once a payment has been
// opened, and a delete that cannot happen offline.

const spies = vi.hoisted(() => ({
  record: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  removeDebt: vi.fn(),
  editDebt: vi.fn(),
  createDebt: vi.fn(),
  removeClosed: vi.fn(),
}));

// The card picker reads the accounts; which card is chosen is not what these check.
vi.mock("../accounts/AccountPicker", () => ({ default: () => null }));
// The accounts a payment names; empty unless a test fills it.
const accounts = vi.hoisted(() => ({ list: [] as { id: string; name: string; kind: "bank" | "cash"; main?: boolean }[] }));
vi.mock("../accounts/useMoneyAccounts", () => ({ useAccountList: () => accounts.list }));
// The new-loan form can send borrowed money to a goal; none here.
vi.mock("../budget/useInvestments", () => ({ useInvestmentGoals: () => ({ data: [] }) }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCategories: () => ({ data: [] }), useTransactions: () => ({ data: [] }) }));
vi.mock("../budget/useCoveredFunding", () => ({ useCoveredFunding: () => ({ mutate: vi.fn() }) }));
// None of these loans paid part of a goal.
vi.mock("../budget/useCoveredLink", () => ({ useCoveredLink: () => ({ link: undefined, goalName: undefined, ready: true }) }));
// The debts the page reads: the list the device holds (`useDebts`), filled by each test.
const store = vi.hoisted(() => ({ debts: [] as unknown[] }));
vi.mock("../../shared/hooks/usePageAdd", () => ({ usePageAdd: () => {} }));
vi.mock("./useDebts", () => ({
  useDebts: () => ({ data: store.debts, isLoading: false, isSuccess: true, isFetching: false }),
  useDeleteClosedDebts: () => ({ mutate: spies.removeClosed, mutateAsync: async (...args: unknown[]) => (spies.removeClosed(...(args as [never])), { debtIds: (args[0] as string[]) ?? [], paymentIds: [], keptTransactionIds: [], unlinkedContributionIds: [], skipped: [] }), isPending: false }),
  useRecordRepayment: () => ({ mutate: spies.record, mutateAsync: async (...args: unknown[]) => (spies.record(...(args as [never])), undefined), isPending: false }),
  useUpdateRepayment: () => ({ mutate: spies.update, mutateAsync: async (...args: unknown[]) => (spies.update(...(args as [never])), undefined), isPending: false }),
  useDeleteRepayment: () => ({ mutate: spies.remove, mutateAsync: async (...args: unknown[]) => (spies.remove(...(args as [never])), undefined), isPending: false }),
  useDeleteDebt: () => ({ mutate: spies.removeDebt, mutateAsync: async (...args: unknown[]) => (spies.removeDebt(...(args as [never])), undefined), isPending: false }),
  useUpdateDebt: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), isPending: false }),
  useEditDebt: () => ({ mutate: spies.editDebt, mutateAsync: async (...args: unknown[]) => (spies.editDebt(...(args as [never])), undefined), isPending: false }),
  useCreateDebt: () => ({ mutate: spies.createDebt, mutateAsync: async (...args: unknown[]) => (spies.createDebt(...(args as [never])), "new-debt"), isPending: false }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }),
}));

const fmt = (n: number) => `€${n.toFixed(2)}`;
const pay = (id: string, debtId: string, amount: number, date: Date): DebtPayment => ({ id, userId: "u1", debtId, amount, date, createdAt: date });

const rent: Debt = {
  id: "rent",
  userId: "u1",
  person: "Nikos",
  direction: "owed_by_me",
  label: "March rent",
  amount: 500,
  date: new Date(2026, 2, 3),
  createdAt: new Date(2026, 2, 3),
  updatedAt: new Date(2026, 2, 3),
};

const car: Debt = {
  id: "car",
  userId: "u1",
  person: "Nikos",
  direction: "owed_by_me",
  label: "Car",
  amount: 6000,
  date: new Date(2026, 0, 10),
  interestRate: 7,
  termMonths: 36,
  createdAt: new Date(2026, 0, 10),
  updatedAt: new Date(2026, 0, 10),
};

// Settled, and the newest of the three: left to the list, it would open the sheet.
const concert: Debt = { ...rent, id: "concert", label: "Concert tickets", amount: 60, date: new Date(2026, 5, 1) };

// Stored newest first, the way the query hands them over.
const payments: DebtPayment[] = [
  pay("r2", "rent", 80, new Date(2026, 4, 2)),
  pay("r1", "rent", 120, new Date(2026, 3, 10)),
  pay("c3", "car", 185.26, new Date(2026, 3, 10)),
  pay("c2", "car", 185.26, new Date(2026, 2, 10)),
  pay("c1", "car", 185.26, new Date(2026, 1, 10)),
  pay("t1", "concert", 60, new Date(2026, 5, 20)),
];

const nikos = (debts: Debt[] = [concert, car, rent]) => debtsByPerson(debts.map((d) => computeDebtStatus(d, payments)))[0];

/** The page at an address, with the list it goes back to. */
const renderStatuses = (list: DebtWithStatus[], at = personPath("Nikos")) => {
  store.debts = list;
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/debts" element={<div>the list</div>} />
        <Route path="/debts/person/:key" element={<DebtPersonPage />} />
        <Route path="/debts/loan/:id" element={<DebtPersonPage />} />
      </Routes>
    </MemoryRouter>,
  );
};
const renderSheet = (debts?: Debt[], at?: string) => renderStatuses(nikos(debts).debts, at);
const payRows = () => within(screen.getByRole("list", { name: "Payments" })).getAllByRole("listitem").map((row) => row.textContent ?? "");

beforeAll(async () => {
  // jsdom has no matchMedia; the name field asks it whether the screen is narrow.
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  Object.values(spies).forEach((spy) => spy.mockReset());
  accounts.list = [];
  // Every figure in sight unless a test says otherwise — «Αναλυτικό».
  localStorage.clear();
  localStorage.setItem("density:debts-person", JSON.stringify("detailed"));
});

afterEach(() => {
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("the payments tab", () => {
  it("lists payments newest first and ends where the loan began", async () => {
    renderSheet([rent]);

    const rows = payRows();
    expect(rows[0]).toMatch(/2 May.*€80\.00/);
    expect(rows[1]).toMatch(/10 Apr.*€120\.00/);
    expect(rows[2]).toMatch(/You took.*€500\.00/);
  });

  it("splits a loan payment into what came off the debt and the interest, as the loan maths does", () => {
    renderSheet([car]);
    const debt = nikos([car]).debts[0];
    const split = loanSplits(debt)!.get("c3")!;

    // The newest payment, read off the screen and off the maths separately.
    expect(payRows()[0]).toContain(`${fmt(split.principal)} off the debt · ${fmt(split.interest)} interest`);
    expect(Math.round((split.principal + split.interest) * 100)).toBe(18526);
  });

  it("does not split money between people, which carries no interest", () => {
    renderSheet([rent]);

    expect(payRows().join(" ")).not.toMatch(/interest/);
  });
});

describe("recording a payment", () => {
  // The wizard is a dialog of its own, over the sheet.
  const wizard = () => screen.getAllByRole("dialog").at(-1)!;
  const next = () => userEvent.click(within(wizard()).getByRole("button", { name: /Next/ }));
  // «Did money move?» starts unanswered (no prefill): answered «Yes» here.
  const moneyMoved = () => userEvent.click(within(wizard()).getByRole("radio", { name: /^Yes,/ }));
  // WHERE before HOW MUCH: the card is the first step; «Yes» there, then on to the amount.
  const toAmount = async () => {
    await moneyMoved();
    await next();
  };

  it("offers the month's payment on a loan, and fills it in", async () => {
    renderSheet([car]);
    const instalment = loanState(nikos([car]).debts[0])!.instalment;
    expect(instalment).toBe(185.26);

    await userEvent.click(screen.getByRole("button", { name: "Pay back €185.26" }));
    await toAmount();
    expect(within(wizard()).getByLabelText("Amount")).toHaveValue(185.26);
    await next();
    await next();
    await userEvent.click(within(wizard()).getByRole("button", { name: "Save" }));

    expect(spies.record).toHaveBeenCalledWith(expect.objectContaining({ debtId: "car", amount: 185.26, accountId: "" }));
  });

  it("offers what is left between people, dated today", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Pay back" }));
    await toAmount();
    expect(within(wizard()).getByLabelText("Amount")).toHaveValue(300);
    await next();
    await next();
    await userEvent.click(within(wizard()).getByRole("button", { name: "Save" }));

    const [vars] = spies.record.mock.calls[0];
    expect(vars).toMatchObject({ debtId: "rent", amount: 300 });
    const now = new Date();
    expect([vars.date.getFullYear(), vars.date.getMonth(), vars.date.getDate()]).toEqual([now.getFullYear(), now.getMonth(), now.getDate()]);
  });

  it("has no Save until the check, the fourth step", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Pay back" }));
    expect(within(wizard()).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    // The card first: no amount field yet.
    expect(within(wizard()).queryByLabelText("Amount")).not.toBeInTheDocument();
    await toAmount();
    await next();
    expect(within(wizard()).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await next();
    expect(within(wizard()).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(spies.record).not.toHaveBeenCalled();
  });

  it("will not leave the amount with nothing or zero in it", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Pay back" }));
    await toAmount();
    await userEvent.clear(within(wizard()).getByLabelText("Amount"));
    await userEvent.type(within(wizard()).getByLabelText("Amount"), "0");
    await next();

    expect(within(wizard()).getByLabelText("Amount")).toBeInvalid();
    expect(within(wizard()).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("says at the check what is left once it is paid — and when it clears the debt", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Pay back" }));
    await toAmount();
    await userEvent.clear(within(wizard()).getByLabelText("Amount"));
    await userEvent.type(within(wizard()).getByLabelText("Amount"), "100");
    await next();
    await next();

    // 300 was left of the 500 after the two payments; 100 more leaves 200.
    const effect = within(wizard()).getByRole("group", { name: "What changes" });
    expect(effect).toHaveTextContent("Owed now€300.00");
    expect(effect).toHaveTextContent("Owed after€200.00 left");
    expect(effect).not.toHaveTextContent("interest");

    // The rail and the row of the check both lead back to the amount.
    await userEvent.click(within(wizard()).getAllByRole("button", { name: /Amount/ })[0]);
    await userEvent.clear(within(wizard()).getByLabelText("Amount"));
    await userEvent.type(within(wizard()).getByLabelText("Amount"), "300");
    await next();
    await next();
    expect(within(wizard()).getByRole("group", { name: "What changes" })).toHaveTextContent("Owed afterPaid off");
  });

  it("splits a loan payment into interest and debt at the check, adding up to the payment", async () => {
    renderSheet([car]);

    await userEvent.click(screen.getByRole("button", { name: "Pay back €185.26" }));
    await toAmount();
    await next();
    await next();

    const effect = within(wizard()).getByRole("group", { name: "What changes" });
    expect(effect).toHaveTextContent("Goes to interest");
    expect(effect).toHaveTextContent("Goes to the debt");
    const cents = (label: string) => Number((effect.textContent!.match(new RegExp(label + "€([0-9.]+)")) ?? [])[1]);
    expect(Math.round((cents("Goes to interest") + cents("Goes to the debt")) * 100) / 100).toBe(185.26);
  });

  it("has nothing to pay on a loan already settled", () => {
    renderSheet([concert]);

    expect(screen.queryByRole("button", { name: /^Pay|^Payment/ })).not.toBeInTheDocument();
  });
});

describe("correcting a payment", () => {
  it("opens with the payment's own figure and day", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: /2 May.*€80\.00/ }));

    expect(screen.getByLabelText("Amount")).toHaveValue(80);
    // The app's calendar field, showing the payment's own day.
    expect(screen.getByLabelText("When")).toHaveTextContent("02 May 2026");
  });

  it("saves the figure and the day that were typed", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: /2 May.*€80\.00/ }));

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "90");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const [vars] = spies.update.mock.calls[0];
    expect(vars).toMatchObject({ paymentId: "r2", amount: 90 });
    // The local calendar day — 2 May, not 1 May at 21:00 UTC.
    expect([vars.date.getFullYear(), vars.date.getMonth(), vars.date.getDate()]).toEqual([2026, 4, 2]);
    expect(spies.record).not.toHaveBeenCalled();
  });

  it("No change, no Save: opened as it is, Save is off with the hint; 80 as 80.00 is no change; 85 is; back to 80 is none", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: /2 May.*€80\.00/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Nothing has changed")).toBeInTheDocument();

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "80.00");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.clear(amount);
    await userEvent.type(amount, "85");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await userEvent.clear(amount);
    await userEvent.type(amount, "80");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.update).not.toHaveBeenCalled();
  });

  it("refuses a zero", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: /2 May.*€80\.00/ }));

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "0");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("deletes only from inside the opened payment", async () => {
    renderSheet([rent]);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /10 Apr.*€120\.00/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    // Not on one tap: it asks first, and only the red button in the question deletes.
    expect(spies.remove).not.toHaveBeenCalled();
    const question = screen.getByText("Delete?").closest(".modal-content") as HTMLElement;
    await userEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(spies.remove).toHaveBeenCalledWith({ paymentId: "r1", debtId: "rent" });
  });
});

describe("the rest of the loan, on the one page", () => {
  it("asks 'what if' only of a loan, where paying more changes something", async () => {
    renderSheet([rent]);
    expect(screen.queryByText("What if…")).not.toBeInTheDocument();
  });

  it("opens the pay-more question on a loan", async () => {
    renderSheet([car]);

    await userEvent.click(screen.getByText("What if…"));

    expect(screen.getByText("Pay extra each month")).toBeInTheDocument();
  });

  it("opens the loan form filled in, to correct the loan", async () => {
    renderSheet([rent]);

    // «Αλλαγή στοιχείων» is under «Ενέργειες», a step of the same dialog.
    await userEvent.click(screen.getByRole("button", { name: "Actions — March rent" }));
    await userEvent.click(screen.getByRole("button", { name: "Change details" }));

    await screen.findAllByText("Edit loan");
    const form = screen.getAllByRole("dialog").find((d) => within(d).queryByDisplayValue("March rent"))!;
    // The amount is on the money step, after the card.
    await userEvent.click(within(form).getByRole("button", { name: /^2\s*Money/ }));
    expect(within(form).getByPlaceholderText("0")).toHaveValue(500);
  });

  it("will not delete a loan offline", async () => {
    renderSheet([rent]);

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await userEvent.click(screen.getByRole("button", { name: "Actions — March rent" }));
    expect(screen.getByRole("button", { name: /Delete loan/ })).toBeDisabled();
  });
});

describe("a new loan from the sheet", () => {
  it("starts it with the same person", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "New loan" }));

    await screen.findByText("Record a loan");
    expect(screen.getByDisplayValue("Nikos")).toBeInTheDocument();
  });
});

describe("the receipt", () => {
  /** A receipt line's amount, by its label, as a signed number. */
  const line = (label: RegExp | string) => {
    const text = screen.getByText(label).parentElement!.lastElementChild!.textContent!;
    return (text.startsWith("−") ? -1 : 1) * Number(text.replace(/[^\d.]/g, ""));
  };
  const left = () => Number(document.querySelector("[class*=_receiptTotal_]")!.lastElementChild!.textContent!.replace(/[^\d.]/g, ""));

  it("between people: started with, less what came back, is what is left — and no interest line", () => {
    renderSheet([rent]);

    expect(line(/^You took, /)).toBe(500);
    expect(line("You paid back")).toBe(-200);
    expect(left()).toBe(300);
    // A second way: the sum of the lines.
    expect(500 - 200).toBe(left());
    expect(screen.queryByText("Interest so far")).not.toBeInTheDocument();
  });

  it("on a loan: the interest in the payments is added back, and the lines land on the balance", () => {
    renderSheet([car]);

    const handed = line("You paid back");
    // Second route: 3 × 185,26 handed over.
    expect(handed).toBeCloseTo(-3 * 185.26, 2);
    const interest = line("Interest so far");
    expect(interest).toBeGreaterThan(0);
    expect(Math.round((line(/^You took, /) + handed + interest) * 100) / 100).toBe(left());
  });

  it("turns the words round when the money was lent", () => {
    renderSheet([{ ...rent, direction: "owed_to_me" }]);

    expect(line(/^You gave, /)).toBe(500);
    expect(line("You got back")).toBe(-200);
    expect(screen.getByText("Left to get back")).toBeInTheDocument();
  });
});

describe("how each payment went", () => {
  const PIRAEUS = { id: "piraeus", name: "Piraeus", kind: "bank" as const, main: true };
  const CASH = { id: "cash", name: "Cash", kind: "cash" as const };
  const lent: Debt = { ...rent, id: "lent", direction: "owed_to_me", label: "Wedding", amount: 300 };
  const sheetWith = (list: DebtPayment[], debt: Debt = lent, at?: string) => renderStatuses([computeDebtStatus(debt, list)], at);

  it("names the card each one reached, or that no money moved, with the note under it", () => {
    accounts.list = [PIRAEUS, CASH];
    sheetWith([
      { ...pay("p3", "lent", 50, new Date(2026, 5, 1)), notes: "birthday present" },
      { ...pay("p2", "lent", 100, new Date(2026, 4, 1)), accountId: "cash" },
      { ...pay("p1", "lent", 120, new Date(2026, 3, 1)), accountId: "", notes: "paid me at the wedding" },
    ]);
    const rows = payRows();
    expect(rows[0]).toMatch(/1 Jun.*No money moved.*«birthday present».*€50.00/);
    expect(rows[1]).toMatch(/1 May.*Cash.*€100.00/);
    // "" is the main account, named as itself.
    expect(rows[2]).toMatch(/1 Apr.*Piraeus.*«paid me at the wedding».*€120.00/);
    expect(rows[1]).not.toContain("«");
  });

  it("says, once paid off, the day of the last payment and where it went", () => {
    accounts.list = [PIRAEUS];
    sheetWith([pay("p2", "lent", 200, new Date(2026, 4, 12)), { ...pay("p3", "lent", 100, new Date(2026, 8, 12)), accountId: "piraeus" }].sort((a, b) => b.date.getTime() - a.date.getTime()), lent, `${personPath("Nikos")}?tab=settled`);
    expect(screen.getByText("Settled")).toBeInTheDocument();
    expect(screen.getByText("12 Sept 2026 · Piraeus")).toBeInTheDocument();
  });

  it("writes the note typed at «Where», shows it at the check, and saves it trimmed", async () => {
    sheetWith([]);
    const wizard = () => screen.getAllByRole("dialog").at(-1)!;
    const next = () => userEvent.click(within(wizard()).getByRole("button", { name: /Next/ }));
    await userEvent.click(screen.getByRole("button", { name: "Came in" }));
    // «Where» is the first step: the card, and the note with it.
    await userEvent.click(within(wizard()).getByRole("radio", { name: /^Yes,/ }));
    await userEvent.type(within(wizard()).getByLabelText(/^Note/), "  handed over in cash  ");
    await next();
    await next();
    await next();
    expect(wizard()).toHaveTextContent("«handed over in cash»");
    await userEvent.click(within(wizard()).getByRole("button", { name: "Save" }));
    expect(spies.record.mock.calls[0][0]).toMatchObject({ debtId: "lent", notes: "handed over in cash" });
  });

  it("saves no note when none was typed", async () => {
    sheetWith([]);
    const wizard = () => screen.getAllByRole("dialog").at(-1)!;
    const next = () => userEvent.click(within(wizard()).getByRole("button", { name: /Next/ }));
    await userEvent.click(screen.getByRole("button", { name: "Came in" }));
    await userEvent.click(within(wizard()).getByRole("radio", { name: /^Yes,/ }));
    await next();
    await next();
    await next();
    await userEvent.click(within(wizard()).getByRole("button", { name: "Save" }));
    expect(spies.record.mock.calls[0][0].notes).toBeUndefined();
  });

  it("opens a correction with its note, and takes the note off when it is emptied", async () => {
    sheetWith([{ ...pay("p1", "lent", 120, new Date(2026, 3, 1)), notes: "at the wedding" }]);
    await userEvent.click(screen.getByRole("button", { name: /1 Apr.*€120.00/ }));
    const note = screen.getByLabelText(/^Note/);
    expect(note).toHaveValue("at the wedding");
    await userEvent.clear(note);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.update.mock.calls[0][0]).toMatchObject({ paymentId: "p1", notes: null });
  });
});

describe("the two tabs, «Ενεργά · Εξοφλημένα»", () => {
  it("counts each in its label, and lists only its own", async () => {
    renderSheet();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Open 2", "Settled 1"]);
    // Open: newest first — the rent (3 Mar) before the car (10 Jan); the paid-off concert is not here.
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["March rent", "Car"]);

    await userEvent.click(screen.getByRole("tab", { name: "Settled 1" }));
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Concert tickets"]);
    // A settled one has nothing to pay — only «Ενέργειες».
    expect(screen.queryByRole("button", { name: /^Pay back/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions — Concert tickets" })).toBeInTheDocument();
  });

  it("opens on the tab in the address", () => {
    renderSheet(undefined, `${personPath("Nikos")}?tab=settled`);
    expect(screen.getByRole("tab", { name: "Settled 1" })).toHaveAttribute("aria-selected", "true");
  });

  it("says so when a tab is empty", () => {
    renderSheet([rent], `${personPath("Nikos")}?tab=settled`);
    expect(screen.getByText(/Nothing settled with Nikos yet/)).toBeInTheDocument();
  });

  it("titles the page «Debts › Nikos» with the way back to the list", async () => {
    renderSheet([rent]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Debts › Nikos");
    // What is still owed, 500 − 200, under the title.
    expect(screen.getByText("You owe €300.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /Back/ }));
    expect(screen.getByText("the list")).toBeInTheDocument();
  });

  it("says «not found», with the way back, for a key that matches none of the user's debts", () => {
    // Another account's link, or someone with nothing left: never an error, never another page.
    renderSheet([rent], personPath("Maria"));
    expect(screen.getByText(i18n.t("debts.personNotFound"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("debts.personNotFoundBack") })).toHaveAttribute("href", "/debts");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("never puts the name in the address — an opaque key, the same for the same name", () => {
    expect(personPath("Nikos")).not.toMatch(/nikos/i);
    expect(personPath("Εθνική Τράπεζα")).toMatch(/^\/debts\/person\/[0-9a-z]{10}$/);
    // The compare key folds case, accents and spaces: one person, one address.
    expect(personKey("  ΕΘΝΙΚΗ   τράπεζα ")).toBe(personKey("Εθνική Τράπεζα"));
    expect(personKey("Maria")).not.toBe(personKey("Nikos"));
  });
});

describe("a bank loan's own page", () => {
  it("is that loan alone, with no tabs", () => {
    renderSheet(undefined, "/debts/loan/car");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Debts › Nikos · Car");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Car"]);
  });
});

describe("how much each debt says — «Απλό · Κανονικό · Αναλυτικό»", () => {
  beforeEach(() => localStorage.clear());

  it("opens on «Normal»: the bar and the last repayment, no receipt", () => {
    renderSheet([rent]);
    expect(screen.getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/^40% cleared/)).toBeInTheDocument();
    expect(screen.getByText("Last paid 2 May 2026 · €80.00")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Payments" })).not.toBeInTheDocument();
  });

  it("«Simple»: what is left and one line", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: "Simple" }));
    const card = screen.getByRole("article", { name: "March rent" });
    expect(card).toHaveTextContent("€300.00");
    expect(card).toHaveTextContent("You took €500.00 · 3 Mar 2026");
    expect(within(card).queryByText(/cleared/)).not.toBeInTheDocument();
  });

  it("«Detailed»: the whole history, and it is remembered on the device", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: "Detailed" }));
    expect(payRows()).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem("density:debts-person")!)).toBe("detailed");
  });
});

describe("the total with one person («Detailed», several debts)", () => {
  it("adds up the tab's debts with them", () => {
    renderSheet();

    const total = screen.getByText("All together · 2 loans").parentElement!;
    // Second route: 6000 + 500 borrowed, the open two.
    expect(within(total).getByText("You started with").nextSibling).toHaveTextContent("€6500.00");
    const paidOff = parseFloat(within(total).getByText("Paid off").closest("div")!.querySelector("dd")!.textContent!.replace("€", ""));
    // Rent 200 + what came off the car loan.
    const carOff = loanSplits(nikos([car]).debts[0])!;
    const expected = 200 + [...carOff.values()].reduce((sum, s) => sum + s.principal, 0);
    expect(paidOff).toBeCloseTo(expected, 2);
  });

  it("is not there for a single debt, whose own figures already say it", () => {
    renderSheet([rent]);

    expect(screen.queryByText(/All together/)).not.toBeInTheDocument();
  });
});

describe("«Ενέργειες»: one dialog, its forms steps inside it", () => {
  const openActions = () => userEvent.click(screen.getByRole("button", { name: "Actions — March rent" }));

  it("offers the debt's actions, delete far left", async () => {
    renderSheet([rent]);
    await openActions();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("Actions · March rent")).toBeInTheDocument();
    const footer = screen.getByRole("dialog").querySelector(".modal-footer")!;
    expect(footer.firstElementChild).toHaveTextContent("Delete loan");
    expect(screen.getByRole("button", { name: /Change details/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Forgiven…/ })).toBeInTheDocument();
  });

  it("changes the debt inside the same dialog, and Cancel comes back to the actions", async () => {
    renderSheet([rent]);
    await openActions();
    await userEvent.click(screen.getByRole("button", { name: /Change details/ }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByDisplayValue("March rent")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Actions · March rent")).toBeInTheDocument();
  });

  it("lets it go inside the same dialog", async () => {
    renderSheet([rent]);
    await openActions();
    await userEvent.click(screen.getByRole("button", { name: /Forgiven…/ }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText(i18n.t("debts.forgiveTitle"))).toBeInTheDocument();
  });

  it("asks before deleting, on a step, and deletes the debt with every repayment", async () => {
    renderSheet([rent]);
    await openActions();
    await userEvent.click(screen.getByRole("button", { name: /Delete loan/ }));
    expect(spies.removeDebt).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText(i18n.t("debts.deleteLoanConfirm"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    // Rent's two repayments go with it (r2 80 + r1 120 — the 200 handed back).
    expect(spies.removeDebt).toHaveBeenCalledWith({ debtId: "rent", paymentIds: ["r2", "r1"], covered: { contributionId: undefined, expenseId: undefined } });
  });
});

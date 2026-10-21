import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import PersonDebtsModal from "./PersonDebtsModal";
import { computeDebtStatus, debtsByPerson, loanSplits, loanState } from "./debtsUtils";
import type { Debt, DebtPayment } from "../../shared/types/IndexTypes";

// One person's loans, one loan in front at a time.
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
}));

// The card picker reads the accounts; which card is chosen is not what these check.
vi.mock("../accounts/AccountPicker", () => ({ default: () => null }));
// The accounts a payment names; empty unless a test fills it.
const accounts = vi.hoisted(() => ({ list: [] as { id: string; name: string; kind: "bank" | "cash"; main?: boolean }[] }));
vi.mock("../accounts/useMoneyAccounts", () => ({ useAccountList: () => accounts.list }));
vi.mock("./useDebts", () => ({
  useRecordRepayment: () => ({ mutate: spies.record, isPending: false }),
  useUpdateRepayment: () => ({ mutate: spies.update, isPending: false }),
  useDeleteRepayment: () => ({ mutate: spies.remove, isPending: false }),
  useDeleteDebt: () => ({ mutate: spies.removeDebt, isPending: false }),
  useUpdateDebt: () => ({ mutate: vi.fn(), isPending: false }),
  useEditDebt: () => ({ mutate: spies.editDebt, isPending: false }),
  useCreateDebt: () => ({ mutate: spies.createDebt, isPending: false }),
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

const renderSheet = (debts?: Debt[]) => render(<PersonDebtsModal person={nikos(debts)} formatCurrency={fmt} locale="en" knownPeople={["Nikos", "Maria"]} onClose={() => {}} />);

/** The sheet's own dialog — reactstrap does not name it after its header. */
const sheet = () => screen.getAllByRole("dialog").find((d) => within(d).queryByRole("group", { name: "Loans" }) || within(d).queryByRole("tablist"))!;
const payRows = () => within(screen.getByRole("list", { name: "Payments" })).getAllByRole("listitem").map((row) => row.textContent ?? "");

beforeAll(async () => {
  // jsdom has no matchMedia; the name field asks it whether the screen is narrow.
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  Object.values(spies).forEach((spy) => spy.mockReset());
  accounts.list = [];
});

afterEach(() => {
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("which loan is in front", () => {
  // The one-at-a-time view; the sheet now opens on «All together».
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("debts-sheet-view", JSON.stringify("one"));
  });

  it("opens on one still owed, with the paid-off one last", () => {
    renderSheet();
    const chips = within(screen.getByRole("group", { name: "Loans" })).getAllByRole("button");

    // Open ones in the list's own order (newest first), the settled one after
    // them even though it is the newest of all.
    expect(chips.map((c) => c.textContent)).toEqual([expect.stringMatching(/^March rent/), expect.stringMatching(/^Car/), expect.stringMatching(/^Concert tickets.*Settled/)]);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("swaps the whole sheet to the loan picked", async () => {
    renderSheet();
    const dialog = sheet();
    // Second route: 500 − 120 − 80.
    expect(500 - 120 - 80).toBe(300);
    expect(dialog.querySelector("[class*=_heroLabel_]")).toHaveTextContent("Left to pay back");
    expect(dialog.querySelector("[class*=_heroAmount_]")).toHaveTextContent("€300.00");
    expect(within(dialog).getByText("of €500.00 · no interest")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Car/ }));

    expect(within(dialog).getByText("of €6000.00 · 7% fixed")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Pay €185.26" })).toBeInTheDocument();
  });

  it("shows no chips for a single loan", () => {
    renderSheet([rent]);

    expect(screen.queryByRole("group", { name: "Loans" })).not.toBeInTheDocument();
    expect(screen.getByText("March rent")).toBeInTheDocument();
  });
});

describe("the payments tab", () => {
  it("lists payments newest first and ends where the loan began", async () => {
    renderSheet([rent]);

    const rows = payRows();
    expect(rows[0]).toMatch(/May 2.*€80\.00/);
    expect(rows[1]).toMatch(/Apr 10.*€120\.00/);
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

  it("offers the month's payment on a loan, and fills it in", async () => {
    renderSheet([car]);
    const instalment = loanState(nikos([car]).debts[0])!.instalment;
    expect(instalment).toBe(185.26);

    await userEvent.click(screen.getByRole("button", { name: "Pay €185.26" }));
    expect(within(wizard()).getByLabelText("Amount")).toHaveValue(185.26);
    await next();
    await next();
    await next();
    await userEvent.click(within(wizard()).getByRole("button", { name: "Save" }));

    expect(spies.record).toHaveBeenCalledWith(expect.objectContaining({ debtId: "car", amount: 185.26, accountId: "" }), expect.anything());
  });

  it("offers what is left between people, dated today", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Payment" }));
    expect(within(wizard()).getByLabelText("Amount")).toHaveValue(300);
    await next();
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

    await userEvent.click(screen.getByRole("button", { name: "Payment" }));
    expect(within(wizard()).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await next();
    await next();
    expect(within(wizard()).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await next();
    expect(within(wizard()).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(spies.record).not.toHaveBeenCalled();
  });

  it("will not leave the amount with nothing or zero in it", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Payment" }));
    await userEvent.clear(within(wizard()).getByLabelText("Amount"));
    await userEvent.type(within(wizard()).getByLabelText("Amount"), "0");
    await next();

    expect(within(wizard()).getByLabelText("Amount")).toBeInvalid();
    expect(within(wizard()).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("says at the check what is left once it is paid — and when it clears the debt", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Payment" }));
    await userEvent.clear(within(wizard()).getByLabelText("Amount"));
    await userEvent.type(within(wizard()).getByLabelText("Amount"), "100");
    await next();
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
    await next();
    expect(within(wizard()).getByRole("group", { name: "What changes" })).toHaveTextContent("Owed afterPaid off");
  });

  it("splits a loan payment into interest and debt at the check, adding up to the payment", async () => {
    renderSheet([car]);

    await userEvent.click(screen.getByRole("button", { name: "Pay €185.26" }));
    await next();
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

    await userEvent.click(screen.getByRole("button", { name: /May 2.*€80\.00/ }));

    expect(screen.getByLabelText("Amount")).toHaveValue(80);
    // The app's calendar field, showing the payment's own day.
    expect(screen.getByLabelText("When")).toHaveTextContent("02 May 2026");
  });

  it("saves the figure and the day that were typed", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: /May 2.*€80\.00/ }));

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

  it("refuses a zero", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: /May 2.*€80\.00/ }));

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "0");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("deletes only from inside the opened payment", async () => {
    renderSheet([rent]);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Apr 10.*€120\.00/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    // Not on one tap: it asks first, and only the red button in the question deletes.
    expect(spies.remove).not.toHaveBeenCalled();
    const question = screen.getByText("Delete?").closest(".modal-content") as HTMLElement;
    await userEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(spies.remove).toHaveBeenCalledWith({ paymentId: "r1", debtId: "rent" }, expect.anything());
  });
});

describe("the other tabs", () => {
  it("asks 'what if' only of a loan, where paying more changes something", async () => {
    renderSheet([rent]);
    expect(screen.queryByRole("tab", { name: "What if…" })).not.toBeInTheDocument();
  });

  it("opens the pay-more question on a loan", async () => {
    renderSheet([car]);

    await userEvent.click(screen.getByRole("tab", { name: "What if…" }));

    expect(screen.getByText("Pay extra each month")).toBeInTheDocument();
  });

  it("opens the loan form filled in, to correct the loan", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    await userEvent.click(screen.getByRole("button", { name: /Edit loan/ }));

    await screen.findAllByText("Edit loan");
    const form = screen.getAllByRole("dialog").find((d) => within(d).queryByDisplayValue("March rent"))!;
    expect(within(form).getByPlaceholderText("0")).toHaveValue(500);
  });

  it("will not delete a loan offline", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("tab", { name: "Details" }));

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

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

describe("the progress tab", () => {
  const detail = (label: string) => within(screen.getByRole("tabpanel")).getByText(label).closest("div")!.querySelector("dd")!.textContent;

  it("between people: started with, paid off, left — and no interest line", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("tab", { name: "Progress" }));

    expect(screen.getByText("You started with").nextSibling).toHaveTextContent("€500.00");
    expect(detail("Paid off")).toBe("€200.00");
    expect(detail("Left to pay back")).toBe("€300.00");
    expect(screen.queryByText("Interest you paid")).not.toBeInTheDocument();
  });

  it("on a loan: what came off the debt and the interest add up to what was handed over", async () => {
    renderSheet([car]);
    await userEvent.click(screen.getByRole("tab", { name: "Progress" }));

    const paidOff = parseFloat(detail("Paid off")!.replace("€", ""));
    const interest = parseFloat(detail("Interest you paid")!.replace("€", ""));
    // Second route: 3 × 185,26 handed over.
    expect(paidOff + interest).toBeCloseTo(3 * 185.26, 1);
    expect(screen.getByText(/You have handed over €555\.78 in all/)).toBeInTheDocument();
  });

  it("turns the words round when the money was lent", async () => {
    renderSheet([{ ...rent, direction: "owed_to_me" }]);
    await userEvent.click(screen.getByRole("tab", { name: "Progress" }));

    expect(screen.getByText("You lent")).toBeInTheDocument();
    expect(detail("Got back")).toBe("€200.00");
  });
});

describe("the total with one person", () => {
  // «All together», where the sheet opens.
  beforeEach(() => localStorage.clear());

  it("adds up every loan with them, the paid-off one included", () => {
    renderSheet();

    const total = screen.getByText("All together · 3 loans").parentElement!;
    // Second route: 6000 + 500 + 60 borrowed.
    expect(within(total).getByText("You started with").nextSibling).toHaveTextContent("€6560.00");
    const paidOff = parseFloat(within(total).getByText("Paid off").closest("div")!.querySelector("dd")!.textContent!.replace("€", ""));
    // Rent 200 + concert 60 + what came off the car loan.
    const carOff = loanSplits(nikos([car]).debts[0])!;
    const expected = 200 + 60 + [...carOff.values()].reduce((sum, s) => sum + s.principal, 0);
    expect(paidOff).toBeCloseTo(expected, 2);
  });

  it("is not there for a single loan, whose own figures already say it", () => {
    renderSheet([rent]);

    expect(screen.queryByText(/All together/)).not.toBeInTheDocument();
  });
});

describe("all together", () => {
  beforeEach(() => localStorage.clear());

  it("opens first, of the three in their order, to look at only", () => {
    renderSheet();
    const views = within(screen.getByRole("group", { name: "View" })).getAllByRole("button");
    expect(views.map((v) => v.textContent?.trim())).toEqual(["All together", "Columns", "One at a time"]);
    expect(views[0]).toHaveAttribute("aria-pressed", "true");
    // Each loan with what is left, and nothing to press: no pay button anywhere.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("€300.00");
    expect(within(dialog).queryByRole("button", { name: /^Pay/ })).not.toBeInTheDocument();
  });
});

describe("every loan as a card", () => {
  const card = (name: string) => screen.getByRole("listitem", { name });
  const toCards = () => userEvent.click(screen.getByRole("button", { name: "Columns" }));

  beforeEach(() => localStorage.clear());

  it("has no choice to make with a single loan", () => {
    renderSheet([rent]);

    expect(screen.queryByRole("button", { name: "Columns" })).not.toBeInTheDocument();
  });

  it("lists the loans one under another, open ones first", async () => {
    renderSheet();
    await toCards();

    const cards = within(screen.getByRole("list", { name: "Loans" })).getAllByRole("listitem");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["March rent", "Car", "Concert tickets"]);
  });

  it("says on the left what it is, and on the right what is left and how much is gone", async () => {
    renderSheet();
    await toCards();

    const rentCard = card("March rent");
    expect(rentCard).toHaveTextContent("You took €500.00");
    expect(rentCard).toHaveTextContent("Mar 3, 2026");
    // The newest payment, not the first one stored.
    expect(rentCard).toHaveTextContent(/Last paid May 2(?!\d)/);
    // 500 − 120 − 80 = 300 left, and 200 of 500 is 40% gone.
    expect(rentCard).toHaveTextContent("€300.00");
    expect(rentCard).toHaveTextContent("40%");

    // A loan's share is what came off the debt, not what was handed over:
    // three payments of 185.26 are more than the principal they cleared.
    const carDebt = nikos([car]).debts[0];
    const gone = Math.floor(((6000 - loanState(carDebt)!.balance) / 6000) * 100);
    expect(gone).toBeLessThan(Math.floor(((185.26 * 3) / 6000) * 100));
    expect(card("Car")).toHaveTextContent(`${gone}%`);
    expect(card("Car")).toHaveTextContent(`€${carDebt.remaining.toFixed(2)}`);

    expect(card("Concert tickets")).toHaveTextContent("Settled");
    expect(within(card("Concert tickets")).queryByRole("button", { name: "Payment" })).not.toBeInTheDocument();
  });

  it("records against the card's own loan, not the one that was in front", async () => {
    renderSheet();
    await toCards();
    // The sheet opened on the rent; the footer's button is gone, each card has its own.
    expect(screen.queryByRole("button", { name: /Pay €/ })).not.toBeInTheDocument();

    await userEvent.click(within(card("Car")).getByRole("button", { name: "Payment" }));
    const wizard = screen.getAllByRole("dialog").at(-1)!;
    expect(within(wizard).getByLabelText("Amount")).toHaveValue(185.26);
  });

  it("opens a loan one at a time from its card", async () => {
    renderSheet();
    await toCards();

    await userEvent.click(screen.getByRole("button", { name: "Open: Car" }));

    expect(within(screen.getByRole("group", { name: "Loans" })).getByRole("button", { pressed: true })).toHaveTextContent(/^Car/);
    expect(screen.getByRole("button", { name: "One at a time" })).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers the cards for next time", async () => {
    const first = renderSheet();
    await toCards();
    first.unmount();

    renderSheet();
    expect(card("Car")).toBeInTheDocument();
  });
});

describe("how each payment went", () => {
  const PIRAEUS = { id: "piraeus", name: "Piraeus", kind: "bank" as const, main: true };
  const CASH = { id: "cash", name: "Cash", kind: "cash" as const };
  const lent: Debt = { ...rent, id: "lent", direction: "owed_to_me", label: "Wedding", amount: 300 };
  const sheetWith = (list: DebtPayment[], debt: Debt = lent) =>
    render(<PersonDebtsModal person={debtsByPerson([computeDebtStatus(debt, list)])[0]} formatCurrency={fmt} locale="en" knownPeople={["Nikos"]} onClose={() => {}} />);

  it("names the card each one reached, or that no money moved, with the note under it", () => {
    accounts.list = [PIRAEUS, CASH];
    sheetWith([
      { ...pay("p3", "lent", 50, new Date(2026, 5, 1)), notes: "birthday present" },
      { ...pay("p2", "lent", 100, new Date(2026, 4, 1)), accountId: "cash" },
      { ...pay("p1", "lent", 120, new Date(2026, 3, 1)), accountId: "", notes: "paid me at the wedding" },
    ]);
    const rows = payRows();
    expect(rows[0]).toMatch(/Jun 1.*No money moved.*«birthday present».*€50.00/);
    expect(rows[1]).toMatch(/May 1.*Cash.*€100.00/);
    // "" is the main account, named as itself.
    expect(rows[2]).toMatch(/Apr 1.*Piraeus.*«paid me at the wedding».*€120.00/);
    expect(rows[1]).not.toContain("«");
  });

  it("says, once paid off, the day of the last payment and where it went", () => {
    accounts.list = [PIRAEUS];
    sheetWith([pay("p2", "lent", 200, new Date(2026, 4, 12)), { ...pay("p3", "lent", 100, new Date(2026, 8, 12)), accountId: "piraeus" }].sort((a, b) => b.date.getTime() - a.date.getTime()));
    expect(screen.getByText("Settled")).toBeInTheDocument();
    expect(screen.getByText("Sep 12, 2026 · Piraeus")).toBeInTheDocument();
  });

  it("writes the note typed at «Where», shows it at the check, and saves it trimmed", async () => {
    sheetWith([]);
    const wizard = () => screen.getAllByRole("dialog").at(-1)!;
    const next = () => userEvent.click(within(wizard()).getByRole("button", { name: /Next/ }));
    await userEvent.click(screen.getByRole("button", { name: "Money back" }));
    await next();
    await next();
    await userEvent.type(within(wizard()).getByLabelText(/^Note/), "  handed over in cash  ");
    await next();
    expect(wizard()).toHaveTextContent("«handed over in cash»");
    await userEvent.click(within(wizard()).getByRole("button", { name: "Save" }));
    expect(spies.record.mock.calls[0][0]).toMatchObject({ debtId: "lent", notes: "handed over in cash" });
  });

  it("saves no note when none was typed", async () => {
    sheetWith([]);
    const wizard = () => screen.getAllByRole("dialog").at(-1)!;
    const next = () => userEvent.click(within(wizard()).getByRole("button", { name: /Next/ }));
    await userEvent.click(screen.getByRole("button", { name: "Money back" }));
    await next();
    await next();
    await next();
    await userEvent.click(within(wizard()).getByRole("button", { name: "Save" }));
    expect(spies.record.mock.calls[0][0].notes).toBeUndefined();
  });

  it("opens a correction with its note, and takes the note off when it is emptied", async () => {
    sheetWith([{ ...pay("p1", "lent", 120, new Date(2026, 3, 1)), notes: "at the wedding" }]);
    await userEvent.click(screen.getByRole("button", { name: /Apr 1.*€120.00/ }));
    const note = screen.getByLabelText(/^Note/);
    expect(note).toHaveValue("at the wedding");
    await userEvent.clear(note);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.update.mock.calls[0][0]).toMatchObject({ paymentId: "p1", notes: null });
  });
});

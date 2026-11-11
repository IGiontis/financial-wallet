import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AddDebtModal from "./AddDebtModal";
import { toISODay } from "../../shared/utils/dates";
import type { Debt } from "../../shared/types/IndexTypes";

// «Καταχώριση δανείου» as numbered steps with a review: the steps must keep the
// form's rules (nothing past step 1 without a person and an amount), the yes /
// no question must reveal the loan's figures only on «Yes», and what is saved
// must be exactly what the one-page form saved — checked against figures worked
// out by hand here, not by the code under test.

const spies = vi.hoisted(() => ({ create: vi.fn(), edit: vi.fn() }));
vi.mock("./useDebts", () => ({
  useCreateDebt: () => ({ mutate: spies.create, isPending: false }),
  useEditDebt: () => ({ mutate: spies.edit, isPending: false }),
}));
vi.mock("../budget/useInvestments", () => ({ useInvestmentGoals: () => ({ data: [] }) }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCategories: () => ({ data: [] }) }));
vi.mock("../budget/useCoveredFunding", () => ({ useCoveredFunding: () => ({ mutate: vi.fn() }) }));
vi.mock("../budget/useCoveredLink", () => ({ useCoveredLink: () => ({ link: undefined, goalName: undefined, ready: true, failed: false, retry: () => {} }) }));
vi.mock("../accounts/AccountPicker", () => ({ default: () => null }));
vi.mock("../accounts/useMoneyAccounts", () => ({ useAccountList: () => [{ id: "eb", name: "Eurobank", kind: "bank", main: true }] }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  spies.create.mockClear();
  spies.edit.mockClear();
});

const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const current = () => document.querySelector("[aria-current=step]")?.textContent;
const yes = () => screen.getByRole("radio", { name: /^Yes, with interest/ });
const no = () => screen.getByRole("radio", { name: /^No, a plain debt/ });
const open = () => render(<AddDebtModal knownPeople={["Keki"]} onClose={() => {}} />);

async function fillWho(person: string, amount: string) {
  await userEvent.type(screen.getByPlaceholderText("e.g. my brother"), person);
  await userEvent.type(screen.getByLabelText(/^Amount/), amount);
}

describe("the loan wizard's steps", () => {
  it("walks who → interest → when → money → review, with Save only on the review", async () => {
    open();
    expect(current()).toMatch(/Who/);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await fillWho("Keki", "100");
    await next();
    expect(current()).toMatch(/Interest/);
    await userEvent.click(no());
    await next();
    expect(current()).toMatch(/When/);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await next();
    expect(current()).toMatch(/Money/);
    await next();
    expect(current()).toMatch(/Review/);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
  });

  it("does not leave step 1 without a person and an amount above 0", async () => {
    open();
    await next();
    expect(current()).toMatch(/Who/);
    expect(screen.getByText("Enter who with")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("e.g. my brother"), "Keki");
    await userEvent.type(screen.getByLabelText(/^Amount/), "0");
    await next();
    expect(current()).toMatch(/Who/);
    await userEvent.clear(screen.getByLabelText(/^Amount/));
    await userEvent.type(screen.getByLabelText(/^Amount/), "5");
    await next();
    expect(current()).toMatch(/Interest/);
  });

  it("asks the interest question with nothing picked, and waits for an answer", async () => {
    open();
    await fillWho("Keki", "100");
    await next();
    expect(yes()).toHaveAttribute("aria-checked", "false");
    expect(no()).toHaveAttribute("aria-checked", "false");
    await next();
    expect(current()).toMatch(/Interest/);
    expect(screen.getByText("Pick Yes or No")).toBeInTheDocument();
  });

  it("«Yes» reveals the rate type, rate and term in the same step; «No» hides them and moves on", async () => {
    open();
    await fillWho("Keki", "100");
    await next();
    expect(screen.queryByLabelText("Yearly interest")).toBeNull();
    await userEvent.click(yes());
    expect(current()).toMatch(/Interest/);
    expect(screen.getByRole("button", { name: "Fixed" })).toBeInTheDocument();
    expect(screen.getByLabelText("Yearly interest")).toBeInTheDocument();
    expect(screen.getByLabelText("Paid over")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Floating" }));
    expect(screen.getByLabelText("Index today")).toBeInTheDocument();
    expect(screen.getByLabelText("Bank's margin")).toBeInTheDocument();

    await userEvent.click(no());
    expect(screen.queryByLabelText("Index today")).toBeNull();
    expect(screen.queryByLabelText("Paid over")).toBeNull();
    await next();
    expect(current()).toMatch(/When/);
  });

  it("each review row jumps back to its own step", async () => {
    open();
    await fillWho("Keki", "100");
    await next();
    await userEvent.click(no());
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: /^Who with/ }));
    expect(current()).toMatch(/Who/);
  });
});

describe("what the wizard saves", () => {
  const todayDay = toISODay(new Date());

  it("a plain debt: the same fields the one-page form wrote", async () => {
    open();
    await fillWho("Keki", "250.5");
    await userEvent.type(screen.getByLabelText("What for"), "  Dinner ");
    await next();
    await userEvent.click(no());
    await next();
    await next();
    await next();
    // Plain: the receipt is the amount alone, no interest.
    const receipt = screen.getByRole("group", { name: "What you pay back" });
    expect(receipt).toHaveTextContent("Loan amount€250.50");
    expect(receipt).toHaveTextContent("Interest€0.00");
    expect(receipt).toHaveTextContent("Total€250.50");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const [data] = spies.create.mock.calls[0];
    expect(toISODay(data.date)).toBe(todayDay);
    expect(data).toEqual({
      person: "Keki",
      direction: "owed_by_me",
      label: "Dinner",
      amount: 250.5,
      date: data.date,
      dueDate: undefined,
      interestRate: undefined,
      termMonths: undefined,
      interestFreeMonths: undefined,
      rateType: undefined,
      baseRate: undefined,
      margin: undefined,
      rateReviewedAt: undefined,
      accountId: "",
    });
  });

  it("a fixed loan: rate and term saved, and the receipt adds up to the cent", async () => {
    open();
    await fillWho("Bank", "10000");
    await next();
    await userEvent.click(yes());
    await userEvent.type(screen.getByLabelText("Yearly interest"), "6");
    await userEvent.type(screen.getByLabelText("Paid over"), "60");
    await next();
    await next();
    await next();

    // Worked out by hand, the annuity formula: P·r / (1 − (1 + r)^−n).
    const r = 0.06 / 12;
    const instalment = Math.round(((10000 * r) / (1 - (1 + r) ** -60)) * 100) / 100;
    expect(instalment).toBe(193.33);
    const total = Math.round(instalment * 60 * 100) / 100; // 11 599,80
    const interest = Math.round((total - 10000) * 100) / 100; // 1 599,80
    expect(10000 + interest).toBeCloseTo(total, 10);

    const receipt = screen.getByRole("group", { name: "What you pay back" });
    expect(receipt).toHaveTextContent(`Loan amount€10000.00`);
    expect(receipt).toHaveTextContent(`Interest€${interest.toFixed(2)}`);
    expect(receipt).toHaveTextContent(`Total€${total.toFixed(2)}`);
    expect(receipt).toHaveTextContent(`Monthly instalment€${instalment.toFixed(2)}`);
    // And the review lists the loan's figures.
    expect(screen.getByRole("button", { name: /^Yearly interest\s*6%/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Paid over\s*60 months/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [data] = spies.create.mock.calls[0];
    expect(data).toMatchObject({ person: "Bank", amount: 10000, interestRate: 6, termMonths: 60, accountId: "" });
    expect(data.interestFreeMonths).toBeUndefined();
    expect(data.rateType).toBeUndefined();
    expect(data.baseRate).toBeUndefined();
    expect(data.rateReviewedAt).toBeUndefined();
  });

  it("a floating loan: the stored rate is index + margin, with the parts beside it", async () => {
    open();
    await fillWho("Bank", "100000");
    await next();
    await userEvent.click(yes());
    await userEvent.click(screen.getByRole("button", { name: "Floating" }));
    await userEvent.type(screen.getByLabelText("Index today"), "2.4");
    await userEvent.type(screen.getByLabelText("Bank's margin"), "1.2");
    await userEvent.type(screen.getByLabelText("Paid over"), "300");
    await userEvent.type(screen.getByLabelText("Interest-free"), "3");
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [data] = spies.create.mock.calls[0];
    expect(data.interestRate).toBeCloseTo(3.6, 10);
    expect(data).toMatchObject({ rateType: "floating", baseRate: 2.4, margin: 1.2, termMonths: 300, interestFreeMonths: 3 });
    expect(data.rateReviewedAt).toBeInstanceOf(Date);
  });

  it("«Yes» with no term is saved as a plain debt, and the wizard says so first", async () => {
    open();
    await fillWho("Keki", "100");
    await next();
    await userEvent.click(yes());
    await userEvent.type(screen.getByLabelText("Yearly interest"), "5");
    expect(screen.getByText(/With no term in months it is saved as a plain debt/)).toBeInTheDocument();
    await next();
    await next();
    await next();
    expect(screen.getByText(/With no term in months it is saved as a plain debt/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [data] = spies.create.mock.calls[0];
    expect(data.interestRate).toBeUndefined();
    expect(data.termMonths).toBeUndefined();
  });

  it("lent with no money moving: direction and no card, as before", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: /^I lent/ }));
    await fillWho("Keki", "40");
    await next();
    await userEvent.click(no());
    await next();
    await next();
    await userEvent.click(screen.getByRole("radio", { name: /^No — you paid for them/ }));
    await next();
    expect(screen.getByRole("group", { name: "What you get back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Where the money came out of\s*No money moved/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.create.mock.calls[0][0]).toMatchObject({ direction: "owed_to_me", amount: 40, accountId: undefined });
  });
});

describe("correcting a saved loan", () => {
  const day = new Date(2026, 0, 15);
  const reviewed = new Date(2026, 5, 1);
  const saved: Debt = {
    id: "d1",
    userId: "u",
    person: "Bank",
    direction: "owed_by_me",
    label: "Mortgage",
    amount: 120000,
    date: day,
    dueDate: undefined,
    interestRate: 3.5,
    termMonths: 240,
    interestFreeMonths: 2,
    rateType: "floating",
    baseRate: 2.25,
    margin: 1.25,
    rateReviewedAt: reviewed,
    accountId: "eb",
    createdAt: day,
    updatedAt: day,
  } as Debt;

  it("opens answered, the rail open; nothing changed, nothing to save", async () => {
    render(<AddDebtModal debt={saved} knownPeople={["Bank"]} onClose={() => {}} />);
    // Every step answered: the rail jumps straight to the review.
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(current()).toMatch(/Review/);
    expect(screen.getByRole("button", { name: /^Where the money went in\s*Eurobank/ })).toBeInTheDocument();
    // An unchanged save would still write and bump `updatedAt` everywhere.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.edit).not.toHaveBeenCalled();
  });

  it("a corrected label writes back every other field as it was saved", async () => {
    render(<AddDebtModal debt={saved} knownPeople={["Bank"]} onClose={() => {}} />);
    await userEvent.clear(screen.getByLabelText("What for"));
    await userEvent.type(screen.getByLabelText("What for"), "Home loan");
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [{ debtId, data }] = spies.edit.mock.calls[0];
    expect(debtId).toBe("d1");
    // The second way: the saved debt's own fields, field by field.
    const { id, userId, createdAt, updatedAt, ...fields } = saved;
    void id;
    void userId;
    void createdAt;
    void updatedAt;
    expect(data).toEqual({ ...fields, label: "Home loan" });
    // An unchanged rate keeps the day it was last read.
    expect(data.rateReviewedAt).toBe(reviewed);
  });

  it("has the bin far left, handing over to the sheet's own question", async () => {
    const onDelete = vi.fn();
    render(<AddDebtModal debt={saved} knownPeople={["Bank"]} onClose={() => {}} onDelete={onDelete} />);
    const footer = document.querySelector(".modal-footer") as HTMLElement;
    const bin = within(footer).getByRole("button", { name: "Delete loan" });
    expect(footer.firstElementChild?.firstElementChild).toBe(bin);
    await userEvent.click(bin);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("offers no bin on a new loan", () => {
    render(<AddDebtModal knownPeople={[]} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.queryByRole("button", { name: "Delete loan" })).toBeNull();
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { personPath } from "./debtSides";
import i18n from "../../i18n";
import { DebtsPage } from "./DebtsPage";
import { computeDebtStatus } from "./debtsUtils";
import type { Debt, DebtPayment } from "../../shared/types/IndexTypes";

// «Ζυγαριά» (owner, 2026-11-16): the balance bar's three figures are the old
// tiles' figures, worked out here by hand from the records; each side lists
// only what is open; the closed ones are in «Αρχείο N», out of the overview,
// not deleted; a row opens the person's sheet on that loan.

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

const payments = [pay("r1", "rent", 200, day(3, 10)), pay("c1", "concert", 60, day(5, 20))];
const debts = [
  debt("rent", "Nikos", "owed_by_me", 500, day(2, 3), { label: "March rent" }),
  debt("trip", "Maria", "owed_by_me", 120.4, day(4, 1)),
  debt("lunch", "Nikos", "owed_to_me", 35.5, day(3, 1)),
  debt("concert", "Nikos", "owed_by_me", 60, day(5, 1), { label: "Concert tickets" }),
  debt("gift", "Eleni", "owed_to_me", 75, day(6, 1), { forgiven: { amount: 75, date: day(9, 1) } }),
].map((d) => computeDebtStatus(d, payments));

const removed = vi.hoisted(() => ({ calls: [] as string[][] }));
vi.mock("./useDebts", () => ({
  useDebts: () => ({ data: debts, isLoading: false, isSuccess: true, isFetching: false }),
  useHealDebtCash: () => {},
  useDeleteClosedDebts: () => ({
    isPending: false,
    mutateAsync: async (ids: string[]) => {
      removed.calls.push(ids);
      return { debtIds: ids, paymentIds: [], keptTransactionIds: [], unlinkedContributionIds: [], skipped: [] };
    },
  }),
}));
// The concert's money: its loan record and its one repayment's, both on the device.
vi.mock("../transactions/hooks/useTransactions", () => ({
  useTransactions: () => ({ data: [{ id: "debt_concert", debtId: "concert" }, { id: "debtpay_c1", debtId: "concert" }, { id: "x", debtId: undefined }], isSuccess: true, isFetching: false }),
}));
vi.mock("./AddDebtModal", () => ({ default: () => null }));
vi.mock("./DebtOrder", () => ({ DebtOrder: () => <div>which loan first</div> }));
vi.mock("../../shared/hooks/usePageAdd", () => ({ usePageAdd: () => {} }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  localStorage.clear();
  removed.calls = [];
});

const renderPage = (at: string | { pathname: string; state: unknown } = "/debts") =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/debts" element={<DebtsPage />} />
        <Route path="/debts/person/:key" element={<div>person page</div>} />
      </Routes>
    </MemoryRouter>,
  );
const side = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });
const rows = (name: string) => within(side(name)).queryAllByRole("link").map((b) => b.textContent ?? "");

describe("the Debts overview «Ζυγαριά»", () => {
  it("has the three tabs under the header, the archive with its count", () => {
    renderPage();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab").map((tab) => tab.textContent);
    // Closed: the concert (paid off) and the gift (forgiven) — 2.
    expect(tabs).toEqual(["Overview", "Repayment plan", "Archive 2"]);
  });

  it("shows on the balance bar the figures the old tiles showed, worked out by hand", () => {
    renderPage();
    const balance = screen.getByRole("region", { name: "What you owe and what you are owed" });
    // You owe: rent 500 − 200 = 300.00, trip 120.40 → 420.40 (the concert is paid off).
    // Owed to you: lunch 35.50 (the gift was forgiven). Net: 35.50 − 420.40 = −384.90.
    expect(balance).toHaveTextContent("You owe€420.40");
    expect(balance).toHaveTextContent("Owed to you€35.50");
    expect(balance).toHaveTextContent("Net−€384.90against you");
  });

  it("splits the bar by those two figures", () => {
    const { container } = renderPage();
    const [owe, owed] = Array.from(container.querySelectorAll<HTMLElement>("[class*=_balanceBar_] > span"));
    // 420.40 / 455.90 = 92.21%; the rest, 7.79%.
    expect(parseFloat(owe.style.width)).toBeCloseTo(92.21, 2);
    expect(parseFloat(owed.style.width)).toBeCloseTo(7.79, 2);
  });

  it("lists each side's open rows, adding up to its total, and nothing closed", () => {
    renderPage();
    expect(side("I owe")).toHaveTextContent(/^I owe€420\.40/);
    // Initials, name, the one loan's name (or how many), what is left, how much is gone (rent: 200 of 500).
    expect(rows("I owe")).toEqual(["NINikosMarch rent€300.0040% cleared", "MAMaria1 open€120.400% cleared"]);
    // 300.00 + 120.40 = 420.40, the side's total and the bar's red figure.
    expect(side("Owed to me")).toHaveTextContent(/^Owed to me€35\.50/);
    expect(rows("Owed to me")).toEqual(["NINikos1 open€35.500% cleared"]);
    expect(screen.queryByText("Eleni")).toBeNull();
    expect(screen.queryByText(/Concert tickets/)).toBeNull();
  });

  it("leads each row to the person's own page, by an opaque key", () => {
    renderPage();
    const link = within(side("Owed to me")).getByRole("link");
    expect(link).toHaveAttribute("href", `${personPath("Nikos")}?tab=open`);
    expect(link.getAttribute("href")).not.toMatch(/nikos/i);
  });

  it("sends an old link that named a person (route state) to their page", () => {
    renderPage({ pathname: "/debts", state: { person: "Nikos" } });
    expect(screen.getByText("person page")).toBeInTheDocument();
  });
});

describe("the archive", () => {
  it("keeps the closed ones, the latest closed first, each leading to its history", () => {
    renderPage("/debts?tab=archive");
    const list = within(screen.getByRole("region", { name: "Archive" })).getAllByRole("link");
    // Forgiven 1 Oct, then paid off 20 Jun.
    expect(list.map((b) => b.textContent)).toEqual(["ELEleniI lent them · Forgiven 1 Oct 2026€75.00You gave", "NINikosConcert tickets · Settled 20 Jun 2026€60.00You took"]);
    expect(list[1]).toHaveAttribute("href", `${personPath("Nikos")}?tab=settled`);
  });

  it("picks closed debts to delete, all or some, and says how many on the bar", async () => {
    renderPage("/debts?tab=archive");
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
    await userEvent.click(screen.getByRole("checkbox", { name: "All" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 selected");
    await userEvent.click(screen.getByRole("checkbox", { name: "All" }));
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
    expect(within(screen.getByRole("status")).getByRole("button", { name: "Delete" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /^Nikos/ }));
    expect(screen.getByRole("status")).toHaveTextContent("1 selected");
  });

  it("says what goes and that the money stays, then deletes only the picked, once", async () => {
    renderPage("/debts?tab=archive");
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^Nikos/ }));
    await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Delete" }));
    const question = screen.getByRole("dialog");
    // The concert: 1 debt, its 1 repayment record; its 2 money records stay.
    expect(question).toHaveTextContent("Delete 1 debt?");
    expect(question).toHaveTextContent("1 debt and its 1 repayment records are deleted.");
    expect(question).toHaveTextContent("Their money stays in Transactions (2 records): no card balance and no total changes.");
    expect(removed.calls).toEqual([]);
    await userEvent.click(within(question).getByRole("button", { name: "Delete" }));
    expect(removed.calls).toEqual([["concert"]]);
  });

  it("moves the repayment order to its own tab", async () => {
    renderPage();
    expect(screen.queryByText("which loan first")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Repayment plan" }));
    // None of these charges interest: the plan says so rather than showing nothing.
    expect(screen.getByText(i18n.t("debts.planEmpty"))).toBeInTheDocument();
  });
});

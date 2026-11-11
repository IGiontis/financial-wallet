import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { MoneyTimeline } from "./MoneyTimeline";
import { resolveIncomes } from "../../incomes/incomesUtils";
import { monthlySalary } from "../../../test/incomes";
import type { CalendarSources } from "../calendarDays";
import type { BillWithStatus } from "../../../shared/types/IndexTypes";

// The tree on «Ημερολόγιο», «Έσοδα» and «Πάγια»: Monday 26 October 2026, the
// salary of 1.450 on the 30th, the phone bill of 25 on the 28th and the rent
// of 400 on 1 November.

const NOW = new Date(2026, 9, 26, 12);
const bill = (name: string, amount: number, dueDay: number) =>
  ({ id: name, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, createdAt: new Date(2026, 0, 1), anchorDate: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1), currentPeriodKey: "2026-10", isPaidThisPeriod: false, payments: [], monthlyEquivalent: amount }) as unknown as BillWithStatus;
const SALARY = monthlySalary(1450, 30);
const sources: CalendarSources = {
  now: NOW,
  bills: [bill("Phone", 25, 28), bill("Rent", 400, 1)],
  statuses: resolveIncomes([SALARY], { transactions: [], overrides: {}, now: NOW }, new Date(2026, 8, 1), new Date(2026, 11, 31)),
  incomeName: () => "Salary",
  oneOffs: [],
  debts: [],
  goalEvents: [],
  debtEvents: [],
};
const money = (n: number) => `€${n.toFixed(2)}`;
const tree = (side: "in" | "out" | "all") =>
  render(<MoneyTimeline side={side} sources={sources} first={new Date(2025, 9, 1)} last={new Date(2027, 9, 1)} formatCurrency={money} locale="en" />);

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("money as a tree", () => {
  it("grows money in to the left of the trunk and money out to the right, this month first", () => {
    const { container } = tree("all");
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    const left = [...container.querySelectorAll("[class*=_left_] li")].map((li) => li.textContent);
    const right = [...container.querySelectorAll("[class*=_right_] li")].map((li) => li.textContent);
    expect(left).toEqual([expect.stringMatching(/Salary.*\+€1450\.00/)]);
    // October's rent of the 1st, then the phone of the 28th.
    expect(right).toEqual([expect.stringMatching(/Rent.*−€400\.00/), expect.stringMatching(/Phone.*−€25\.00/)]);
    // A second way: the totals over the trunk are the leaves added up.
    expect(screen.getByText("+€1450.00", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText(`−${money(25 + 400)}`, { selector: "b" })).toBeInTheDocument();
  });

  it("marks today on the trunk, though nothing lands on it", () => {
    tree("all");
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows only money in on «Έσοδα», and only money out on «Πάγια»", () => {
    const { container, unmount } = tree("in");
    expect(container.textContent).toContain("Salary");
    expect(container.textContent).not.toContain("Rent");
    unmount();
    const out = tree("out");
    expect(out.container.textContent).toContain("Rent");
    expect(out.container.textContent).not.toContain("Salary");
  });

  it("keeps one side for each way, whichever kind it holds: in all left, out all right", () => {
    const incomes = tree("in");
    expect(incomes.container.querySelectorAll("[class*=_right_] li")).toHaveLength(0);
    expect(incomes.container.querySelectorAll("[class*=_left_] li").length).toBeGreaterThan(0);
    incomes.unmount();
    const bills = tree("out");
    expect(bills.container.querySelectorAll("[class*=_left_] li")).toHaveLength(0);
    expect(bills.container.querySelectorAll("[class*=_right_] li")).toHaveLength(2);
  });

  it("spans three months, six or a year, and says each figure the months add up to", async () => {
    tree("out");
    await userEvent.click(within(screen.getByRole("group", { name: "Period" })).getByRole("button", { name: /Year/ }));
    expect(screen.getByText(/^Oct 2026 – Sept? 2027$/)).toBeInTheDocument();
    // Twelve months of a 25 and a 400 bill: 12 × 425, a second way of reading the total.
    expect(screen.getByText(`−${money(12 * (25 + 400))}`, { selector: "b" })).toBeInTheDocument();
    // Drawn a few weeks at a time: 24 days with a bill on them and today, 21 drawn first.
    const nodes = () => document.querySelectorAll("[class*=_node_]").length;
    expect(nodes()).toBe(21);
    await userEvent.click(screen.getByRole("button", { name: "Show 4 more days" }));
    expect(nodes()).toBe(12 * 2 + 1);
    await userEvent.click(within(screen.getByRole("group", { name: "Period" })).getByRole("button", { name: /3 months/ }));
    expect(screen.getByText("Oct 2026 – Dec 2026")).toBeInTheDocument();
    expect(screen.getByText(`−${money(3 * 425)}`, { selector: "b" })).toBeInTheDocument();
  });

  it("offers a month, 3, 6 or 12 months — no week — and steps a month at a time", async () => {
    tree("all");
    const spans = within(screen.getByRole("group", { name: "Period" })).getAllByRole("button");
    expect(spans.map((button) => button.textContent)).toEqual(["Month1m", "3 months3m", "6 months6m", "Year12m"]); // each with its tiny-phone short form
    expect(within(screen.getByRole("group", { name: "Period" })).queryByRole("button", { name: /Week/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to today" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Period" })).getByRole("button", { name: /Month/ }));
    // The whole of October: the rent of the 1st, unpaid and so late; the phone; the salary.
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    const rent = screen.getByText("Rent").closest("li")!;
    expect(rent).toHaveTextContent("to pay");
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText(`−${money(400 + 25)}`, { selector: "b" })).toBeInTheDocument();
  });

  it("goes no further than the sources reach, either way", async () => {
    render(<MoneyTimeline side="all" sources={sources} first={new Date(2026, 9, 1)} last={new Date(2026, 10, 1)} formatCurrency={money} locale="en" />);
    await userEvent.click(within(screen.getByRole("group", { name: "Period" })).getByRole("button", { name: /Month/ }));
    // October is the first month: no way back. November is the last: one step on, then none.
    expect(screen.getByRole("button", { name: "Previous period" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next period" })).toBeDisabled();
  });

  it("weighs each leaf by what it wants: to pay, to come, or done", async () => {
    tree("out");
    // The phone bill on the 28th, two days off: to come, and how soon.
    const phone = screen.getByText("Phone").closest("li")!;
    expect(phone.className).toMatch(/_upcoming_/);
    expect(phone.className).not.toMatch(/_late_/);
    expect(phone).toHaveTextContent("to come · in 2 days");
    // The rent of the 1st, unpaid: late, and filled so.
    const rent = screen.getByText("Rent").closest("li")!;
    expect(rent.className).toMatch(/_late_/);
    expect(rent).toHaveTextContent("to pay");
  });

  it("says a goal's money for today is to put in, not to pay", () => {
    const withGoal = { ...sources, goalEvents: [{ kind: "goal" as const, label: "Trip", goalId: "trip", amount: -100, date: new Date(2026, 9, 26) }] };
    render(<MoneyTimeline side="out" sources={withGoal} first={new Date(2025, 9, 1)} last={new Date(2027, 9, 1)} formatCurrency={money} locale="en" />);
    expect(screen.getByText("Trip").closest("li")).toHaveTextContent("to put in today");
  });

  it("holds the bills alone on «Πάγια», under their own name", () => {
    const withGoal = { ...sources, goalEvents: [{ kind: "goal" as const, label: "Trip", goalId: "trip", amount: -100, date: new Date(2026, 9, 27) }] };
    render(<MoneyTimeline side="out" kinds={["bill"]} sources={withGoal} first={new Date(2025, 9, 1)} last={new Date(2027, 9, 1)} formatCurrency={money} locale="en" />);
    expect(screen.getByText("Bills timeline")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.queryByText("Trip")).toBeNull();
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { IncomeMonthsAhead } from "./IncomeMonthsAhead";
import { incomeMonthsAhead } from "../incomesUtils";
import { makeFormats } from "../incomeText";
import { monthlyIncome, monthlySalary } from "../../../test/incomes";

// A bar of «Οι επόμενοι 12 μήνες» opens its month, as a bar on «Πάγια» does.

const NOW = new Date(2026, 9, 26, 12);
const INCOMES = [monthlySalary(1450, 30), monthlyIncome("bonus", "Bonus", 600, 20, { frequency: "yearly", month: 11 })];
const money = (n: number) => `€${n.toFixed(2)}`;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the months ahead on «Έσοδα»", () => {
  it("opens December on a tap: the bonus and the salary, and the bar's own sum", async () => {
    render(<IncomeMonthsAhead months={incomeMonthsAhead(INCOMES, [], NOW)} incomes={INCOMES} transactions={[]} formatCurrency={money} f={makeFormats("en")} locale="en" />);
    await userEvent.click(screen.getByTitle(/^December — /));

    const sheet = screen.getByRole("dialog");
    const rows = within(within(sheet).getByRole("list", { name: "What comes in the month" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/Bonus.*€600\.00$/), expect.stringMatching(/Salary.*€1450\.00$/)]);
    // A second way: the total under the list is the bar's figure.
    expect(within(sheet).getByText("Total").nextElementSibling!.textContent).toBe(money(1450 + 600));
  });
});

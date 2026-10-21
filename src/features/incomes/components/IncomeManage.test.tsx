import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { IncomeManage } from "./IncomeManage";
import { makeFormats } from "../incomeText";
import type { Income } from "../incomesUtils";

// «Έσοδα › Διαχείριση»: the running incomes, then the archived, each to edit or delete.

const NOW = new Date(2026, 8, 16, 10, 0); // 16 September 2026

const income = (id: string, name: string, extra: Partial<Income> = {}): Income => ({ id, name, kind: "other", amount: 100, frequency: "monthly", day: 15, start: "2026-01", ...extra });

const INCOMES = [
  income("s", "Salary", { kind: "salary", isSalary: true, day: 30 }),
  income("r", "Rent", { kind: "rent", day: 5, pause: { from: "2026-09", to: "2026-10" } }),
  income("t", "Tutoring", { end: "2026-06" }),
  income("x", "Old job", { active: false }),
];

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const renderList = () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggle = vi.fn();
  render(<IncomeManage incomes={INCOMES} f={makeFormats("en")} now={NOW} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />);
  return { onEdit, onDelete, onToggle };
};

describe("the incomes' manage list", () => {
  it("puts the active ones first and the inactive apart, alphabetical, with no amounts", () => {
    renderList();
    expect(screen.getByText("4 incomes. Tap one to change it.")).toBeInTheDocument();
    const names = (region: string) =>
      within(screen.getByRole("region", { name: region }))
        .getAllByRole("button", { name: /^Edit: / })
        .filter((_, i) => i % 2 === 0)
        .map((b) => b.getAttribute("aria-label"));
    expect(names("Active")).toEqual(["Edit: Rent", "Edit: Salary", "Edit: Tutoring"]);
    expect(names("Inactive")).toEqual(["Edit: Old job"]);
    expect(document.body.textContent).not.toMatch(/€|100/);
  });

  it("says when each comes, marks the salary, and tags what is not running", () => {
    renderList();
    const row = (name: string) => screen.getAllByRole("button", { name: `Edit: ${name}` })[0];
    expect(row("Salary")).toHaveTextContent("every month on the 30");
    expect(row("Salary")).toHaveTextContent("Salary");
    expect(row("Rent")).toHaveTextContent(/paused until Oct/);
    expect(row("Tutoring")).toHaveTextContent("stopped");
    expect(row("Salary")).not.toHaveTextContent(/paused|stopped/);
  });

  it("opens the edit and hands the bin's income on to be asked about", async () => {
    const { onEdit, onDelete } = renderList();
    await userEvent.click(screen.getAllByRole("button", { name: "Edit: Rent" })[1]);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "r" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete: Old job" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("switches an income off or back on from its row", async () => {
    const { onToggle } = renderList();
    expect(screen.getByRole("switch", { name: "Active: Rent" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Active: Old job" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: "Active: Rent" }));
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r" }), false);
    await userEvent.click(screen.getByRole("switch", { name: "Active: Old job" }));
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ id: "x" }), true);
  });
});

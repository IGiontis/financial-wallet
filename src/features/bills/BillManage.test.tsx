import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { BillManage } from "./BillManage";
import type { BillWithStatus, Category } from "../../shared/types/IndexTypes";

// «Πάγια › Διαχείριση»: every bill by name, no figures, each to edit or delete.

const NOW = new Date(2026, 8, 16, 10, 0); // 16 September 2026

const bill = (id: string, name: string, extra: Partial<BillWithStatus> = {}): BillWithStatus =>
  ({ id, userId: "u1", name, amount: 10, categoryId: "c1", frequency: "monthly", dueDay: 20, isActive: true, ...extra }) as BillWithStatus;

const BILLS = [
  bill("n", "Netflix"),
  bill("a", "Car insurance", { frequency: "yearly", dueMonth: 2, dueDay: 10, amount: 400 }),
  bill("g", "Gym", { pause: { from: "2026-08", to: "2026-12" } }),
  bill("o", "Old phone", { isActive: false }),
  bill("l", "Later", { startsOn: "2026-11" }),
  bill("w", "Cleaner", { frequency: "weekly", dueDay: 1 }),
];
const categoryFor = (): Category => ({ id: "c1", name: "Fun", icon: "🎬" }) as Category;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const renderList = (props: Partial<Parameters<typeof BillManage>[0]> = {}) => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(<BillManage bills={BILLS} categoryFor={categoryFor} now={NOW} onEdit={onEdit} onDelete={onDelete} {...props} />);
  return { onEdit, onDelete };
};

describe("the bills' manage list", () => {
  it("lists every bill, gathered by how often and alphabetical inside, with no amounts", () => {
    renderList();
    expect(screen.getByText("6 bills. Tap one to change it.")).toBeInTheDocument();
    const monthly = within(screen.getByRole("region", { name: "Monthly" }));
    expect(monthly.getAllByRole("button", { name: /^Edit: / }).filter((_, i) => i % 2 === 0).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Edit: Gym",
      "Edit: Later",
      "Edit: Netflix",
      "Edit: Old phone",
    ]);
    expect(screen.getByRole("region", { name: "Yearly" })).toHaveTextContent("Car insurance");
    expect(screen.getByRole("region", { name: "Weekly" })).toHaveTextContent("Cleaner");
    // Not a figure on the page.
    expect(document.body.textContent).not.toMatch(/€|\d+[.,]\d\d/);
  });

  it("says when each falls, and tags whatever is not running", () => {
    renderList();
    const row = (name: string) => screen.getAllByRole("button", { name: `Edit: ${name}` })[0];
    expect(row("Netflix")).toHaveTextContent("day 20 of the month");
    expect(row("Car insurance")).toHaveTextContent(/10 Mar/);
    expect(row("Cleaner")).toHaveTextContent("every Monday");
    expect(row("Gym")).toHaveTextContent("paused");
    expect(row("Old phone")).toHaveTextContent("off");
    expect(row("Later")).toHaveTextContent(/Starts Nov/);
    expect(row("Netflix")).not.toHaveTextContent(/paused|off|stopped|Starts/);
  });

  it("opens the edit from the row or the pencil, and hands the bin's bill on to be asked about", async () => {
    const { onEdit, onDelete } = renderList();
    const [rowButton, pencil] = screen.getAllByRole("button", { name: "Edit: Netflix" });
    await userEvent.click(rowButton);
    await userEvent.click(pencil);
    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onEdit.mock.calls.every(([b]) => b.id === "n")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete: Gym" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "g" }));
  });

  it("keeps the bins shut while deleting is locked, saying why", () => {
    renderList({ deleteLocked: true, deleteReason: "Offline" });
    for (const bin of screen.getAllByRole("button", { name: /^Delete: / })) {
      expect(bin).toBeDisabled();
      expect(bin).toHaveAttribute("title", "Offline");
    }
  });
});

import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import ActiveBillsModal from "./ActiveBillsModal";
import RunwaySheet from "./RunwaySheet";
import type { CashCheckpoint } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";

// The two sheets the Bills page's figures open: every active bill as cards
// grouped by how often it comes, and what a "now / by …" figure is made of.

const format = (n: number) => `€${n.toFixed(2)}`;
const bill = (id: string, name: string, amount: number, frequency: "monthly" | "yearly", intervalCount = 1, monthlyEquivalent = amount) =>
  ({ id, name, amount, frequency, intervalCount, monthlyEquivalent, isActive: true, isVariableAmount: false }) as unknown as BillWithStatus;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the active bills, as cards", () => {
  const bills = [
    bill("water", "Water", 60, "monthly", 2, 30),
    bill("netflix", "Netflix", 13.99, "monthly"),
    bill("tax", "Car tax", 240, "yearly", 1, 20),
    bill("phone", "Phone", 20, "monthly"),
  ];

  it("groups them shortest cycle first, each group headed once by how often, each card its name and amount", () => {
    render(<ActiveBillsModal isOpen bills={bills} formatCurrency={format} onClose={() => {}} onOpenBill={() => {}} />);
    const groups = screen.getAllByRole("region");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Monthly", "Every 2 months", "Yearly"]);

    const monthly = within(groups[0]);
    expect(monthly.getByText("Monthly · 2")).toBeInTheDocument();
    // 13,99 + 20 a month.
    expect(monthly.getByText(/€33\.99/)).toBeInTheDocument();
    const cards = monthly.getAllByRole("button");
    expect(cards.map((c) => c.textContent)).toEqual(["Netflix€13.99", "Phone€20.00"]);
    // How often is the heading's to say, not each card's.
    expect(monthly.getAllByText(/Monthly/)).toHaveLength(1);
  });

  it("opens the bill a card stands for", async () => {
    const onOpenBill = vi.fn();
    render(<ActiveBillsModal isOpen bills={bills} formatCurrency={format} onClose={() => {}} onOpenBill={onOpenBill} />);
    await userEvent.click(screen.getByRole("button", { name: /Car tax/ }));
    expect(onOpenBill).toHaveBeenCalledWith(bills[2]);
  });
});

describe("what a runway figure is made of", () => {
  const water = bill("water", "Water", 60, "monthly");
  const power = bill("power", "Power", 85, "monthly");
  const netflix = bill("netflix", "Netflix", 13.99, "monthly");
  const checkpoints: CashCheckpoint[] = [
    { date: new Date(2026, 9, 7), bills: [water], amount: 120, cumulative: 120, cumulativeCount: 1, strictCount: 0, overdue: true, items: [{ bill: water, amount: 120, overdue: true }] },
    {
      date: new Date(2026, 9, 14),
      bills: [power, netflix],
      amount: 98.99,
      cumulative: 218.99,
      cumulativeCount: 3,
      strictCount: 0,
      overdue: false,
      items: [
        { bill: power, amount: 85, overdue: false },
        { bill: netflix, amount: 13.99, overdue: false },
      ],
    },
  ];

  it("leads with the box's figure, then each day as a group of bills, a day with several saying what it comes to", () => {
    render(<RunwaySheet checkpoints={checkpoints} title="By 14 Oct" formatCurrency={format} onClose={() => {}} onOpenBill={() => {}} />);
    const sheet = screen.getByRole("dialog");
    // The second way: the rows added up again here — 120 + 85 + 13,99.
    expect(120 + 85 + 13.99).toBeCloseTo(218.99, 2);
    expect(within(sheet).getByText("€218.99")).toBeInTheDocument();
    expect(within(sheet).getByText("for 3 bills")).toBeInTheDocument();

    const [now, day] = within(sheet).getAllByRole("region");
    expect(now).toHaveTextContent("Now · overdue");
    expect(within(now).getByRole("button", { name: /Water/ })).toHaveTextContent("€120.00");
    // 85 + 13,99 on the 14th.
    expect(day).toHaveTextContent("€98.99");
    expect(within(day).getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("€85.00"), expect.stringContaining("€13.99")]);
  });

  it("opens the bill a row stands for", async () => {
    const onOpenBill = vi.fn();
    render(<RunwaySheet checkpoints={checkpoints} title="By 14 Oct" formatCurrency={format} onClose={() => {}} onOpenBill={onOpenBill} />);
    await userEvent.click(screen.getByRole("button", { name: /Netflix/ }));
    expect(onOpenBill).toHaveBeenCalledWith(netflix);
  });

  it("shows only the first day for the next payment", () => {
    render(<RunwaySheet checkpoints={checkpoints.slice(0, 1)} title="Next" formatCurrency={format} onClose={() => {}} onOpenBill={() => {}} />);
    expect(screen.queryByText("Power")).toBeNull();
    expect(screen.getAllByText("€120.00").length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import ClearBillModal from "./ClearBillModal";
import { computeBillStatus } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// «Ήρθε εκκαθαριστικό» (owner, 2026-11-26), walked as he would: the months it
// closes (all ticked), the card, the figure on the paper (never filled in for
// him), the day and «does the bill carry on?», and the check — and what it
// hands over to be saved.

const places = vi.hoisted(() => ({ accounts: [{ id: "eb", name: "Eurobank", kind: "bank", main: true }, { id: "cash", name: "Μετρητά", kind: "cash" }] }));
vi.mock("../accounts/useMoneyAccounts", () => ({
  useAccountList: () => places.accounts,
  useMoneyAccounts: () => ({ accounts: places.accounts, latest: undefined, transactions: [], checkIns: [], setCheckIns: vi.fn(), readings: [], isLoading: false }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR", symbol: "€" }),
}));
// The calendar is a picker; a plain box stands in for it.
vi.mock("../../shared/components/DateField", () => ({
  DateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="Date" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});
afterEach(() => vi.useRealTimers());

const water = { id: "water", userId: "u1", name: "Water", amount: 30, isVariableAmount: true, categoryId: "c1", frequency: "monthly", dueDay: 10, isActive: true, anchorDate: new Date(2025, 9, 5), createdAt: new Date(2025, 9, 5), updatedAt: new Date(2025, 9, 5) } as Bill;
const paid = (key: string): BillPayment => {
  const [y, m] = key.split("-").map(Number);
  return { id: `p-${key}`, userId: "u1", billId: "water", periodKey: key, amount: 30, paidDate: new Date(y, m - 1, 8), createdAt: new Date(y, m - 1, 8) } as BillPayment;
};

const open = () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 20, 10)); // 20 October 2026
  // October 2025 – June 2026 paid; July – October 2026 left to pile up.
  const kept = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].reverse().map(paid);
  const status = computeBillStatus(water, kept, new Date());
  const onConfirm = vi.fn();
  render(<ClearBillModal bill={status} onClose={() => {}} onConfirm={onConfirm} />);
  return onConfirm;
};
const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));

describe("a final bill", () => {
  it("ticks every unpaid month, asks for the paper's figure, and saves it on the latest month", async () => {
    const onConfirm = open();
    // July to October unpaid on 20 October — all four ticked.
    const months = screen.getByRole("group", { name: "Which months does it close?" });
    expect(within(months).getAllByRole("checkbox").map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true, true]);
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Eurobank/ }));
    await next();
    // Never filled in for him: the reckoned 4 × 30 = 120 is a guide, not the value.
    const amount = screen.getByLabelText(/Final amount/);
    expect(amount).toHaveValue(null);
    expect(screen.getByText(/reckoned at about €120.00/)).toBeInTheDocument();
    await userEvent.type(amount, "96");
    await next();
    // «Does the bill carry on?» starts on Yes.
    const carry = screen.getByRole("radiogroup", { name: "Does the bill carry on?" });
    expect(within(carry).getByRole("radio", { name: /^Yes/ })).toBeChecked();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save final bill" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ periodKeys: ["2026-07", "2026-08", "2026-09", "2026-10"], amount: 96, accountId: "eb", stopFrom: undefined }));
  });

  it("stops the bill from TODAY's month when it was the last one — not from its next period", async () => {
    const onConfirm = open();
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Eurobank/ }));
    await next();
    await userEvent.type(screen.getByLabelText(/Final amount/), "96");
    await next();
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Does the bill carry on?" })).getByRole("radio", { name: /^No/ }));
    expect(screen.getByText(/stops from today/)).toBeInTheDocument();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save final bill" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ stopFrom: "2026-10" }));
  });

  it("closes only the months left ticked", async () => {
    const onConfirm = open();
    await userEvent.click(screen.getAllByRole("checkbox")[3]); // leave October to pay on its own
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Eurobank/ }));
    await next();
    await userEvent.type(screen.getByLabelText(/Final amount/), "70");
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save final bill" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ periodKeys: ["2026-07", "2026-08", "2026-09"], amount: 70 }));
  });

  it("will not move on with no month ticked, nor without an amount", async () => {
    open();
    for (const box of screen.getAllByRole("checkbox")) await userEvent.click(box);
    await next();
    expect(screen.getByText("Pick at least one month.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Eurobank/ }));
    await next();
    await next();
    expect(screen.getByLabelText(/Final amount/)).toBeInTheDocument();
  });
});

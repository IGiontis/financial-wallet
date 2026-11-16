import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";
import i18n from "../../../i18n";
import EditTransactionModal from "./EditTransactionModal";
import { firestoreToDate, toISODay } from "../../../shared/utils/dates";
import { formatTable } from "../transactionDates";
import type { Transaction, UpdateTransactionDTO } from "../../../shared/types/IndexTypes";

// The edit form opens on the day the list shows (2026-11-16 bug: it read the
// stored date with `toISOString()`, so in Greece a record at local midnight —
// a gap record, any `parseISODay` writer — opened on the day BEFORE). Run on
// Greek time with a fixed clock: Mon 26 Oct 2026, 12:00, the day after the
// clocks went back.

vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: [] }) }));
vi.mock("../hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ baseCurrency: "EUR", displayCurrency: "EUR", convert: (n: number) => n, convertToBase: (n: number) => n }),
}));
vi.mock("../../accounts/useMoneyAccounts", () => ({
  useMoneyAccounts: () => ({ accounts: [], checkIns: [], setCheckIns: vi.fn() }),
  useAccountList: () => [{ id: "eb", name: "Eurobank", kind: "bank", main: true }],
}));
vi.mock("../../accounts/AccountPicker", () => ({ default: () => <p>card picker</p> }));
vi.mock("../../accounts/ReviewCard", () => ({ default: () => <p>card effect</p> }));
vi.mock("../../categories/CategoryPicker", () => ({ default: () => null }));

const categories = [{ id: "food", name: "Food", icon: "☕", type: "expense", isDefault: false, userId: "u" } as never];

beforeAll(async () => {
  vi.stubEnv("TZ", "Europe/Athens");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 26, 12, 0));
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});
afterEach(cleanup);
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A Firestore Timestamp, the way the SDK hands one back. */
const stamp = (date: Date) => ({ seconds: date.getTime() / 1000, nanoseconds: 0, toDate: () => new Date(date.getTime()) });

const tx = (date: Date) => ({ id: "t-1", userId: "u", amount: 12, type: "expense", categoryId: "food", date: stamp(date), description: "Groceries", notes: "", accountId: "eb", createdAt: date, updatedAt: date }) as unknown as Transaction;

async function openDetails(transaction: Transaction) {
  const onSubmit = vi.fn<(id: string, data: UpdateTransactionDTO) => Promise<void>>(async () => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <EditTransactionModal transaction={transaction} isOpen onClose={() => {}} categories={categories} onSubmit={onSubmit} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: i18n.t("common.next") }));
  await user.click(screen.getByRole("button", { name: i18n.t("common.next") }));
  return { user, onSubmit };
}

const notes = () => screen.getByPlaceholderText(i18n.t("common.optionalNote"));
const reviewButton = () => screen.getByRole("button", { name: i18n.t("transactions.reviewChanges") });
const saveButton = () => screen.getByRole("button", { name: i18n.t("transactions.confirmAndSave") });

/** What the date field's button reads ("dd MMM yyyy") for a local calendar day. */
const fieldText = (y: number, m: number, d: number) => format(new Date(y, m, d), "dd MMM yyyy");

describe("the edit form shows the stored day the list shows (Greek time)", () => {
  it.each([
    ["local midnight 14 Oct (gap records, parseISODay writers)", new Date(2026, 9, 14), [2026, 9, 14]],
    ["UTC midnight 14 Oct (the old new Date(\"yyyy-MM-dd\") writer)", new Date(Date.UTC(2026, 9, 14)), [2026, 9, 14]],
    ["local midnight 29 Mar (clocks go forward)", new Date(2026, 2, 29), [2026, 2, 29]],
    ["UTC midnight 29 Mar (= 02:00, before the jump)", new Date(Date.UTC(2026, 2, 29)), [2026, 2, 29]],
    ["local midnight 25 Oct (clocks go back)", new Date(2026, 9, 25), [2026, 9, 25]],
    ["UTC midnight 25 Oct (= 03:00 summer time, before the change)", new Date(Date.UTC(2026, 9, 25)), [2026, 9, 25]],
  ] as [string, Date, [number, number, number]][])("%s", async (_, stored, [y, m, d]) => {
    const transaction = tx(stored);
    // The list row: formatTable(firestoreToDate(date)).
    const listDay = toISODay(firestoreToDate(transaction.date));
    expect(listDay).toBe(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

    const { user, onSubmit } = await openDetails(transaction);
    expect(screen.getByText(fieldText(y, m, d))).toBeInTheDocument();
    // Opened and read back: nothing changed — the date included.
    expect(reviewButton()).toBeDisabled();

    // A change elsewhere saves, and the untouched day is not sent again.
    await user.type(notes(), "weekly shop");
    await user.click(reviewButton());
    expect(screen.getByText(formatTable(firestoreToDate(transaction.date), "en"))).toBeInTheDocument();
    await user.click(saveButton());
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][1].date).toBeUndefined();
    expect(onSubmit.mock.calls[0][1].notes).toBe("weekly shop");
  });

  it("a stored future day (written before the rule) opens, stays, and saves", async () => {
    const { user, onSubmit } = await openDetails(tx(new Date(2026, 9, 30)));
    expect(screen.getByText(fieldText(2026, 9, 30))).toBeInTheDocument();
    await user.type(notes(), "fixed");
    await user.click(reviewButton());
    await user.click(saveButton());
    expect(onSubmit.mock.calls[0][1].date).toBeUndefined();
  });

  it("a day picked in the calendar is saved as that day's local midnight", async () => {
    const { user, onSubmit } = await openDetails(tx(new Date(2026, 9, 14)));
    await user.click(screen.getByText(fieldText(2026, 9, 14)));
    const day13 = document.querySelector(".react-datepicker__day--013:not(.react-datepicker__day--outside-month)") as HTMLElement;
    await user.click(day13);
    expect(screen.getByText(fieldText(2026, 9, 13))).toBeInTheDocument();
    await user.click(reviewButton());
    await user.click(saveButton());
    const saved = onSubmit.mock.calls[0][1].date as Date;
    expect(saved.getTime()).toBe(new Date(2026, 9, 13).getTime());
    expect(toISODay(saved)).toBe("2026-10-13");
  });
});

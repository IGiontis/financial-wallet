import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { billsNeedingAttention } from "./billsUtils";
import { useBills, useBillsNeedingAttention, useMarkBillPaid } from "./useBills";
import { useToday } from "../../shared/hooks/useToday";
import type { Bill, BillWithStatus } from "../../shared/types/IndexTypes";

// The number on the menu and the number on the «Πληρωμές» tab.
//
// The owner paid one of two bills and the tab said 1 while the menu still said
// 2. Both counted with `billsNeedingAttention` on the same cached bills — but
// each on its own clock: the page on the moment it opened, the menu on the
// moment the bills last changed. A phone keeps the app open overnight, so the
// page counted yesterday and the menu today, and a bill that came within the
// week overnight was on one and not the other. Now both read the app's one day
// (`useToday`). Every count below is also worked out by hand.

const api = vi.hoisted(() => ({
  getBills: vi.fn(),
  getBillPayments: vi.fn(),
  markBillPaid: vi.fn(),
  newDocId: vi.fn(),
  getTransactions: vi.fn(),
}));

vi.mock("../../firebase/firestore", () => api);
vi.mock("../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));

/** A monthly bill begun in June, so nothing from before June can be owed. */
const monthly = (id: string, name: string, amount: number, dueDay: number): Bill => ({
  id,
  userId: "u1",
  name,
  amount,
  categoryId: "c",
  frequency: "monthly",
  dueDay,
  isActive: true,
  anchorDate: new Date(2026, 5, 1),
  createdAt: new Date(2026, 5, 1),
  updatedAt: new Date(2026, 5, 1),
});

// June 2026, nothing paid yet:
//   Phone  due the 18th — late from the 19th on.
//   Power  due the 25th — within the week from the 18th on.
//   Rent   due the 28th — within the week from the 21st on (7 days), not on the 20th (8).
const phone = monthly("phone", "Phone", 15, 18);
const power = monthly("power", "Power", 80, 25);
const rent = monthly("rent", "Rent", 450, 28);

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const cached = () => client.getQueryData<BillWithStatus[]>(["bills", "u1"]) ?? [];

/** The menu's badge, and the «Πληρωμές» tab exactly as BillsPage counts it. */
function useBothCounts() {
  const { data: bills = [] } = useBills();
  const now = useToday();
  return {
    menu: useBillsNeedingAttention(),
    tab: useMemo(() => billsNeedingAttention(bills, now), [bills, now]),
    pay: useMarkBillPaid(),
    loaded: bills.length > 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  api.getBillPayments.mockResolvedValue([]);
  api.getTransactions.mockResolvedValue([]);
  api.markBillPaid.mockImplementation(() => Promise.resolve({ paymentId: "pay-1", transactionId: "tx-1" }));
  api.newDocId.mockImplementation((collection: string) => `${collection}-new`);
});

afterEach(() => vi.useRealTimers());

describe("the bills badge — menu and «Πληρωμές» tab", () => {
  it("pay one of two due bills: both say 1, at once", async () => {
    vi.setSystemTime(new Date(2026, 5, 20, 10)); // Saturday 20 June
    api.getBills.mockResolvedValue([{ ...phone }, { ...power }]);
    const { result } = renderHook(useBothCounts, { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // By hand: Phone 2 days late + Power due in 5 days = 2.
    expect(result.current.menu).toBe(2);
    expect(result.current.tab).toBe(2);

    act(() => result.current.pay.mutate({ bill: cached().find((b) => b.id === "power")!, paidDate: new Date(2026, 5, 20) }));

    // Straight from the cache, before the server answers: Phone alone.
    await waitFor(() => expect(result.current.menu).toBe(1));
    expect(result.current.tab).toBe(1);
    // No second read: the payment went into the cached list.
    expect(api.getBills).toHaveBeenCalledTimes(1);
  });

  it("a page left open overnight counts today, as the menu does", async () => {
    // Opened at 23:00 on the 20th, as the phone left it.
    vi.setSystemTime(new Date(2026, 5, 20, 23));
    api.getBills.mockResolvedValue([{ ...phone }, { ...power }, { ...rent }]);
    const { result } = renderHook(useBothCounts, { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // By hand on the 20th: Phone late, Power in 5 days; Rent 8 days off = 2.
    expect(result.current.menu).toBe(2);
    expect(result.current.tab).toBe(2);

    // 09:00 on the 21st: the app comes back to the screen.
    vi.setSystemTime(new Date(2026, 5, 21, 9));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    // By hand on the 21st: Phone late, Power in 4 days, Rent in 7 = 3.
    expect(result.current.menu).toBe(3);
    expect(result.current.tab).toBe(3);

    act(() => result.current.pay.mutate({ bill: cached().find((b) => b.id === "power")!, paidDate: new Date(2026, 5, 21) }));
    await waitFor(() => expect(result.current.menu).toBe(2));
    // Phone and Rent on both. The page's old clock — the 20th — said 1 here.
    expect(result.current.tab).toBe(2);
    expect(billsNeedingAttention(cached(), new Date(2026, 5, 20, 23))).toBe(1);
  });

  it("moves to the new day at midnight even with nothing touched", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 5, 20, 23, 59, 50));
    api.getBills.mockResolvedValue([{ ...phone }, { ...power }, { ...rent }]);
    const { result } = renderHook(useBothCounts, { wrapper });
    await vi.waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.menu).toBe(2);

    // Past midnight: Rent is now 7 days off.
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.menu).toBe(3);
    expect(result.current.tab).toBe(3);
  });
});

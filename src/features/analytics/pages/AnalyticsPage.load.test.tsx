import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import i18n from "../../../i18n";
import { AnalyticsPage } from "./AnalyticsPage";
import { SKELETON_MAX_MS } from "../../../shared/hooks/usePageLoad";
import { AUTO_RETRY_DELAYS, installQueryAutoRetry } from "../../../lib/queryAutoRetry";

// The endless skeleton as it was: the Statistics page (like the Overview and the
// Planner) checked `isLoading || isError`, so a read that kept failing — and is
// retried for minutes by `queryAutoRetry` — kept the skeleton for ever. Now the
// skeleton for `SKELETON_MAX_MS`, then the page's frame with a quiet line, and
// the page itself once a retry gets through.

const read = vi.hoisted(() => ({ fn: (): Promise<unknown[]> => Promise.resolve([]) }));

vi.mock("../../transactions/hooks/useTransactions", () => ({
  useTransactions: () => useQuery({ queryKey: ["transactions", "u"], queryFn: () => read.fn() }),
  useCategories: () => ({ data: [], isSuccess: true }),
}));
vi.mock("../useFixedMonth", () => ({ useFixedMonth: () => ({ income: 0, bills: 0 }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }) }));

const ERROR_WORDS = /error|fail|retry|try again|didn.t load|σφάλμα|απέτυχ|ξαναδοκίμασε|δοκίμασε ξανά/i;
const WAITING = "Your records will appear here as soon as they arrive.";

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the Statistics page when its records will not load", () => {
  it("a read that keeps failing: skeleton, then the quiet line within SKELETON_MAX_MS; a later retry that gets through fills the page", async () => {
    let calls = 0;
    read.fn = async () => {
      calls += 1;
      if (calls < 3) throw new Error("unavailable");
      return [];
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const uninstall = installQueryAutoRetry(client);
    const { container } = render(
      <QueryClientProvider client={client}>
        <AnalyticsPage />
      </QueryClientProvider>,
    );

    await advance(10);
    expect(container.querySelector(".react-loading-skeleton")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: i18n.t("analytics.title") })).toBeNull();

    await advance(SKELETON_MAX_MS);
    // Before: still the skeleton here, and for as long as the read failed.
    expect(screen.getByRole("heading", { name: i18n.t("analytics.title") })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(WAITING);
    expect(screen.queryByText(i18n.t("analytics.nothingYet"))).toBeNull();
    expect(container.textContent).not.toMatch(ERROR_WORDS);

    // The retries go on silently (5 s, then 15 s): the third read answers — an
    // account with no records, so its invitation, and no quiet line any more.
    await advance(AUTO_RETRY_DELAYS[0] + AUTO_RETRY_DELAYS[1]);
    expect(calls).toBe(3);
    expect(screen.queryByText(WAITING)).toBeNull();
    expect(screen.getByText(i18n.t("analytics.nothingYet"))).toBeInTheDocument();
    uninstall();
  });
});

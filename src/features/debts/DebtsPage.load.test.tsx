import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { DebtsPage } from "./DebtsPage";
import { computeDebtStatus } from "./debtsUtils";
import { SKELETON_MAX_MS } from "../../shared/hooks/usePageLoad";
import type { Debt } from "../../shared/types/IndexTypes";

// The owner's report: a page kept its loading skeleton for ever. The Debts page
// against a real TanStack query whose read the test answers — or never answers.

const read = vi.hoisted(() => ({ fn: (): Promise<unknown[]> => Promise.resolve([]) }));

vi.mock("./useDebts", () => ({
  useDebts: () => useQuery({ queryKey: ["debts", "u"], queryFn: () => read.fn() }),
  useHealDebtCash: () => {},
  useDeleteClosedDebts: () => ({ isPending: false, mutateAsync: async () => undefined }),
}));
vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: [], isSuccess: true, isFetching: false }) }));
vi.mock("./AddDebtModal", () => ({ default: () => null }));
vi.mock("./DebtOrder", () => ({ DebtOrder: () => null }));
vi.mock("../../shared/hooks/usePageAdd", () => ({ usePageAdd: () => {} }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }) }));

const day = new Date(2026, 9, 1);
const nikos = computeDebtStatus({ id: "a", userId: "u", person: "Nikos", direction: "owed_by_me", amount: 100, date: day, createdAt: day, updatedAt: day } as Debt, []);

/** No word that tells the user something failed or asks them to act. */
const ERROR_WORDS = /error|fail|retry|try again|didn.t load|σφάλμα|απέτυχ|ξαναδοκίμασε|δοκίμασε ξανά/i;

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DebtsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const skeletonShown = (container: HTMLElement) => container.querySelector(".react-loading-skeleton") !== null;
const header = () => screen.queryByRole("heading", { name: "Debts & loans" });
const add = () => screen.queryByRole("button", { name: "Record a loan" });

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the Debts page while its list loads", () => {
  it("a read that never answers: the skeleton, then within SKELETON_MAX_MS the page's frame, its add and a quiet line — no error words", async () => {
    read.fn = () => new Promise(() => {});
    const { container } = renderPage();
    expect(skeletonShown(container)).toBe(true);
    expect(header()).toBeNull();

    await advance(SKELETON_MAX_MS);
    expect(skeletonShown(container)).toBe(false);
    expect(header()).toBeInTheDocument();
    expect(add()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Your records will appear here as soon as they arrive.");
    // Not the empty state: nobody has checked that there are no debts.
    expect(screen.queryByText(i18n.t("debts.empty"))).toBeNull();
    expect(container.textContent).not.toMatch(ERROR_WORDS);
  });

  it("data arriving after the wait replaces the quiet line", async () => {
    let answer!: (rows: unknown[]) => void;
    read.fn = () => new Promise((resolve) => (answer = resolve));
    renderPage();
    await advance(SKELETON_MAX_MS * 2);
    expect(screen.getByRole("status")).toHaveTextContent("Your records will appear here");

    answer([nikos]);
    await advance(10);
    expect(screen.queryByText("Your records will appear here as soon as they arrive.")).toBeNull();
    expect(screen.getByRole("link", { name: /^Nikos/ })).toBeInTheDocument();
  });

  it("a read that failed is not «no debts»: the skeleton, then the quiet line — never the empty state", async () => {
    read.fn = () => Promise.reject(new Error("unavailable"));
    const { container } = renderPage();
    await advance(10);
    // TanStack's `isLoading` is false here; the old page drew its empty state now.
    expect(skeletonShown(container)).toBe(true);
    await advance(SKELETON_MAX_MS);
    expect(screen.getByRole("status")).toHaveTextContent("Your records will appear here");
    expect(container.textContent).not.toMatch(ERROR_WORDS);
  });

  it("a genuinely empty account: the invitation as soon as the read answers [], not a skeleton", async () => {
    read.fn = () => Promise.resolve([]);
    const { container } = renderPage();
    await advance(10);
    expect(skeletonShown(container)).toBe(false);
    expect(screen.getByText(i18n.t("debts.empty"))).toBeInTheDocument();
    expect(add()).toBeEnabled();
    // The invitation carries the page's add, as Bills and Goals do (rule 7).
    expect(screen.getByRole("button", { name: "+ Record a loan" })).toBeEnabled();
    expect(screen.queryByText("Your records will appear here as soon as they arrive.")).toBeNull();
  });
});

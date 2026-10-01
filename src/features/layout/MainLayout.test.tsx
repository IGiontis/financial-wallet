import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import i18n from "../../i18n";
import { MainLayout } from "./MainLayout";
import { ALL_DESTINATIONS } from "./navConfig";

// The shell's navigation, on the real layout: the phone bar, the menu sheet,
// the wide-screen sidebar and the «+» that opens the add form from any page.
// Both navigations are in the document here — the CSS that hides one per width
// is not loaded — so every query is scoped to the landmark it is about.

const state = vi.hoisted(() => ({ billsDue: 0 }));

vi.mock("../bills/useBills", () => ({ useBillsNeedingAttention: () => state.billsDue }));
vi.mock("../../shared/hooks/useAuth", () => ({
  useAuth: () => ({ currentUser: { uid: "u1", email: "ilias@example.com", displayName: null, providerData: [{ providerId: "password" }] }, loading: false }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ exchangeRateKeys: { user: (uid: string) => ["userCurrency", uid], rates: () => ["exchangeRates"] } }));
vi.mock("../../firebase/firestore", () => ({
  getUser: vi.fn(async () => ({ username: "ilias", firstName: "Ilias", lastName: "Giontis", locale: "en" })),
  updateUser: vi.fn(async () => undefined),
}));
vi.mock("../../firebase/auth", () => ({ logout: vi.fn(async () => undefined) }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCreateTransaction: () => ({ mutate: vi.fn() }), useCategories: () => ({ data: [] }) }));
// The form is tested on its own; here only that the shell opens it.
vi.mock("../transactions/components/AddTransactionModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="add form" /> : null),
}));

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route path="*" element={<Where />} />
            <Route index element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const bar = () => screen.getByRole("navigation", { name: "Quick navigation" });
const sidebar = () => screen.getByRole("navigation", { name: "Main navigation" });

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  state.billsDue = 0;
  localStorage.removeItem("sidebar-collapsed");
});

describe("the phone bar", () => {
  it("has Overview, Transactions, «+», Bills and Menu, in that order", () => {
    renderAt("/");
    const items = within(bar())
      .getAllByRole("listitem")
      .map((li) => li.querySelector("a, button")?.textContent);
    expect(items).toEqual(["Overview", "Transactions", "New", "Bills", "Menu"]);
    expect(within(bar()).getByRole("button", { name: "New transaction" })).toBeInTheDocument();
  });

  it("marks the page you are on, and only that one", () => {
    renderAt("/transactions");
    expect(within(bar()).getByRole("link", { name: "Transactions" })).toHaveAttribute("aria-current", "page");
    expect(within(bar()).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(within(bar()).getByRole("link", { name: "Bills" })).not.toHaveAttribute("aria-current");
  });

  it("does not take the Overview for every page — it is current on / only", () => {
    renderAt("/");
    expect(within(bar()).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(within(bar()).getByRole("link", { name: "Transactions" })).not.toHaveAttribute("aria-current");
  });

  it("puts the bills that need paying on Bills, read as part of its name", () => {
    state.billsDue = 2;
    renderAt("/");
    const bills = within(bar()).getByRole("link", { name: "Bills, 2 bills need paying" });
    expect(bills).toHaveAttribute("href", "/bills");
    expect(within(bills).getByText("2")).toBeInTheDocument();
    // Bills is on the bar, so the menu has nothing to flag.
    expect(within(bar()).getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("caps the count at 9+", () => {
    state.billsDue = 14;
    renderAt("/");
    expect(within(within(bar()).getByRole("link", { name: "Bills, 14 bills need paying" })).getByText("9+")).toBeInTheDocument();
  });
});

describe("the «+»", () => {
  it("opens the add form over the page, without going anywhere", async () => {
    renderAt("/planner");
    await userEvent.click(within(bar()).getByRole("button", { name: "New transaction" }));
    expect(await screen.findByRole("dialog", { name: "add form" })).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/planner");
  });

  it("is the sidebar's first button too", async () => {
    renderAt("/goals");
    const sidebarAdd = screen.getAllByRole("button", { name: "New transaction" }).find((button) => !bar().contains(button));
    await userEvent.click(sidebarAdd!);
    expect(await screen.findByRole("dialog", { name: "add form" })).toBeInTheDocument();
  });

  it("opens with N, but not while typing and not with Ctrl", async () => {
    renderAt("/");
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "n", code: "KeyN" });
    fireEvent.keyDown(window, { key: "n", code: "KeyN", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "add form" })).not.toBeInTheDocument();

    // The key, not the letter: on a Greek layout the same key types "ν".
    fireEvent.keyDown(window, { key: "ν", code: "KeyN" });
    expect(await screen.findByRole("dialog", { name: "add form" })).toBeInTheDocument();
    input.remove();
  });
});

describe("the menu", () => {
  it("lists every destination, settings included", async () => {
    renderAt("/");
    await userEvent.click(within(bar()).getByRole("button", { name: "Menu" }));
    const sheet = screen.getByRole("dialog", { name: "Menu" });

    const hrefs = within(sheet)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(new Set(hrefs)).toEqual(new Set(ALL_DESTINATIONS.map((d) => d.path)));
    expect(ALL_DESTINATIONS).toHaveLength(11);
    // In the mockup's groups.
    const pages = within(sheet).getByRole("navigation", { name: "All pages" });
    expect(within(pages).getByRole("list", { name: "Plan" })).toHaveTextContent(/Planner.*Allocation.*Goals/);
    expect(within(pages).getByRole("list", { name: "What you own & owe" })).toHaveTextContent(/Banks & cash.*Investments.*Debts & loans/);
    expect(within(pages).getByRole("list", { name: "Activity" })).toHaveTextContent(/Transactions.*Bills/);
    // Who you are, theme, language and signing out come with it.
    expect(within(sheet).getByRole("link", { name: /ilias.*Settings & profile/ })).toHaveAttribute("href", "/settings");
    expect(within(sheet).getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(within(sheet).getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("marks the current page inside it", async () => {
    renderAt("/allocation");
    await userEvent.click(within(bar()).getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("link", { name: "Allocation" })).toHaveAttribute("aria-current", "page");
  });

  it("closes with Esc and hands focus back to the Menu button", async () => {
    renderAt("/");
    const menu = within(bar()).getByRole("button", { name: "Menu" });
    await userEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    // The sheet has the focus. Sent as a browser sends it: Bootstrap's sheet
    // reads `keyCode`, which user-event leaves at 0.
    expect(screen.getByRole("dialog", { name: "Menu" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape", keyCode: 27 });
    fireEvent.keyUp(document.activeElement!, { key: "Escape", code: "Escape", keyCode: 27 });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument(), { timeout: 2000 });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(menu).toHaveFocus(), { timeout: 2000 });
  });

  it("closes when a page is chosen, and goes there", async () => {
    renderAt("/");
    await userEvent.click(within(bar()).getByRole("button", { name: "Menu" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("link", { name: "Debts & loans" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/debts");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument(), { timeout: 2000 });
  });

  it("switches the language from inside, and keeps it on the account", async () => {
    const { updateUser } = await import("../../firebase/firestore");
    renderAt("/");
    await userEvent.click(within(bar()).getByRole("button", { name: "Menu" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("button", { name: "Ελληνικά" }));
    expect(i18n.resolvedLanguage).toBe("el");
    expect(updateUser).toHaveBeenCalledWith("u1", { locale: "el" });
    await act(() => i18n.changeLanguage("en"));
  });
});

describe("the sidebar", () => {
  it("shows every page in its groups, the current one marked", () => {
    renderAt("/accounts");
    const links = within(sidebar()).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(ALL_DESTINATIONS.filter((d) => d.path !== "/settings").map((d) => d.path));
    expect(within(sidebar()).getByRole("link", { name: "Banks & cash" })).toHaveAttribute("aria-current", "page");
  });

  it("folds to icons, still naming every link, and remembers it", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(within(sidebar()).getByRole("link", { name: "Planner" })).toBeInTheDocument();
    expect(within(sidebar()).queryByText("Planner")).not.toBeInTheDocument();
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  });
});

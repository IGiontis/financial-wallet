import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import i18n from "../../i18n";
import { ThemeProvider } from "../../context/ThemeContext";
import { MainLayout } from "./MainLayout";

// The shell's navigation in each of the three menu styles. The styles are CSS
// only — the stylesheets are not loaded here — so what these check is the part
// the styles must not change: the same links in the same groups and order, the
// same badge, the same drawer behaviour, whichever one is chosen.

const state = vi.hoisted(() => ({ billsDue: 0, incomesWaiting: 0, narrow: false }));

vi.mock("../bills/useBills", () => ({ useBillsNeedingAttention: () => state.billsDue }));
vi.mock("../incomes/useIncomes", () => ({ useIncomesNeedingAttention: () => state.incomesWaiting }));
vi.mock("../../shared/hooks/useAuth", () => ({
  useAuth: () => ({ currentUser: { uid: "u1", email: "ilias@example.com", displayName: null, providerData: [{ providerId: "password" }] }, loading: false }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ exchangeRateKeys: { user: (uid: string) => ["userCurrency", uid], rates: () => ["exchangeRates"] } }));
vi.mock("../../firebase/firestore", () => ({
  getUser: vi.fn(async () => ({ username: "ilias", firstName: "Ilias", lastName: "Giontis", locale: "en" })),
}));
vi.mock("../../firebase/auth", () => ({ logout: vi.fn(async () => undefined) }));

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route path="*" element={<Where />} />
              <Route index element={<Where />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );

const sidebar = () => screen.getByRole("navigation", { name: "Main navigation" });
const HOME = "MyFiWallet — to the Overview";
/** The menu's links, without the logo — which goes home and is no item of the menu. */
const navLinks = () =>
  within(sidebar())
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-label") !== HOME);
const menuButton = () => screen.getByRole("button", { name: /^Menu/ });

// Every destination the sidebar shows as a link, in its order, with
// Transactions folded: it is a button over its two pages, which show when it
// opens (see "an item with pages under it").
// «Συναλλαγές», «Έσοδα» and «Πάγια» open into their pages, so they are not links themselves.
const ALL_PATHS = ["/", "/analytics", "/planner", "/calendar", "/goals", "/accounts", "/investments", "/debts", "/settings"];

const original = window.matchMedia;

beforeAll(async () => {
  // Phone or desktop by `state.narrow`; never dark.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 991.98px") ? state.narrow : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  window.matchMedia = original;
});

beforeEach(() => {
  state.billsDue = 0;
  state.incomesWaiting = 0;
  state.narrow = false;
  localStorage.removeItem("sidebar-collapsed");
  localStorage.removeItem("nav-style");
  document.documentElement.removeAttribute("data-nav-style");
});

describe.each(["a", "b", "c"] as const)("menu style %s", (style) => {
  beforeEach(() => localStorage.setItem("nav-style", JSON.stringify(style)));

  it("is the style the shell wears", () => {
    renderAt("/");
    expect(document.documentElement).toHaveAttribute("data-nav-style", style);
  });

  it("lists the same links, in the same four groups and the same order", () => {
    renderAt("/");
    const hrefs = navLinks()
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(ALL_PATHS);

    const group = (name: string) =>
      within(within(sidebar()).getByRole("list", { name }))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
    expect(group("Where you stand")).toEqual(["/", "/analytics"]);
    // Every one of them opens into its pages: no plain link in the group at all.
    expect(within(within(sidebar()).getByRole("list", { name: "Day to day" })).queryAllByRole("link")).toEqual([]);
    const daily = within(within(sidebar()).getByRole("list", { name: "Day to day" }));
    for (const name of ["Transactions", "Income", "Bills"]) expect(daily.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    expect(group("Plan")).toEqual(["/planner", "/calendar", "/goals"]);
    expect(group("What you own & owe")).toEqual(["/accounts", "/investments", "/debts"]);
  });

  it("takes the name and logo home, to the Overview, without marking itself as the page", () => {
    renderAt("/goals");
    const home = within(sidebar()).getByRole("link", { name: HOME });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveTextContent("MyFiWallet");
    expect(home).not.toHaveAttribute("aria-current");
  });

  it("marks the page you are on, and only that one", () => {
    renderAt("/goals");
    const current = navLinks()
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.getAttribute("href"))).toEqual(["/goals"]);
  });

  it("puts the bills that need paying on Bills, read as part of its name, and a dot on ☰", () => {
    state.billsDue = 2;
    renderAt("/");
    const bills = within(sidebar()).getByRole("button", { name: "Bills — 2 bills need paying" });
    expect(within(bills).getAllByText("2")[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu — 2 bills need paying" })).toBeInTheDocument();
    // Open, the count is on the page where they are paid as well.
    fireEvent.click(bills);
    expect(within(within(sidebar()).getByRole("link", { name: /^Payments/ })).getByText("2")).toBeInTheDocument();
    expect(within(sidebar()).getByRole("link", { name: /^Payments/ })).toHaveAttribute("href", "/bills/pay");
  });

  it("puts the incomes that need a look on Income, in amber rather than the bills' red", () => {
    state.incomesWaiting = 1;
    renderAt("/");
    const incomes = within(sidebar()).getByRole("button", { name: "Income — 1 income needs a look" });
    expect(within(incomes).getAllByText("1")[0]).toHaveClass("nav-badge", "nav-badge-word", "nav-badge-warning");
    fireEvent.click(incomes);
    expect(within(sidebar()).getByRole("link", { name: /^Receipts/ })).toHaveAttribute("href", "/incomes/record");
  });

  it("draws nothing on Bills when nothing is due", () => {
    renderAt("/");
    expect(within(sidebar()).getByRole("button", { name: "Bills" })).toHaveTextContent(/^Bills$/);
  });

  it("keeps a closed section lit while one of its pages is open", () => {
    renderAt("/bills/pay");
    const bills = within(sidebar()).getByRole("button", { name: "Bills" });
    // Open, the page itself is the lit one.
    expect(bills).toHaveAttribute("aria-expanded", "true");
    expect(bills).not.toHaveClass("nav-link-current");
    // Closed, the section stands in for it — name and all, not only the icon.
    fireEvent.click(bills);
    expect(bills).toHaveAttribute("aria-expanded", "false");
    expect(bills).toHaveClass("nav-link-current");
    expect(within(sidebar()).getByRole("button", { name: "Income" })).not.toHaveClass("nav-link-current");
  });
});

describe("the badge", () => {
  it("caps the count at 9+", () => {
    state.billsDue = 14;
    renderAt("/");
    expect(within(within(sidebar()).getByRole("button", { name: "Bills — 14 bills need paying" })).getAllByText("9+")[0]).toBeInTheDocument();
  });
});

describe("the menu style", () => {
  it("is Α for anyone who never chose", () => {
    renderAt("/");
    expect(document.documentElement).toHaveAttribute("data-nav-style", "a");
  });

  it("falls back to Α for a stored value it does not recognise", () => {
    localStorage.setItem("nav-style", JSON.stringify("z"));
    renderAt("/");
    expect(document.documentElement).toHaveAttribute("data-nav-style", "a");
  });
});

describe("the drawer on a phone", () => {
  beforeEach(() => {
    state.narrow = true;
  });

  it("opens from ☰ with the focus on its ✕, and keeps the page behind it out of reach", async () => {
    renderAt("/");
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(sidebar()).not.toHaveClass("open");

    await userEvent.click(menuButton());
    expect(sidebar()).toHaveClass("open");
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
    expect(document.querySelector(".main-content")).toHaveAttribute("inert");
  });

  it("closes with Esc and gives the focus back to ☰", async () => {
    renderAt("/");
    await userEvent.click(menuButton());
    await userEvent.keyboard("{Escape}");
    expect(sidebar()).not.toHaveClass("open");
    expect(document.querySelector(".main-content")).not.toHaveAttribute("inert");
    expect(menuButton()).toHaveFocus();
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with its ✕ and with a tap on the page beside it", async () => {
    const { container } = renderAt("/");
    await userEvent.click(menuButton());
    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(sidebar()).not.toHaveClass("open");
    expect(menuButton()).toHaveFocus();

    await userEvent.click(menuButton());
    await userEvent.click(container.querySelector(".sidebar-overlay")!);
    expect(sidebar()).not.toHaveClass("open");
  });

  it("closes when a link is followed, and goes there", async () => {
    renderAt("/");
    await userEvent.click(menuButton());
    await userEvent.click(within(sidebar()).getByRole("link", { name: "Planner" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/planner");
    expect(sidebar()).not.toHaveClass("open");
  });

  it("is never the collapsed rail, even if a wide window left it collapsed", async () => {
    localStorage.setItem("sidebar-collapsed", "true");
    renderAt("/");
    await userEvent.click(menuButton());
    // No rail tooltips in the drawer: it shows its words.
    await userEvent.hover(within(sidebar()).getByRole("link", { name: "Goals" }));
    expect(document.querySelector(".sidebar-tip")).toBeNull();
  });
});

describe("an item with pages under it", () => {
  const transactions = () => within(sidebar()).getByRole("button", { name: "Transactions" });

  it("opens in place on a tap, new first, the list second, the ledger third, and folds away again", async () => {
    localStorage.setItem("sidebar-collapsed", "false");
    renderAt("/");
    await userEvent.click(transactions());
    expect(transactions()).toHaveAttribute("aria-expanded", "true");
    const pages = within(document.getElementById(transactions().getAttribute("aria-controls")!)!).getAllByRole("link");
    expect(pages.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["New transaction", "/transactions/new"],
      ["All transactions", "/transactions"],
      ["Ledger", "/transactions/ledger"],
    ]);

    await userEvent.click(transactions());
    expect(transactions()).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar()).queryByRole("link", { name: "New transaction" })).toBeNull();
  });

  it("is already open on one of its pages, with that page marked and not the other", () => {
    localStorage.setItem("sidebar-collapsed", "false");
    renderAt("/transactions/new");
    expect(transactions()).toHaveAttribute("aria-expanded", "true");
    expect(within(sidebar()).getByRole("link", { name: "New transaction" })).toHaveAttribute("aria-current", "page");
    // The list's path is the start of this one; it must not light up as well.
    expect(within(sidebar()).getByRole("link", { name: "All transactions" })).not.toHaveAttribute("aria-current");
  });

  it("goes where its page points", async () => {
    localStorage.setItem("sidebar-collapsed", "false");
    renderAt("/");
    await userEvent.click(transactions());
    await userEvent.click(within(sidebar()).getByRole("link", { name: "New transaction" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/transactions/new");
  });

  it("on the collapsed rail opens its pages beside the icon, and closes on a choice", async () => {
    localStorage.setItem("sidebar-collapsed", "true");
    renderAt("/");
    await userEvent.click(transactions());
    const flyout = document.querySelector(".sidebar-flyout") as HTMLElement;
    expect(flyout).toHaveTextContent("Transactions");
    await userEvent.click(within(flyout).getByRole("link", { name: "All transactions" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/transactions");
    expect(document.querySelector(".sidebar-flyout")).toBeNull();
  });

  it("on the collapsed rail closes on Esc without going anywhere", async () => {
    localStorage.setItem("sidebar-collapsed", "true");
    renderAt("/");
    await userEvent.click(transactions());
    expect(document.querySelector(".sidebar-flyout")).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector(".sidebar-flyout")).toBeNull();
    expect(screen.getByTestId("path")).toHaveTextContent("/");
  });
});

describe("the collapsed rail on a wide screen", () => {
  beforeEach(() => {
    localStorage.setItem("sidebar-collapsed", "true");
  });

  it("keeps every link named, and labels an icon beside it on hover, bills and all", async () => {
    state.billsDue = 2;
    renderAt("/");
    expect(navLinks()).toHaveLength(ALL_PATHS.length);
    // Bills is an icon that opens its pages here — still named with its count.
    expect(within(sidebar()).getByRole("button", { name: "Bills — 2 bills need paying" })).toBeInTheDocument();

    const planner = within(sidebar()).getByRole("link", { name: "Planner" });
    await userEvent.hover(planner);
    const tip = document.querySelector(".sidebar-tip");
    expect(tip).toHaveTextContent("Planner");
    // The link already says this; the tooltip is not read a second time.
    expect(tip).toHaveAttribute("aria-hidden", "true");

    await userEvent.unhover(planner);
    expect(document.querySelector(".sidebar-tip")).toBeNull();
  });

  it("shows the label for the keyboard too, and Esc puts it away", async () => {
    renderAt("/");
    const goals = within(sidebar()).getByRole("link", { name: "Goals" });
    // Tabbed to, as the keyboard gets there.
    for (let i = 0; i < 30 && document.activeElement !== goals; i++) await userEvent.tab();
    expect(goals).toHaveFocus();
    expect(document.querySelector(".sidebar-tip")).toHaveTextContent("Goals");
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector(".sidebar-tip")).toBeNull();
    expect(goals).toHaveFocus();
  });

  it("does not label the rows of an expanded bar, which show their words", async () => {
    localStorage.setItem("sidebar-collapsed", "false");
    renderAt("/");
    await userEvent.hover(within(sidebar()).getByRole("link", { name: "Goals" }));
    expect(document.querySelector(".sidebar-tip")).toBeNull();
  });

  it("expands again from its button, which says which way it goes", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(sidebar()).not.toHaveClass("collapsed");
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    expect(localStorage.getItem("sidebar-collapsed")).toBe("false");
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
const menuButton = () => screen.getByRole("button", { name: /^Menu/ });

// Every destination, in the order the sidebar lists them.
const ALL_PATHS = ["/", "/analytics", "/transactions", "/incomes", "/bills", "/planner", "/allocation", "/goals", "/accounts", "/investments", "/debts", "/settings"];

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

  it("lists the same twelve links, in the same four groups and the same order", () => {
    renderAt("/");
    const hrefs = within(sidebar())
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(ALL_PATHS);

    const group = (name: string) =>
      within(within(sidebar()).getByRole("list", { name }))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
    expect(group("Where you stand")).toEqual(["/", "/analytics"]);
    expect(group("Day to day")).toEqual(["/transactions", "/incomes", "/bills"]);
    expect(group("Plan")).toEqual(["/planner", "/allocation", "/goals"]);
    expect(group("What you own & owe")).toEqual(["/accounts", "/investments", "/debts"]);
  });

  it("marks the page you are on, and only that one", () => {
    renderAt("/goals");
    const current = within(sidebar())
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.getAttribute("href"))).toEqual(["/goals"]);
  });

  it("puts the bills that need paying on Bills, read as part of its name, and a dot on ☰", () => {
    state.billsDue = 2;
    renderAt("/");
    const bills = within(sidebar()).getByRole("link", { name: "Bills — 2 bills need paying" });
    expect(bills).toHaveAttribute("href", "/bills");
    expect(within(bills).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu — 2 bills need paying" })).toBeInTheDocument();
  });

  it("puts the incomes that need a look on Income, in amber rather than the bills' red", () => {
    state.incomesWaiting = 1;
    renderAt("/");
    const incomes = within(sidebar()).getByRole("link", { name: "Income — 1 income needs a look" });
    expect(incomes).toHaveAttribute("href", "/incomes");
    expect(within(incomes).getByText("1")).toHaveClass("nav-badge", "nav-badge-warning");
  });

  it("draws nothing on Bills when nothing is due", () => {
    renderAt("/");
    expect(within(sidebar()).getByRole("link", { name: "Bills" })).toHaveTextContent(/^Bills$/);
  });
});

describe("the badge", () => {
  it("caps the count at 9+", () => {
    state.billsDue = 14;
    renderAt("/");
    expect(within(within(sidebar()).getByRole("link", { name: "Bills — 14 bills need paying" })).getByText("9+")).toBeInTheDocument();
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

describe("the collapsed rail on a wide screen", () => {
  beforeEach(() => {
    localStorage.setItem("sidebar-collapsed", "true");
  });

  it("keeps every link named, and labels an icon beside it on hover, bills and all", async () => {
    state.billsDue = 2;
    renderAt("/");
    expect(within(sidebar()).getAllByRole("link")).toHaveLength(ALL_PATHS.length);

    const bills = within(sidebar()).getByRole("link", { name: "Bills — 2 bills need paying" });
    await userEvent.hover(bills);
    const tip = document.querySelector(".sidebar-tip");
    expect(tip).toHaveTextContent("Bills2 bills need paying");
    // The link already says this; the tooltip is not read a second time.
    expect(tip).toHaveAttribute("aria-hidden", "true");

    await userEvent.unhover(bills);
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

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import i18n from "../../../i18n";
import { SettingsPage } from "./SettingsPage";

// Settings in four tabs, each at its own address — the same cards as before,
// each where it belongs. What the cards do is theirs and tested with them; here,
// which ones each tab shows and that the addresses lead to them.

vi.mock("../../../shared/hooks/useAuth", () => ({
  useAuth: () => ({ currentUser: { uid: "u1", email: "ilias@example.com", displayName: null, providerData: [{ providerId: "password" }] }, loading: false }),
}));
vi.mock("../../../firebase/firestore", () => ({
  getUser: vi.fn(async () => ({ firstName: "Ilias", lastName: "Giontis", username: "ilias", currency: "EUR", locale: "en" })),
  updateUser: vi.fn(async () => undefined),
  deleteAllUserData: vi.fn(async () => undefined),
}));
vi.mock("../../../firebase/auth", () => ({
  isGoogleUser: () => false,
  logout: vi.fn(async () => undefined),
  updateUserEmail: vi.fn(),
  updateUserPassword: vi.fn(),
  reauthenticate: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ exchangeRateKeys: { user: (uid: string) => ["userCurrency", uid], rates: () => ["exchangeRates"] } }));
// The data cards are each their own world; stand-ins are enough to see where they land.
vi.mock("../../categories/CategoryManager", () => ({ default: () => <p>category manager</p> }));
vi.mock("../components/OpeningBalanceSection", () => ({ default: () => <p>opening balance form</p> }));
vi.mock("../components/StatementSection", () => ({ default: () => <p>statement button</p> }));
vi.mock("../components/ResetDataSection", () => ({ default: () => <p>reset button</p> }));

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

// As src/lib/router.tsx has it.
const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings">
            <Route index element={<Navigate to="profile" replace />} />
            <Route path=":tab" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const panel = () => screen.getByRole("tabpanel");

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("settings tabs", () => {
  it("opens on Profile at /settings", async () => {
    renderAt("/settings");
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/profile");
    expect(await screen.findByText(/First name/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
    expect(panel()).toHaveAttribute("aria-labelledby", "settings-tab-profile");
    expect(within(panel()).queryByText("Currency")).not.toBeInTheDocument();
  });

  it("sends an address it does not know to Profile", async () => {
    renderAt("/settings/nonsense");
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/profile");
    expect(await screen.findByText(/First name/)).toBeInTheDocument();
  });

  it("shows currency, language, the theme and the menu style under Preferences", async () => {
    renderAt("/settings/preferences");
    expect(await within(panel()).findByText("Currency")).toBeInTheDocument();
    expect(within(panel()).getByText("Language")).toBeInTheDocument();
    expect(within(panel()).getByRole("group", { name: "Theme" })).toHaveTextContent(/Light.*Dark.*Auto/);
    // The menu's three styles, each with its preview, Α chosen until another is.
    const menuStyle = within(panel()).getByRole("group", { name: "Menu style" });
    expect(within(menuStyle).getAllByRole("button").map((b) => b.textContent)).toEqual(["A Classic", "B Blue tone", "C Glass"]);
    expect(within(menuStyle).getByRole("button", { name: "A Classic" })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel()).queryByText(/First name/)).not.toBeInTheDocument();
  });

  it("keeps the data cards together, with the statement right above starting over", async () => {
    renderAt("/settings/data");
    await within(panel()).findByText("opening balance form");
    const text = panel().textContent ?? "";
    const order = ["opening balance form", "category manager", "statement button", "reset button"].map((s) => text.indexOf(s));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(within(panel()).queryByRole("button", { name: "Delete account" })).not.toBeInTheDocument();
  });

  it("puts email, password, signing out and deleting under Account", async () => {
    renderAt("/settings/account");
    expect(await within(panel()).findByText("Email address")).toBeInTheDocument();
    expect(within(panel()).getAllByText("Change password").length).toBeGreaterThan(0);
    expect(within(panel()).getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Delete account" })).toBeInTheDocument();
    expect(within(panel()).queryByText("category manager")).not.toBeInTheDocument();
  });

  it("moves between tabs by address, by click and by arrow key", async () => {
    renderAt("/settings/profile");
    await screen.findByText(/First name/);

    await userEvent.click(screen.getByRole("tab", { name: "Data" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/data");
    expect(screen.getByRole("tab", { name: "Data" })).toHaveAttribute("aria-selected", "true");

    // Only the chosen tab is in the Tab order; the arrows do the rest.
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("tabindex", "-1");
    screen.getByRole("tab", { name: "Data" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/account");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/profile");
    await userEvent.keyboard("{End}");
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/account");
  });

  it("keeps a profile edit while you look at another tab", async () => {
    renderAt("/settings/profile");
    await screen.findByText(/First name/);
    // The form's labels are not tied to their fields, so the field by its name.
    const city = () => document.querySelector<HTMLInputElement>('input[name="city"]')!;
    await userEvent.type(city(), "Athens");
    await userEvent.click(screen.getByRole("tab", { name: "Preferences" }));
    await userEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(city()).toHaveValue("Athens");
  });
});

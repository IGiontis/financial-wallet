import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "react-toastify";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import i18n from "../../../i18n";
import { SettingsPage } from "./SettingsPage";
import { enterDemo, exitDemo, leaveDemo } from "../../../demo/demoMode";
import { openAuthDialog } from "../../../demo/authDialog";

// Settings in four tabs, each at its own address — the same cards as before,
// each where it belongs. What the cards do is theirs and tested with them; here,
// which ones each tab shows and that the addresses lead to them.

vi.mock("../../../shared/hooks/useAuth", () => ({
  useAuth: () => ({ currentUser: { uid: "u1", email: "ilias@example.com", displayName: null, providerData: [{ providerId: "password" }] }, loading: false }),
}));
vi.mock("../../../firebase/firestore", () => ({
  getUser: vi.fn(async () => ({ firstName: "Ilias", lastName: "Giontis", username: "ilias", currency: "EUR", locale: "en" })),
  updateUser: vi.fn(async () => undefined),
}));
vi.mock("../../../firebase/auth", () => ({
  isGoogleUser: () => false,
  logout: vi.fn(async () => undefined),
  updateUserEmail: vi.fn(),
  updateUserPassword: vi.fn(),
  reauthenticate: vi.fn(),
}));
// The deletion's own order is tested in `accountDeletion.test.ts`; here, what
// the dialog sends it and what it says when it stops.
const deletion = vi.hoisted(() => {
  class AccountDeletionError extends Error {
    readonly stage: string;
    readonly code: string;
    constructor(stage: string, code = "") {
      super(stage);
      this.stage = stage;
      this.code = code;
    }
  }
  return { AccountDeletionError, deleteMyAccount: vi.fn<(options: unknown) => Promise<object>>(async () => ({ deleted: 0, leftovers: 0, profile: true })) };
});
vi.mock("../../../firebase/accountDeletion", () => deletion);
// Leaving the demo is a full page load: watched, not run.
vi.mock("../../../demo/demoMode", async (original) => ({ ...(await original<typeof import("../../../demo/demoMode")>()), leaveDemo: vi.fn() }));
vi.mock("../../../demo/authDialog", async (original) => ({ ...(await original<typeof import("../../../demo/authDialog")>()), openAuthDialog: vi.fn() }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ exchangeRateKeys: { user: (uid: string) => ["userCurrency", uid], rates: () => ["exchangeRates"] } }));
// The data cards are each their own world; stand-ins are enough to see where they land.
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

  it("shows currency, language, the theme and the colours under Preferences", async () => {
    renderAt("/settings/preferences");
    expect(await within(panel()).findByText("Currency")).toBeInTheDocument();
    expect(within(panel()).getByText("Language")).toBeInTheDocument();
    expect(within(panel()).getByRole("group", { name: "Theme" })).toHaveTextContent(/Light.*Dark.*Auto/);
    // The three colourways, each with its preview, blue chosen until another is.
    const colours = within(panel()).getByRole("group", { name: "Colours" });
    expect(within(colours).getAllByRole("button").map((b) => b.textContent)).toEqual(["Trust blue", "Black & gold"]);
    expect(within(colours).getByRole("button", { name: "Trust blue" })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel()).queryByText(/First name/)).not.toBeInTheDocument();
  });

  it("keeps the data cards together, with the statement right above starting over", async () => {
    // The «Αρχικό υπόλοιπο» card is gone: the bank and cash readings replaced it.
    renderAt("/settings/data");
    // The categories live on their own page now: here, only the link there.
    expect(await within(panel()).findByRole("link", { name: /Payees & categories/ })).toHaveAttribute("href", "/transactions/names?tab=categories");
    expect(within(panel()).queryByText(/opening balance/i)).toBeNull();
    const text = panel().textContent ?? "";
    const order = ["Payees & categories", "statement button", "reset button"].map((s) => text.indexOf(s));
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
    expect(within(panel()).queryByRole("link", { name: /Payees & categories/ })).not.toBeInTheDocument();
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

describe("deleting the account", () => {
  const openDialog = async () => {
    renderAt("/settings/account");
    await userEvent.click(await within(panel()).findByRole("button", { name: "Delete account" }));
    return screen.getByRole("dialog");
  };

  it("sends the password with the account, and nothing before it is typed", async () => {
    deletion.deleteMyAccount.mockClear();
    const dialog = await openDialog();
    const confirm = within(dialog).getByRole("button", { name: "Delete my account" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByPlaceholderText(/current password/i), "secret");
    await userEvent.click(confirm);
    expect(deletion.deleteMyAccount).toHaveBeenCalledWith({ uid: "u1", google: false, password: "secret" });
  });

  it("says where it stopped: half-way through the data, or with only the sign-in left", async () => {
    deletion.deleteMyAccount.mockRejectedValueOnce(new deletion.AccountDeletionError("data"));
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByPlaceholderText(/current password/i), "secret");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(await within(dialog).findByText(/stopped half-way/)).toBeInTheDocument();

    // With only the sign-in left the device signs out and the page leaves for the
    // sign-in form, so the message also goes in a toast that stays until read.
    const toastError = vi.spyOn(toast, "error");
    deletion.deleteMyAccount.mockRejectedValueOnce(new deletion.AccountDeletionError("sign-in"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(await within(dialog).findByText(/data was deleted, but the sign-in/)).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Sign in again/), { autoClose: false });
    toastError.mockRestore();

    deletion.deleteMyAccount.mockRejectedValueOnce(new deletion.AccountDeletionError("identity", "auth/wrong-password"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(await within(dialog).findByText(/password is incorrect/i)).toBeInTheDocument();
  });
});

describe("settings in the demo", () => {
  afterEach(() => exitDemo());

  it("puts one card in place of email, password, signing out and deleting, leading to a real account", async () => {
    enterDemo();
    renderAt("/settings/account");
    expect(await within(panel()).findByRole("heading", { name: "This is a demo" })).toBeInTheDocument();
    expect(within(panel()).queryByText("Email address")).not.toBeInTheDocument();
    expect(within(panel()).queryByText("Change password")).not.toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Sign Out" })).not.toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Delete account" })).not.toBeInTheDocument();

    await userEvent.click(within(panel()).getByRole("button", { name: "Create account" }));
    // The sign-up dialog over the demo, not a page load away from it.
    expect(openAuthDialog).toHaveBeenCalledWith("register");
    expect(leaveDemo).not.toHaveBeenCalled();
  });

  it("keeps the profile, the preferences and the data cards as they are", async () => {
    enterDemo();
    renderAt("/settings/profile");
    expect(await screen.findByText(/First name/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Data" }));
    expect(within(panel()).getByText("statement button")).toBeInTheDocument();
    expect(within(panel()).getByText("reset button")).toBeInTheDocument();
    expect(within(panel()).queryByText("This is a demo")).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { createRef } from "react";
import i18n from "../i18n";
import { ThemeProvider } from "../context/ThemeContext";
import { Topbar } from "../features/layout/Topbar";
import { BackToDemoLink } from "./DemoChrome";
import { enterDemo, exitDemo, leaveDemo } from "./demoMode";
import { openAuthDialog } from "./authDialog";

// The demo's marks on the shell: «DEMO» and the way to a real account in the
// top bar instead of the account menu, and the link back from the sign-in
// pages. Leaving is a full page load, so `leaveDemo` is watched, not run.

vi.mock("./demoMode", async (original) => ({ ...(await original<typeof import("./demoMode")>()), leaveDemo: vi.fn() }));
// The way in is a dialog over the demo now; which one is asked for is what matters here.
vi.mock("./authDialog", async (original) => ({ ...(await original<typeof import("./authDialog")>()), openAuthDialog: vi.fn() }));
vi.mock("../features/bills/useBills", () => ({ useBillsNeedingAttention: () => 0 }));
vi.mock("../shared/hooks/useAuth", () => ({
  useAuth: () => ({ currentUser: { uid: "u1", email: "ilias@example.com", displayName: null, providerData: [{ providerId: "password" }] }, loading: false }),
}));
vi.mock("../shared/hooks/useCurrencyConverter", () => ({ exchangeRateKeys: { user: (uid: string) => ["userCurrency", uid], rates: () => ["exchangeRates"] } }));
vi.mock("../firebase/firestore", () => ({
  getUser: vi.fn(async () => ({ username: "ilias", firstName: "Ilias", lastName: "Giontis", locale: "en" })),
  updateUser: vi.fn(async () => undefined),
}));
vi.mock("../firebase/auth", () => ({ logout: vi.fn(async () => undefined) }));

const renderTopbar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <MemoryRouter>
          <Topbar toggleSidebar={() => {}} menuButtonRef={createRef<HTMLButtonElement>()} isDrawerOpen={false} />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );

const bar = () => screen.getByRole("navigation");
// The account menu is named after the user: the username, for a password account.
const ACCOUNT_MENU = "ilias";

/** Below 576px: the phone's top bar. */
let phone = false;

beforeAll(async () => {
  // Never dark, on any screen: the theme reads it as it mounts. A phone only
  // where a test says so.
  window.matchMedia = ((query: string) => ({
    matches: phone && query.includes("max-width: 575.98px"),
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
beforeEach(() => {
  vi.mocked(leaveDemo).mockClear();
  vi.mocked(openAuthDialog).mockClear();
});
afterEach(() => {
  phone = false;
  exitDemo();
  localStorage.clear();
});

describe("the top bar in the demo", () => {
  beforeEach(() => enterDemo());

  it("says it is the demo, with what that means for anyone who cannot see the hover title", () => {
    renderTopbar();
    const chip = within(bar()).getByText("DEMO");
    expect(chip).toHaveAttribute("title", "You're viewing a demo with made-up data — nothing is saved");
    expect(chip).toHaveTextContent("DEMO — You're viewing a demo with made-up data — nothing is saved");
  });

  it("has the way to an account in place of the account menu", async () => {
    renderTopbar();
    expect(within(bar()).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: /^Create account/ })).toBeInTheDocument();
    // No one's name, no menu with Sign Out in it — the stand-in user is no one.
    expect(within(bar()).queryByRole("button", { name: ACCOUNT_MENU })).toBeNull();
    expect(within(bar()).queryByText("Sign Out")).toBeNull();
    // Light/dark and the language stay where they were.
    expect(within(bar()).getByRole("button", { name: /dark mode/i })).toBeInTheDocument();
  });

  it("opens the sign-in dialog from «Sign in», staying on the demo", async () => {
    renderTopbar();
    await userEvent.click(within(bar()).getByRole("button", { name: "Sign in" }));
    expect(openAuthDialog).toHaveBeenCalledWith("login");
    expect(leaveDemo).not.toHaveBeenCalled();
  });

  it("opens the sign-up dialog from «Create account»", async () => {
    renderTopbar();
    await userEvent.click(within(bar()).getByRole("button", { name: /^Create account/ }));
    expect(openAuthDialog).toHaveBeenCalledWith("register");
    expect(leaveDemo).not.toHaveBeenCalled();
  });
});

describe("the top bar in the demo, on a phone", () => {
  beforeEach(() => {
    phone = true;
    enterDemo();
  });

  it("folds the tour and signing in into one «DEMO» menu, and keeps «Create account» at the end", async () => {
    renderTopbar();
    // No separate tour button, no separate «Sign in».
    expect(within(bar()).queryByRole("button", { name: "Tour" })).toBeNull();
    expect(within(bar()).queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(within(bar()).getByRole("button", { name: /^Create account/ })).toBeInTheDocument();

    await userEvent.click(within(bar()).getByRole("button", { name: /^DEMO/ }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("You're viewing a demo with made-up data — nothing is saved");
    expect(within(menu).getByRole("menuitem", { name: "Tour" })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Sign in" }));
    expect(openAuthDialog).toHaveBeenCalledWith("login");
  });

  it("offers creating an account from the menu too", async () => {
    renderTopbar();
    await userEvent.click(within(bar()).getByRole("button", { name: /^DEMO/ }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Create account" }));
    expect(openAuthDialog).toHaveBeenCalledWith("register");
  });
});

describe("the top bar outside the demo", () => {
  it("is as it was: the account menu, no chip, no account buttons", async () => {
    renderTopbar();
    expect(await within(bar()).findByRole("button", { name: ACCOUNT_MENU })).toBeInTheDocument();
    expect(within(bar()).queryByText("DEMO")).toBeNull();
    expect(within(bar()).queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(within(bar()).queryByRole("button", { name: /Create account/ })).toBeNull();
  });
});

describe("«Back to the demo» on the sign-in pages", () => {
  it("is there for a device no one has signed in on, and opens the demo with a full page load", async () => {
    const assign = vi.fn();
    const location = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...location, assign } });
    try {
      render(<BackToDemoLink />);
      const link = screen.getByRole("link", { name: "Back to the demo" });
      expect(link).toHaveAttribute("href", "/");
      await userEvent.click(link);
      expect(assign).toHaveBeenCalledWith("/");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: location });
    }
  });

  it("is not there once someone has signed in on this device", () => {
    localStorage.setItem("auth:known-device", "1");
    render(<BackToDemoLink />);
    expect(screen.queryByRole("link", { name: "Back to the demo" })).toBeNull();
  });

  it("is not there on a device with a session from before the hint existed", () => {
    localStorage.setItem("auth:signed-in", "1");
    render(<BackToDemoLink />);
    expect(screen.queryByRole("link", { name: "Back to the demo" })).toBeNull();
  });
});

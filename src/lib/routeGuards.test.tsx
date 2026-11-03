import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import i18n from "../i18n";
import { SessionGate } from "./routeGuards";
import { WELCOME_MAX_MS, WELCOME_MIN_MS } from "../features/auth/WelcomeSplash";
import { rememberSession, rememberWelcomeName, resetPreviousOpen } from "./sessionHint";

// A cold start: Firebase has not yet said who is signed in. A device that was
// signed in sees the app's frame take shape; one that was not sees the sign-in
// form's outline — never the app's sidebar for a moment and then the form.

const auth = vi.hoisted(() => ({ value: { currentUser: null as unknown, loading: true } }));
vi.mock("../shared/hooks/useAuth", () => ({ useAuth: () => auth.value }));
const pending = vi.hoisted(() => ({ finishPendingSignUpWithRetry: vi.fn((uid: string, onGiveUp: () => void) => () => void [uid, onGiveUp]) }));
vi.mock("../features/auth/pendingSignUp", () => pending);
vi.mock("../firebase/firestore", () => ({ getUser: vi.fn(async () => null) }));
vi.mock("../shared/hooks/useCurrencyConverter", () => ({ exchangeRateKeys: { user: (uid: string) => ["userCurrency", uid] } }));

let client = new QueryClient();

const tree = (path: string) => (
  <QueryClientProvider client={client}>
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: "/login", element: <p>login form</p> },
          { element: <SessionGate />, children: [{ path: "/", element: <p>app frame</p> }] },
        ],
        { initialEntries: [path] },
      )}
    />
  </QueryClientProvider>
);
const renderAt = (path = "/") => render(tree(path));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  localStorage.clear();
  resetPreviousOpen();
  client = new QueryClient();
  pending.finishPendingSignUpWithRetry.mockClear();
  auth.value = { currentUser: null, loading: true };
});

describe("the session gate", () => {
  it("while the session is found, shows a device never signed in the form's outline, not the app", () => {
    renderAt();
    expect(screen.queryByText("app frame")).toBeNull();
    expect(screen.queryByText("login form")).toBeNull();
  });

  it("while the session is found, lets a device that was signed in draw the app's frame", () => {
    rememberSession(true);
    renderAt();
    expect(screen.getByText("app frame")).toBeInTheDocument();
  });

  it("sends the signed out to the sign-in form", () => {
    auth.value = { currentUser: null, loading: false };
    renderAt();
    expect(screen.getByText("login form")).toBeInTheDocument();
  });

  it("lets the signed in through", () => {
    auth.value = { currentUser: { uid: "u" }, loading: false };
    renderAt();
    expect(screen.getByText("app frame")).toBeInTheDocument();
  });

  it("forgets the session on sign-out", () => {
    rememberSession(true);
    rememberSession(false);
    renderAt();
    expect(screen.queryByText("app frame")).toBeNull();
  });
});

describe("the welcome while the app opens", () => {
  it("greets a device that was signed in by the name kept from last time, over the app's frame", () => {
    rememberSession(true);
    rememberWelcomeName("Ilias");
    renderAt();
    expect(screen.getByTestId("welcome-splash")).toHaveTextContent(/Welcome back,\s*Ilias/);
    // The frame draws underneath; the welcome does not hold it back.
    expect(screen.getByText("app frame")).toBeInTheDocument();
  });

  it("says when the device was last here", () => {
    rememberSession(true);
    localStorage.setItem("auth:last-open", String(Date.now() - 86_400_000));
    renderAt();
    expect(screen.getByTestId("welcome-splash")).toHaveTextContent(/Last here: yesterday/);
    // And now remembers this time.
    expect(Number(localStorage.getItem("auth:last-open"))).toBeGreaterThan(Date.now() - 5000);
  });

  it("without a kept name, welcomes back without one", () => {
    rememberSession(true);
    renderAt();
    expect(screen.getByTestId("welcome-splash")).toHaveTextContent("Welcome back");
    expect(screen.getByTestId("welcome-splash")).not.toHaveTextContent("Welcome back,");
  });

  it("is not shown on a device never signed in", () => {
    renderAt();
    expect(screen.queryByTestId("welcome-splash")).toBeNull();
  });

  /** Moves the clock, then once more past the fade a timer on the way may have started. */
  const advance = async (ms: number) => {
    for (const step of [ms, 0, 400]) {
      await act(async () => {
        vi.advanceTimersByTime(step);
      });
    }
  };

  it("stays to be read even when the app is ready at once, then goes", async () => {
    vi.useFakeTimers();
    try {
      rememberSession(true);
      const view = renderAt();
      expect(screen.getByTestId("welcome-splash")).toHaveAttribute("aria-busy", "true");
      auth.value = { currentUser: { uid: "u" }, loading: false };
      // The profile, read by the top bar under the shared key.
      act(() => client.setQueryData(["userCurrency", "u"], { firstName: "Ilias", username: "ilias_g", displayName: "Ηλίας" }));
      view.rerender(tree("/"));
      expect(screen.getByTestId("welcome-splash")).toHaveAttribute("aria-busy", "false");
      // Ready, but not yet read: still there just short of the minimum (the helper adds 0.4s).
      await advance(WELCOME_MIN_MS - 500);
      expect(screen.getByTestId("welcome-splash")).toBeInTheDocument();
      // Past the minimum and the fade: gone.
      await advance(800);
      expect(screen.queryByTestId("welcome-splash")).toBeNull();
      // And the name the top bar shows (the one set in Settings) is kept for the next open.
      expect(localStorage.getItem("auth:welcome-name")).toBe("Ηλίας");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never stays past its longest, even if the session is still being found", async () => {
    vi.useFakeTimers();
    try {
      rememberSession(true);
      renderAt();
      await advance(WELCOME_MAX_MS - 500);
      expect(screen.getByTestId("welcome-splash")).toBeInTheDocument();
      await advance(800);
      expect(screen.queryByTestId("welcome-splash")).toBeNull();
      // The frame was there underneath all along.
      expect(screen.getByText("app frame")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never keeps the demo's made-up name for the next welcome", async () => {
    const { enterDemo, exitDemo } = await import("../demo/demoMode");
    enterDemo();
    try {
      auth.value = { currentUser: { uid: "demo" }, loading: false };
      renderAt();
      act(() => client.setQueryData(["userCurrency", "demo"], { firstName: "Κατερίνα" }));
      expect(localStorage.getItem("auth:welcome-name")).toBeNull();
    } finally {
      exitDemo();
    }
  });

  it("closes at once on a tap anywhere", () => {
    rememberSession(true);
    renderAt();
    fireEvent.click(screen.getByTestId("welcome-splash"));
    expect(screen.queryByTestId("welcome-splash")).toBeNull();
  });

  it("closes at once on Esc or Enter", () => {
    rememberSession(true);
    const first = renderAt();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("welcome-splash")).toBeNull();
    first.unmount();
    resetPreviousOpen();
    renderAt();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.queryByTestId("welcome-splash")).toBeNull();
  });

  it("forgets the name with the session on sign-out", () => {
    rememberSession(true);
    rememberWelcomeName("Ilias");
    rememberSession(false);
    expect(localStorage.getItem("auth:welcome-name")).toBeNull();
  });

  it("finishes a sign-up the demo's dialog left, once someone is signed in", () => {
    auth.value = { currentUser: { uid: "u" }, loading: false };
    renderAt();
    expect(pending.finishPendingSignUpWithRetry).toHaveBeenCalledWith("u", expect.any(Function));
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { LoginForm } from "./LoginForm";
import type { AuthActions } from "./authActions";
import { RESET_COOLDOWN_SECONDS, resetCooldown } from "./passwordReset";

// «Ξέχασα τον κωδικό;»: the email, a link sent by Firebase, and words that
// never tell whether there is an account behind the address.

vi.mock("../../firebase/auth", () => ({ loginWithEmail: vi.fn(), registerWithEmail: vi.fn(), loginWithGoogle: vi.fn(), sendPasswordReset: vi.fn() }));
vi.mock("../../firebase/firestore", () => ({ createUser: vi.fn(), getUser: vi.fn() }));

const sendPasswordReset = vi.fn<AuthActions["sendPasswordReset"]>();
const actions: AuthActions = { loginWithEmail: vi.fn(), registerWithEmail: vi.fn(), loginWithGoogle: vi.fn(), sendPasswordReset };

const NEUTRAL = "If there is an account with this email, a link to set a new password is on its way. Check your spam folder too.";
const GOOGLE_HINT = "If you signed in with Google, you have no password here — press “Continue with Google”.";

const renderForm = () =>
  render(
    <MemoryRouter>
      <LoginForm actions={actions} onSignedIn={vi.fn()} />
    </MemoryRouter>,
  );

const openReset = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  return screen.getByRole("heading", { name: "Forgot your password?" });
};
const sendButton = () => screen.getByRole("button", { name: /Send me a link|Send again|Sending/ });
/** Second by second, letting React render between ticks (each tick schedules the next). */
const tick = async (seconds: number) => {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
};
const failWith = (code: string) => sendPasswordReset.mockRejectedValueOnce(Object.assign(new Error(code), { code }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  resetCooldown.until = 0;
  sendPasswordReset.mockReset();
  sendPasswordReset.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("the forgotten-password step", () => {
  it("opens from the sign-in form, in place, with the email field focused", async () => {
    renderForm();
    expect(await openReset()).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("carries over the email already typed for signing in, and back again", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Email"), "  maria@example.test ");
    await openReset();
    expect(screen.getByLabelText("Email")).toHaveValue("maria@example.test");
    await userEvent.clear(screen.getByLabelText("Email"));
    await userEvent.type(screen.getByLabelText("Email"), "m2@example.test");
    await userEvent.click(screen.getByRole("button", { name: "← Back to sign in" }));
    expect(screen.getByLabelText("Email")).toHaveValue("m2@example.test");
    expect(screen.getByLabelText("Password")).toHaveFocus();
  });

  it("shows no error for an empty or unfinished address until it is sent — and sends nothing", async () => {
    renderForm();
    await openReset();
    await userEvent.type(screen.getByLabelText("Email"), "maria@");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Enter a valid email")).toBeNull();
    await userEvent.click(sendButton());
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Email"));
    await userEvent.click(sendButton());
    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it("leaves an empty field quiet on opening, and when left empty; a typed address is checked when left", async () => {
    renderForm();
    await openReset();
    expect(screen.queryByText("Email is required")).toBeNull();
    await userEvent.tab();
    expect(screen.queryByText("Email is required")).toBeNull();
    await userEvent.type(screen.getByLabelText("Email"), "maria@");
    await userEvent.tab();
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Email"));
    await userEvent.tab();
    expect(screen.queryByText("Email is required")).toBeNull();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("sends the trimmed address and answers in the neutral words, with the Google hint", async () => {
    renderForm();
    await openReset();
    await userEvent.type(screen.getByLabelText("Email"), "   maria@example.test  ");
    await userEvent.click(sendButton());
    const status = await screen.findByRole("status");
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(sendPasswordReset).toHaveBeenCalledWith("maria@example.test");
    expect(status).toHaveTextContent(NEUTRAL);
    expect(status).toHaveTextContent(GOOGLE_HINT);
  });

  it("says exactly the same when there is no such account", async () => {
    const texts: string[] = [];
    for (const outcome of ["ok", "auth/user-not-found"]) {
      resetCooldown.until = 0;
      if (outcome !== "ok") failWith(outcome);
      const { unmount } = renderForm();
      await openReset();
      await userEvent.type(screen.getByLabelText("Email"), "nobody@example.test");
      await userEvent.click(sendButton());
      texts.push((await screen.findByRole("status")).textContent ?? "");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(sendButton()).toBeDisabled();
      unmount();
    }
    expect(texts[0]).toBe(NEUTRAL + GOOGLE_HINT);
    expect(texts[1]).toBe(texts[0]);
  });

  it("rests the button for a minute after a send, counting down, even across a return to sign-in", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ["setTimeout", "clearTimeout", "Date"] });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maria@example.test" } });
    await act(async () => {
      fireEvent.click(sendButton());
    });
    await act(async () => {});
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveTextContent(`Send again in ${RESET_COOLDOWN_SECONDS} s`);

    await tick(30);
    expect(sendButton()).toHaveTextContent("Send again in 30 s");
    expect(sendButton()).toBeDisabled();

    // Back and in again: the wait goes on, it does not start over.
    fireEvent.click(screen.getByRole("button", { name: "← Back to sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveTextContent("Send again in 30 s");

    await tick(31);
    expect(sendButton()).toBeEnabled();
    expect(sendButton()).toHaveTextContent("Send me a link");
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it("maps the failures that are real: a bad address on the field, the rest above the form", async () => {
    renderForm();
    await openReset();
    await userEvent.type(screen.getByLabelText("Email"), "maria@example.test");

    failWith("auth/invalid-email");
    await userEvent.click(sendButton());
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");

    for (const [code, words] of [
      ["auth/too-many-requests", "Too many attempts. Please try again later."],
      ["auth/network-request-failed", "No internet connection. Try again once you're online."],
      ["auth/internal-error", "Something went wrong. Please try again."],
    ] as const) {
      failWith(code);
      await userEvent.click(sendButton());
      expect(await screen.findByRole("alert")).toHaveTextContent(words);
      // Nothing was sent: no neutral message, and the button may be pressed again.
      expect(screen.queryByRole("status")).toBeNull();
      expect(sendButton()).toBeEnabled();
    }
    expect(sendPasswordReset).toHaveBeenCalledTimes(4);
  });

  it("speaks Greek too", async () => {
    await i18n.changeLanguage("el");
    try {
      renderForm();
      await userEvent.click(screen.getByRole("button", { name: "Ξέχασα τον κωδικό;" }));
      await userEvent.type(screen.getByLabelText("Email"), "maria@example.test");
      await userEvent.click(screen.getByRole("button", { name: "Στείλε μου σύνδεσμο" }));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Αν υπάρχει λογαριασμός με αυτό το email, θα σου έρθει σύνδεσμος για νέο κωδικό. Κοίτα και στα ανεπιθύμητα.Αν μπήκες με Google, δεν έχεις κωδικό — πάτα «Συνέχεια με Google».",
        ),
      );
      expect(screen.getByRole("button", { name: "Ξανά σε 60 δευτ." })).toBeDisabled();
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});

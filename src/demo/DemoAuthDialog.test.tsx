import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../i18n";
import { closeAuthDialog, openAuthDialog, useAuthDialogMode } from "./authDialog";
import DemoAuthDialog from "./DemoAuthDialog";

// The real forms in a dialog over the demo. What they call is the demo's own
// way in (a real Auth started on demand); once in, the page loads again as the
// real app with what a new account still needs noted — never written from the
// demo's page, which has no Firestore behind it.

const signIn = vi.hoisted(() => ({
  demoAuthActions: {
    loginWithEmail: vi.fn(async () => ({ uid: "u-1", email: "maria@example.test", displayName: null })),
    registerWithEmail: vi.fn(async () => ({ uid: "u-new", email: "maria@example.test", displayName: null })),
    loginWithGoogle: vi.fn(async () => ({ uid: "u-g", email: "g@example.test", displayName: "Maria Papa" })),
  },
  enterRealApp: vi.fn(),
}));
vi.mock("./demoSignIn", () => signIn);
// The app's own sign-in, which refuses in the demo: must not be what the dialog calls.
const appAuth = vi.hoisted(() => ({ loginWithEmail: vi.fn(), registerWithEmail: vi.fn(), loginWithGoogle: vi.fn() }));
vi.mock("../firebase/auth", () => appAuth);
vi.mock("../firebase/firestore", () => ({ createUser: vi.fn(), getUser: vi.fn() }));

/** The dialog as its host draws it: whichever mode the store says. */
function Host() {
  const mode = useAuthDialogMode();
  return mode ? <DemoAuthDialog mode={mode} /> : null;
}

const renderHost = () =>
  render(
    <MemoryRouter>
      <Host />
    </MemoryRouter>,
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  closeAuthDialog();
  vi.clearAllMocks();
});

describe("the demo's sign-in dialog", () => {
  it("signs in through the demo's way in, then enters the real app with nothing left to write", async () => {
    renderHost();
    openAuthDialog("login");
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email"), "maria@example.test");
    await userEvent.type(within(dialog).getByLabelText("Password"), "secret123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(signIn.enterRealApp).toHaveBeenCalledTimes(1));
    expect(signIn.demoAuthActions.loginWithEmail).toHaveBeenCalledWith("maria@example.test", "secret123");
    expect(signIn.enterRealApp).toHaveBeenCalledWith(undefined);
    expect(appAuth.loginWithEmail).not.toHaveBeenCalled();
    // On its way: no form left to press twice, and no closing it halfway.
    expect(within(dialog).getByRole("status")).toHaveTextContent("Taking you to your account");
  });

  it("hands a Google sign-in's profile step to the real app", async () => {
    renderHost();
    openAuthDialog("login");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Google/ }));
    await waitFor(() => expect(signIn.enterRealApp).toHaveBeenCalledTimes(1));
    expect(signIn.enterRealApp).toHaveBeenCalledWith({ kind: "google", uid: "u-g", email: "g@example.test", displayName: "Maria Papa", locale: "en" });
  });

  it("switches between signing in and signing up in place", async () => {
    renderHost();
    openAuthDialog("login");
    let dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create one" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in" }));
    expect(within(await screen.findByRole("dialog")).queryByRole("checkbox")).toBeNull();
  });

  it("signs up, noting the profile for the real app to write", async () => {
    renderHost();
    openAuthDialog("register");
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByPlaceholderText("e.g. John"), "Maria");
    await userEvent.type(within(dialog).getByPlaceholderText("e.g. Doe"), "Papa");
    await userEvent.type(within(dialog).getByPlaceholderText("e.g. john_doe"), "maria_p");
    await userEvent.type(within(dialog).getByPlaceholderText("you@example.com"), "maria@example.test");
    const [password, confirm] = within(dialog).getAllByPlaceholderText("••••••••");
    await userEvent.type(password, "secret123");
    await userEvent.type(confirm, "secret123");
    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create your account" }));

    await waitFor(() => expect(signIn.enterRealApp).toHaveBeenCalledTimes(1));
    expect(signIn.enterRealApp).toHaveBeenCalledWith({
      kind: "profile",
      uid: "u-new",
      profile: { email: "maria@example.test", username: "maria_p", firstName: "Maria", lastName: "Papa", locale: "en" },
    });
    expect(appAuth.registerWithEmail).not.toHaveBeenCalled();
  }, 20_000);
});

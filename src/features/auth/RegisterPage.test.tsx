import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import RegisterPage from "./RegisterPage";

// Signing up asks for one thing before anything else: 18 or over, and the
// terms accepted. Neither the form nor Google goes ahead without it.

const auth = vi.hoisted(() => ({
  registerWithEmail: vi.fn(async () => ({ uid: "new-user" })),
  loginWithGoogle: vi.fn(async () => ({ uid: "google-user" })),
}));
vi.mock("../../firebase/auth", () => auth);
vi.mock("../../firebase/firestore", () => ({ createUser: vi.fn(async () => {}) }));
vi.mock("./googleProfile", () => ({ ensureGoogleProfile: vi.fn(async () => {}) }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );

const fillForm = async () => {
  await userEvent.type(screen.getByPlaceholderText("John"), "Maria");
  await userEvent.type(screen.getByPlaceholderText("Doe"), "Papa");
  await userEvent.type(screen.getByPlaceholderText("john_doe"), "maria_p");
  await userEvent.type(screen.getByPlaceholderText("you@example.com"), "maria@example.test");
  const [password, confirm] = screen.getAllByPlaceholderText("••••••••");
  await userEvent.type(password, "secret123");
  await userEvent.type(confirm, "secret123");
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  auth.registerWithEmail.mockClear();
  auth.loginWithGoogle.mockClear();
});

describe("signing up", () => {
  it("asks for 18+ and the terms, with links to both pages", () => {
    renderPage();
    const box = screen.getByRole("checkbox", { name: /I am 18 or over and accept the Terms of Use and the Privacy Policy/ });
    expect(box).not.toBeChecked();
    expect(screen.getAllByRole("link", { name: "Terms of Use" })[0]).toHaveAttribute("href", "/terms");
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })[0]).toHaveAttribute("href", "/privacy");
  });

  it("will not create an account from the form until it is ticked", async () => {
    renderPage();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Create your account" }));
    expect(auth.registerWithEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeInvalid();

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create your account" }));
    expect(auth.registerWithEmail).toHaveBeenCalledWith("maria@example.test", "secret123");
  });

  it("will not go to Google until it is ticked either", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Google/ }));
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Google/ }));
    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
  });
});

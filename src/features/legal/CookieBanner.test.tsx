import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { CookieBanner } from "./CookieBanner";
import { readConsent, reopenConsent } from "../../lib/analytics";

// The cookie question: asked until answered, "no" kept as firmly as "yes",
// and asked again from the footer. Analytics itself is not loaded here —
// `applyConsent` is what would import it.

const applied = vi.hoisted(() => [] as unknown[]);
vi.mock("../../firebase/config", () => ({ firebaseApp: {} }));
vi.mock("../../lib/analytics", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...real, analyticsConfigured: true, applyConsent: async (v?: unknown) => void applied.push(v) };
});

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  localStorage.clear();
  applied.length = 0;
});

describe("the cookie banner", () => {
  it("asks until answered, and a no is kept — and never starts analytics", async () => {
    render(<CookieBanner />);
    expect(screen.getByRole("dialog", { name: "Cookies" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readConsent()).toBe("denied");
  });

  it("takes a yes, and asks again when reopened from the footer", async () => {
    render(<CookieBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(readConsent()).toBe("granted");
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => reopenConsent());
    expect(screen.getByRole("dialog", { name: "Cookies" })).toBeInTheDocument();
    expect(readConsent()).toBeUndefined();
  });

  it("does not ask someone who already answered", () => {
    localStorage.setItem("analytics-consent", "granted");
    render(<CookieBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isKnownDevice, hadSession } from "../lib/sessionHint";
import { startsInDemo } from "./demoMode";

// Into the real app from the demo's dialog: the device is remembered as signed
// in — which is what makes the next page load the app instead of the demo —
// what is left to write is noted, and the page loads again.

vi.mock("../firebase/config", () => ({ authForDemoSignIn: vi.fn(() => ({})) }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {},
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
}));
vi.mock("../features/auth/pendingSignUp", async (original) => ({ ...(await original<typeof import("../features/auth/pendingSignUp")>()) }));
vi.mock("../firebase/firestore", () => ({ createUser: vi.fn(), getUser: vi.fn() }));

const { enterRealApp } = await import("./demoSignIn");

beforeEach(() => localStorage.clear());

describe("enterRealApp", () => {
  it("remembers the device, notes the step, and loads the real app in the demo's place", () => {
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, replace } });
    try {
      enterRealApp({ kind: "profile", uid: "u1", profile: { email: "m@x.test", username: "m", firstName: "M", lastName: "P", locale: "el" } });
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
    expect(replace).toHaveBeenCalledWith("/");
    expect(hadSession()).toBe(true);
    expect(isKnownDevice()).toBe(true);
    // The rule the next page load applies: not the demo any more.
    expect(startsInDemo("/", isKnownDevice())).toBe(false);
    expect(JSON.parse(localStorage.getItem("auth:pending-sign-up")!)).toMatchObject({ kind: "profile", uid: "u1" });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { startsInDemo } from "../demo/demoMode";
import { hadSession, isKnownDevice, KNOWN_DEVICE_KEY, rememberKnownDevice, rememberSession, SIGNED_OUT_KEY, welcomeName } from "../lib/sessionHint";

// «Αποσύνδεση» lands on the public demo (owner, 2026-11-12): signed out, the
// account's lists and keys gone from the device, the device no longer known —
// so the page load that follows, by the demo's own start rule, is the demo.
// Before, it went to /login inside the same page and the device stayed known:
// every later visit opened on the sign-in form, never the demo.

const calls = vi.hoisted(() => [] as string[]);
const demo = vi.hoisted(() => ({ on: false }));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  signOut: vi.fn(async () => void calls.push("auth:signOut")),
}));
vi.mock("./config", () => ({ auth: { name: "auth" } }));
vi.mock("./syncList", () => ({ forgetAllLocal: vi.fn(async () => void calls.push('local:delete "sync:"')) }));
vi.mock("../demo/demoMode", async () => {
  const actual = await vi.importActual<typeof import("../demo/demoMode")>("../demo/demoMode");
  return { ...actual, isDemo: () => demo.on, leaveDemo: (path: string) => void calls.push(`leaveDemo ${path}`) };
});

const { signOutToDemo } = await import("./auth");

/** The account, signed in on this device, as the app leaves it in storage. */
function signedIn() {
  rememberSession(true);
  rememberKnownDevice();
  localStorage.setItem("auth:welcome-name", "Ilias");
  localStorage.setItem("categories-seeded-version", "34");
  // The account's own: the planner's cache, a person picked in analytics, its view choices.
  localStorage.setItem("planner-lines", JSON.stringify([{ name: "Rent", amount: 450 }]));
  localStorage.setItem("analytics-two-way", JSON.stringify("Nikos"));
  localStorage.setItem("business:tab", JSON.stringify("days"));
  // The device's own.
  localStorage.setItem("app-language", "el");
  localStorage.setItem("theme-preference", JSON.stringify("dark"));
  localStorage.setItem("motion-effects", "off");
  sessionStorage.setItem("anything", "x");
}

const leave = vi.fn((path: string) => void calls.push(`leave ${path}`));

beforeEach(() => {
  calls.length = 0;
  demo.on = false;
  leave.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

describe("signing out", () => {
  it("signs out, forgets the sync lists and then the device, and only then loads the demo at /", async () => {
    signedIn();
    await signOutToDemo(leave);
    expect(calls).toEqual(["auth:signOut", 'local:delete "sync:"', "leave /"]);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("leaves the device unknown, so the page that loads is the demo — on any page of the app", async () => {
    signedIn();
    expect(startsInDemo("/", isKnownDevice())).toBe(false);
    await signOutToDemo(leave);
    expect(isKnownDevice()).toBe(false);
    expect(hadSession()).toBe(false);
    expect(localStorage.getItem(KNOWN_DEVICE_KEY)).toBeNull();
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBe("1");
    for (const path of ["/", "/business", "/settings/account"]) expect(startsInDemo(path, isKnownDevice())).toBe(true);
    // The sign-in page is still the sign-in page.
    expect(startsInDemo("/login", isKnownDevice())).toBe(false);
  });

  it("keeps nothing of the account in storage for the demo to find — only the device's own keys", async () => {
    signedIn();
    await signOutToDemo(leave);
    expect(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))).toEqual({
      "app-language": "el",
      "theme-preference": JSON.stringify("dark"),
      "motion-effects": "off",
      // The shared defaults' flag stays: signing in again costs no second check of them.
      "categories-seeded-version": "34",
      [SIGNED_OUT_KEY]: "1",
    });
    expect(welcomeName()).toBe("");
    expect(sessionStorage.length).toBe(0);
  });

  it("is undone by the next sign-in: the device is known again, and a demo open in another tab hears of it", async () => {
    signedIn();
    await signOutToDemo(leave);
    const before = localStorage.getItem(KNOWN_DEVICE_KEY);
    rememberKnownDevice();
    // A change from nothing to "1" — what `watchForSignIn`'s storage event listens for.
    expect(before).toBeNull();
    expect(localStorage.getItem(KNOWN_DEVICE_KEY)).toBe("1");
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
    expect(isKnownDevice()).toBe(true);
    expect(startsInDemo("/", isKnownDevice())).toBe(false);
  });

  it("does not leave for the demo when signing out failed — the account stays as it was", async () => {
    signedIn();
    const { signOut } = await import("firebase/auth");
    vi.mocked(signOut).mockRejectedValueOnce(new Error("network"));
    await expect(signOutToDemo(leave)).rejects.toThrow("network");
    expect(leave).not.toHaveBeenCalled();
    expect(isKnownDevice()).toBe(true);
    expect(localStorage.getItem("planner-lines")).not.toBeNull();
  });

  it("in the demo, leaves for the sign-in page as before, and touches nothing", async () => {
    demo.on = true;
    void signOutToDemo(leave);
    await Promise.resolve();
    expect(calls).toEqual(["leaveDemo /login"]);
    expect(leave).not.toHaveBeenCalled();
  });
});

describe("a session that ended without signing out", () => {
  it("still opens on the sign-in form, not the demo — the device stays known", () => {
    signedIn();
    // Expired, or the password changed elsewhere: only the auth listener's answer.
    rememberSession(false);
    expect(isKnownDevice()).toBe(true);
    expect(startsInDemo("/", isKnownDevice())).toBe(false);
  });
});

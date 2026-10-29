import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enterDemo, exitDemo, isDemo, leaveDemo, startsInDemo, watchForSignIn } from "./demoMode";
import { hadSession, isKnownDevice, KNOWN_DEVICE_KEY, rememberKnownDevice, rememberSession } from "../lib/sessionHint";

// When a page opens as the demo: a device nobody has signed in on, anywhere
// but the sign-in, sign-up and legal pages. Someone who has an account and
// signed out must land on the sign-in form — so the hint that says so outlives
// signing out, where the session hint does not.

beforeEach(() => localStorage.clear());
afterEach(() => exitDemo());

describe("startsInDemo", () => {
  it("opens the demo on an unknown device, on any page of the app", () => {
    for (const path of ["/", "/transactions", "/bills/pay", "/settings/profile", "/nowhere"]) expect(startsInDemo(path, false)).toBe(true);
  });

  it("never on the sign-in, sign-up and legal pages", () => {
    for (const path of ["/login", "/register", "/terms", "/privacy", "/login/", "/privacy/cookies"]) expect(startsInDemo(path, false)).toBe(false);
  });

  it("matches them whatever the case, as the router does", () => {
    for (const path of ["/Login", "/REGISTER", "/Terms/", "/PRIVACY"]) expect(startsInDemo(path, false)).toBe(false);
  });

  it("does not take a page that only starts with the same letters for one of them", () => {
    expect(startsInDemo("/loginhelp", false)).toBe(true);
  });

  it("never on a device someone has signed in on", () => {
    expect(startsInDemo("/", true)).toBe(false);
    expect(startsInDemo("/transactions", true)).toBe(false);
  });
});

describe("the known-device hint", () => {
  it("is set by a session and survives signing out, unlike the session hint", () => {
    expect(isKnownDevice()).toBe(false);
    rememberSession(true);
    rememberKnownDevice();
    rememberSession(false);
    expect(hadSession()).toBe(false);
    expect(isKnownDevice()).toBe(true);
    expect(startsInDemo("/", isKnownDevice())).toBe(false);
  });

  it("counts a device signed in before the hint existed — it carries only the session hint", () => {
    rememberSession(true);
    expect(isKnownDevice()).toBe(true);
  });

  it("counts a device signed out before both hints existed, by the flag every signed-in start leaves", () => {
    localStorage.setItem("categories-seeded-version", "34");
    expect(isKnownDevice()).toBe(true);
  });

  it("reads storage that refuses to answer as an unknown device", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isKnownDevice()).toBe(false);
    spy.mockRestore();
  });
});

describe("the switch", () => {
  it("is off in tests until switched on, and switches back", () => {
    expect(isDemo()).toBe(false);
    enterDemo();
    expect(isDemo()).toBe(true);
    exitDemo();
    expect(isDemo()).toBe(false);
  });

  it("leaves with a full page load that replaces the demo in the history, to the sign-in page unless told otherwise", () => {
    const replace = vi.fn();
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, replace, assign } });
    try {
      leaveDemo();
      leaveDemo("/register");
      expect(replace.mock.calls).toEqual([["/login"], ["/register"]]);
      expect(assign).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("loads again once someone has signed in: back out of the page cache, or in another tab", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    const stop = watchForSignIn();
    try {
      // Back to the demo with nobody signed in: it stays.
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
      expect(reload).not.toHaveBeenCalled();

      rememberKnownDevice();
      // An ordinary load is not a page restored from the cache.
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
      expect(reload).not.toHaveBeenCalled();
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
      expect(reload).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: "1" }));
      expect(reload).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new StorageEvent("storage", { key: KNOWN_DEVICE_KEY, newValue: "1" }));
      expect(reload).toHaveBeenCalledTimes(2);

      stop();
      window.dispatchEvent(new StorageEvent("storage", { key: KNOWN_DEVICE_KEY, newValue: "1" }));
      expect(reload).toHaveBeenCalledTimes(2);
    } finally {
      stop();
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});

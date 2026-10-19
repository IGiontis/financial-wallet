import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// App Check: on with a site key, and only then; never against the emulators,
// which do not check it; and with a debug token while developing on localhost.

const appCheck = vi.hoisted(() => ({ initializeAppCheck: vi.fn(), ReCaptchaEnterpriseProvider: vi.fn(function (this: { key: string }, key: string) { this.key = key; }) }));
vi.mock("firebase/app-check", () => appCheck);
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })), FirebaseError: class FirebaseError extends Error { code = ""; } }));
vi.mock("firebase/auth", () => ({ getAuth: vi.fn(() => ({})), connectAuthEmulator: vi.fn() }));
vi.mock("firebase/firestore", () => ({ initializeFirestore: vi.fn(() => ({})), getFirestore: vi.fn(() => ({})), connectFirestoreEmulator: vi.fn(), persistentLocalCache: vi.fn(), persistentMultipleTabManager: vi.fn() }));

const load = async () => {
  vi.resetModules();
  return import("./config");
};

beforeEach(() => {
  appCheck.initializeAppCheck.mockClear();
  appCheck.ReCaptchaEnterpriseProvider.mockClear();
  delete (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN;
});
afterEach(() => vi.unstubAllEnvs());

describe("App Check", () => {
  it("stays off without a site key — the app behaves as before", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "");
    const config = await load();
    expect(config.appCheckEnabled).toBe(false);
    expect(appCheck.initializeAppCheck).not.toHaveBeenCalled();
  });

  it("starts with reCAPTCHA Enterprise and keeps its token fresh, given a key", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    vi.stubEnv("VITE_FIREBASE_EMULATOR", "false");
    const config = await load();
    expect(config.appCheckEnabled).toBe(true);
    expect(appCheck.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith("site-key");
    expect(appCheck.initializeAppCheck).toHaveBeenCalledWith({ name: "app" }, expect.objectContaining({ isTokenAutoRefreshEnabled: true }));
    // Developing (vitest is a dev build): a debug token, since reCAPTCHA does not vouch for localhost.
    expect((self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
  });

  it("uses the debug token given, when one is", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    vi.stubEnv("VITE_FIREBASE_EMULATOR", "false");
    vi.stubEnv("VITE_APPCHECK_DEBUG_TOKEN", "registered-token");
    await load();
    expect((self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe("registered-token");
  });

  it("stays off against the emulators, key or not", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    vi.stubEnv("VITE_FIREBASE_EMULATOR", "true");
    const config = await load();
    expect(config.appCheckEnabled).toBe(false);
    expect(appCheck.initializeAppCheck).not.toHaveBeenCalled();
  });
});

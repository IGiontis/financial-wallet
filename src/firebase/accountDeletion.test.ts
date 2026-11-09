import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isDeletingAccount, endAccountDeletion } from "./deletionGate";

// The order of an account deletion, step by step: who it is before anything is
// touched, then the data, then the sign-in, then this device forgets it. What
// each step does on its own is tested where it lives (`firestore.test.ts` for
// the data); here, what runs when, and what is left when a step fails.

const calls = vi.hoisted(() => [] as string[]);
const fail = vi.hoisted(() => ({ at: "" as string, code: "" }));
const demo = vi.hoisted(() => ({ on: false }));

const step = (name: string) =>
  vi.fn(async () => {
    calls.push(name);
    if (fail.at === name) throw Object.assign(new Error(name), { code: fail.code });
  });

vi.mock("./config", () => ({ db: {} }));
vi.mock("./auth", () => ({
  DEMO_UNAVAILABLE: "demo/unavailable",
  reauthenticate: step("reauth:password"),
  reauthenticateWithGoogle: step("reauth:google"),
  deleteAccount: step("auth:delete"),
  logout: step("logout"),
}));
vi.mock("./firestore", () => ({
  deleteAllUserData: vi.fn(async () => {
    calls.push(`data (gate ${isDeletingAccount() ? "shut" : "open"})`);
    if (fail.at === "data") throw Object.assign(new Error("data"), { code: fail.code });
    return { deleted: 12, leftovers: 1, profile: true };
  }),
}));
vi.mock("./firestoreApi", () => ({ terminate: step("firestore:terminate"), clearIndexedDbPersistence: step("firestore:clear-cache") }));
vi.mock("../lib/queryClient", () => ({ queryClient: { cancelQueries: step("queries:cancel"), clear: () => void calls.push("queries:clear") } }));
vi.mock("../lib/localStore", () => ({ localDeletePrefix: vi.fn(async (prefix: string) => void calls.push(`local:delete "${prefix}"`)) }));
vi.mock("../demo/demoMode", () => ({ isDemo: () => demo.on }));

const { deleteMyAccount, AccountDeletionError } = await import("./accountDeletion");
const auth = await import("./auth");
const data = await import("./firestore");

const leave = vi.fn((path: string) => void calls.push(`leave ${path}`));

beforeEach(() => {
  calls.length = 0;
  fail.at = "";
  fail.code = "";
  demo.on = false;
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => endAccountDeletion());

describe("deleting an account", () => {
  it("asks for the password first, then data, sign-in, and forgets it all on this device", async () => {
    const wipe = await deleteMyAccount({ uid: "u1", google: false, password: "pw", leave });
    expect(wipe).toEqual({ deleted: 12, leftovers: 1, profile: true });
    expect(auth.reauthenticate).toHaveBeenCalledWith("pw");
    expect(data.deleteAllUserData).toHaveBeenCalledWith("u1");
    expect(calls).toEqual([
      "reauth:password",
      "queries:cancel",
      "data (gate shut)",
      "auth:delete",
      "logout",
      "queries:clear",
      // Only the account's lists: the shared defaults under `ref:` stay.
      'local:delete "sync:"',
      "firestore:terminate",
      "firestore:clear-cache",
      "leave /login",
    ]);
  });

  it("confirms a Google account in Google's window, never with a password", async () => {
    await deleteMyAccount({ uid: "u1", google: true, leave });
    expect(calls[0]).toBe("reauth:google");
    expect(auth.reauthenticate).not.toHaveBeenCalledWith(expect.anything());
    expect(calls).toContain("auth:delete");
  });

  it("touches nothing when Google's window is closed or the wrong account is picked", async () => {
    for (const code of ["auth/popup-closed-by-user", "auth/user-mismatch"]) {
      calls.length = 0;
      fail.at = "reauth:google";
      fail.code = code;
      await expect(deleteMyAccount({ uid: "u1", google: true, leave })).rejects.toMatchObject({ stage: "identity", code });
      expect(calls).toEqual(["reauth:google"]);
      expect(isDeletingAccount()).toBe(false);
    }
  });

  it("touches nothing on a wrong password", async () => {
    fail.at = "reauth:password";
    fail.code = "auth/wrong-password";
    const err = await deleteMyAccount({ uid: "u1", google: false, password: "nope", leave }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err).toMatchObject({ stage: "identity", code: "auth/wrong-password" });
    expect(calls).toEqual(["reauth:password"]);
  });

  it("stopped in the data: the sign-in stays, writes are allowed again, nothing is forgotten", async () => {
    localStorage.setItem("money-accounts", "[]");
    fail.at = "data";
    fail.code = "permission-denied";
    await expect(deleteMyAccount({ uid: "u1", google: false, password: "pw", leave })).rejects.toMatchObject({ stage: "data" });
    expect(calls).not.toContain("auth:delete");
    expect(calls).not.toContain("logout");
    expect(isDeletingAccount()).toBe(false);
    expect(localStorage.getItem("money-accounts")).toBe("[]");
    expect(leave).not.toHaveBeenCalled();
  });

  it("stopped at the sign-in: the data is gone, so this device signs out and forgets it rather than refusing every save", async () => {
    localStorage.setItem("money-accounts", "[]");
    localStorage.setItem("app-language", "el");
    fail.at = "auth:delete";
    fail.code = "auth/network-request-failed";
    await expect(deleteMyAccount({ uid: "u1", google: true, leave })).rejects.toMatchObject({ stage: "sign-in" });
    expect(calls).toEqual(["reauth:google", "queries:cancel", "data (gate shut)", "auth:delete", "logout", "queries:clear", 'local:delete "sync:"']);
    // Signed out, nothing can write as the account; a new sign-in must be able to.
    expect(isDeletingAccount()).toBe(false);
    expect(localStorage.getItem("money-accounts")).toBeNull();
    expect(localStorage.getItem("app-language")).toBe("el");
    // Firestore keeps running and the page is not reloaded: the message has to be seen.
    expect(leave).not.toHaveBeenCalled();

    // Deleting again: asks again, finds the data already gone, removes the sign-in.
    fail.at = "";
    calls.length = 0;
    await deleteMyAccount({ uid: "u1", google: true, leave });
    expect(calls.slice(0, 4)).toEqual(["reauth:google", "queries:cancel", "data (gate shut)", "auth:delete"]);
  });

  it("clears the account's keys from storage and keeps the device's own preferences", async () => {
    const kept = { "app-language": "el", "theme-preference": "dark", "nav-style": "gold", "auth:known-device": "1" };
    for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v);
    for (const k of ["money-accounts", "balance-check-ins", "incomes", "planner-salary", "auth:welcome-name", "auth:signed-in", "auth:pending-sign-up", "bill-alerts"]) localStorage.setItem(k, "x");
    sessionStorage.setItem("anything", "x");

    await deleteMyAccount({ uid: "u1", google: false, password: "pw", leave });

    expect(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))).toEqual(kept);
    expect(sessionStorage.length).toBe(0);
  });

  it("is refused in the demo before anything else", async () => {
    demo.on = true;
    await expect(deleteMyAccount({ uid: "demo", google: false, password: "pw", leave })).rejects.toMatchObject({ code: "demo/unavailable" });
    expect(calls).toEqual([]);
  });

  it("is refused offline before anything else", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      await expect(deleteMyAccount({ uid: "u1", google: false, password: "pw", leave })).rejects.toMatchObject({ name: "OfflineActionError" });
      expect(calls).toEqual([]);
    } finally {
      online.mockRestore();
    }
  });
});

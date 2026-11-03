import { describe, it, expect, vi, beforeEach } from "vitest";
import { completeSignUp, finishPendingSignUp, savePendingSignUp, type PendingSignUp } from "./pendingSignUp";

// A sign-up from the demo's dialog leaves its profile to the real app. Written
// only where none exists: `createUser` replaces the whole document, and a step
// run twice must never empty an account.

const store = vi.hoisted(() => ({ createUser: vi.fn(async () => {}), getUser: vi.fn(async (): Promise<unknown> => null) }));
vi.mock("../../firebase/firestore", () => store);
const google = vi.hoisted(() => ({ ensureGoogleProfile: vi.fn(async () => true) }));
vi.mock("./googleProfile", () => google);
const cache = vi.hoisted(() => ({ invalidateQueries: vi.fn(async () => {}) }));
vi.mock("../../lib/queryClient", () => ({ queryClient: cache }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ exchangeRateKeys: { user: (uid: string) => ["userCurrency", uid] } }));

const profile: PendingSignUp = { kind: "profile", uid: "u1", profile: { email: "m@example.test", username: "maria_p", firstName: "Maria", lastName: "Papa", locale: "el" } };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  store.getUser.mockResolvedValue(null);
});

describe("completeSignUp", () => {
  it("writes the typed profile for an account that has none", async () => {
    await completeSignUp(profile);
    expect(store.createUser).toHaveBeenCalledWith("u1", profile.kind === "profile" ? profile.profile : undefined);
  });

  it("never overwrites a profile that is already there", async () => {
    store.getUser.mockResolvedValue({ firstName: "Existing" });
    await completeSignUp(profile);
    expect(store.createUser).not.toHaveBeenCalled();
  });

  it("hands Google's to ensureGoogleProfile, which checks first", async () => {
    await completeSignUp({ kind: "google", uid: "g1", email: "g@example.test", displayName: "Maria Papa", locale: "en" });
    expect(google.ensureGoogleProfile).toHaveBeenCalledWith({ uid: "g1", email: "g@example.test", displayName: "Maria Papa" }, "en");
  });
});

describe("finishPendingSignUp", () => {
  it("does nothing when nothing was left", async () => {
    expect(await finishPendingSignUp("u1")).toBe(false);
    expect(store.createUser).not.toHaveBeenCalled();
  });

  it("finishes the step for the account it was left for, forgets it, and has the profile read again", async () => {
    savePendingSignUp(profile);
    expect(await finishPendingSignUp("u1")).toBe(true);
    expect(store.createUser).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("auth:pending-sign-up")).toBeNull();
    expect(cache.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["userCurrency", "u1"] });
    // A second start: nothing left.
    expect(await finishPendingSignUp("u1")).toBe(false);
    expect(store.createUser).toHaveBeenCalledTimes(1);
  });

  it("drops a step left for another account without writing it", async () => {
    savePendingSignUp(profile);
    expect(await finishPendingSignUp("someone-else")).toBe(false);
    expect(store.createUser).not.toHaveBeenCalled();
    expect(localStorage.getItem("auth:pending-sign-up")).toBeNull();
  });

  it("keeps a step that failed, for the next start", async () => {
    savePendingSignUp(profile);
    store.createUser.mockRejectedValueOnce(new Error("offline"));
    await expect(finishPendingSignUp("u1")).rejects.toThrow("offline");
    expect(localStorage.getItem("auth:pending-sign-up")).not.toBeNull();
  });
});

describe("finishPendingSignUpWithRetry", () => {
  it("tries again when the connection comes back, and says nothing when that works", async () => {
    savePendingSignUp(profile);
    store.createUser.mockRejectedValueOnce(new Error("offline"));
    const giveUp = vi.fn();
    const { finishPendingSignUpWithRetry } = await import("./pendingSignUp");
    finishPendingSignUpWithRetry("u1", giveUp);
    await vi.waitFor(() => expect(store.createUser).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(store.createUser).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(localStorage.getItem("auth:pending-sign-up")).toBeNull());
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("says so when the second try fails too, and keeps the step for the next start", async () => {
    vi.useFakeTimers();
    try {
      savePendingSignUp(profile);
      store.createUser.mockRejectedValue(new Error("refused"));
      const giveUp = vi.fn();
      const { finishPendingSignUpWithRetry, PENDING_RETRY_MS } = await import("./pendingSignUp");
      finishPendingSignUpWithRetry("u1", giveUp);
      await vi.advanceTimersByTimeAsync(PENDING_RETRY_MS + 10);
      expect(store.createUser).toHaveBeenCalledTimes(2);
      expect(giveUp).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("auth:pending-sign-up")).not.toBeNull();
    } finally {
      store.createUser.mockReset();
      store.createUser.mockResolvedValue(undefined);
      vi.useRealTimers();
    }
  });

  it("does nothing more once cancelled", async () => {
    savePendingSignUp(profile);
    store.createUser.mockRejectedValueOnce(new Error("offline"));
    const giveUp = vi.fn();
    const { finishPendingSignUpWithRetry } = await import("./pendingSignUp");
    const cancel = finishPendingSignUpWithRetry("u1", giveUp);
    await vi.waitFor(() => expect(store.createUser).toHaveBeenCalledTimes(1));
    cancel();
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.createUser).toHaveBeenCalledTimes(1);
  });
});

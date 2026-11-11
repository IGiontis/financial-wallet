import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth } from "firebase/auth";

// The send itself: never a real email — Firebase's call is a mock here.

const sdk = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock("firebase/auth", () => sdk);

const { sendResetLink, resetOutcome, cooldownLeft, startCooldown, resetCooldown, RESET_COOLDOWN_SECONDS } = await import("./passwordReset");

const fakeAuth = { name: "auth" } as unknown as Auth;
const err = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  sdk.sendPasswordResetEmail.mockReset();
  resetCooldown.until = 0;
});

describe("sendResetLink", () => {
  it("asks Firebase once, with a way back to this site's sign-in page", async () => {
    sdk.sendPasswordResetEmail.mockResolvedValue(undefined);
    await sendResetLink(fakeAuth, "maria@example.test");
    expect(sdk.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sdk.sendPasswordResetEmail).toHaveBeenCalledWith(fakeAuth, "maria@example.test", { url: `${window.location.origin}/login` });
  });

  it("sends without the way back from a site Firebase does not know", async () => {
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(err("auth/unauthorized-continue-uri")).mockResolvedValueOnce(undefined);
    await sendResetLink(fakeAuth, "maria@example.test");
    expect(sdk.sendPasswordResetEmail).toHaveBeenCalledTimes(2);
    expect(sdk.sendPasswordResetEmail).toHaveBeenLastCalledWith(fakeAuth, "maria@example.test");
  });

  it("passes any other failure on, untried a second time", async () => {
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(err("auth/too-many-requests"));
    await expect(sendResetLink(fakeAuth, "maria@example.test")).rejects.toMatchObject({ code: "auth/too-many-requests" });
    expect(sdk.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});

describe("resetOutcome", () => {
  it("reads a missing account as a send", () => {
    expect(resetOutcome(null)).toEqual({ kind: "sent" });
    expect(resetOutcome(err("auth/user-not-found"))).toEqual(resetOutcome(null));
  });

  it("puts a bad address on the field, the rest above the form", () => {
    expect(resetOutcome(err("auth/invalid-email"))).toEqual({ kind: "field", key: "validation.emailInvalid" });
    expect(resetOutcome(err("auth/too-many-requests"))).toEqual({ kind: "alert", key: "errors.tooManyRequests" });
    expect(resetOutcome(err("auth/network-request-failed"))).toEqual({ kind: "alert", key: "auth.reset.offline" });
    expect(resetOutcome(new Error("boom"))).toEqual({ kind: "alert", key: "errors.generic" });
  });
});

describe("the cooldown", () => {
  it("counts whole seconds down from the minute, to zero", () => {
    expect(cooldownLeft(1_000)).toBe(0);
    startCooldown(1_000);
    expect(cooldownLeft(1_000)).toBe(RESET_COOLDOWN_SECONDS);
    expect(cooldownLeft(1_000 + 59_001)).toBe(1);
    expect(cooldownLeft(1_000 + 60_000)).toBe(0);
    expect(cooldownLeft(1_000 + 90_000)).toBe(0);
  });
});

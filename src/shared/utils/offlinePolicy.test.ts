import { describe, it, expect } from "vitest";
import { isLockedOffline, requireConnection, OfflineActionError } from "./offlinePolicy";

// The line between what waits for a connection and what gets queued.
//
// The point of writing these down is that the rule is a judgement, not an
// accident: an expense entered on a train is worth keeping, a deletion decided
// against an hours-old copy of the account is not.

describe("isLockedOffline", () => {
  it("locks nothing at all while there is a connection", () => {
    expect(isLockedOffline("delete", true)).toBe(false);
    expect(isLockedOffline("settings", true)).toBe(false);
    expect(isLockedOffline("entry", true)).toBe(false);
  });

  it("keeps everyday entries open offline, because they are queued and additive", () => {
    expect(isLockedOffline("entry", false)).toBe(false);
  });

  it("holds back the two that cannot be judged offline", () => {
    expect(isLockedOffline("delete", false)).toBe(true);
    expect(isLockedOffline("settings", false)).toBe(true);
  });
});

describe("requireConnection", () => {
  it("says nothing when there is a connection", () => {
    expect(() => requireConnection("delete", true)).not.toThrow();
  });

  it("names the action it refused", () => {
    // The screen turns this into a sentence, so it has to carry which rule bit.
    try {
      requireConnection("delete", false);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OfflineActionError);
      expect((error as OfflineActionError).action).toBe("delete");
    }
  });

  it("refuses a settings change too", () => {
    expect(() => requireConnection("settings", false)).toThrow(OfflineActionError);
  });
});

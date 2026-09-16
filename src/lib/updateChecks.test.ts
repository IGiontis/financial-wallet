import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleUpdateChecks } from "./updateChecks";

// When the app asks whether there is a new version.
//
// The point of all of this is an installed app that sits suspended on a phone
// for days: it is never loaded again, so it never asks, so a published version
// only arrived after a force quit. What is pinned down here is that it asks at
// the moments a new version could have appeared — and that it does not ask when
// there is nothing to find, because every ask is a request.

describe("scheduleUpdateChecks", () => {
  let clock = 0;
  const options = (extra: Partial<Parameters<typeof scheduleUpdateChecks>[1]> = {}) => ({
    intervalMs: 1000,
    minGapMs: 0,
    isOnline: () => true,
    isVisible: () => true,
    now: () => clock,
    ...extra,
  });

  beforeEach(() => {
    clock = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks again while the app is left open", () => {
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, options());

    clock = 1000;
    vi.advanceTimersByTime(1000);
    clock = 2000;
    vi.advanceTimersByTime(1000);

    expect(check).toHaveBeenCalledTimes(2);
    stop();
  });

  it("asks when the app comes back to the front", () => {
    // The phone resuming a suspended app: no load, no navigation, nothing else
    // that would prompt the browser to look.
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, options());

    clock = 500;
    document.dispatchEvent(new Event("visibilitychange"));

    expect(check).toHaveBeenCalledTimes(1);
    stop();
  });

  it("asks when the connection comes back", () => {
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, options());

    clock = 500;
    window.dispatchEvent(new Event("online"));

    expect(check).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stays quiet with no connection", () => {
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, options({ isOnline: () => false }));

    clock = 5000;
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event("online"));

    expect(check).not.toHaveBeenCalled();
    stop();
  });

  it("stays quiet while the app is in the background", () => {
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, options({ isVisible: () => false }));

    clock = 5000;
    vi.advanceTimersByTime(5000);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(check).not.toHaveBeenCalled();
    stop();
  });

  it("does not ask twice for one switch away and back", () => {
    // Registering already asked, and a visibilitychange fires on the way out as
    // well as on the way in. Without the gap, tabbing back and forth is a
    // request every time.
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, options({ minGapMs: 60_000 }));

    clock = 1;
    document.dispatchEvent(new Event("visibilitychange"));
    clock = 2;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(check).not.toHaveBeenCalled();

    clock = 60_001;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(check).toHaveBeenCalledTimes(1);

    stop();
  });

  it("stops asking once it is torn down", () => {
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, options());
    stop();

    clock = 5000;
    vi.advanceTimersByTime(5000);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));

    expect(check).not.toHaveBeenCalled();
  });
});

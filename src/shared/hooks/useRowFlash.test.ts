import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ROW_FLASH, ROW_FLASH_MS, useRowFlash } from "./useRowFlash";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useRowFlash", () => {
  it("lights only the saved row, and lets it go once the flash is over", () => {
    const { result } = renderHook(() => useRowFlash());
    expect(result.current.flashClass("a")).toBe("");

    act(() => result.current.flash("a"));
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.flashClass("a")).toBe(ROW_FLASH);
    expect(result.current.flashClass("b")).toBe("");

    act(() => vi.advanceTimersByTime(ROW_FLASH_MS + 50));
    expect(result.current.flashClass("a")).toBe("");
    expect(result.current.flashedId).toBeNull();
  });

  it("moves to the next saved row, and starts over for the same one", () => {
    const { result } = renderHook(() => useRowFlash<number>());
    act(() => result.current.flash(1));
    act(() => vi.advanceTimersByTime(16));
    act(() => result.current.flash(2));
    // Off for a frame, so a repeat restarts the animation…
    expect(result.current.flashedId).toBeNull();
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.flashClass(1)).toBe("");
    expect(result.current.flashClass(2)).toBe(ROW_FLASH);
    // …and the timer is the second one's: still lit just before its own end.
    act(() => vi.advanceTimersByTime(ROW_FLASH_MS));
    expect(result.current.flashClass(2)).toBe(ROW_FLASH);
  });
});

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLoadMore } from "./useLoadMore";

// A long list a page at a time: the first page, more on asking, and a new
// filter back to the first page.

describe("drawing a long list a page at a time", () => {
  it("starts with one page and adds one each time more is asked for", () => {
    const { result } = renderHook(() => useLoadMore(100, 40, "all"));
    expect(result.current).toMatchObject({ limit: 40, hasMore: true });
    act(() => result.current.more());
    expect(result.current.limit).toBe(80);
    act(() => result.current.more());
    // 120 drawn of 100: nothing left to ask for.
    expect(result.current.hasMore).toBe(false);
  });

  it("goes back to the first page when the list changes", () => {
    const { result, rerender } = renderHook(({ key }) => useLoadMore(100, 40, key), { initialProps: { key: "all" } });
    act(() => result.current.more());
    expect(result.current.limit).toBe(80);
    rerender({ key: "out" });
    expect(result.current.limit).toBe(40);
  });

  it("has nothing more to ask for when one page holds it all", () => {
    const { result } = renderHook(() => useLoadMore(12, 40, "all"));
    expect(result.current.hasMore).toBe(false);
  });
});

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStepTried } from "./useStepTried";

describe("useStepTried", () => {
  it("starts with no step tried, so a form opens without errors", () => {
    const { result } = renderHook(() => useStepTried<"a" | "b">());
    expect(result.current.tried("a")).toBe(false);
    expect(result.current.tried("b")).toBe(false);
  });

  it("marks only the step that blocked, not the ones after it", () => {
    const { result } = renderHook(() => useStepTried<"a" | "b">());
    act(() => result.current.mark("a"));
    expect(result.current.tried("a")).toBe(true);
    expect(result.current.tried("b")).toBe(false);
  });

  it("reset clears every step", () => {
    const { result } = renderHook(() => useStepTried<"a" | "b">());
    act(() => {
      result.current.mark("a");
      result.current.mark("b");
    });
    act(() => result.current.reset());
    expect(result.current.tried("a")).toBe(false);
    expect(result.current.tried("b")).toBe(false);
  });
});

import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "./useOnceMutation";

// The same action never runs twice at once (the owner, 2026-11-12: a second
// «delete goal» while the first ran sent a second batch, and the rules'
// refusal of it came up as an error for a goal that was gone).

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

/** A write that answers only when told to. */
function gate<T = void>() {
  const calls: { vars: unknown; resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  const fn = vi.fn(
    (vars: unknown) =>
      new Promise<T>((resolve, reject) => {
        calls.push({ vars, resolve, reject });
      }),
  );
  return { fn, calls };
}

describe("useOnceMutation", () => {
  it("a second call for the same record while the first runs starts nothing, and hears the first one's answer", async () => {
    const write = gate<string>();
    const { result } = renderHook(() => useOnceMutation({ onceBy: (id: string) => id, mutationFn: write.fn }), { wrapper });

    let first!: Promise<string>;
    let second!: Promise<string>;
    act(() => {
      first = result.current.mutateAsync("goal-1");
      second = result.current.mutateAsync("goal-1");
      result.current.mutate("goal-1");
    });
    await vi.waitFor(() => expect(write.fn).toHaveBeenCalledTimes(1));
    expect(second).toBe(first);

    await act(async () => write.calls[0].resolve("gone"));
    await expect(second).resolves.toBe("gone");
    expect(write.fn).toHaveBeenCalledTimes(1);
  });

  it("another record is another action, and runs beside it", async () => {
    const write = gate();
    const { result } = renderHook(() => useOnceMutation({ onceBy: (id: string) => id, mutationFn: write.fn }), { wrapper });
    act(() => {
      result.current.mutate("goal-1");
      result.current.mutate("goal-2");
    });
    await vi.waitFor(() => expect(write.fn).toHaveBeenCalledTimes(2));
    expect(write.calls.map((c) => c.vars)).toEqual(["goal-1", "goal-2"]);
  });

  it("once the first has answered — even with a failure — the same action can run again", async () => {
    const write = gate();
    const { result } = renderHook(() => useOnceMutation({ onceBy: (id: string) => id, mutationFn: write.fn }), { wrapper });
    let first!: Promise<void>;
    act(() => {
      first = result.current.mutateAsync("goal-1");
    });
    const answer = first.catch((error: Error) => error);
    await vi.waitFor(() => expect(write.calls).toHaveLength(1));
    await act(async () => write.calls[0].reject(new Error("offline")));
    expect(((await answer) as Error).message).toBe("offline");

    act(() => result.current.mutate("goal-1"));
    await vi.waitFor(() => expect(write.fn).toHaveBeenCalledTimes(2));
  });

  it("an optimistic save (`sameCall`): two saves with equal figures are two records — both go", async () => {
    const write = gate();
    const { result } = renderHook(() => useOnceMutation({ onceBy: sameCall, mutationFn: write.fn }), { wrapper });
    const deposit = () => ({ goalId: "g", amount: 50 });
    act(() => {
      result.current.mutate(deposit());
      result.current.mutate(deposit());
    });
    await vi.waitFor(() => expect(write.fn).toHaveBeenCalledTimes(2));
  });

  it("…but the very same vars object handed in twice is one save", async () => {
    const write = gate();
    const { result } = renderHook(() => useOnceMutation({ onceBy: sameCall, mutationFn: write.fn }), { wrapper });
    const vars = { goalId: "g", amount: 50 };
    act(() => {
      result.current.mutate(vars);
      result.current.mutate(vars);
    });
    await vi.waitFor(() => expect(write.fn).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(write.fn).toHaveBeenCalledTimes(1);
  });

  it("`unchangedWhen` (No change, no write): an update equal to what is stored runs nothing — no patch, no write, no callbacks", async () => {
    const write = gate();
    const onMutate = vi.fn();
    const onSuccess = vi.fn();
    const stored = { name: "ΔΕΗ", amount: 50 };
    const { result } = renderHook(
      () => useOnceMutation({ onceBy: sameCall, unchangedWhen: (vars: { name: string; amount: number }) => vars.name.trim() === stored.name && vars.amount === stored.amount, mutationFn: write.fn, onMutate, onSuccess }),
      { wrapper },
    );
    let answer!: Promise<unknown>;
    act(() => {
      answer = result.current.mutateAsync({ name: "ΔΕΗ ", amount: 50 });
    });
    await expect(answer).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 20));
    expect(write.fn).not.toHaveBeenCalled();
    expect(onMutate).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    // A real change goes through as always.
    act(() => result.current.mutate({ name: "ΔΕΗ", amount: 55 }));
    await vi.waitFor(() => expect(write.fn).toHaveBeenCalledTimes(1));
    expect(onMutate).toHaveBeenCalledTimes(1);
  });

  it("keeps the first call's own callbacks: a dropped second call never steals its answer", async () => {
    const write = gate();
    const { result } = renderHook(() => useOnceMutation({ onceBy: (id: string) => id, mutationFn: write.fn }), { wrapper });
    const firstDone = vi.fn();
    const secondDone = vi.fn();
    act(() => {
      result.current.mutate("goal-1", { onSuccess: firstDone });
      result.current.mutate("goal-1", { onSuccess: secondDone });
    });
    await vi.waitFor(() => expect(write.calls).toHaveLength(1));
    await act(async () => write.calls[0].resolve());
    await vi.waitFor(() => expect(firstDone).toHaveBeenCalledOnce());
    expect(secondDone).not.toHaveBeenCalled();
  });
});

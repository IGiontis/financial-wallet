import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCachedList, useCachedWorkspaceList } from "./useCachedList";
import { workspaceKeys } from "./useWorkspaceSetting";

// The name checks read lists the screen already holds — never a read of their own.

describe("useCachedList", () => {
  it("reads what the cache holds, follows it, and never fetches", () => {
    const client = new QueryClient();
    client.setQueryData(["bills", "u1"], [{ name: "ΔΕΗ" }]);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useCachedList<{ name: string }>(["bills", "u1"]), { wrapper });
    expect(result.current).toEqual([{ name: "ΔΕΗ" }]);
    act(() => void client.setQueryData(["bills", "u1"], [{ name: "ΔΕΗ" }, { name: "ΕΥΔΑΠ" }]));
    expect(result.current).toHaveLength(2);
    // Nothing was asked of the server: no query function ever ran.
    expect(client.getQueryCache().find({ queryKey: ["bills", "u1"] })?.state.fetchStatus).toBe("idle");
  });

  it("is empty when nothing is held, or with no provider at all", () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    expect(renderHook(() => useCachedList(["goals", "u1"]), { wrapper }).result.current).toEqual([]);
    expect(client.getQueryCache().findAll()).toHaveLength(0);
    expect(renderHook(() => useCachedList(["goals", "u1"])).result.current).toEqual([]);
  });

  it("reads one key of the held workspace", () => {
    const client = new QueryClient();
    client.setQueryData(workspaceKeys.all(""), { "money-accounts": [{ id: "a", name: "Alpha" }], other: 1 });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    expect(renderHook(() => useCachedWorkspaceList("money-accounts"), { wrapper }).result.current).toEqual([{ id: "a", name: "Alpha" }]);
    expect(renderHook(() => useCachedWorkspaceList("other"), { wrapper }).result.current).toEqual([]);
  });
});

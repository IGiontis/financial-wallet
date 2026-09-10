import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWorkspaceSetting } from "./useWorkspaceSetting";

// Where the plan lives, and which copy wins.
//
// This replaced `useLocalStorage` on the planner and the allocation page after
// the same plan turned out to exist twice — once on the phone, once on the
// laptop — with no way for either to know about the other. The rules that fix
// that are worth pinning down: the account's copy wins, the device's copy stands
// in until it arrives, an edit is visible before it is saved, and a device that
// has a plan while the account has none hands its plan over rather than being
// wiped by an empty answer.

const saveWorkspaceValue = vi.fn();
let storedUser: { workspace?: Record<string, unknown> } | null = null;

vi.mock("../../firebase/firestore", () => ({
  getUser: () => Promise.resolve(storedUser),
  saveWorkspaceValue: (...args: unknown[]) => {
    saveWorkspaceValue(...args);
    return Promise.resolve();
  },
}));

vi.mock("./useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
  saveWorkspaceValue.mockClear();
  storedUser = { workspace: {} };
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWorkspaceSetting", () => {
  it("falls back to what this device has while the account is still answering", () => {
    localStorage.setItem("planner-salary", JSON.stringify({ amount: "1400", day: "28" }));

    const { result } = renderHook(() => useWorkspaceSetting("planner-salary", { amount: "", day: "" }), { wrapper });

    // Not the empty default — the screen paints with the plan it already has
    // rather than blank, and then blinking into the real one.
    expect(result.current[0]).toEqual({ amount: "1400", day: "28" });
  });

  it("prefers the account's copy over this device's once it arrives", async () => {
    localStorage.setItem("planner-opening", JSON.stringify("100"));
    storedUser = { workspace: { "planner-opening": "2500" } };

    const { result } = renderHook(() => useWorkspaceSetting("planner-opening", ""), { wrapper });

    await waitFor(() => expect(result.current[0]).toBe("2500"));
  });

  it("shows an edit immediately and saves it once the changes stop", async () => {
    const { result } = renderHook(() => useWorkspaceSetting<string[]>("planner-skip", []), { wrapper });
    await waitFor(() => expect(saveWorkspaceValue).not.toHaveBeenCalled());

    act(() => result.current[1](["a"]));
    // On screen at once, and on the device at once.
    await waitFor(() => expect(result.current[0]).toEqual(["a"]));
    expect(JSON.parse(localStorage.getItem("planner-skip") ?? "null")).toEqual(["a"]);
    // But not yet sent: a slider being dragged would write sixty times a second.
    expect(saveWorkspaceValue).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(saveWorkspaceValue).toHaveBeenCalledWith("u1", "planner-skip", ["a"]);
  });

  it("sends one write for a run of changes, holding the last one", async () => {
    const { result } = renderHook(() => useWorkspaceSetting("planner-opening", ""), { wrapper });

    act(() => result.current[1]("1"));
    act(() => result.current[1]("12"));
    act(() => result.current[1]("123"));

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(saveWorkspaceValue).toHaveBeenCalledTimes(1);
    expect(saveWorkspaceValue).toHaveBeenCalledWith("u1", "planner-opening", "123");
  });

  it("updates from the value that is there, not from a stale closure", async () => {
    const { result } = renderHook(() => useWorkspaceSetting<string[]>("planner-skip", []), { wrapper });

    act(() => result.current[1](["a"]));
    act(() => result.current[1]((previous) => [...previous, "b"]));

    await waitFor(() => expect(result.current[0]).toEqual(["a", "b"]));
  });

  it("hands this device's plan up when the account has none", async () => {
    localStorage.setItem("planner-lines", JSON.stringify([{ id: "l1", label: "Ενοίκιο", amount: 400 }]));
    storedUser = { workspace: {} };

    renderHook(() => useWorkspaceSetting("planner-lines", []), { wrapper });

    // The empty answer must not be read as "the plan was deleted".
    await waitFor(() => expect(saveWorkspaceValue).toHaveBeenCalledWith("u1", "planner-lines", [{ id: "l1", label: "Ενοίκιο", amount: 400 }]));
  });

  it("does not hand anything up when the account already has an answer", async () => {
    localStorage.setItem("planner-lines", JSON.stringify([{ id: "old" }]));
    storedUser = { workspace: { "planner-lines": [{ id: "new" }] } };

    const { result } = renderHook(() => useWorkspaceSetting("planner-lines", []), { wrapper });

    await waitFor(() => expect(result.current[0]).toEqual([{ id: "new" }]));
    expect(saveWorkspaceValue).not.toHaveBeenCalled();
  });

  it("keeps an empty account value rather than treating it as missing", async () => {
    // Clearing every line is a decision, and it has to survive a reload — an
    // empty array up there must beat a full one still sitting on the device.
    localStorage.setItem("planner-lines", JSON.stringify([{ id: "old" }]));
    storedUser = { workspace: { "planner-lines": [] } };

    const { result } = renderHook(() => useWorkspaceSetting("planner-lines", [{ id: "fallback" }]), { wrapper });

    await waitFor(() => expect(result.current[0]).toEqual([]));
  });
});

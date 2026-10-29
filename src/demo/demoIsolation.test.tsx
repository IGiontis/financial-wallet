import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { enterDemo, exitDemo } from "./demoMode";
import { seedDemo } from "./demoSession";
import { memoryCollection } from "./memoryFirestore";
import { DEMO_UID } from "./demoUser";
import { ACCOUNTS_KEY, CHECK_INS_KEY } from "../features/accounts/accountsUtils";
import { INCOMES_KEY } from "../features/incomes/incomesUtils";
import { PLANNER_KEYS } from "../features/plannerPage/plannerInputs";

// Spelled out: the module that names it reaches Firebase's own, and has to
// load after the demo is switched on (checked against it below).
const BILL_ALERTS_OFF_KEY = "bill-alerts-off";

// The demo must never show anyone's real account. The workspace's device copy
// sits in localStorage under keys that carry no user — «planner-lines»,
// «incomes», «money-accounts» — so a device that has been used for a real
// account holds its plan there, readable by any page on the origin. Before
// this was closed the demo painted the owner's own Planner lines from them.
//
// Here the device holds an "owner's" values under every one of those keys; the
// demo is started; and nothing it reads, renders or writes may touch them.

// No Firebase at all: any export the demo reached for would fail loudly.
vi.mock("firebase/firestore", () => ({}));
// A Google provider object is built as `auth.ts` loads; it is configuration, not a request.
vi.mock("firebase/auth", () => ({ GoogleAuthProvider: class GoogleAuthProvider {} }));
vi.mock("firebase/app-check", () => ({}));
vi.mock("firebase/app", () => ({ initializeApp: () => ({}), FirebaseError: class FirebaseError extends Error {} }));

const OWNER = "OWNER-LINE";
const ownerValues: Record<string, unknown> = {
  [PLANNER_KEYS.lines]: [{ id: "owner-1", label: OWNER, amount: 999, kind: "expense" }],
  [PLANNER_KEYS.oneOffs]: [{ id: "owner-2", label: OWNER, amount: 999, date: "2026-11-01" }],
  [INCOMES_KEY]: [{ id: "owner-3", name: OWNER, kind: "salary", amount: 999, frequency: "monthly", day: 1, start: "2020-01" }],
  [ACCOUNTS_KEY]: [{ id: "owner-4", name: OWNER, kind: "bank" }],
  [CHECK_INS_KEY]: [{ id: "owner-5", at: "2026-10-01T10:00:00.000Z", amounts: { "owner-4": 999 } }],
  "planner-salary": { amount: "999", day: "1", label: OWNER },
  [BILL_ALERTS_OFF_KEY]: [OWNER],
};

type Hooks = typeof import("../shared/hooks/useWorkspaceSetting");
let hooks: Hooks;
let AuthProvider: (props: { children: ReactNode }) => ReactNode;

beforeAll(async () => {
  enterDemo();
  hooks = await import("../shared/hooks/useWorkspaceSetting");
  ({ AuthProvider } = await import("../context/AuthContext"));
  expect((await import("../features/bills/useBillAlerts")).BILL_ALERTS_OFF_KEY).toBe(BILL_ALERTS_OFF_KEY);
});
afterAll(() => exitDemo());

beforeEach(() => {
  localStorage.clear();
  for (const [key, value] of Object.entries(ownerValues)) localStorage.setItem(key, JSON.stringify(value));
  seedDemo("en");
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

const ownerStorageUntouched = () => {
  for (const [key, value] of Object.entries(ownerValues)) expect(localStorage.getItem(key)).toBe(JSON.stringify(value));
};

describe("the demo and the device's copy of a real account", () => {
  it("reads every workspace value from the demo's account, never from the device — not even before it arrives", async () => {
    const { result } = renderHook(
      () => ({
        workspace: hooks.useWorkspace(),
        lines: hooks.useWorkspaceSetting<unknown[]>(PLANNER_KEYS.lines, [])[0],
        incomes: hooks.useWorkspaceSetting<unknown[]>(INCOMES_KEY, [])[0],
        accounts: hooks.useWorkspaceSetting<unknown[]>(ACCOUNTS_KEY, [])[0],
        salary: hooks.useWorkspaceSetting<unknown>("planner-salary", "none")[0],
        alertsOff: hooks.useWorkspaceSetting<string[]>(BILL_ALERTS_OFF_KEY, [])[0],
      }),
      { wrapper },
    );
    // First frame: the defaults, not the device's values.
    expect(JSON.stringify(result.current)).not.toContain(OWNER);

    await waitFor(() => expect(result.current.workspace.isSuccess).toBe(true));
    expect(JSON.stringify(result.current)).not.toContain(OWNER);
    expect(result.current.lines.length).toBeGreaterThan(0);
    expect(result.current.salary).toBe("none");
    expect(result.current.alertsOff).toEqual([]);
    ownerStorageUntouched();
  });

  it("writes an edit to the demo's account in memory and leaves the device's copy alone", async () => {
    const { result } = renderHook(() => hooks.useWorkspaceSetting<unknown[]>(PLANNER_KEYS.lines, []), { wrapper });
    await waitFor(() => expect(result.current[0].length).toBeGreaterThan(0));

    act(() => result.current[1]([{ id: "demo-new", label: "Visitor's line", amount: 50, kind: "expense" }]));
    await waitFor(() => expect(result.current[0]).toEqual([{ id: "demo-new", label: "Visitor's line", amount: 50, kind: "expense" }]));

    await waitFor(() => expect((memoryCollection("users")[DEMO_UID].workspace as Record<string, unknown>)[PLANNER_KEYS.lines]).toEqual([{ id: "demo-new", label: "Visitor's line", amount: 50, kind: "expense" }]), { timeout: 3000 });
    ownerStorageUntouched();
  });

  it("a fresh copy of the account drops the old one's values and any save still waiting", async () => {
    const { result, unmount } = renderHook(
      () => ({ lines: hooks.useWorkspaceSetting<unknown[]>(PLANNER_KEYS.lines, []), salary: hooks.useWorkspaceSetting<unknown>("planner-salary", "none") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.lines[0].length).toBeGreaterThan(0));
    const fixtureLines = (memoryCollection("users")[DEMO_UID].workspace as Record<string, unknown>)[PLANNER_KEYS.lines];

    act(() => {
      result.current.lines[1]([{ id: "stale", label: "Before the reseed", amount: 1, kind: "expense" }]);
      result.current.salary[1]({ amount: "1" });
    });
    // Made again inside the pause before the save goes out (a language switch, say).
    seedDemo("en");
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 900));

    expect((memoryCollection("users")[DEMO_UID].workspace as Record<string, unknown>)[PLANNER_KEYS.lines]).toEqual(fixtureLines);
    expect(memoryCollection("users")[DEMO_UID].workspace).not.toHaveProperty("planner-salary");
    // Nor does the device stand-in still offer the old value.
    const again = renderHook(() => hooks.useWorkspaceSetting<unknown>("planner-salary", "none"), { wrapper });
    expect(again.result.current[0]).toBe("none");
    ownerStorageUntouched();
  });

  it("renders the demo's names, not the owner's", async () => {
    function Lines() {
      const [lines] = hooks.useWorkspaceSetting<{ id: string; label: string }[]>(PLANNER_KEYS.lines, []);
      const [accounts] = hooks.useWorkspaceSetting<{ id: string; name: string }[]>(ACCOUNTS_KEY, []);
      return (
        <ul>
          {[...lines.map((l) => l.label), ...accounts.map((a) => a.name)].map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      );
    }
    render(<Lines />, { wrapper });
    await screen.findByText("Alpha Bank");
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(OWNER);
    ownerStorageUntouched();
  });

  it("signs in as the demo's own user, with no Firebase session behind it", async () => {
    const { useAuth } = await import("../shared/hooks/useAuth");
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(false);
    expect(result.current.currentUser?.uid).toBe(DEMO_UID);
    // Signing in on this device is what makes it known; the demo is not a sign-in.
    expect(localStorage.getItem("auth:known-device")).toBeNull();
    expect(localStorage.getItem("auth:signed-in")).toBeNull();
  });
});

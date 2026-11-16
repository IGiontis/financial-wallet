import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { enterDemo, exitDemo } from "../demo/demoMode";
import { deleteField as memoryDeleteField, memoryCollection, resetMemoryFirestore } from "../demo/memoryFirestore";
import { mergeFields } from "../lib/listCache";
import { billKeys } from "../features/bills/billCache";
import type { Bill, BillWithStatus, Category, Debt, InvestmentGoal, Transaction } from "../shared/types/IndexTypes";

// Clearing an optional field in an edit form (docs/DATA_FLOW.md «Clearing a field»).
//
// The bug: the edit form sent `notes: undefined` for a note the user had
// deleted, the writer's `clean()` dropped undefined keys, the stored note
// stayed — and came back on screen with the next sync. Now a cleared field is
// `null` from the form: the write takes it off (`deleteField()`), the cache
// patch drops it (`mergeFields`), and a field the form did not touch
// (`undefined`) stays where it is, on both sides.
//
// The data layer runs here against the demo's in-memory store, which applies
// `deleteField()` as Firestore does and refuses an update of a document that is
// not there (as the production rules do), so "the stored doc" below is what a
// real write would leave.

vi.mock("firebase/firestore", () => ({}));
vi.mock("firebase/auth", () => ({ GoogleAuthProvider: class GoogleAuthProvider {} }));
vi.mock("firebase/app-check", () => ({}));
vi.mock("firebase/app", () => ({ initializeApp: () => ({}), FirebaseError: class FirebaseError extends Error {} }));
vi.mock("../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));

type Api = typeof import("./firestore");
let api: Api;

beforeAll(async () => {
  enterDemo();
  api = await import("./firestore");
});
afterAll(() => exitDemo());

const day = (d: number) => new Date(2026, 5, d);
const stored = (col: string, id: string) => memoryCollection(col)[id] as Record<string, unknown> | undefined;

const SEED = {
  transactions: {
    t1: { userId: "u1", amount: 12.5, type: "expense", categoryId: "food", date: day(3), description: "Σούπερ", notes: "με κάρτα", accountId: "acc-1", heldBy: "Νίκος", inReading: true, createdAt: day(3), updatedAt: day(3) },
    // A bill's expense and its payment: one fact written twice.
    tBill: { userId: "u1", amount: 80, type: "expense", categoryId: "utilities", date: day(10), description: "ΔΕΗ", notes: "λογαριασμός Ιουνίου", billId: "b1", createdAt: day(10), updatedAt: day(10) },
  },
  billPayments: {
    p1: { userId: "u1", billId: "b1", periodKey: "2026-06", amount: 80, paidDate: day(10), transactionId: "tBill", createdAt: day(10), updatedAt: day(10) },
  },
  investmentGoals: {
    g1: { userId: "u1", name: "Ταξίδι", icon: "✈️", color: "#3B82F6", notes: "Ιούλιο", goalType: "targeted", targetAmount: 900, targetPeriod: "custom", deadline: day(28), planFrom: "2026-07-01", parts: [{ id: "a", label: "Εισιτήρια", min: 300, max: 400 }], isActive: true, isCompleted: false, createdAt: day(1), updatedAt: day(1) },
  },
  bills: {
    b1: { userId: "u1", name: "ΔΕΗ", amount: 80, categoryId: "utilities", frequency: "yearly", dueDay: 10, dueMonth: 5, notes: "πάγια", icon: "💡", graceDays: 20, pause: { from: "2026-08" }, startsOn: "2026-01", isActive: true, createdAt: day(1), updatedAt: day(1) },
  },
  debts: {
    d1: { userId: "u1", person: "Νίκος", direction: "owed_by_me", label: "Εισιτήρια", amount: 200, date: day(2), dueDate: day(30), notes: "μέχρι το τέλος", forgiven: { date: day(20), amount: 200, note: "άσ' το" }, createdAt: day(2), updatedAt: day(2) },
  },
  categories: {
    c1: { userId: "u1", name: "Γάτα", type: "expense", icon: "🐈", color: "#aa0000", isDefault: false, createdAt: day(1), updatedAt: day(1) },
    c2: { userId: "u1", name: "Γάτα", type: "income", icon: "🐈", color: "#aa0000", isDefault: false, createdAt: day(1), updatedAt: day(1) },
  },
  users: {
    u1: { id: "u1", firstName: "Ηλίας", city: "Αθήνα", country: "GR", age: 40, currency: "EUR", workspace: { "money-accounts": [{ id: "a1", name: "Κάρτα", kind: "bank", color: "blue" }], other: { keep: true } } },
  },
};

beforeEach(() => resetMemoryFirestore(structuredClone(SEED)));

// ─── The rule itself ─────────────────────────────────────────────────────────

describe("forUpdate — what an update writes", () => {
  it("leaves undefined out, turns null into deleteField(), strips nested undefined and cleans text", () => {
    const out = api.forUpdate({ notes: null, icon: undefined, name: "  Σκι   διακοπές ", pause: { from: "2026-08", to: undefined }, parts: [{ id: "a", label: " x ", min: 1, max: 2, extra: undefined }] });
    expect(Object.keys(out).sort()).toEqual(["name", "notes", "parts", "pause"]);
    expect(out.notes).toEqual(memoryDeleteField());
    expect(out.name).toBe("Σκι διακοπές");
    expect(out.pause).toEqual({ from: "2026-08" });
    expect(out.parts).toEqual([{ id: "a", label: "x", min: 1, max: 2 }]);
  });
});

describe("mergeFields — the cache patch, the same rule", () => {
  it("drops a null field, keeps an undefined one as it was, replaces the rest", () => {
    const row = { id: "x", notes: "old", icon: "✈️", name: "a" };
    const next = mergeFields(row, { notes: null, icon: undefined, name: "b" });
    expect(next).toEqual({ id: "x", icon: "✈️", name: "b" });
    expect("notes" in next).toBe(false);
    expect(row.notes).toBe("old"); // the cached row itself is not changed in place
  });
});

// ─── Each writer against the store ───────────────────────────────────────────

describe("clearing a field takes it off the stored document", () => {
  it("transaction: a cleared note and card go; the payee, the holder and the reading mark stay", async () => {
    await api.updateTransaction("t1", { amount: 12.5, description: "Σούπερ", notes: null, accountId: null });
    const t = stored("transactions", "t1")!;
    expect("notes" in t).toBe(false);
    expect("accountId" in t).toBe(false);
    expect(t).toMatchObject({ description: "Σούπερ", heldBy: "Νίκος", inReading: true, amount: 12.5 });
  });

  it("transaction: a note not spoken for (undefined) stays as stored", async () => {
    await api.updateTransaction("t1", { amount: 13 });
    expect(stored("transactions", "t1")).toMatchObject({ notes: "με κάρτα", accountId: "acc-1", amount: 13 });
  });

  it("transaction: a bill's expense — the note goes, the payment follows the amount in the same batch", async () => {
    await api.updateTransaction("tBill", { amount: 95, notes: null }, { userId: "u1", paymentId: "p1" });
    const t = stored("transactions", "tBill")!;
    expect("notes" in t).toBe(false);
    // Reconciled a second way: the payment says the same figure the expense says.
    expect(t.amount).toBe(95);
    expect(stored("billPayments", "p1")!.amount).toBe(t.amount);
  });

  it("transaction: the payment deleted elsewhere — the batch never names it, and the note still goes", async () => {
    resetMemoryFirestore({ ...structuredClone(SEED), billPayments: {} });
    await api.updateTransaction("tBill", { amount: 95, notes: null }, { userId: "u1", paymentId: "p1" });
    expect("notes" in stored("transactions", "tBill")!).toBe(false);
    expect(stored("billPayments", "p1")).toBeUndefined();
  });

  it("goal: icon, note, deadline, plan-from and parts go; the colour, name and target stay", async () => {
    await api.updateInvestmentGoal("g1", { name: "Ταξίδι", icon: null, notes: null, deadline: null, planFrom: null, parts: null, targetAmount: 900 });
    const g = stored("investmentGoals", "g1")!;
    for (const field of ["icon", "notes", "deadline", "planFrom", "parts"]) expect(field in g, field).toBe(false);
    expect(g).toMatchObject({ name: "Ταξίδι", color: "#3B82F6", targetAmount: 900, goalType: "targeted" });
  });

  it("bill: note, due month, pause and start month go; icon, grace days and the amount stay", async () => {
    await api.updateBill("b1", { name: "ΔΕΗ", frequency: "monthly", notes: null, dueMonth: null, pause: null, startsOn: null });
    const b = stored("bills", "b1")!;
    for (const field of ["notes", "dueMonth", "pause", "startsOn"]) expect(field in b, field).toBe(false);
    expect(b).toMatchObject({ icon: "💡", graceDays: 20, amount: 80, frequency: "monthly", dueDay: 10 });
  });

  it("bill: fields the edit does not speak for stay", async () => {
    await api.updateBill("b1", { isActive: false });
    expect(stored("bills", "b1")).toMatchObject({ notes: "πάγια", dueMonth: 5, pause: { from: "2026-08" }, startsOn: "2026-01", isActive: false });
  });

  it("debt: label, note, due date and the forgiveness go; the person and the amount stay", async () => {
    await api.updateDebt("d1", { label: null, notes: null, dueDate: null, forgiven: null });
    const d = stored("debts", "d1")!;
    for (const field of ["label", "notes", "dueDate", "forgiven"]) expect(field in d, field).toBe(false);
    expect(d).toMatchObject({ person: "Νίκος", amount: 200, direction: "owed_by_me" });
  });

  it("category: both documents of a «both» lose the icon; the colour stays", async () => {
    await api.updateCategories(["c1", "c2"], { icon: null });
    for (const id of ["c1", "c2"]) {
      const c = stored("categories", id)!;
      expect("icon" in c).toBe(false);
      expect(c.color).toBe("#aa0000");
    }
  });

  it("profile: a cleared city, country and age go; the first name and the workspace stay", async () => {
    await api.updateUser("u1", { firstName: "Ηλίας", city: null, country: null, age: null });
    const u = stored("users", "u1")!;
    for (const field of ["city", "country", "age"]) expect(field in u, field).toBe(false);
    expect(u.firstName).toBe("Ηλίας");
    expect((u.workspace as Record<string, unknown>).other).toEqual({ keep: true });
  });

  it("workspace: the whole value replaces the stored one — a colour taken off an entry is gone, no undefined is sent", async () => {
    await api.saveWorkspaceValue("u1", "money-accounts", [{ id: "a1", name: "Μετρητά", kind: "cash", color: undefined }]);
    const ws = stored("users", "u1")!.workspace as Record<string, unknown>;
    expect(ws["money-accounts"]).toEqual([{ id: "a1", name: "Μετρητά", kind: "cash" }]);
    expect(ws.other).toEqual({ keep: true });
  });

  it("an update of a document that is not there is still refused (rules), clearing or not", async () => {
    await expect(api.updateTransaction("nope", { notes: null })).rejects.toBeTruthy();
  });
});

// ─── The hooks: the cache and the store agree ────────────────────────────────

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const asRow = <T,>(col: string, id: string) => ({ ...stored(col, id)!, id }) as T;

describe("the edit hooks: what the screen shows is what is stored", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  });

  it("useUpdateTransaction: a cleared note leaves the cached row and the stored doc; the card stays on both", async () => {
    const { transactionKeys, useUpdateTransaction } = await import("../features/transactions/hooks/useTransactions");
    client.setQueryData(transactionKeys.all("u1"), [asRow<Transaction>("transactions", "t1")]);
    const { result } = renderHook(() => useUpdateTransaction(), { wrapper });
    await act(() => result.current.mutateAsync({ transactionId: "t1", data: { amount: 12.5, notes: null } }));

    const row = client.getQueryData<Transaction[]>(transactionKeys.all("u1"))!.find((r) => r.id === "t1")!;
    const doc = stored("transactions", "t1")!;
    expect("notes" in row).toBe(false);
    expect("notes" in doc).toBe(false);
    expect(row.accountId).toBe("acc-1");
    expect(doc.accountId).toBe("acc-1");
  });

  it("useUpdateTransaction: clearing a note that is not there is no change — nothing is written", async () => {
    const { transactionKeys, useUpdateTransaction } = await import("../features/transactions/hooks/useTransactions");
    resetMemoryFirestore({ transactions: { t2: { userId: "u1", amount: 5, type: "expense", categoryId: "food", date: day(3), description: "Καφές", createdAt: day(3), updatedAt: day(3) } } });
    client.setQueryData(transactionKeys.all("u1"), [asRow<Transaction>("transactions", "t2")]);
    const before = (stored("transactions", "t2")!.updatedAt as Date).getTime();
    const { result } = renderHook(() => useUpdateTransaction(), { wrapper });
    await act(() => result.current.mutateAsync({ transactionId: "t2", data: { amount: 5, description: "Καφές", categoryId: "food", type: "expense", date: day(3), notes: null, accountId: null } }));
    expect((stored("transactions", "t2")!.updatedAt as Date).getTime()).toBe(before);
  });

  it("useUpdateGoal: a cleared icon and note leave the cache and the store; the colour stays", async () => {
    const { investmentKeys, useUpdateGoal } = await import("../features/budget/useInvestments");
    client.setQueryData(investmentKeys.goals("u1"), [asRow<InvestmentGoal>("investmentGoals", "g1")]);
    const { result } = renderHook(() => useUpdateGoal(), { wrapper });
    await act(() => result.current.mutateAsync({ goalId: "g1", data: { name: "Ταξίδι", icon: null, notes: null } }));

    const row = client.getQueryData<InvestmentGoal[]>(investmentKeys.goals("u1"))!.find((g) => g.id === "g1")!;
    const doc = stored("investmentGoals", "g1")!;
    for (const field of ["icon", "notes"]) {
      expect(field in row, `cache ${field}`).toBe(false);
      expect(field in doc, `store ${field}`).toBe(false);
    }
    expect(row.color).toBe("#3B82F6");
    expect(doc.color).toBe("#3B82F6");
  });

  it("useUpdateBill: a cleared note and due month leave the cache and the store; the icon stays", async () => {
    const { useUpdateBill } = await import("../features/bills/useBills");
    const bill = asRow<Bill>("bills", "b1");
    client.setQueryData<BillWithStatus[]>(billKeys.all("u1"), [{ ...bill, payments: [] } as unknown as BillWithStatus]);
    const { result } = renderHook(() => useUpdateBill(), { wrapper });
    await act(() => result.current.mutateAsync({ billId: "b1", data: { frequency: "monthly", notes: null, dueMonth: null } }));

    const row = client.getQueryData<BillWithStatus[]>(billKeys.all("u1"))!.find((b) => b.id === "b1")!;
    const doc = stored("bills", "b1")!;
    for (const field of ["notes", "dueMonth"]) {
      expect(field in row, `cache ${field}`).toBe(false);
      expect(field in doc, `store ${field}`).toBe(false);
    }
    expect(row.icon).toBe("💡");
    expect(doc.icon).toBe("💡");
    expect(row.pause).toEqual({ from: "2026-08" });
  });

  it("useUpdateCategoryGroup: a cleared icon leaves both cached rows and both stored docs", async () => {
    const { transactionKeys, useUpdateCategoryGroup } = await import("../features/transactions/hooks/useTransactions");
    client.setQueryData(transactionKeys.categories("u1"), [asRow<Category>("categories", "c1"), asRow<Category>("categories", "c2")]);
    const { result } = renderHook(() => useUpdateCategoryGroup(), { wrapper });
    await act(() => result.current.mutateAsync({ categoryIds: ["c1", "c2"], data: { icon: null } }));

    const rows = client.getQueryData<Category[]>(transactionKeys.categories("u1"))!;
    for (const id of ["c1", "c2"]) {
      expect("icon" in rows.find((r) => r.id === id)!).toBe(false);
      expect("icon" in stored("categories", id)!).toBe(false);
    }
  });

  it("debts: the cached debt after a cleared label matches the stored one (mergeFields, as `updated` applies it)", async () => {
    const debt = asRow<Debt>("debts", "d1");
    await api.updateDebt("d1", { label: null, forgiven: null });
    const cached = mergeFields(debt, { label: null, forgiven: null });
    const doc = stored("debts", "d1")!;
    expect(Object.keys(cached).filter((k) => k !== "id" && k !== "updatedAt").sort()).toEqual(Object.keys(doc).filter((k) => k !== "updatedAt").sort());
  });
});

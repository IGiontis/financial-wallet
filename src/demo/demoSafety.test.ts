import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { enterDemo, exitDemo } from "./demoMode";
import { memoryCollection } from "./memoryFirestore";
import { seedDemo } from "./demoSession";
import { DEMO_IDS } from "./fixtures";
import { DEMO_UID } from "./demoUser";

// The promise the demo makes the owner: a visitor costs nothing. Every
// Firebase SDK function — Firestore, Auth, App Check — is replaced by one that
// counts and refuses; the data layer is then put through what a visitor does,
// and none of them may have been called. What it wrote must be in the
// in-memory store instead.

const sdk = vi.hoisted(() => {
  const calls: string[] = [];
  const refuse = (name: string) =>
    function refused() {
      calls.push(name);
      throw new Error(`The real ${name} was called in the demo.`);
    };
  const firestore = Object.fromEntries(
    [
      "addDoc",
      "collection",
      "connectFirestoreEmulator",
      "deleteDoc",
      "deleteField",
      "doc",
      "getCountFromServer",
      "getDoc",
      "getDocs",
      "getDocFromServer",
      "getDocsFromServer",
      "waitForPendingWrites",
      "terminate",
      "clearIndexedDbPersistence",
      "getFirestore",
      "initializeFirestore",
      "persistentLocalCache",
      "persistentMultipleTabManager",
      "query",
      "serverTimestamp",
      "setDoc",
      "updateDoc",
      "where",
      "writeBatch",
      "FieldPath",
    ].map((name) => [name, refuse(`firestore.${name}`)]),
  );
  // A plain value class in the real SDK; here it only has to be something `instanceof` can test.
  firestore.Timestamp = class Timestamp {} as never;
  const auth = Object.fromEntries(
    [
      "getAuth",
      "connectAuthEmulator",
      "createUserWithEmailAndPassword",
      "signInWithEmailAndPassword",
      "signInWithPopup",
      "signOut",
      "onAuthStateChanged",
      "updatePassword",
      "reauthenticateWithCredential",
      "reauthenticateWithPopup",
      "deleteUser",
      "verifyBeforeUpdateEmail",
      "sendPasswordResetEmail",
    ].map((name) => [name, refuse(`auth.${name}`)]),
  );
  auth.GoogleAuthProvider = class GoogleAuthProvider {} as never;
  auth.EmailAuthProvider = { credential: refuse("auth.EmailAuthProvider.credential") } as never;
  const appCheck = { initializeAppCheck: refuse("appCheck.initializeAppCheck"), ReCaptchaEnterpriseProvider: refuse("appCheck.ReCaptchaEnterpriseProvider") };
  return { calls, firestore, auth, appCheck };
});

vi.mock("firebase/firestore", () => sdk.firestore);
vi.mock("firebase/auth", () => sdk.auth);
vi.mock("firebase/app-check", () => sdk.appCheck);
vi.mock("firebase/app", () => ({ initializeApp: () => ({ name: "app" }), FirebaseError: class FirebaseError extends Error {} }));

type Data = typeof import("../firebase/firestore");
type Auth = typeof import("../firebase/auth");
let data: Data;
let auth: Auth;

beforeAll(async () => {
  // Before Firebase's own module loads, as in the browser: the page decides
  // first, then `config` sees it.
  enterDemo();
  vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
  data = await import("../firebase/firestore");
  auth = await import("../firebase/auth");
});
afterAll(() => {
  vi.unstubAllEnvs();
  exitDemo();
});
beforeEach(() => {
  seedDemo("el");
  sdk.calls.length = 0;
});

const uid = DEMO_UID;

describe("the demo never reaches Firebase", () => {
  it("opens no Firestore, no Auth and no App Check as the app loads", async () => {
    const config = await import("../firebase/config");
    expect(config.appCheckEnabled).toBe(false);
    expect(() => config.db.type).toThrow(/not available in the demo/);
    expect(() => config.auth.currentUser).toThrow(/not available in the demo/);
    expect(sdk.calls).toEqual([]);
  });

  it("reads every list from memory", async () => {
    const [user, transactions, categories, bills, payments, goals, contributions, debts, debtPayments] = await Promise.all([
      data.getUser(uid),
      data.getTransactions(uid),
      data.getCategories(uid),
      data.getBills(uid),
      data.getBillPayments(uid),
      data.getInvestmentGoals(uid),
      data.getAllContributions(uid),
      data.getDebts(uid),
      data.getDebtPayments(uid),
    ]);
    expect(user?.locale).toBe("el");
    expect(transactions.length).toBeGreaterThan(100);
    expect(categories.some((c) => c.isDefault)).toBe(true);
    // Six running, one stopped («Σταματημένα»), one that starts later («Ξεκινά …»).
    expect(bills.length).toBe(8);
    expect(payments.length).toBeGreaterThan(10);
    expect(goals.length).toBe(3);
    expect(contributions.length).toBeGreaterThan(5);
    expect(debts.length).toBe(3);
    expect(debtPayments.length).toBeGreaterThan(5);
    expect(sdk.calls).toEqual([]);
  });

  it("writes a transaction, edits it and deletes it — in memory", async () => {
    const id = data.newDocId("transactions");
    await data.createTransaction(uid, { amount: 4.2, type: "expense", categoryId: "cat-expense-coffee", date: new Date(), description: "Φρέντο" }, id);
    expect(memoryCollection("transactions")[id]).toMatchObject({ amount: 4.2, userId: uid });
    await data.updateTransaction(id, { amount: 4.5 });
    expect(memoryCollection("transactions")[id].amount).toBe(4.5);
    await data.deleteTransaction(uid, id);
    expect(memoryCollection("transactions")).not.toHaveProperty(id);
    expect(sdk.calls).toEqual([]);
  });

  it("pays the late bill and takes the payment back", async () => {
    const bill = (await data.getBills(uid)).find((b) => b.id === DEMO_IDS.lateBill)!;
    const { paymentId, transactionId } = await data.markBillPaid(uid, bill, "2099-01", new Date(), 32.9);
    expect(memoryCollection("billPayments")[paymentId]).toMatchObject({ billId: bill.id, transactionId });
    expect(memoryCollection("transactions")[transactionId]).toMatchObject({ billId: bill.id, amount: 32.9 });
    await data.unmarkBillPaid(uid, { id: paymentId, transactionId });
    expect(memoryCollection("billPayments")).not.toHaveProperty(paymentId);
    expect(memoryCollection("transactions")).not.toHaveProperty(transactionId);
    expect(sdk.calls).toEqual([]);
  });

  it("saves a workspace value under its dotted path, leaving the rest of the workspace", async () => {
    await data.saveWorkspaceValue(uid, "planner-horizon", 6);
    const workspace = memoryCollection("users")[uid].workspace as Record<string, unknown>;
    expect(workspace["planner-horizon"]).toBe(6);
    expect(workspace["tour-seen"]).toBe(true);
    expect(sdk.calls).toEqual([]);
  });

  it("adds to a goal, counts a category, deletes a goal with what it held", async () => {
    await data.createContributionWithTransaction(uid, { goalId: DEMO_IDS.goals.trip, amount: 50, contributionType: "deposit", date: new Date() }, { amount: 50, type: "investment", categoryId: "", date: new Date(), description: "x", isInvestmentTransaction: true, isGoalTransaction: true, goalId: DEMO_IDS.goals.trip, contributionType: "deposit" });
    expect(await data.countCategoryUsage(uid, "cat-expense-coffee")).toBeGreaterThan(5);
    const gone = await data.deleteInvestmentGoal(uid, DEMO_IDS.goals.home);
    expect(gone.contributionIds.length).toBeGreaterThan(0);
    expect(memoryCollection("investmentGoals")).not.toHaveProperty(DEMO_IDS.goals.home);
    expect(Object.values(memoryCollection("transactions")).some((t) => t.goalId === DEMO_IDS.goals.home)).toBe(false);
    expect(sdk.calls).toEqual([]);
  });

  it("debts, transfers and a bulk reset stay in memory too", async () => {
    const debtId = await data.createDebt(uid, { person: "Άλκης", direction: "owed_to_me", amount: 20, date: new Date() });
    await data.createDebtPayment(uid, { debtId, amount: 5, date: new Date() });
    await data.saveTransfer(uid, [
      { id: "xfer_t_out", type: "expense", amount: 10, date: new Date(), accountId: "acc-main", categoryId: "__transfer__", description: "t", transferId: "t", transferPart: "out" },
      { id: "xfer_t_in", type: "income", amount: 10, date: new Date(), accountId: "acc-cash", categoryId: "__transfer__", description: "t", transferId: "t", transferPart: "in" },
    ]);
    await data.deleteTransfer(uid, "t");
    expect(await data.resetUserData(uid, { transactions: true })).toBeGreaterThan(100);
    expect(memoryCollection("transactions")).toEqual({});
    expect(memoryCollection("debts")).toHaveProperty(debtId);
    expect(sdk.calls).toEqual([]);
  });

  it("seeds no categories, and refuses what only a real account can do", async () => {
    const { seedDefaultCategories } = await import("../firebase/seedCategories");
    await seedDefaultCategories();
    expect(localStorage.getItem("categories-seeded-version")).toBeNull();
    expect(auth.isGoogleUser()).toBe(false);
    await expect(auth.updateUserPassword("x")).rejects.toMatchObject({ code: auth.DEMO_UNAVAILABLE });
    await expect(auth.deleteAccount()).rejects.toMatchObject({ code: auth.DEMO_UNAVAILABLE });
    await expect(auth.reauthenticateWithGoogle()).rejects.toMatchObject({ code: auth.DEMO_UNAVAILABLE });
    // A reset link only from the sign-in dialog's own way in, never the app's.
    await expect(auth.sendPasswordReset("maria@example.test")).rejects.toMatchObject({ code: auth.DEMO_UNAVAILABLE });
    const { deleteMyAccount } = await import("../firebase/accountDeletion");
    await expect(deleteMyAccount({ uid: DEMO_UID, google: true, leave: () => {} })).rejects.toMatchObject({ code: auth.DEMO_UNAVAILABLE });
    await expect(auth.loginWithEmail("a@b.c", "x")).rejects.toMatchObject({ code: auth.DEMO_UNAVAILABLE });
    expect(sdk.calls).toEqual([]);
  });

  it("signing out leaves the demo for /login with a full page load", async () => {
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, replace } });
    try {
      void auth.logout();
      expect(replace).toHaveBeenCalledWith("/login");
      // The menu's «Αποσύνδεση» (which lands a real account on the demo) does the same here.
      replace.mockClear();
      void auth.signOutToDemo();
      expect(replace).toHaveBeenCalledWith("/login");
      expect(replace).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
    expect(sdk.calls).toEqual([]);
  });

  it("keeps nothing on the device: the delta sync's store answers empty and stores nothing", async () => {
    const { localGet, localSet } = await import("../lib/localStore");
    await localSet("sync:demo:transactions", { rows: [] });
    expect(await localGet("sync:demo:transactions")).toBeUndefined();
  });
});

// A clearing bill («εκκαθαριστικός», owner 2026-11-26): one final figure for
// several unpaid months, kept as ONE payment with the whole amount on the
// latest month and the expense, plus a 0-row per other month marked
// `coveredBy` it. Put through the same in-memory store a visitor uses.
describe("a clearing bill, in memory", () => {
  const clear = async (stopFrom?: string) => {
    const bill = (await data.getBills(uid)).find((b) => b.id === DEMO_IDS.lateBill)!;
    const ids = { paymentId: data.newDocId("billPayments"), transactionId: data.newDocId("transactions") };
    const covered = [
      { id: data.newDocId("billPayments"), periodKey: "2099-01" },
      { id: data.newDocId("billPayments"), periodKey: "2099-02" },
    ];
    await data.markBillCleared(uid, bill, "2099-03", covered, new Date(), 96, ids, undefined, stopFrom);
    return { bill, ids, covered };
  };
  const rowsOf = (billId: string) => Object.entries(memoryCollection("billPayments")).filter(([, p]) => (p as { billId: string }).billId === billId && ["2099-01", "2099-02", "2099-03"].includes((p as { periodKey: string }).periodKey));

  it("writes one expense, one payment carrying it, and a 0-row per other month", async () => {
    const { bill, ids, covered } = await clear();
    expect(memoryCollection("transactions")[ids.transactionId]).toMatchObject({ billId: bill.id, amount: 96, type: "expense" });
    expect(memoryCollection("billPayments")[ids.paymentId]).toMatchObject({ periodKey: "2099-03", amount: 96, transactionId: ids.transactionId, covers: covered.map((c) => c.id) });
    for (const c of covered) expect(memoryCollection("billPayments")[c.id]).toMatchObject({ periodKey: c.periodKey, amount: 0, coveredBy: ids.paymentId });
    // Reconciled the other way: the three rows together hold exactly the one expense — nothing counted twice.
    const sum = rowsOf(bill.id).reduce((total, [, p]) => total + (p as { amount: number }).amount, 0);
    expect(sum).toBe(memoryCollection("transactions")[ids.transactionId].amount);
    expect(sdk.calls).toEqual([]);
  });

  it("stops the bill in the same write when it was the last one", async () => {
    const { bill } = await clear("2099-03");
    expect(memoryCollection("bills")[bill.id].pause).toEqual({ from: "2099-03" });
  });

  it("taken back from the Bills screen, goes with every month it closed", async () => {
    const { bill, ids } = await clear();
    // Not told which rows: it reads them off the payment itself.
    await data.unmarkBillPaid(uid, { id: ids.paymentId, transactionId: ids.transactionId });
    expect(rowsOf(bill.id)).toEqual([]);
    expect(memoryCollection("transactions")).not.toHaveProperty(ids.transactionId);
    expect(sdk.calls).toEqual([]);
  });

  it("its expense deleted from the Transactions screen takes the months with it", async () => {
    const { bill, ids } = await clear();
    await data.deleteTransaction(uid, ids.transactionId, { userId: uid });
    expect(rowsOf(bill.id)).toEqual([]);
    expect(memoryCollection("transactions")).not.toHaveProperty(ids.transactionId);
  });

  it("its expense corrected from the Transactions screen corrects only the clearing, never the 0-rows", async () => {
    const { ids, covered } = await clear();
    await data.updateTransaction(ids.transactionId, { amount: 101 }, { userId: uid, paymentId: ids.paymentId });
    expect(memoryCollection("billPayments")[ids.paymentId].amount).toBe(101);
    for (const c of covered) expect(memoryCollection("billPayments")[c.id].amount).toBe(0);
    expect(memoryCollection("transactions")[ids.transactionId].amount).toBe(101);
  });
});

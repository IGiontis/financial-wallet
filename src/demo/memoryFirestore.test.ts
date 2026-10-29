import { describe, it, expect, beforeEach } from "vitest";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  memoryCollection,
  MemoryFieldPath,
  query,
  resetMemoryFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "./memoryFirestore";

// The demo's Firestore. What matters is that it answers the data layer the way
// the server does wherever the app can tell: filters, batches that land whole
// or not at all, dotted updates into the workspace, deleted fields, dates.

const db = {};
const tx = (id: string) => doc(db, "transactions", id);

beforeEach(() =>
  resetMemoryFirestore({
    transactions: {
      a: { userId: "u1", amount: 3.5, categoryId: "coffee", date: new Date(2026, 9, 1), tags: ["work"] },
      b: { userId: "u1", amount: 42.1, categoryId: "groceries", date: new Date(2026, 9, 5) },
      c: { userId: "u2", amount: 9, categoryId: "coffee", date: new Date(2026, 9, 9) },
      d: { userId: "u1", amount: 120, categoryId: "rent", date: new Date(2026, 9, 12), tags: ["home", "monthly"] },
    },
    users: { u1: { id: "u1", workspace: { "planner-lines": [], "tour-seen": false }, syncDeletes: { "transactions:x": 1 } } },
  }),
);

const idsOf = async (q: Parameters<typeof getDocs>[0]) => (await getDocs(q)).docs.map((d) => d.id).sort();

describe("references", () => {
  it("makes a fresh twenty-character id for doc(collection) — what newDocId uses", () => {
    const a = doc(collection(db, "transactions"));
    const b = doc(collection(db, "transactions"));
    expect(a.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.path).toBe(`transactions/${a.id}`);
  });

  it("refuses an empty segment, as Firestore does for a missing uid", () => {
    expect(() => doc(db, "users", "")).toThrow(/empty segment/);
  });
});

describe("queries", () => {
  it("filters on equality, ranges over dates and numbers, and combines filters", async () => {
    expect(await idsOf(query(collection(db, "transactions"), where("userId", "==", "u1")))).toEqual(["a", "b", "d"]);
    expect(await idsOf(query(collection(db, "transactions"), where("userId", "==", "u1"), where("categoryId", "==", "coffee")))).toEqual(["a"]);
    expect(await idsOf(query(collection(db, "transactions"), where("date", ">", new Date(2026, 9, 5))))).toEqual(["c", "d"]);
    expect(await idsOf(query(collection(db, "transactions"), where("date", ">=", new Date(2026, 9, 5))))).toEqual(["b", "c", "d"]);
    expect(await idsOf(query(collection(db, "transactions"), where("amount", "<", 9)))).toEqual(["a"]);
    expect(await idsOf(query(collection(db, "transactions"), where("amount", "<=", 9)))).toEqual(["a", "c"]);
  });

  it("compares a Timestamp-like value by its time, as the delta sync's cursor is", async () => {
    const since = { toDate: () => new Date(2026, 9, 8), toMillis: () => new Date(2026, 9, 8).getTime() };
    expect(await idsOf(query(collection(db, "transactions"), where("date", ">", since)))).toEqual(["c", "d"]);
  });

  it("never orders values of different types against each other", async () => {
    expect(await idsOf(query(collection(db, "transactions"), where("date", ">", 0)))).toEqual([]);
  });

  it("supports in, not-in, !=, array-contains and array-contains-any", async () => {
    expect(await idsOf(query(collection(db, "transactions"), where("categoryId", "in", ["coffee", "rent"])))).toEqual(["a", "c", "d"]);
    expect(await idsOf(query(collection(db, "transactions"), where("categoryId", "not-in", ["coffee"])))).toEqual(["b", "d"]);
    expect(await idsOf(query(collection(db, "transactions"), where("userId", "!=", "u1")))).toEqual(["c"]);
    expect(await idsOf(query(collection(db, "transactions"), where("tags", "array-contains", "home")))).toEqual(["d"]);
    expect(await idsOf(query(collection(db, "transactions"), where("tags", "array-contains-any", ["work", "monthly"])))).toEqual(["a", "d"]);
  });

  it("a document without the field is never matched", async () => {
    expect(await idsOf(query(collection(db, "transactions"), where("tags", "!=", ["x"])))).toEqual(["a", "d"]);
  });

  it("answers with the snapshot shape the data layer reads", async () => {
    const snap = await getDocs(query(collection(db, "transactions"), where("userId", "==", "u1")));
    expect(snap.size).toBe(3);
    expect(snap.empty).toBe(false);
    expect(snap.metadata.fromCache).toBe(false);
    const seen: string[] = [];
    snap.forEach((d) => seen.push(d.id));
    expect(seen.sort()).toEqual(["a", "b", "d"]);
    const first = snap.docs.find((d) => d.id === "a")!;
    expect(first.ref.path).toBe("transactions/a");
    expect(first.data()).toMatchObject({ amount: 3.5 });

    const empty = await getDocs(query(collection(db, "transactions"), where("userId", "==", "nobody")));
    expect(empty.empty).toBe(true);
    expect(empty.size).toBe(0);
  });

  it("counts like getCountFromServer", async () => {
    const counted = await getCountFromServer(query(collection(db, "transactions"), where("userId", "==", "u1"), where("categoryId", "==", "coffee")));
    expect(counted.data().count).toBe(1);
  });

  it("hands out copies: changing what came back changes nothing stored", async () => {
    const snap = await getDoc(tx("d"));
    const data = snap.data()!;
    (data.tags as string[]).push("changed");
    (data.date as Date).setFullYear(1999);
    expect(memoryCollection("transactions").d).toMatchObject({ tags: ["home", "monthly"], date: new Date(2026, 9, 12) });
  });
});

describe("single writes", () => {
  it("getDoc says whether a document is there", async () => {
    expect((await getDoc(tx("a"))).exists()).toBe(true);
    const missing = await getDoc(tx("nope"));
    expect(missing.exists()).toBe(false);
    expect(missing.data()).toBeUndefined();
    expect(missing.id).toBe("nope");
  });

  it("setDoc replaces the whole document and stamps serverTimestamp() with a Date", async () => {
    const before = Date.now();
    await setDoc(tx("a"), { userId: "u1", amount: 4, createdAt: serverTimestamp() });
    const stored = memoryCollection("transactions").a;
    expect(stored).not.toHaveProperty("categoryId");
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect((stored.createdAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("turns anything with toDate() into a Date on the way in", async () => {
    await setDoc(tx("t"), { date: { toDate: () => new Date(2026, 0, 2) } });
    expect(memoryCollection("transactions").t.date).toEqual(new Date(2026, 0, 2));
  });

  it("refuses undefined anywhere, as Firestore does — the data layer's clean() is what keeps it out", async () => {
    await expect(setDoc(tx("u"), { a: { b: undefined } })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(memoryCollection("transactions")).not.toHaveProperty("u");
  });

  it("addDoc writes under a fresh id and returns its reference", async () => {
    const ref = await addDoc(collection(db, "debts"), { userId: "u1", amount: 300 });
    expect(memoryCollection("debts")[ref.id]).toEqual({ userId: "u1", amount: 300 });
  });

  it("deleteDoc removes, and deleting what is not there is no error", async () => {
    await deleteDoc(tx("a"));
    await deleteDoc(tx("never"));
    expect(Object.keys(memoryCollection("transactions")).sort()).toEqual(["b", "c", "d"]);
  });
});

describe("updates", () => {
  const user = doc(db, "users", "u1");

  it("reads a dotted key as a path into the workspace and leaves its neighbours alone", async () => {
    await updateDoc(user, { "workspace.planner-lines": [{ id: "l1", amount: 300 }], updatedAt: serverTimestamp() });
    const stored = memoryCollection("users").u1;
    expect(stored.workspace).toEqual({ "planner-lines": [{ id: "l1", amount: 300 }], "tour-seen": false });
    expect(stored.updatedAt).toBeInstanceOf(Date);
  });

  it("creates the maps a dotted path needs", async () => {
    await updateDoc(user, { "settings.alerts.reach": 7 });
    expect(memoryCollection("users").u1.settings).toEqual({ alerts: { reach: 7 } });
  });

  it("an undotted object replaces the field whole", async () => {
    await updateDoc(user, { workspace: { only: 1 } });
    expect(memoryCollection("users").u1.workspace).toEqual({ only: 1 });
  });

  it("deleteField() takes a field away, dotted or not", async () => {
    await updateDoc(user, { "workspace.tour-seen": deleteField(), syncDeletes: deleteField() });
    const stored = memoryCollection("users").u1;
    expect(stored.workspace).toEqual({ "planner-lines": [] });
    expect(stored).not.toHaveProperty("syncDeletes");
  });

  it("takes FieldPaths with value pairs after them — names may hold dots and colons", async () => {
    await updateDoc(user, new MemoryFieldPath("syncDeletes", "transactions:y.z"), 5, new MemoryFieldPath("syncDeletes", "transactions:x"), deleteField());
    expect(memoryCollection("users").u1.syncDeletes).toEqual({ "transactions:y.z": 5 });
  });

  it("fails on a document that is not there, and writes nothing", async () => {
    await expect(updateDoc(doc(db, "users", "ghost"), { a: 1 })).rejects.toMatchObject({ code: "not-found" });
    expect(memoryCollection("users")).not.toHaveProperty("ghost");
  });

  it("rejects instead of throwing, so a caller's catch() sees it", () => {
    const pending = updateDoc(doc(db, "users", "ghost"), { a: 1 });
    expect(pending).toBeInstanceOf(Promise);
    return pending.catch(() => {});
  });
});

describe("batches", () => {
  it("applies set, update and delete together, each seeing the ones before it", async () => {
    const batch = writeBatch();
    batch.set(tx("new"), { userId: "u1", amount: 1 });
    batch.update(tx("new"), { amount: 2 });
    batch.update(tx("b"), { amount: 40 });
    batch.delete(tx("a"));
    await batch.commit();
    const rows = memoryCollection("transactions");
    expect(rows.new).toEqual({ userId: "u1", amount: 2 });
    expect(rows.b.amount).toBe(40);
    expect(rows).not.toHaveProperty("a");
  });

  it("is all or nothing: one failing update leaves every other write unmade", async () => {
    const batch = writeBatch();
    batch.delete(tx("a"));
    batch.set(tx("x"), { amount: 1 });
    batch.update(tx("missing"), { amount: 2 });
    await expect(batch.commit()).rejects.toMatchObject({ code: "not-found" });
    const rows = memoryCollection("transactions");
    expect(rows).toHaveProperty("a");
    expect(rows).not.toHaveProperty("x");
  });

  it("an update after a delete in the same batch finds nothing to update", async () => {
    const batch = writeBatch();
    batch.delete(tx("a"));
    batch.update(tx("a"), { amount: 1 });
    await expect(batch.commit()).rejects.toMatchObject({ code: "not-found" });
    expect(memoryCollection("transactions")).toHaveProperty("a");
  });

  it("commits once only", async () => {
    const batch = writeBatch();
    batch.delete(tx("a"));
    await batch.commit();
    await expect(batch.commit()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(() => batch.delete(tx("b"))).toThrow();
  });
});

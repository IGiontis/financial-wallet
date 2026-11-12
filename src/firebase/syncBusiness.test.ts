import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// «Δουλειά»'s list on the delta path, as `syncEveryList.test.ts` checks the
// others: the real data layer on the demo's in-memory Firestore, two devices,
// and every list a start returns compared with the server's own documents.

vi.mock("../demo/demoMode", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isDemo: () => true,
}));
vi.mock("./config", () => ({ db: {} }));

const disk = vi.hoisted(() => ({ current: new Map<string, unknown>() }));
vi.mock("../lib/localStore", () => ({
  localGet: async (key: string) => structuredClone(disk.current.get(key)),
  localSet: async (key: string, value: unknown) => void disk.current.set(key, structuredClone(value)),
  localDelete: async (key: string) => void disk.current.delete(key),
  localDeletePrefix: async (prefix: string) => {
    for (const key of [...disk.current.keys()]) if (key.startsWith(prefix)) disk.current.delete(key);
  },
}));

const meter = vi.hoisted(() => ({ labels: [] as string[] }));
vi.mock("../lib/readMeter", () => ({
  meterRead: (label: string) => void meter.labels.push(label),
  totalReads: () => 0,
}));

import { memoryCollection, resetMemoryFirestore } from "../demo/memoryFirestore";
import { getTransactions } from "./firestore";
import { deleteBusinessRecords, deleteClosing, getBusinessEntries, saveClosing } from "./business";
import { BUSINESS_CATEGORY_ID } from "../shared/utils/categories";
import { OWNED_COLLECTIONS } from "./ownedCollections";

const U = "u1";
const DAY = 24 * 60 * 60 * 1000;
let T0 = new Date(2026, 10, 1, 9).getTime();
const laptop = new Map<string, unknown>();
const phone = new Map<string, unknown>();
const on = (device: Map<string, unknown>) => void (disk.current = device);
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const onServer = (name: string) =>
  byId(
    Object.entries(memoryCollection(name))
      .filter(([, d]) => d.userId === U)
      .map(([id, d]) => ({ id, ...d })),
  );

async function start() {
  meter.labels.length = 0;
  const [business, transactions] = await Promise.all([getBusinessEntries(U), getTransactions(U)]);
  return { business: byId(business), transactions: byId(transactions) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  T0 += 30 * DAY;
  vi.setSystemTime(T0);
  laptop.clear();
  phone.clear();
  const at = new Date(T0 - 10 * DAY);
  resetMemoryFirestore({
    users: { u1: { id: U } },
    businessEntries: {
      s1: { userId: U, businessId: "biz-a", incomes: [{ lineId: "till", amount: 800 }], expenses: [{ lineId: "goods", amount: 350 }], lineIds: ["till", "goods"], date: at, createdAt: at, updatedAt: at },
      o1: { userId: U, businessId: "biz-b", incomes: [{ lineId: "sales", amount: 300 }], expenses: [], lineIds: ["sales"], date: at, createdAt: at, updatedAt: at },
      x1: { userId: "u2", businessId: "biz-a", incomes: [{ lineId: "till", amount: 9 }], expenses: [], date: at, createdAt: at, updatedAt: at },
    },
    transactions: { t0: { userId: U, amount: 3, type: "expense", date: at, createdAt: at, updatedAt: at } },
  });
});

afterEach(() => vi.useRealTimers());

describe("the business list, synced like every other", () => {
  it("is an owned collection, so deleting the account removes it", () => {
    expect(OWNED_COLLECTIONS).toContain("businessEntries");
  });

  it("reads whole the first time, then only what changed; another device's closing and correction arrive", async () => {
    on(laptop);
    const cold = await start();
    expect(meter.labels).toContain("businessEntries (whole)");
    expect(cold.business).toEqual(onServer("businessEntries"));

    on(phone);
    await start();
    later(60 * 60 * 1000);
    await saveClosing(U, { entryId: "d1", closing: { businessId: "biz-b", date: new Date(), incomes: [{ lineId: "sales", amount: 500 }], expenses: [], accountId: "acc" }, personal: { id: "td1", data: { amount: 500, type: "income", categoryId: BUSINESS_CATEGORY_ID, date: new Date(), description: "Profit · B", accountId: "acc" } } });
    await saveClosing(U, { entryId: "s1", closing: { businessId: "biz-a", date: new Date(), incomes: [{ lineId: "till", amount: 820 }], expenses: [{ lineId: "goods", amount: 350 }] }, personal: null, editing: {} });

    later(60 * 60 * 1000);
    on(laptop);
    const warm = await start();
    expect(meter.labels).toContain("businessEntries (changes)");
    expect(meter.labels).not.toContain("businessEntries (whole)");
    expect(warm.business).toEqual(onServer("businessEntries"));
    expect(warm.transactions).toEqual(onServer("transactions"));
    expect(warm.business.find((e) => e.id === "s1")).toMatchObject({ incomes: [{ lineId: "till", amount: 820 }] });
    expect(warm.business.find((e) => e.id === "d1")).toMatchObject({ businessId: "biz-b", linkedTransactionId: "td1" });
    expect(warm.transactions.find((t) => t.id === "td1")).toMatchObject({ type: "income", businessEntryId: "d1", businessId: "biz-b", categoryId: BUSINESS_CATEGORY_ID });
  });

  it("a closing deleted on the phone leaves the laptop's two lists together", async () => {
    on(phone);
    await saveClosing(U, { entryId: "d1", closing: { businessId: "biz-a", date: new Date(T0 - DAY), incomes: [{ lineId: "till", amount: 100 }], expenses: [{ lineId: "goods", amount: 600 }], accountId: "acc" }, personal: { id: "td1", data: { amount: 500, type: "expense", categoryId: BUSINESS_CATEGORY_ID, date: new Date(T0 - DAY), description: "Loss · A", accountId: "acc" } } });
    later(60 * 60 * 1000);
    on(laptop);
    await start();
    on(phone);
    await start();

    later(60 * 60 * 1000);
    await deleteClosing(U, "d1", "td1");
    // One write to the deletion log for both lists.
    expect(Object.keys((memoryCollection("users").u1.syncDeletes ?? {}) as object).sort()).toEqual(["businessEntries__d1", "transactions__td1"]);

    later(60 * 60 * 1000);
    on(laptop);
    const warm = await start();
    expect(meter.labels).not.toContain("businessEntries (whole)");
    expect(warm.business).toEqual(onServer("businessEntries"));
    expect(warm.transactions).toEqual(onServer("transactions"));
    expect(warm.business.map((e) => e.id)).toEqual(["o1", "s1"]);
    expect(warm.transactions.map((t) => t.id)).toEqual(["t0"]);
  });

  it("a business deleted on the phone takes its closings and records off the laptop too, by the delta", async () => {
    on(phone);
    await saveClosing(U, { entryId: "d1", closing: { businessId: "biz-a", date: new Date(T0 - DAY), incomes: [{ lineId: "till", amount: 700 }], expenses: [{ lineId: "goods", amount: 200 }], accountId: "acc" }, personal: { id: "td1", data: { amount: 500, type: "income", categoryId: BUSINESS_CATEGORY_ID, date: new Date(T0 - DAY), description: "Profit · A", accountId: "acc", businessId: "biz-a" } } });
    later(60 * 60 * 1000);
    on(laptop);
    await start();
    on(phone);
    await start();

    later(60 * 60 * 1000);
    const done = await deleteBusinessRecords(U, "biz-a");
    // biz-a's two closings of this user (s1, d1) and d1's record; o1 is biz-b's, x1 another user's.
    expect([...done.businessEntries].sort()).toEqual(["d1", "s1"]);
    expect(done.transactions).toEqual(["td1"]);

    later(60 * 60 * 1000);
    on(laptop);
    const warm = await start();
    expect(meter.labels).not.toContain("businessEntries (whole)");
    expect(warm.business).toEqual(onServer("businessEntries"));
    expect(warm.transactions).toEqual(onServer("transactions"));
    expect(warm.business.map((e) => e.id)).toEqual(["o1"]);
    expect(warm.transactions.map((t) => t.id)).toEqual(["t0"]);
  });
});

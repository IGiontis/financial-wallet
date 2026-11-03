import { describe, it, expect, vi, beforeEach } from "vitest";
import { collection, getDocs, query, resetMemoryFirestore, where } from "../../demo/memoryFirestore";
import { saveGapRecords } from "../../firebase/firestore";
import { gapWrites, type GapRecord } from "./gapRecords";

// The public demo writes to its in-memory Firestore through the same data
// layer. A gap's records — an expense, a loan and its money, a transfer —
// must land there whole, in one batch, as the real one would write them.

vi.mock("../../demo/demoMode", async (importOriginal) => ({ ...(await importOriginal<object>()), isDemo: () => true }));
vi.mock("../../firebase/config", () => ({ db: {} }));
vi.mock("../../firebase/syncList", () => ({ syncedList: async () => [], noteDeleted: async () => {}, noteRecreated: async () => {}, noteReset: async () => {} }));

const db = {};
const NOW = new Date(2026, 10, 3, 18);
let seq = 0;
const ctx = {
  accountId: "euro",
  today: "2026-11-03",
  userId: "demo",
  debts: [],
  accountName: (id: string) => (id === "euro" ? "Eurobank" : "Μετρητά"),
  categoryName: () => "Φαγητό",
  newId: () => `g${++seq}`,
  now: NOW,
};
const records: GapRecord[] = [
  { key: "a", kind: "expense", amount: 8, date: "2026-11-03", categoryId: "food" },
  { key: "b", kind: "lent", amount: 50, date: "2026-11-01", person: "Νίκος" },
  { key: "c", kind: "transferOut", amount: 20, date: "2026-11-02", otherAccountId: "cash" },
];

const rowsOf = async (name: string) => (await getDocs(query(collection(db, name), where("userId", "==", "demo")))).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);

beforeEach(() => resetMemoryFirestore({}));

describe("a gap's records in the demo", () => {
  it("are all written, under the user, with the reading's mark only on today's", async () => {
    const writes = gapWrites(records, ctx);
    await saveGapRecords("demo", writes);

    const transactions = await rowsOf("transactions");
    // The expense, the loan's money, and the transfer's two halves.
    expect(transactions).toHaveLength(4);
    const sum = transactions.reduce((s, r) => s + (r.type === "income" ? 1 : -1) * Number(r.amount), 0);
    // Out of this card: 8 + 50 + 20; into cash: 20.
    expect(sum).toBe(-58);
    expect(transactions.filter((r) => r.inReading).map((r) => r.amount)).toEqual([8]);
    expect(await rowsOf("debts")).toEqual([expect.objectContaining({ person: "Νίκος", amount: 50, accountId: "euro", direction: "owed_to_me" })]);
  });
});

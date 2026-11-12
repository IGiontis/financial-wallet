import { describe, it, expect, vi, beforeEach } from "vitest";

// The bulk writes of the names page against a small Firestore that behaves as
// the LIVE rules do: an update or delete of a document that is not there fails
// the whole batch (the emulator lets it through, which is why this is here).

type Ref = { col: string; id: string };
type Op = { kind: "update"; ref: Ref; data: Record<string, unknown> } | { kind: "delete"; ref: Ref };

const fs = vi.hoisted(() => {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const table = (col: string) => {
    if (!tables.has(col)) tables.set(col, new Map());
    return tables.get(col)!;
  };
  const batches: Op[][] = [];
  return {
    tables,
    table,
    batches,
    api: {
      doc: (_db: unknown, col: string, id: string): Ref => ({ col, id }),
      serverTimestamp: () => "SERVER_TIME",
      writeBatch: () => {
        const ops: Op[] = [];
        return {
          update: (ref: Ref, data: Record<string, unknown>) => void ops.push({ kind: "update", ref, data }),
          delete: (ref: Ref) => void ops.push({ kind: "delete", ref }),
          commit: async () => {
            if (ops.length > 500) throw new Error("more than 500 writes in one batch");
            // As production: a missing document fails everything in the batch.
            for (const op of ops) if (!table(op.ref.col).has(op.ref.id)) throw new Error(`missing ${op.ref.col}/${op.ref.id}`);
            for (const op of ops) {
              if (op.kind === "delete") table(op.ref.col).delete(op.ref.id);
              else table(op.ref.col).set(op.ref.id, { ...table(op.ref.col).get(op.ref.id), ...op.data });
            }
            batches.push(ops);
          },
        };
      },
    },
  };
});

vi.mock("./firestoreApi", () => fs.api);
vi.mock("./config", () => ({ db: {} }));
const noted = vi.hoisted(() => ({ deleted: [] as [string, string, string[]][] }));
vi.mock("./syncList", () => ({ noteDeleted: async (userId: string, name: string, ids: string[]) => void noted.deleted.push([userId, name, ids]) }));

const { WRITE_CHUNK, chunkOps, commitOps, mergeCategoriesEverywhere, renamePayeeEverywhere } = await import("./names");
const { payeeRenameIds, savedAfterRename } = await import("../features/names/payeeNames");
const { mergeTargets, planCategoryMerge } = await import("../features/names/categoryMerge");

const put = (col: string, id: string, data: Record<string, unknown>) => fs.table(col).set(id, data);
const named = () => fs.batches.flat().map((op) => `${op.ref.col}/${op.ref.id}`);

beforeEach(() => {
  fs.tables.clear();
  fs.batches.length = 0;
  noted.deleted.length = 0;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("chunking", () => {
  it("is ≤ 450 a batch, in order, and splits only above 450", () => {
    const ops = Array.from({ length: 901 }, (_, i) => i);
    expect(WRITE_CHUNK).toBe(450);
    expect(chunkOps(ops.slice(0, 450)).map((c) => c.length)).toEqual([450]);
    expect(chunkOps(ops.slice(0, 451)).map((c) => c.length)).toEqual([450, 1]);
    expect(chunkOps(ops).map((c) => c.length)).toEqual([450, 450, 1]);
    expect(chunkOps(ops).flat()).toEqual(ops);
  });

  it("commits 1 000 updates as three batches and writes each document once", async () => {
    for (let i = 0; i < 1000; i++) put("transactions", `t${i}`, { description: "x" });
    const written = await commitOps(Array.from({ length: 1000 }, (_, i) => ({ kind: "update" as const, collection: "transactions" as const, id: `t${i}`, data: { description: "y" } })));
    expect(written).toBe(1000);
    expect(fs.batches.map((b) => b.length)).toEqual([450, 450, 100]);
    expect(new Set(named()).size).toBe(1000);
    // Every one carries a new updatedAt, so other devices pick it up.
    expect(fs.batches.flat().every((op) => op.kind === "update" && op.data.updatedAt === "SERVER_TIME")).toBe(true);
  });

  it("fails a whole batch on a missing document — the reason only existing ids are named", async () => {
    put("transactions", "a", {});
    await expect(
      commitOps([
        { kind: "update", collection: "transactions", id: "a", data: { description: "y" } },
        { kind: "update", collection: "transactions", id: "gone", data: { description: "y" } },
      ]),
    ).rejects.toThrow("missing");
    expect(fs.table("transactions").get("a")).toEqual({});
  });
});

describe("renaming a payee everywhere", () => {
  const tx = (id: string, description: string, extra: Record<string, unknown> = {}) => ({ id, description, date: new Date(2026, 0, 1), ...extra });

  it("writes exactly the records the confirmation counted, and nothing else", async () => {
    const records = [
      tx("1", "Δώρο"),
      tx("2", "  δωρο "),
      tx("3", "ΔΩΡΟ"),
      tx("4", "Δώρα"), // another name
      tx("5", "Δώρο", { transferId: "tr" }), // a transfer half: written by the app, not a payee
      tx("6", "Δώρο", { isGoalTransaction: true }),
      tx("7", "Doro"), // Greeklish: only ever suggested, never renamed along
    ];
    for (const r of records) put("transactions", r.id, { description: r.description });
    put("users", "u1", { savedPayees: ["Δώρο", "Lidl"] });

    const ids = payeeRenameIds(records, "Δώρο", "Δώρα γενεθλίων");
    // Counted a second way, by hand: records 1, 2 and 3 carry the name.
    expect(ids).toEqual(["1", "2", "3"]);

    const saved = savedAfterRename(["Δώρο", "Lidl"], "Δώρο", "Δώρα γενεθλίων");
    const written = await renamePayeeEverywhere("u1", ids, " Δώρα   γενεθλίων ", saved);

    // The count shown (3) is the count written, plus the one user document.
    expect(written).toBe(ids.length + 1);
    expect(named().filter((n) => n.startsWith("transactions/")).sort()).toEqual(["transactions/1", "transactions/2", "transactions/3"]);
    const after = [...fs.table("transactions").entries()].filter(([, d]) => d.description === "Δώρα γενεθλίων").map(([id]) => id);
    expect(after.sort()).toEqual(["1", "2", "3"]);
    expect(fs.table("transactions").get("5")?.description).toBe("Δώρο");
    expect(fs.table("transactions").get("7")?.description).toBe("Doro");
    expect(fs.table("users").get("u1")?.savedPayees).toEqual(["Δώρα γενεθλίων", "Lidl"]);
    // The user document last, after every record.
    expect(named().at(-1)).toBe("users/u1");
  });

  it("skips records already spelled as asked: a case-only rename writes only the others", () => {
    const records = [tx("1", "lidl"), tx("2", "Lidl"), tx("3", "LIDL ")];
    expect(payeeRenameIds(records, "lidl", "Lidl")).toEqual(["1", "3"]);
  });

  it("merging two payees: the saved one goes, the kept one stays once", () => {
    expect(savedAfterRename(["Doro", "Δώρο", "Lidl"], "Doro", "Δώρο")).toEqual(["Δώρο", "Lidl"]);
    // A name never saved leaves the list alone — no user document written.
    const list = ["Lidl"];
    expect(savedAfterRename(list, "Doro", "Δώρο")).toBe(list);
  });

  it("splits a rename of 1 000 records into batches of ≤ 450", async () => {
    const records = Array.from({ length: 1000 }, (_, i) => tx(`t${i}`, i % 2 ? "Shell" : "shell "));
    for (const r of records) put("transactions", r.id, { description: r.description });
    put("users", "u1", { savedPayees: ["Shell"] });
    const ids = payeeRenameIds(records, "Shell", "Shell Γλυφάδα");
    expect(ids).toHaveLength(1000);
    await renamePayeeEverywhere("u1", ids, "Shell Γλυφάδα", savedAfterRename(["Shell"], "Shell", "Shell Γλυφάδα"));
    expect(fs.batches.map((b) => b.length)).toEqual([450, 450, 101]);
  });

  it("waits for a connection rather than queueing many writes", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await expect(renamePayeeEverywhere("u1", ["1"], "x")).rejects.toThrow(/connection/);
    expect(fs.batches).toHaveLength(0);
  });
});

describe("merging categories", () => {
  it("moves every record, deletes the dropped category last and notes it, naming only documents that exist", async () => {
    const transactions = [
      { id: "t1", categoryId: "own-kafes", amount: 3.5 },
      { id: "t2", categoryId: "own-kafes", amount: 4 },
      { id: "t3", categoryId: "def-coffee", amount: 2.5 },
      { id: "t4", categoryId: "def-food", amount: 10 },
    ];
    const bills = [{ id: "b1", categoryId: "own-kafes" }];
    for (const t of transactions) put("transactions", t.id, { categoryId: t.categoryId });
    put("bills", "b1", { categoryId: "own-kafes" });
    put("categories", "own-kafes", { name: "Kafes" });

    const pairs = mergeTargets([{ id: "own-kafes", type: "expense" }], [{ id: "def-coffee", type: "expense", isDefault: true }])!;
    const plan = planCategoryMerge(pairs, { transactions, bills, incomes: [], plannerLines: [] });
    await mergeCategoriesEverywhere("u1", plan);

    expect(named()).toEqual(["transactions/t1", "transactions/t2", "bills/b1", "categories/own-kafes"]);
    expect(fs.table("categories").has("own-kafes")).toBe(false);
    expect(noted.deleted).toEqual([["u1", "categories", ["own-kafes"]]]);
    // Nothing points at the deleted category any more.
    const stillThere = [...fs.table("transactions").values(), ...fs.table("bills").values()].filter((d) => d.categoryId === "own-kafes");
    expect(stillThere).toHaveLength(0);
  });
});

describe("records named after what they are linked to", () => {
  const tx = (id: string, description: string, extra: Record<string, unknown> = {}) => ({ id, description, date: new Date(2026, 2, 1), type: "expense", amount: 10, ...extra }) as never;

  it("are never counted or rewritten: bill payments, income arrivals, debt records, covered expenses", async () => {
    const { linkedRecordIds, payeeRows } = await import("../features/names/payeeNames");
    const records = [
      tx("own", "ΔΕΗ"),
      tx("bill", "ΔΕΗ", { billId: "b1" }),
      tx("old-bill", "ΔΕΗ"), // a payment older than billId: linked from the payment
      tx("income", "ΔΕΗ", { type: "income", incomeId: "i1" }),
      tx("interest", "ΔΕΗ", { debtId: "d1", debtPart: "interest" }),
      tx("closing", "ΔΕΗ", { type: "income", businessEntryId: "be1" }), // a day's closing: its profit in the owner's money
      tx("covered", "ΔΕΗ"), // coveredExpenseId points here
      tx("legacy", "Σκι", { amount: 550 }), // an older covered debt's expense, found as the refund finds it
    ];
    const bills = [{ payments: [{ transactionId: "old-bill" }] }];
    const debts = [
      { id: "d2", forGoalId: "g1", coveredExpenseId: "covered", amount: 10, date: new Date(2026, 2, 1), label: "x" },
      { id: "d3", forGoalId: "g1", amount: 550, date: new Date(2026, 2, 1), label: "Σκι " },
    ] as never[];
    const linked = linkedRecordIds(bills, debts, records);
    expect([...linked].sort()).toEqual(["covered", "legacy", "old-bill"]);

    // Counted a second way, by hand: only «own» carries the payee ΔΕΗ.
    expect(payeeRows([], records, linked)).toEqual([{ name: "ΔΕΗ", key: "δεη", count: 1, saved: false }]);
    const ids = payeeRenameIds(records, "ΔΕΗ", "ΔΕΗ ρεύμα", linked);
    expect(ids).toEqual(["own"]);
    expect(payeeRenameIds(records, "Σκι", "Ski", linked)).toEqual([]);

    // The count shown is the count written; the linked ones keep their names.
    for (const r of records as { id: string; description: string }[]) put("transactions", r.id, { description: r.description });
    const written = await renamePayeeEverywhere("u1", ids, "ΔΕΗ ρεύμα");
    expect(written).toBe(ids.length);
    expect(named()).toEqual(["transactions/own"]);
    for (const id of ["bill", "old-bill", "income", "interest", "covered"]) expect(fs.table("transactions").get(id)?.description).toBe("ΔΕΗ");
    expect(fs.table("transactions").get("legacy")?.description).toBe("Σκι");
  });
});

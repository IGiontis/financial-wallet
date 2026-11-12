import { doc, serverTimestamp, writeBatch } from "./firestoreApi";
import { db } from "./config";
import { noteDeleted } from "./syncList";
import { requireConnection } from "../shared/utils/offlinePolicy";
import { cleanLine, cleanTextFields } from "../shared/utils/cleanText";

// ─── Renames and merges that touch many records ──────────────────────────────
//
// A payee renamed everywhere, two payees made one, two categories made one:
// each writes every record concerned. Rare, asked for by the user, and
// confirmed with the count first — the count is the list of ids handed in, and
// exactly those documents are written.
//
// Three rules hold for every batch here:
//   • ≤ 450 operations each (Firestore allows 500), committed in order;
//   • only documents known to exist are named — the ids come from the lists
//     the app already holds. The live rules refuse an update of a missing
//     document, and that fails the WHOLE batch (the emulator hides this);
//   • every updated record gets a new `updatedAt`, so other devices pick the
//     change up through the delta sync, and a deletion is noted (`noteDeleted`).

/** Firestore allows 500 operations per batch; stay clear of it. */
export const WRITE_CHUNK = 450;

export type NamesCollection = "transactions" | "bills" | "users" | "categories";

export type NamesOp = { kind: "update"; collection: NamesCollection; id: string; data: Record<string, unknown> } | { kind: "delete"; collection: NamesCollection; id: string };

/**
 * The document an op names. Each collection by its literal name, never through
 * a variable: the account-deletion list is checked against every literal in
 * the code (`ownedCollections.test.ts`), so a name hidden in a variable here
 * would escape that check.
 */
function refOf(op: NamesOp) {
  switch (op.collection) {
    case "transactions":
      return doc(db, "transactions", op.id);
    case "bills":
      return doc(db, "bills", op.id);
    case "users":
      return doc(db, "users", op.id);
    case "categories":
      return doc(db, "categories", op.id);
  }
}

/** The ops in batches of at most `WRITE_CHUNK`, in the order given. */
export function chunkOps<T>(ops: readonly T[], size: number = WRITE_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ops.length; i += size) chunks.push(ops.slice(i, i + size));
  return chunks;
}

/**
 * Commits the ops in order, a batch at a time. Callers put what makes the rest
 * visible last — the category deleted after its records have moved — so a
 * failure part-way leaves something to run again rather than records pointing
 * at nothing. Returns how many documents were written.
 */
export async function commitOps(ops: readonly NamesOp[]): Promise<number> {
  let written = 0;
  for (const chunk of chunkOps(ops)) {
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = refOf(op);
      if (op.kind === "delete") batch.delete(ref);
      else batch.update(ref, { ...cleanTextFields(op.data), updatedAt: serverTimestamp() });
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

/**
 * A payee renamed on every record that carries it (`transactionIds`, from
 * `payeeRenameIds`), and in the saved list when it is there (`savedPayees`, the
 * whole new list, or undefined to leave it). The user document goes last.
 */
export async function renamePayeeEverywhere(userId: string, transactionIds: readonly string[], to: string, savedPayees?: string[]): Promise<number> {
  requireConnection("bulk");
  const description = cleanLine(to);
  const ops: NamesOp[] = transactionIds.map((id) => ({ kind: "update", collection: "transactions", id, data: { description } }));
  if (savedPayees) ops.push({ kind: "update", collection: "users", id: userId, data: { savedPayees } });
  return commitOps(ops);
}

export interface CategoryMergeWrite {
  /** dropped id → kept id: the category documents deleted at the end. */
  pairs: Record<string, string>;
  /** Records to move, each known to exist, with the category it moves to. */
  transactions: readonly { id: string; to: string }[];
  bills: readonly { id: string; to: string }[];
}

/**
 * Two categories made one: every transaction and bill moved to the kept one,
 * and the dropped category documents deleted LAST, so a failure part-way
 * leaves them in place to merge again. The incomes and Planner lines on the
 * user document are moved by the caller through `useWorkspaceSetting` first —
 * the one path that keeps their device copy in step. Not queued offline: it
 * ends in a deletion (`offlinePolicy`).
 */
export async function mergeCategoriesEverywhere(userId: string, plan: CategoryMergeWrite): Promise<number> {
  requireConnection("delete");
  const ops: NamesOp[] = [
    ...plan.transactions.map((m): NamesOp => ({ kind: "update", collection: "transactions", id: m.id, data: { categoryId: m.to } })),
    ...plan.bills.map((m): NamesOp => ({ kind: "update", collection: "bills", id: m.id, data: { categoryId: m.to } })),
  ];

  const deleteIds = Object.keys(plan.pairs);
  for (const id of deleteIds) ops.push({ kind: "delete", collection: "categories", id });

  const written = await commitOps(ops);
  await noteDeleted(userId, "categories", deleteIds);
  return written;
}

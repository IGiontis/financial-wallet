import { useEffect, useRef } from "react";
import { useWorkspace, useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { cleanLines, PLANNER_KEYS } from "./plannerInputs";
import type { BudgetLine } from "./plannerUtils";

// The Allocation page's buckets, carried into the Planner's own lines.
//
// The page is gone: it divided "what is left" a second way, with monthly
// averages, beside the Planner dividing it with real dates — two answers to
// one question. Its buckets («Φαγητό 250 €», with the categories it pays for)
// are exactly the Planner's own lines once a line can be linked to categories,
// so they move across once, and the Planner counts them from then on.

/** Where the Allocation page kept them, and the mark that they have moved. */
export const ALLOCATION_KEYS = { buckets: "allocation-buckets", moved: "allocation-moved-to-planner" } as const;

interface StoredBucket {
  id?: unknown;
  label?: unknown;
  amount?: unknown;
  kind?: unknown;
  categoryIds?: unknown;
}

const norm = (label: string) => label.trim().toLocaleLowerCase();

/**
 * The lines with the buckets added. A bucket named like a line already there
 * is not added again — the line keeps its figure, and takes the bucket's
 * categories only if it had none. A category already counted by a line is not
 * given to a second one: one category, one line, or both would report it.
 */
export function bucketsIntoLines(lines: BudgetLine[], stored: unknown): BudgetLine[] {
  const buckets = (Array.isArray(stored) ? (stored as StoredBucket[]) : []).filter(
    (b) => !!b && typeof b.id === "string" && typeof b.label === "string" && typeof b.amount === "number" && Number.isFinite(b.amount) && b.kind === "expense",
  );
  if (buckets.length === 0) return lines;

  const owned = new Set(lines.flatMap((line) => line.categoryIds ?? []));
  const free = (ids: unknown) => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && !owned.has(id)) : []);
  const ids = new Set(lines.map((line) => line.id));
  const next = [...lines];

  for (const bucket of buckets) {
    const label = (bucket.label as string).trim();
    const amount = Math.max(bucket.amount as number, 0);
    const categoryIds = free(bucket.categoryIds);
    // An empty bucket with nothing linked says nothing a line would.
    if (amount <= 0 && categoryIds.length === 0) continue;

    const same = next.findIndex((line) => line.kind !== "income" && norm(line.label) === norm(label));
    if (same >= 0) {
      if (!next[same].categoryIds?.length && categoryIds.length > 0) {
        next[same] = { ...next[same], categoryIds };
        categoryIds.forEach((id) => owned.add(id));
      }
      continue;
    }

    const id = ids.has(bucket.id as string) ? `alloc-${bucket.id as string}` : (bucket.id as string);
    ids.add(id);
    categoryIds.forEach((c) => owned.add(c));
    next.push({ id, label: label || "—", amount, kind: "expense", ...(categoryIds.length ? { categoryIds } : {}) });
  }
  return next;
}

/**
 * Moves them once per account, when the account's copy of both lists has
 * arrived — never from a device's stale cache alone, which could put back
 * buckets moved from another device already.
 */
export function useAllocationMigration() {
  const { isSuccess } = useWorkspace();
  const [stored] = useWorkspaceSetting<unknown>(ALLOCATION_KEYS.buckets, []);
  const [storedLines, setLines] = useWorkspaceSetting<BudgetLine[]>(PLANNER_KEYS.lines, []);
  const [moved, setMoved] = useWorkspaceSetting<boolean>(ALLOCATION_KEYS.moved, false);
  const done = useRef(false);

  useEffect(() => {
    if (!isSuccess || moved || done.current) return;
    done.current = true;
    const lines = cleanLines(storedLines);
    const next = bucketsIntoLines(lines, stored);
    if (next !== lines) setLines(next);
    setMoved(true);
  }, [isSuccess, moved, stored, storedLines, setLines, setMoved]);
}

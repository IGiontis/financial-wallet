import { isDemo } from "../demo/demoMode";

// ─── Counting reads, while developing ────────────────────────────────────────
//
// Firestore bills every document a query returns from the server — and an
// empty answer as one. Which screen or save costs what is not visible anywhere
// in the app, and guessing at it is how the read budget was spent the first
// time. In development every server answer is counted here by name; the totals
// are on `window.__reads` and in the console.
//
// Answers served from the device's cache cost nothing and are not counted.
// In a production build this does nothing, and in the demo, which reads
// nothing from Firestore, neither.

type Tally = Record<string, { queries: number; docs: number }>;

const tally: Tally = {};

export function meterRead(label: string, docs: number, fromCache: boolean) {
  if (!import.meta.env.DEV || fromCache || isDemo()) return;
  const row = (tally[label] ??= { queries: 0, docs: 0 });
  row.queries += 1;
  // An empty answer is still billed as one read.
  row.docs += Math.max(docs, 1);
  if (typeof window !== "undefined") {
    (window as unknown as { __reads?: Tally }).__reads = tally;
    if (import.meta.env.MODE !== "test") console.debug(`[reads] ${label}: ${Math.max(docs, 1)} (total ${totalReads()})`);
  }
}

export function totalReads(): number {
  return Object.values(tally).reduce((sum, row) => sum + row.docs, 0);
}

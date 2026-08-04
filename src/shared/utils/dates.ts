// ─── Firestore date helper ────────────────────────────────────────────────────
// Firestore returns Timestamp objects ({ seconds, nanoseconds }), not JS Dates.
// Our types annotate these fields as `Date` for ergonomics, so every read site
// must normalize before using date methods. Use this single helper everywhere.

export function firestoreToDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  // Firestore Timestamp — has a toDate() method
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  // Plain serialized Timestamp — { seconds, nanoseconds }
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return new Date(value as string | number);
}

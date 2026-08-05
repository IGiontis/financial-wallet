// Date helpers shared by the transactions table and its calendar filter.
// Deliberately plain functions (no hooks) so both can import them freely.

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toInputValue(d: Date | null): string {
  return d ? toDateKey(d) : "";
}

export function fromInputValue(v: string): Date | null {
  if (!v) return null;
  const [y, m, day] = v.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function formatDisplay(d: Date, lang: string): string {
  return d.toLocaleDateString(lang, { month: "short", day: "2-digit", year: "numeric" });
}

export function formatTable(d: Date, lang: string): string {
  return d.toLocaleDateString(lang, { day: "2-digit", month: "short", year: "numeric" });
}

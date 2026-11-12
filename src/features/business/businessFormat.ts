import type { Business, BusinessExpense, BusinessLine } from "../../shared/types/IndexTypes";

/** A figure with its sign: − out, + in; none on zero. */
export function signed(amount: number, format: (n: number) => string, sign: "+" | "−" | "auto" = "auto"): string {
  const cents = Math.round(amount * 100);
  if (cents === 0) return format(0);
  const s = sign === "auto" ? (cents > 0 ? "+" : "−") : sign;
  return `${s}${format(Math.abs(amount))}`;
}

/** The colour class a profit takes: green for a profit, red for a loss, none at zero. */
export const profitTone = (profit: number, styles: Readonly<Record<string, string>>) => {
  const cents = Math.round(profit * 100);
  return cents > 0 ? styles.positive : cents < 0 ? styles.negative : "";
};

/** A business by id. */
export const businessOf = (businesses: readonly Business[], id: string | undefined): Business | undefined => businesses.find((b) => b.id === id);

/** Every line of a business, both kinds, removed ones included — what old closings may name. */
const allLines = (business: Business | undefined): BusinessLine[] => (business ? [...business.incomeLines, ...business.expenseLines] : []);

/** A line's name as the business has it now (renamed lines read their new name); `fallback` when it is gone. */
export function lineName(business: Business | undefined, lineId: string | undefined, fallback: string): string {
  return allLines(business).find((l) => l.id === lineId)?.name ?? fallback;
}

/** What an expense of a closing is called: its line's name, or the one-off's own. */
export function expenseName(business: Business | undefined, line: Pick<BusinessExpense, "lineId" | "name">, fallback: string): string {
  if (line.lineId) return lineName(business, line.lineId, fallback);
  return line.name?.trim() || fallback;
}

/** The lines a business offers in a new closing: the ones not taken off it. */
export const activeLines = (lines: readonly BusinessLine[]) => lines.filter((l) => !l.removed);

import type { BusinessCategory } from "../../shared/types/IndexTypes";

/** A figure with its sign: − out, + in; none on zero. */
export function signed(amount: number, format: (n: number) => string, sign: "+" | "−" | "auto" = "auto"): string {
  const cents = Math.round(amount * 100);
  if (cents === 0) return format(0);
  const s = sign === "auto" ? (cents > 0 ? "+" : "−") : sign;
  return `${s}${format(Math.abs(amount))}`;
}

/** The category a line names, as the reader knows it; the fallback when none (or one since deleted). */
export function categoryName(categories: readonly BusinessCategory[], id: string | undefined, fallback: string): string {
  return categories.find((c) => c.id === id)?.name ?? fallback;
}

/** The colour class a profit takes: green for a profit, red for a loss, none at zero. */
export const profitTone = (profit: number, styles: Readonly<Record<string, string>>) => {
  const cents = Math.round(profit * 100);
  return cents > 0 ? styles.positive : cents < 0 ? styles.negative : "";
};

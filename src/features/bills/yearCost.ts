import type { BillWithStatus } from "../../shared/types/IndexTypes";

/** One bill's year, for «Ο χρόνος»: what it costs over the next twelve months and its share of all of them. */
export interface YearCostRow {
  bill: BillWithStatus;
  /** Over the twelve months from this one, counting only the months it is charged in. */
  yearly: number;
  /** Of the whole year's bills, 0–100. */
  share: number;
  /** This row and every dearer one together, 0–100: «these three are 61%». */
  cumulative: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every running bill ranked by what it costs a year — dearest first — with its
 * share of the total and the running share down the list.
 *
 * The page could say what a month costs and which months are heavy; nothing
 * said which bills the year's money goes to. A €9.99 subscription every month
 * is €120 a year and the insurance once a year is €480: side by side as a year
 * they are comparable, and the ranking is where to look first when cutting.
 *
 * The year is the one every other yearly figure on the page uses —
 * `monthlyEquivalent × 12`, so a bill off for the winter, or one starting in
 * March, counts only the months it is charged in — and the rows add up to the
 * «Ετήσια προβολή» total. One switched off is not in it; one charged in none of
 * the twelve months comes last, at zero.
 */
export function yearCostRanking(bills: BillWithStatus[]): { total: number; rows: YearCostRow[] } {
  const priced = bills
    .filter((b) => b.isActive)
    .map((bill) => ({ bill, yearly: round2(bill.monthlyEquivalent * 12) }))
    .sort((a, b) => b.yearly - a.yearly || a.bill.name.localeCompare(b.bill.name));
  const total = round2(priced.reduce((sum, row) => sum + row.yearly, 0));
  let running = 0;
  const rows = priced.map((row) => {
    running += row.yearly;
    return { ...row, share: total > 0 ? (row.yearly / total) * 100 : 0, cumulative: total > 0 ? (running / total) * 100 : 0 };
  });
  return { total, rows };
}

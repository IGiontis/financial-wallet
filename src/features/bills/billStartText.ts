import type { TFunction } from "i18next";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { timeUntil } from "../incomes/incomeText";
import { startsLater } from "./billsUtils";
import { dateFormat } from "../../shared/utils/dates";

/**
 * «Ξεκινά 1 Δεκ 2026 · σε 1 μήνα» for a bill that starts in a later month —
 * its first due date with the year, and how far off that is — or nothing.
 * The same words on the card, the line, the tile and the bill's own dialog.
 */
export function billStartText(bill: BillWithStatus, now: Date, t: TFunction, locale: string): string | undefined {
  const month = startsLater(bill, now);
  if (!month || bill.isPaidThisPeriod) return undefined;
  const first = bill.nextDueDate && bill.nextDueDate >= month ? bill.nextDueDate : month;
  const date = dateFormat("day", locale).format(first);
  return `${t("bills.startsOnDate", { date })} · ${timeUntil(first, now, t, "bills")}`;
}

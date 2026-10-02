import type { TFunction } from "i18next";
import type { OpeningBalance } from "../../../shared/utils/balance";

// The two pieces of the pay-day card that are not drawing: kept apart from the
// component so the Planner can use them on figures of its own.

type Money = (n: number) => string;

/**
 * Where "the money you have" comes from, in one line: the subtraction itself
 * when there is one to show, rather than a sentence about it.
 *
 * Shared because the Planner prints the same figure under the same name, and a
 * second wording of where it came from would make it look like a second figure.
 */
export function moneyOrigin(
  t: TFunction,
  { source, banks, inGoals, opening, locale, formatCurrency }: { source?: "readings" | "settings"; banks?: number; inGoals: number; opening?: OpeningBalance; locale: string; formatCurrency: Money },
): string {
  if (source === "readings") return inGoals > 0 && banks !== undefined ? t("overview.heroBanksLessGoals", { banks: formatCurrency(banks), goals: formatCurrency(inGoals) }) : t("overview.heroFromBanks");
  return opening
    ? t("overview.currentBalanceHint", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(opening.date) })
    : t("overview.currentBalanceNoOpening");
}

/** The colours of the three kinds of outgoing — shared with the Planner's chart, so a colour means one thing on both pages. */
export const OUTGOING_COLOURS = {
  bills: "var(--color-goal)",
  commitments: "var(--color-invest)",
  lines: "var(--color-border-primary)",
  left: "var(--color-income)",
} as const;


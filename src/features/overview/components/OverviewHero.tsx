import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { excludedByOpeningDate, type OpeningBalance } from "../../../shared/utils/balance";
import type { PaydayOutlook } from "../overviewTabs";
import { PaydayCard } from "./PaydayCard";
import { moneyOrigin } from "./paydayParts";

type Money = (n: number) => string;

/**
 * The money there is now, and whether it lasts until pay day — one card, one
 * answer.
 *
 * The answer used to sit on a tab of its own, worked out by a simpler sum than
 * the Planner's, and the two disagreed one tap apart. Now it is the Planner's
 * own walk (see `paydayOutlook`), under the figure it starts from, with the bar
 * between them showing how the one becomes the other — so the second figure
 * never has to be taken on trust.
 *
 * The card itself is `PaydayCard`, which the Planner opens with too; what is
 * the Overview's own is around it: the way to add banks, the note about older
 * records, and the way on to the Planner.
 */
export default function OverviewHero({
  balance,
  transactions,
  opening,
  source,
  isLoading,
  banks,
  inGoals,
  outlook,
  now,
  formatCurrency,
  locale,
}: {
  balance: number;
  transactions: Transaction[];
  opening?: OpeningBalance;
  source?: "readings" | "settings";
  isLoading: boolean;
  /** Banks and cash as the latest reading and the records since put them, goals included. */
  banks?: number;
  inGoals: number;
  outlook: PaydayOutlook;
  now: Date;
  formatCurrency: Money;
  locale: string;
}) {
  const { t } = useTranslation();

  // Only the Settings figure holds records back by date; after a bank reading
  // nearly every record is older than it, and saying so would be noise.
  const excluded = useMemo(() => (source === "settings" ? excludedByOpeningDate(transactions, opening) : 0), [transactions, opening, source]);

  return (
    <PaydayCard
      label={t("overview.currentBalance")}
      figure={balance}
      origin={moneyOrigin(t, { source, banks, inGoals, opening, locale, formatCurrency })}
      // Until the banks have been read the figure is only as complete as the
      // history entered — and the place to fix that is the banks.
      action={
        source !== "readings" && !isLoading ? (
          <Link to="/accounts" className="btn btn-outline-secondary btn-sm flex-shrink-0">
            {t("overview.addBanks")}
          </Link>
        ) : undefined
      }
      // The reassurance that makes backfilling safe: those older records are
      // in the charts, they are simply not deducted twice.
      between={
        excluded > 0 ? (
          <p className="mb-0 mt-2 text-body-secondary" style={{ fontSize: 11.5 }}>
            ⓘ {t("overview.currentBalanceExcluded", { count: excluded })}
          </p>
        ) : undefined
      }
      // The way to the full walk, after the answer rather than beside it,
      // where it pushed the verdict onto two lines on a phone.
      footer={
        <div className="d-flex justify-content-between align-items-baseline gap-2 mt-2">
          {/* No pay day: the salary is set on «Έσοδα», where every screen reads it from. */}
          {!outlook.known ? (
            <Link to="/incomes" className="small text-decoration-none">
              {t("overview.setPayday")}
            </Link>
          ) : (
            <span />
          )}
          <Link to="/planner" className="small text-decoration-none flex-shrink-0">
            {t("overview.openPlanner")}
          </Link>
        </div>
      }
      outlook={outlook}
      now={now}
      isLoading={isLoading}
      formatCurrency={formatCurrency}
      locale={locale}
    />
  );
}

import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BillWithStatus, Category } from "../../shared/types/IndexTypes";
import { expectedAmount, getFrequencyLabel, getIntervalCount } from "./billsUtils";
import { yearCostRanking } from "./yearCost";
import styles from "./css/BillsPage.module.css";

/**
 * «Ο χρόνος»: every running bill ranked by what it costs over the next twelve
 * months, dearest first, each with its share of the year — and a line where
 * the dearest few reach half of it. Answers "where does the year's money go,
 * and where do I look first to cut", which neither the month views nor the
 * category bars do. See `yearCostRanking`. A row opens the bill.
 */
export default function BillYearCost({
  bills,
  categoryFor,
  formatCurrency,
  onOpenBill,
}: {
  bills: BillWithStatus[];
  categoryFor: (id: string) => Category | undefined;
  formatCurrency: (n: number) => string;
  onOpenBill: (bill: BillWithStatus) => void;
}) {
  const { t } = useTranslation();
  const { total, rows } = useMemo(() => yearCostRanking(bills), [bills]);
  const top = rows[0]?.yearly ?? 0;
  // The row where the running share first reaches half — the line goes under it.
  const half = rows.findIndex((row) => row.cumulative >= 50);

  return (
    <div className={styles.yearAhead}>
      <div className="stat-head d-flex justify-content-between align-items-baseline gap-2">
        <span>{t("bills.yearCostTitle")}</span>
        <span className={styles.yearAheadTotal}>{formatCurrency(total)}</span>
      </div>
      <div className={styles.yearAheadHint}>{t("bills.yearCostHint")}</div>

      {rows.length === 0 ? (
        <p className="mb-0 text-body-secondary" style={{ fontSize: 13 }}>
          {t("bills.noBillsToProject")}
        </p>
      ) : (
        <ol className={styles.costList}>
          {rows.map((row, index) => {
            const freq = getFrequencyLabel(row.bill);
            return (
              <Fragment key={row.bill.id}>
                <li>
                  <button type="button" className={`${styles.costRow} ${row.yearly === 0 ? styles.costRowNone : ""}`} onClick={() => onOpenBill(row.bill)}>
                    <span className={styles.costRank} aria-hidden>
                      {index + 1}
                    </span>
                    <span className={styles.costMain}>
                      <span className={styles.costName}>
                        <span aria-hidden>{categoryFor(row.bill.categoryId)?.icon ?? "🧾"}</span> {row.bill.name}
                      </span>
                      <span className={styles.costSub}>
                        {t(freq.key, { count: freq.count })}
                        {/* The year spread over its twelve months, months off included —
                            its own words, since it is not the card's «αναλογία»
                            (one charge ÷ the months it covers): 60 € every two
                            months is 30 € a month there, and 22,50 € here once
                            three months of the year are paused. Said only where
                            it differs from what leaves each month. */}
                        {!(row.bill.frequency === "monthly" && getIntervalCount(row.bill) === 1 && Math.abs(row.yearly / 12 - expectedAmount(row.bill)) < 0.005) &&
                          ` · ${t("bills.yearShare", { amount: formatCurrency(row.yearly / 12) })}`}
                      </span>
                      <span className={styles.costTrack} aria-hidden>
                        <span className={styles.costFill} style={{ width: `${top > 0 ? (row.yearly / top) * 100 : 0}%` }} />
                      </span>
                    </span>
                    <span className={styles.costFigure}>
                      <strong>{formatCurrency(row.yearly)}</strong>
                      <span className={styles.costShare}>{row.yearly === 0 ? t("bills.yearCostNone") : `${Math.round(row.share)}%`}</span>
                    </span>
                  </button>
                </li>
                {index === half && half < rows.length - 1 && (
                  <li className={styles.costHalf}>
                    {t("bills.yearCostHalf", { count: half + 1, pct: Math.round(row.cumulative) })}
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      )}
    </div>
  );
}

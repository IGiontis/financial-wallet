import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BillSpread } from "./billsUtils";
import styles from "./css/BillsPage.module.css";

/**
 * What each bill that moves has actually been costing.
 *
 * Every payment of a variable bill records the real figure, and until now that
 * history was only ever averaged. Drawn, it answers the question the averages
 * cannot: has this got dearer.
 *
 * Each bill is scaled to its own charges rather than to a shared axis. The point
 * of a row is the shape of that bill over time; against a common scale the
 * €9 subscription would be a flat line beside the rent and say nothing at all.
 *
 * The verdict beside the last bar is deliberately modest — above everything
 * before it, below everything before it, or neither. Utilities are seasonal, and
 * anything grander would report every January as a crisis.
 */
export default function BillSpreads({
  spreads,
  formatCurrency,
  locale,
  onOpenDetails,
}: {
  spreads: BillSpread[];
  formatCurrency: (n: number) => string;
  locale: string;
  onOpenDetails: (spread: BillSpread) => void;
}) {
  const { t } = useTranslation();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }), [locale]);

  if (spreads.length === 0) {
    return (
      <div className={styles.yearAhead}>
        <div className="fw-semibold" style={{ fontSize: 14 }}>
          {t("bills.spreadsTitle")}
        </div>
        <p className="mb-0 mt-2" style={{ fontSize: 13, opacity: 0.75 }}>
          {t("bills.spreadsEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.yearAhead}>
      <div className={styles.yearAheadHead}>
        <div>
          <div className="fw-semibold" style={{ fontSize: 14 }}>
            {t("bills.spreadsTitle")}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.spreadsHint")}</div>
        </div>
      </div>

      {spreads.map((spread) => {
        const peak = spread.charges.reduce((most, charge) => Math.max(most, charge.amount), 0);
        return (
          <button key={spread.bill.id} type="button" className={styles.spreadRow} onClick={() => onOpenDetails(spread)}>
            <span className={styles.spreadHead}>
              <span className={styles.spreadName}>{spread.bill.name}</span>
              {spread.usual && (
                <span className={styles.spreadUsual}>
                  {t("bills.spreadUsual", { min: formatCurrency(spread.usual.min), max: formatCurrency(spread.usual.max) })}
                </span>
              )}
            </span>

            <span className={styles.spreadBars}>
              {spread.charges.map((charge, index) => {
                const last = index === spread.charges.length - 1;
                const tone = last && spread.standing === "above" ? styles.spreadBarAbove : last && spread.standing === "below" ? styles.spreadBarBelow : last ? styles.spreadBarLast : "";
                return (
                  <span
                    key={`${charge.date.getTime()}-${index}`}
                    className={`${styles.spreadBar} ${tone}`}
                    style={{ height: `${peak > 0 ? Math.max((charge.amount / peak) * 100, 6) : 6}%` }}
                    title={`${dateFmt.format(charge.date)} — ${formatCurrency(charge.amount)}`}
                  />
                );
              })}
            </span>

            <span className={styles.spreadFoot}>
              <span className={styles.spreadLatest}>{t("bills.spreadLatest", { amount: formatCurrency(spread.latest.amount) })}</span>
              {spread.standing === "above" && spread.gap !== undefined && (
                <span className={`${styles.linePill} ${styles.linePillLate}`}>{t("bills.spreadAbove", { gap: formatCurrency(spread.gap) })}</span>
              )}
              {spread.standing === "below" && spread.gap !== undefined && (
                <span className={`${styles.linePill} ${styles.linePillPaid}`}>{t("bills.spreadBelow", { gap: formatCurrency(spread.gap) })}</span>
              )}
              {spread.standing === "usual" && <span className={`${styles.linePill} ${styles.linePillPaid}`}>{t("bills.spreadAsUsual")}</span>}
              {!spread.standing && <span className={`${styles.linePill} ${styles.linePillPaused}`}>{t("bills.spreadNeedsHistory")}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

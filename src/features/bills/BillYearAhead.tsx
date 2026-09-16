import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { heaviestMonth, type MonthAhead } from "./billsUtils";
import { standaloneMonthName } from "../../shared/utils/dates";
import styles from "./css/BillsPage.module.css";

/**
 * The twelve months ahead, each as long as it is expensive.
 *
 * The page could already say what a month costs on average and what next month
 * costs. Neither says which months are the hard ones — and that is most of what
 * there is to plan around: the insurance and the road tax land in the same
 * December, and a holiday house switches itself off for the winter. An average
 * spread evenly over twelve months hides both by construction.
 *
 * One list of twelve, laid out two ways. On a phone each month is a full-width
 * row — name, bar, figure — which is the shape that survives a 375px screen
 * without cramming a label into 24px. From `sm` up the same twelve become
 * columns, which reads faster when there is room for it. The bar's length comes
 * from a custom property so the two layouts differ only in whether it is the
 * width or the height that grows; there is no second markup to keep in step.
 */
export default function BillYearAhead({
  months,
  formatCurrency,
  locale,
  onOpenMonth,
}: {
  months: MonthAhead[];
  formatCurrency: (n: number) => string;
  locale: string;
  /** Opens that month's own breakdown — the list behind the bar. */
  onOpenMonth: (offset: number) => void;
}) {
  const { t } = useTranslation();

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);
  // Named the way a sentence names a month, not the way a date does.
  const longName = useMemo(() => (date: Date) => standaloneMonthName(locale, date), [locale]);

  const peak = months.reduce((most, month) => Math.max(most, month.total), 0);
  const total = months.reduce((sum, month) => sum + month.total, 0);
  const heaviest = heaviestMonth(months);
  // Only worth pointing out when it actually stands out; on a flat year every
  // month is the heaviest and saying so is noise.
  const notable = heaviest && total > 0 && heaviest.total > (total / months.length) * 1.25 ? heaviest : undefined;

  return (
    <div className={styles.yearAhead}>
      <div className={styles.yearAheadHead}>
        <div>
          <div className="fw-semibold" style={{ fontSize: 14 }}>
            {t("bills.yearAheadTitle")}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.yearAheadHint")}</div>
        </div>
        <span className={styles.yearAheadTotal}>{formatCurrency(total)}</span>
      </div>

      <div className={styles.yearBars}>
        {months.map((month, offset) => {
          const share = peak > 0 ? Math.max((month.total / peak) * 100, month.total > 0 ? 4 : 0) : 0;
          return (
            <button
              key={month.start.toISOString()}
              type="button"
              className={`${styles.yearBarItem} ${month === notable ? styles.yearBarItemPeak : ""}`}
              style={{ ["--fill" as string]: `${share}%` }}
              onClick={() => onOpenMonth(offset)}
              title={`${longName(month.start)} — ${formatCurrency(month.total)}`}
            >
              <span className={styles.yearBarMonth}>{monthFmt.format(month.start)}</span>
              <span className={styles.yearBarTrack}>
                <span className={styles.yearBarFill} />
              </span>
              <span className={styles.yearBarAmount}>{month.total > 0 ? formatCurrency(month.total) : "—"}</span>
            </button>
          );
        })}
      </div>

      {notable && (
        <p className={styles.yearAheadNote}>
          {t("bills.yearAheadPeak", { month: longName(notable.start), amount: formatCurrency(notable.total), count: notable.count })}
        </p>
      )}
    </div>
  );
}

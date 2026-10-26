import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MonthAhead } from "./billsUtils";
import { monthExtremes } from "../../shared/utils/monthExtremes";
import { standaloneMonthName } from "../../shared/utils/dates";
import { MonthBars } from "../../shared/components/MonthBars";
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

  // Named the way a sentence names a month, not the way a date does.
  const longName = useMemo(() => (date: Date) => standaloneMonthName(locale, date), [locale]);

  const total = months.reduce((sum, month) => sum + month.total, 0);
  // The dear months and the easy ones — every tied month at each end, as on
  // «Έσοδα» — only where they stand a quarter off the average: on a flat year
  // every month is the heaviest, and saying so is noise.
  const { highs: notable, lows: easy } = monthExtremes(months, 0.25);
  const names = (list: MonthAhead[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(list.map((m) => longName(m.start)));

  return (
    <div className={styles.yearAhead}>
      <div className="stat-head d-flex justify-content-between align-items-baseline gap-2">
        <span>{t("bills.yearAheadTitle")}</span>
        <span className={styles.yearAheadTotal}>{formatCurrency(total)}</span>
      </div>
      <div className={styles.yearAheadHint}>{t("bills.yearAheadHint")}</div>

      {/* The bars are shared with «Έσοδα»; the dear month red, the easy one green. */}
      <MonthBars
        months={months.map((month) => {
          const left = Math.round((month.total - month.paid) * 100) / 100;
          return {
            ...month,
            title:
              month.paid > 0
                ? `${longName(month.start)} — ${formatCurrency(month.total)} · ${t("bills.yearAheadPaidTitle", { paid: formatCurrency(month.paid), left: formatCurrency(left) })}`
                : `${longName(month.start)} — ${formatCurrency(month.total)}`,
          };
        })}
        formatCurrency={formatCurrency}
        locale={locale}
        label={t("bills.yearAheadTitle")}
        highs={notable}
        lows={easy}
        highTone="expense"
        lowTone="income"
        onOpen={onOpenMonth}
        paidLegend={t("bills.yearAheadPrepaid")}
      />

      {(notable.length > 0 || easy.length > 0) && (
        <p className={styles.yearAheadNote}>
          {notable.length === 1 && t("bills.yearAheadPeak", { month: longName(notable[0].start), amount: formatCurrency(notable[0].total), count: notable[0].count })}
          {notable.length > 1 && t("bills.yearAheadPeakMany", { months: names(notable), amount: formatCurrency(notable[0].total) })}
          {notable.length > 0 && easy.length > 0 && " "}
          {easy.length === 1 && t("bills.yearAheadLow", { month: longName(easy[0].start), amount: formatCurrency(easy[0].total) })}
          {easy.length > 1 && t("bills.yearAheadLowMany", { months: names(easy), amount: formatCurrency(easy[0].total) })}
        </p>
      )}
    </div>
  );
}

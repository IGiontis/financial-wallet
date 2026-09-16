import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { standaloneMonthName } from "../../shared/utils/dates";
import type { MonthTimeline } from "./monthTimeline";
import styles from "./css/BillsPage.module.css";

/**
 * The month in the order it happens.
 *
 * Every other view here totals things up. This one keeps them in sequence,
 * because for anyone paid once a month the sequence is the thing that decides
 * whether a month is comfortable: rent on the 1st against pay on the 28th is a
 * very different month from the same two figures the other way round, and no
 * total can tell them apart.
 *
 * A list of dated rows rather than a calendar grid, which is also what makes it
 * work on a phone: seven columns of day squares leave 44px for an amount, while
 * a row has the whole width for it.
 */
export default function BillMonthTimeline({
  timeline,
  formatCurrency,
  locale,
  onOpenBill,
}: {
  timeline: MonthTimeline;
  formatCurrency: (n: number) => string;
  locale: string;
  onOpenBill: (bill: BillWithStatus) => void;
}) {
  const { t } = useTranslation();
  // The day alone: the month is named once at the top, and repeating it down
  // the column crowded the dates into the line.
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric" }), [locale]);
  const fullFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }), [locale]);

  const bills = timeline.events.filter((event) => event.kind === "bill");

  return (
    <div className={styles.yearAhead}>
      <div className={styles.yearAheadHead}>
        <div>
          <div className="fw-semibold" style={{ fontSize: 14 }}>
            {standaloneMonthName(locale, timeline.monthStart)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.timelineHint")}</div>
        </div>
        <span className={styles.yearAheadTotal} style={{ color: "var(--color-expense-text)" }}>
          −{formatCurrency(timeline.out)}
        </span>
      </div>

      {bills.length === 0 ? (
        <p className="mb-0" style={{ fontSize: 13, opacity: 0.75 }}>
          {t("bills.timelineEmpty")}
        </p>
      ) : (
        <div className={styles.timeline}>
          {timeline.events.map((event) => (
            <button
              key={event.key}
              type="button"
              className={`${styles.timelineRow} ${event.done ? styles.timelineRowDone : ""}`}
              disabled={!event.bill}
              onClick={() => event.bill && onOpenBill(event.bill)}
            >
              <span className={styles.timelineDay} title={fullFmt.format(event.date)}>
                {dayFmt.format(event.date)}
              </span>
              <span className={`${styles.timelineDot} ${event.kind === "income" ? styles.timelineDotIn : ""} ${event.done ? styles.timelineDotDone : ""}`} aria-hidden />
              <span className={styles.timelineName}>{event.label}</span>
              <span className={`${styles.timelineAmount} ${event.kind === "income" ? styles.timelineIn : styles.timelineOut}`}>
                {event.amount > 0 ? "+" : "−"}
                {formatCurrency(Math.abs(event.amount))}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* The one sentence the view exists for: what last month's money has to
          cover before this month's arrives. */}
      {timeline.firstIncome && timeline.beforeIncome > 0 && (
        <p className={styles.yearAheadNote}>
          {t("bills.timelineGap", { amount: formatCurrency(timeline.beforeIncome), day: fullFmt.format(timeline.firstIncome) })}
        </p>
      )}
      {!timeline.firstIncome && bills.length > 0 && <p className={styles.yearAheadNote}>{t("bills.timelineNoSalary")}</p>}
    </div>
  );
}

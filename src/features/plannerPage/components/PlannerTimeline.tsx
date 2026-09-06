import { useTranslation } from "react-i18next";
import { FiLock } from "react-icons/fi";

import { isHardDeadline } from "../../bills/billsUtils";
import type { PlannerEvent } from "../plannerUtils";
import type { BillWithStatus } from "../../../shared/types/IndexTypes";
import styles from "../css/PlannerPage.module.css";

export interface EventMonth {
  key: string;
  label: string;
  outgoing: number;
  events: PlannerEvent[];
}

interface PlannerTimelineProps {
  months: EventMonth[];
  bills: BillWithStatus[];
  /** The outgoing that tipped the balance under, if one did — coloured as the culprit. */
  breakingEvent?: PlannerEvent;
  formatCurrency: (n: number) => string;
  dateFmt: Intl.DateTimeFormat;
}

/**
 * What happens, and when.
 *
 * A dated list rather than a table of totals: the question this answers is not
 * "how much" — the hero already said that — but "in what order", which is the
 * difference between a month that adds up and a month that adds up too late.
 */
export function PlannerTimeline({ months, bills, breakingEvent, formatCurrency, dateFmt }: PlannerTimelineProps) {
  const { t } = useTranslation();

  const renderEvent = (event: PlannerEvent, index: number) => {
    const source = event.billId ? bills.find((b) => b.id === event.billId) : undefined;
    const isBreaking = breakingEvent === event;
    // The same muted tint the lever rows use, so both lists tell money in from
    // money out the same way. Full strength is kept for the one event that
    // tipped the balance under — that is the row worth shouting about.
    const tone = isBreaking
      ? "var(--color-expense)"
      : event.amount > 0
        ? "color-mix(in srgb, var(--color-income) 55%, var(--color-text-primary))"
        : "color-mix(in srgb, var(--color-expense) 55%, var(--color-text-primary))";

    return (
      <div key={`${event.kind}-${event.billId ?? event.label}-${index}`} className={styles.eventRow}>
        <span className={styles.eventDate} style={{ color: tone }}>
          {event.overdue ? t("planner.now") : dateFmt.format(event.date)}
        </span>
        <span className={styles.eventName}>
          <span className={styles.eventTitle} style={{ color: tone }}>
            {event.kind === "income" ? t("planner.salaryLabel") : event.label}
            {source && isHardDeadline(source) && <FiLock size={11} className="ms-1" style={{ verticalAlign: "-1px", color: "var(--color-expense)" }} title={t("bills.strictHint")} />}
          </span>
          {/* Only bills with real grace get this line — and it names the actual
              last day, since "can wait" without a date is not something you can
              plan around. */}
          {event.graceDays !== undefined && event.graceDays > 0 && event.deadline && (
            <span className={styles.eventNote}>{t("planner.canWaitUntil", { date: dateFmt.format(event.deadline), days: event.graceDays })}</span>
          )}
        </span>
        <span className={styles.eventAmount} style={{ color: tone }}>
          {event.amount > 0 ? "+" : "−"}
          {formatCurrency(Math.abs(event.amount))}
        </span>
      </div>
    );
  };

  return (
    <div className={`${styles.chartCard} p-3 p-lg-4`}>
      <div className={styles.cardTitle}>{t("planner.stillComing")}</div>
      <p className={styles.cardHint}>{t("planner.stillComingHint")}</p>

      {months.length === 0 ? (
        <p className="text-body-secondary mb-0" style={{ fontSize: 12.5 }}>
          {t("planner.noBillsLeft")}
        </p>
      ) : (
        months.map((month) => (
          <div key={month.key}>
            {/* A single-month window is already one month — a heading over it
                would only repeat the horizon picker. */}
            {months.length > 1 && (
              <div className={styles.monthHeader}>
                <span>{month.label}</span>
                <span className={styles.monthTotal}>−{formatCurrency(month.outgoing)}</span>
              </div>
            )}
            {month.events.map(renderEvent)}
          </div>
        ))
      )}
    </div>
  );
}

export default PlannerTimeline;

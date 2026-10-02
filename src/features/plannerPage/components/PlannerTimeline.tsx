import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronRight, FiLock } from "react-icons/fi";
import { daysLate, type ResolvedOccurrence } from "../plannerActuals";

import { isHardDeadline } from "../../bills/billsUtils";
import { SALARY_ROW_ID, type PlannerEvent } from "../plannerUtils";
import type { PlanSlice } from "../payCycles";
import type { BillWithStatus } from "../../../shared/types/IndexTypes";
import styles from "../css/PlannerPage.module.css";

/** Months listed before the rest wait behind a button — only past a year and a quarter, as in the chart. */
const FIRST_MONTHS = 13;
const FOLD_ABOVE = 16;

interface PlannerTimelineProps {
  /** The plan cut at the first of each month — see `planMonths`. */
  months: PlanSlice[];
  bills: BillWithStatus[];
  /** The outgoing that tipped the balance under, if one did — coloured as the culprit. */
  breakingEvent?: PlannerEvent;
  formatCurrency: (n: number) => string;
  dateFmt: Intl.DateTimeFormat;
  locale: string;
  today: Date;
  /** What already came, or will not, near today — listed first, and struck through. */
  settled?: ResolvedOccurrence[];
  /** Opens one salary, instalment or one-off, to say what happened to it. */
  onOccurrence?: (key: string) => void;
}

/**
 * Month by month: the balance each month ends on, and its payments on a tap.
 *
 * It was a dated list of every payment, grouped under month headings that gave
 * only the month's outgoings — so where a month left you was in the chart and
 * nowhere else. Each month is now one row that answers that first: what came
 * in, what went out, what it ends on, and what was left the evening before its
 * pay. The payments themselves are one tap down, in the same rows as before —
 * a salary or an instalment still opens its sheet.
 */
function PlannerTimelineBase({ months, bills, breakingEvent, formatCurrency, dateFmt, locale, today, settled = [], onOccurrence }: PlannerTimelineProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<Record<number, boolean>>({});
  const [showAll, setShowAll] = useState(false);

  const formats = useMemo(
    () => ({
      number: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      month: new Intl.DateTimeFormat(locale, { month: "short" }),
    }),
    [locale],
  );
  const signed = (n: number) => `${n > 0 ? "+" : "−"}${formats.number.format(Math.abs(n))}`;

  const renderEvent = (event: PlannerEvent, index: number) => {
    const source = event.billId ? bills.find((b) => b.id === event.billId) : undefined;
    const isBreaking = breakingEvent === event;
    // Plain figures, as in the levers. Full strength is kept for the one event
    // that tipped the balance under — that is the row worth shouting about.
    const tone = isBreaking ? "var(--color-expense-text)" : event.amount > 0 ? "var(--figure-income)" : "var(--figure-expense)";

    const tappable = !!event.occurrenceKey && !!onOccurrence;
    const Row = tappable ? "button" : "div";
    const moved = !event.late && event.expected && event.expected.getTime() !== event.date.getTime();

    return (
      <Row
        key={`${event.kind}-${event.occurrenceKey ?? event.billId ?? event.label}-${index}`}
        className={`${styles.eventRow} ${tappable ? styles.eventButton : ""}`}
        {...(tappable ? { type: "button" as const, onClick: () => onOccurrence!(event.occurrenceKey!) } : {})}
      >
        <span className={styles.eventDate} style={{ color: tone }}>
          {event.overdue || event.late ? t("planner.now") : dateFmt.format(event.date)}
        </span>
        <span className={styles.eventName}>
          <span className={styles.eventTitle} style={{ color: tone }}>
            {event.label === SALARY_ROW_ID ? t("planner.salaryLabel") : event.label}
            {source && isHardDeadline(source) && <FiLock size={11} className="ms-1" style={{ verticalAlign: "-1px", color: "var(--color-expense)" }} title={t("bills.strictHint")} />}
            {tappable && <FiChevronRight size={12} className="ms-1" style={{ verticalAlign: "-1px" }} aria-hidden />}
          </span>
          {/* Only bills with real grace get this line — and it names the actual
              last day, since "can wait" without a date is not something you can
              plan around. */}
          {event.graceDays !== undefined && event.graceDays > 0 && event.deadline && (
            <span className={styles.eventNote}>{t("planner.canWaitUntil", { date: dateFmt.format(event.deadline), count: event.graceDays })}</span>
          )}
          {event.late && event.expected && (
            <span className={`${styles.eventNote} ${styles.lateNote}`}>{t("planner.lateBy", { count: daysLate({ date: event.expected }, today), date: dateFmt.format(event.expected) })}</span>
          )}
          {moved && <span className={styles.eventNote}>{t("planner.movedFrom", { date: dateFmt.format(event.expected!) })}</span>}
        </span>
        <span className={styles.eventAmount} style={{ color: tone }}>
          {event.amount > 0 ? "+" : "−"}
          {formatCurrency(Math.abs(event.amount))}
        </span>
      </Row>
    );
  };

  // Came, paid, or not coming this time — kept on the list, struck through, so
  // the plan shows it knows and the one tap that undoes it stays in reach.
  const renderSettled = (occurrence: ResolvedOccurrence) => {
    const name = occurrence.label === SALARY_ROW_ID ? t("planner.salaryLabel") : occurrence.label;
    const outgoing = occurrence.amount < 0;
    const m = occurrence.matched;
    const note = occurrence.status === "skipped" ? t("planner.skippedShort") : m ? t(outgoing ? "planner.paidOn" : "planner.arrivedOn", { date: dateFmt.format(m.date) }) : "";
    const differs = m && Math.round(Math.abs(m.amount) * 100) !== Math.round(Math.abs(occurrence.amount) * 100);
    const Row = onOccurrence ? "button" : "div";
    return (
      <Row
        key={occurrence.key}
        className={`${styles.eventRow} ${styles.settledRow} ${onOccurrence ? styles.eventButton : ""}`}
        {...(onOccurrence ? { type: "button" as const, onClick: () => onOccurrence(occurrence.key) } : {})}
      >
        <span className={styles.eventDate}>{dateFmt.format(occurrence.date)}</span>
        <span className={styles.eventName}>
          <span className={styles.eventTitle}>{name}</span>
          <span className={`${styles.eventNote} ${occurrence.status === "skipped" ? "" : styles.doneNote}`}>
            {note}
            {differs && ` · ${t("planner.amountWas", { amount: formatCurrency(Math.abs(m!.amount)) })}`}
          </span>
        </span>
        <span className={`${styles.eventAmount} ${styles.struck}`}>
          {outgoing ? "−" : "+"}
          {formatCurrency(Math.abs(occurrence.amount))}
        </span>
      </Row>
    );
  };

  const shown = showAll || months.length <= FOLD_ABOVE ? months : months.slice(0, FIRST_MONTHS);

  return (
    <div className="card p-3 mb-3">
      <span className={styles.label}>{t("planner.monthsTitle")}</span>

      {settled.length > 0 && (
        <div className="mt-2 mb-1">
          <div className={styles.doneHeader}>{t("planner.doneTitle")}</div>
          {settled.map(renderSettled)}
        </div>
      )}

      {shown.map((month) => {
        const events = [...month.payEvents, ...month.items].sort((a, b) => a.date.getTime() - b.date.getTime());
        const open = !!opened[month.from];
        const came = month.pay + month.incoming;
        const went = month.bills + month.commitments + month.lines;
        // Another year's month carries its year under it: "Jan 27" beside it
        // reads as the 27th of January.
        const otherYear = month.start.getFullYear() !== today.getFullYear();
        // A month that is only today has nothing to add up but today.
        const onlyToday = month.from === 0 && month.days === 1;

        return (
          <div key={month.from}>
            <button
              type="button"
              className={styles.monthRow}
              aria-expanded={events.length > 0 ? open : undefined}
              disabled={events.length === 0}
              onClick={() => setOpened((state) => ({ ...state, [month.from]: !open }))}
            >
              <b className={styles.monthName}>
                {formats.month.format(month.start)}
                {otherYear && <small>{month.start.getFullYear()}</small>}
              </b>
              <span className={styles.monthFlow}>
                {onlyToday ? (
                  `${t("planner.today")} ${came > 0 ? `${signed(came)} ` : ""}${went > 0 ? signed(-went) : ""}`.trim()
                ) : (
                  <>
                    {came > 0 && `${signed(came)} `}
                    {went > 0 && signed(-went)}
                  </>
                )}
                {month.beforePay && <small>{t("planner.monthBeforePay", { amount: formatCurrency(month.beforePay.balance) })}</small>}
              </span>
              <b className={styles.monthEnd} style={{ color: month.close < 0 ? "var(--color-expense-text)" : undefined }}>
                {formatCurrency(month.close)}
              </b>
              <span className={styles.monthChevron} aria-hidden>
                {events.length > 0 && (open ? <FiChevronDown size={15} /> : <FiChevronRight size={15} />)}
              </span>
            </button>
            {open && <div className={styles.monthEvents}>{events.map(renderEvent)}</div>}
          </div>
        );
      })}

      {months.length > shown.length && (
        <button type="button" className={styles.cycleMore} onClick={() => setShowAll(true)}>
          {t("planner.moreEvents", { count: months.length - shown.length })}
        </button>
      )}

      {onOccurrence && <p className={`${styles.cardHint} mt-2 mb-0`}>{t("planner.tapToFix")}</p>}
    </div>
  );
}

/** Skipped while the plan behind it is unchanged: it is the longest list on the page. */
export const PlannerTimeline = memo(PlannerTimelineBase);

export default PlannerTimeline;

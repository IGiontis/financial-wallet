import { memo, useMemo, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronRight, FiLock } from "react-icons/fi";
import { daysLate, type ResolvedOccurrence } from "../plannerActuals";

import { isHardDeadline } from "../../bills/billsUtils";
import type { PlannerEvent } from "../plannerUtils";
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
 * Month by month: the balance each month ends on, and its working on a tap.
 *
 * It was a dated list of every payment, grouped under month headings that gave
 * only the month's outgoings — so where a month left you was in the chart and
 * nowhere else. Then each month became a row of everything at once: in, out,
 * the evening before pay, the end. At a glance that was a column of figures
 * to decode, so the row now says the one thing — where the month ends — and a
 * tap opens the rest in a sheet: what came in and went out, the evening
 * before pay, and every payment in columns from what it started with to what
 * it ends on. A salary or an instalment there still opens its own sheet.
 *
 * What already happened near today folds the same way, to one line.
 */
function PlannerTimelineBase({ months, bills, breakingEvent, formatCurrency, dateFmt, locale, today, settled = [], onOccurrence }: PlannerTimelineProps) {
  const { t } = useTranslation();
  // The month whose sheet is open, by its first day's offset — or the list of what already happened.
  const [opened, setOpened] = useState<number | "done" | null>(null);
  const [showAll, setShowAll] = useState(false);

  const formats = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(locale, { month: "short" }),
      monthLong: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
      day: new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }),
    }),
    [locale],
  );
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;

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
            {event.label}
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
          <span className={styles.eventTitle}>{occurrence.label}</span>
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
  const month = typeof opened === "number" ? months.find((m) => m.from === opened) : undefined;

  /** A line of the month's sheet that is not a payment: where it starts, the budget lines, where it ends. */
  const summaryRow = (key: string, date: string, label: string, amount: string, strong = false) => (
    <div key={key} className={`${styles.eventRow} ${strong ? styles.eventStrong : ""}`}>
      <span className={styles.eventDate}>{date}</span>
      <span className={styles.eventName}>
        <span className={styles.eventTitle}>{label}</span>
      </span>
      <span className={styles.eventAmount}>{amount}</span>
    </div>
  );

  const renderSheet = () => {
    if (!month) return null;
    const events = [...month.payEvents, ...month.items].sort((a, b) => a.date.getTime() - b.date.getTime());
    const came = month.pay + month.incoming;
    const went = month.bills + month.commitments + month.lines;
    const first = month.from === 0;
    const stats: [string, string, string | undefined][] = [
      [t("planner.moneyIn"), signed(came), came > 0 ? "var(--color-income-text)" : undefined],
      [t("planner.moneyOut"), signed(-went), went > 0 ? "var(--color-expense-text)" : undefined],
      [t("planner.monthEndsOn"), formatCurrency(month.close), month.close < 0 ? "var(--color-expense-text)" : undefined],
    ];

    return (
      <>
        <div className={styles.monthStats}>
          {stats.map(([label, value, color]) => (
            <div key={label} className={styles.monthStat}>
              <span className={styles.tileLabel}>{label}</span>
              <span className={styles.monthStatValue} style={{ color }}>
                {value}
              </span>
            </div>
          ))}
        </div>
        {month.beforePay && (
          <p className="small text-body-secondary mt-2 mb-0">
            {t("planner.monthBeforePayOn", { date: formats.day.format(month.beforePay.on), amount: formatCurrency(month.beforePay.balance) })}
          </p>
        )}

        <div className={`${styles.label} mt-3`}>{t("planner.monthMoves")}</div>
        {/* From what it starts with to what it ends on: the rows add up to the last. */}
        {summaryRow("carried", dateFmt.format(month.start), t(first ? "planner.openingBalance" : "planner.monthCarried"), formatCurrency(month.carried))}
        {events.map(renderEvent)}
        {month.linesIn > 0 && summaryRow("lines-in", "—", t("planner.monthLinesIn"), signed(month.linesIn))}
        {month.lines > 0 && summaryRow("lines", "—", t("planner.monthLines"), signed(-month.lines))}
        {summaryRow("close", dateFmt.format(month.end), t("planner.monthEndsOn"), formatCurrency(month.close), true)}
        {onOccurrence && <p className={`${styles.cardHint} mt-2 mb-0`}>{t("planner.tapToFix")}</p>}
      </>
    );
  };

  return (
    <div className="card p-3 mb-3">
      <span className={styles.label}>{t("planner.monthsTitle")}</span>

      {/* What already happened near today, folded to one line. */}
      {settled.length > 0 && (
        <button type="button" className={styles.monthRow} onClick={() => setOpened("done")}>
          <span className={`${styles.monthName} ${styles.monthDone}`}>{t("planner.doneTitle")}</span>
          <b className={styles.monthEnd}>{settled.length}</b>
          <span className={styles.monthChevron} aria-hidden>
            <FiChevronRight size={15} />
          </span>
        </button>
      )}

      {shown.map((m) => {
        // Another year's month carries its year beside it: "Jan 27" alone
        // reads as the 27th of January.
        const otherYear = m.start.getFullYear() !== today.getFullYear();
        return (
          <button
            key={m.from}
            type="button"
            className={styles.monthRow}
            onClick={() => setOpened(m.from)}
            aria-label={t("planner.monthOpen", { month: formats.monthLong.format(m.start), amount: formatCurrency(m.close) })}
          >
            <b className={styles.monthName}>
              {formats.month.format(m.start)}
              {otherYear && <small>{m.start.getFullYear()}</small>}
            </b>
            <b className={styles.monthEnd} style={{ color: m.close < 0 ? "var(--color-expense-text)" : undefined }}>
              {formatCurrency(m.close)}
            </b>
            <span className={styles.monthChevron} aria-hidden>
              <FiChevronRight size={15} />
            </span>
          </button>
        );
      })}

      {months.length > shown.length && (
        <button type="button" className={styles.cycleMore} onClick={() => setShowAll(true)}>
          {t("planner.moreEvents", { count: months.length - shown.length })}
        </button>
      )}

      <Modal isOpen={month !== undefined} toggle={() => setOpened(null)} centered scrollable>
        <ModalHeader toggle={() => setOpened(null)}>
          <span style={{ fontSize: 15, textTransform: "capitalize" }}>{month ? formats.monthLong.format(month.start) : ""}</span>
        </ModalHeader>
        <ModalBody>{renderSheet()}</ModalBody>
      </Modal>

      <Modal isOpen={opened === "done" && settled.length > 0} toggle={() => setOpened(null)} centered scrollable>
        <ModalHeader toggle={() => setOpened(null)}>
          <span style={{ fontSize: 15 }}>{t("planner.doneTitle")}</span>
        </ModalHeader>
        <ModalBody>
          {settled.map(renderSettled)}
          {onOccurrence && <p className={`${styles.cardHint} mt-2 mb-0`}>{t("planner.tapToFix")}</p>}
        </ModalBody>
      </Modal>
    </div>
  );
}

/** Skipped while the plan behind it is unchanged: it is the longest list on the page. */
export const PlannerTimeline = memo(PlannerTimelineBase);

export default PlannerTimeline;

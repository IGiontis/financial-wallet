import { useTranslation } from "react-i18next";
import { FiChevronRight } from "react-icons/fi";

import { OUTGOING_COLOURS } from "../../overview/components/paydayParts";
import { daysLate } from "../plannerActuals";
import { SALARY_ROW_ID, type PlannerEvent } from "../plannerUtils";
import type { SliceStep } from "../payCycles";
import styles from "../css/PlannerPage.module.css";

/** The key colour of a step: the Overview's three outgoings, green for what arrives. */
function keyColour(step: SliceStep): string | undefined {
  if (step.kind === "carried") return undefined;
  if (step.kind === "lines") return OUTGOING_COLOURS.lines;
  if (step.amount > 0) return OUTGOING_COLOURS.left;
  return step.event?.kind === "bill" ? OUTGOING_COLOURS.bills : OUTGOING_COLOURS.commitments;
}

/**
 * A figure, written out as the sum it is: what there was, each thing that
 * came or went on its day, and what is left.
 *
 * The same rows under the card's "how it adds up" and under the chart's
 * cycle, so the two cannot list the same days differently. The amounts are
 * `sliceSteps`, which land on the closing figure to the cent — this only
 * names and dates them.
 */
export function CycleSteps({
  label,
  steps,
  days,
  first,
  close,
  nextPay,
  today,
  onOccurrence,
  formatCurrency,
  locale,
}: {
  /** What the list adds up to, for the group's name. */
  label: string;
  steps: SliceStep[];
  /** Days the slice covers, for the budget lines' row. */
  days: number;
  /** The first slice starts from the money there is today, not from a previous one. */
  first: boolean;
  /** The closing row, when the figure is not already printed above the list. */
  close?: { label: string; date: Date; amount: number };
  /** The pay that ends the stretch, listed after what is left, as the reason it ends there. */
  nextPay?: PlannerEvent;
  today: Date;
  onOccurrence?: (key: string) => void;
  formatCurrency: (n: number) => string;
  locale: string;
}) {
  const { t } = useTranslation();
  const dayDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const isToday = (date?: Date) => !!date && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  const when = (date?: Date) => (!date ? "" : isToday(date) ? t("planner.today") : dayDate.format(date));
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
  const nameOf = (event: PlannerEvent) => (event.label === SALARY_ROW_ID ? t("planner.salaryLabel") : event.label);

  const row = (key: string, date: string, label: string, amount: string, colour?: string, event?: PlannerEvent, note?: string) => {
    const tappable = !!event?.occurrenceKey && !!onOccurrence;
    const Row = tappable ? "button" : "div";
    return (
      <Row key={key} className={`${styles.step} ${tappable ? styles.stepButton : ""}`} {...(tappable ? { type: "button" as const, onClick: () => onOccurrence!(event!.occurrenceKey!) } : {})}>
        <span className={styles.stepDate}>{date}</span>
        <span className={styles.stepName}>
          <span className={styles.stepTitle}>
            {/* Always there, if only as a gap, so every name starts in one column. */}
            <i className={styles.stepKey} style={{ background: colour ?? "transparent" }} aria-hidden />
            {label}
            {tappable && <FiChevronRight size={13} className={styles.stepChevron} aria-hidden />}
          </span>
          {note && <span className={styles.stepNote}>{note}</span>}
        </span>
        <span className={styles.stepAmount}>{amount}</span>
      </Row>
    );
  };

  return (
    <div className={styles.steps} role="group" aria-label={label}>
      {steps.map((step, index) => {
        const key = `${step.kind}-${index}`;
        if (step.kind === "carried") return row(key, first ? t("planner.today") : when(step.date), t(first ? "planner.moneyYouHave" : "planner.stepCarried"), formatCurrency(step.amount));
        if (step.kind === "lines" || step.kind === "linesIn")
          return row(key, t("planner.stepDays", { count: days }), t(step.kind === "lines" ? "planner.groupMine" : "planner.stepMineIn"), signed(step.amount), keyColour(step));
        const event = step.event!;
        // Late pay sits on today; it says how late, as the list under the months does.
        const note = event.late && event.expected ? t("planner.lateBy", { count: daysLate({ date: event.expected }, today), date: dayDate.format(event.expected) }) : undefined;
        return row(key, when(step.date), nameOf(event), signed(step.amount), keyColour(step), event, note);
      })}

      {close && (
        <div className={`${styles.step} ${styles.stepClose} ${close.amount < 0 ? styles.stepCloseShort : ""}`}>
          <span className={styles.stepDate}>{when(close.date)}</span>
          <span className={styles.stepName}>
            <span className={styles.stepTitle}>
              <i className={styles.stepKey} aria-hidden />
              {close.label}
            </span>
          </span>
          <span className={styles.stepAmount}>{formatCurrency(close.amount)}</span>
        </div>
      )}

      {nextPay && row("next-pay", when(nextPay.date), nameOf(nextPay), signed(nextPay.amount), OUTGOING_COLOURS.left, nextPay)}
    </div>
  );
}

export default CycleSteps;

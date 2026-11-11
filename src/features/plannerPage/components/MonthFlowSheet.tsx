import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { isSameMonth } from "date-fns";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { monthFlows, type PlanMonth } from "../planMonthView";
import styles from "../css/PlannerPage.module.css";

/**
 * «Μπαίνουν» or «Βγαίνουν» of one month, opened: every income, bill, goal,
 * loan instalment, one-off and line behind the figure, each with its name,
 * its day and its amount, and the total under them — the figure itself.
 *
 * Read off `monthFlows`, which is cut from the same slice the tile's figure
 * is, so the list and the number cannot disagree. A view, not a form: it
 * closes on a tap outside.
 */
export function MonthFlowSheet({
  side,
  month,
  monthDate,
  now,
  formatCurrency,
  locale,
  onClose,
}: {
  side: "in" | "out";
  month: PlanMonth;
  /** The month's first day, for its name. */
  monthDate: Date;
  now: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const items = useMemo(() => monthFlows(month)[side], [month, side]);
  const figure = side === "in" ? month.in : month.out;
  const sign = side === "in" ? "+" : "−";
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthDate);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const tone = side === "in" ? "var(--color-income-text)" : undefined;
  const title = t(side === "in" ? "planner.flowInTitle" : "planner.flowOutTitle", { month: monthName });

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{title}</span>
      </ModalHeader>
      <ModalBody>
        {isSameMonth(monthDate, now) && <p className="small text-body-secondary mb-2">{t("planner.flowFromToday")}</p>}
        {items.length === 0 ? (
          <p className="text-body-secondary mb-0">{t("planner.flowEmpty")}</p>
        ) : (
          <ul className="list-unstyled mb-0" aria-label={title}>
            {items.map((item) => (
              <li key={item.key} className={styles.rowLine} data-testid="flow-item">
                <span className="d-flex flex-column" style={{ minWidth: 0 }}>
                  <span className="fw-medium">{item.label}</span>
                  <span className={styles.rowHint}>
                    {t(`planner.flowKind_${item.kind}`)} · {item.date ? dayFmt.format(item.date) : t("planner.flowSpread")}
                  </span>
                </span>
                <span className="ms-auto fw-semibold text-nowrap" style={{ color: tone, fontVariantNumeric: "tabular-nums" }}>
                  {sign}
                  {formatCurrency(item.amount)}
                </span>
              </li>
            ))}
            <li className={styles.rowLine}>
              <span className="fw-semibold">{t("planner.flowTotal")}</span>
              <span className="ms-auto fw-bold text-nowrap" style={{ color: tone, fontVariantNumeric: "tabular-nums" }} data-testid="flow-total">
                {sign}
                {formatCurrency(figure)}
              </span>
            </li>
          </ul>
        )}
      </ModalBody>
    </Modal>
  );
}

export default MonthFlowSheet;

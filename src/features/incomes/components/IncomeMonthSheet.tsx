import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { KIND_ICON, type IncomeMonthItem } from "../incomesUtils";
import type { IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";

/**
 * One month of «Οι επόμενοι 12 μήνες», opened: every time an income is
 * expected in it, soonest first, and the sum its bar stands for — as a bar on
 * «Πάγια» opens the bills behind it. A view, so a tap outside closes it.
 */
export function IncomeMonthSheet({
  month,
  items,
  formatCurrency,
  f,
  onClose,
}: {
  month: Date;
  items: IncomeMonthItem[];
  formatCurrency: (n: number) => string;
  f: IncomeFormats;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const total = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const approx = items.some((item) => item.approximate) ? "≈" : "";

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span className="text-capitalize">{f.monthName(month)}</span> {month.getFullYear()}
      </ModalHeader>
      <ModalBody>
        {items.length === 0 ? (
          <p className="mb-0 text-body-secondary">{t("incomes.ahead.nothing")}</p>
        ) : (
          <>
            <ul className={styles.monthItems} aria-label={t("incomes.ahead.listLabel")}>
              {items.map((item) => (
                <li key={`${item.income.id}-${item.date.getTime()}`}>
                  <span className={styles.monthItemName}>
                    <span aria-hidden>{KIND_ICON[item.income.kind]}</span> {item.income.name}
                    <span className={styles.monthItemWhen}>{item.undated ? t("incomes.ahead.noDay") : f.dayMonthShort.format(item.date)}</span>
                  </span>
                  <span className={styles.monthItemAmount}>
                    {item.approximate ? "≈" : ""}
                    {formatCurrency(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.monthItemsTotal}>
              <span>{t("incomes.ahead.total")}</span>
              <span>
                {approx}
                {formatCurrency(total)}
              </span>
            </div>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}

export default IncomeMonthSheet;

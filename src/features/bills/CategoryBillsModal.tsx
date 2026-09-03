import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { getFrequencyLabel } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import styles from "./css/BillsPage.module.css";

interface CategoryBillsModalProps {
  /** Null closes it — the category is what identifies the contents. */
  label: string | null;
  icon?: string;
  bills: BillWithStatus[];
  yearlyAmount: number;
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onOpenBill: (bill: BillWithStatus) => void;
}

/**
 * What is actually inside one bar of the yearly projection.
 *
 * The projection answers "how much of the year goes on subscriptions"; the
 * obvious next question is "which subscriptions", and that was previously
 * answerable only by scrolling the whole list and adding up by eye.
 */
export default function CategoryBillsModal({ label, icon, bills, yearlyAmount, formatCurrency, onClose, onOpenBill }: CategoryBillsModalProps) {
  const { t } = useTranslation();

  return (
    <Modal isOpen={label !== null} toggle={onClose} centered scrollable size="sm">
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2" style={{ fontSize: 15 }}>
          <span aria-hidden>{icon ?? "•"}</span>
          {label}
        </span>
      </ModalHeader>

      <ModalBody className="pt-2">
        <div className="d-flex justify-content-between align-items-baseline mb-2" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span>{t("bills.billsInCategory", { count: bills.length })}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{t("bills.perYearShort", { amount: formatCurrency(yearlyAmount) })}</span>
        </div>

        {bills.map((bill) => (
          // Straight through to the bill itself: having found the €140 line you
          // did not recognise, the next thing you want is to open it.
          <button key={bill.id} type="button" className={styles.categoryBillRow} onClick={() => onOpenBill(bill)}>
            <span className={styles.categoryBillName}>
              <span className={styles.categoryBillTitle}>{bill.name}</span>
              <span className={styles.categoryBillMeta}>{t(getFrequencyLabel(bill).key, { count: getFrequencyLabel(bill).count })}</span>
            </span>
            <span className={styles.categoryBillAmount}>
              {formatCurrency(bill.amount)}
              <span className={styles.categoryBillMeta}>
                {formatCurrency(bill.monthlyEquivalent)} {t("bills.perMonthShort")}
              </span>
            </span>
          </button>
        ))}
      </ModalBody>
    </Modal>
  );
}

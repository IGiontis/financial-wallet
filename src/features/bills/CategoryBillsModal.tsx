import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { getFrequencyLabel } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import styles from "./css/BillsPage.module.css";

/** What one row says beside its name. */
export interface BillRowDescription {
  meta: string;
  amount: string;
  sub: string;
  /** The amount's colour, when the set means something — red for late. */
  tone?: string;
}

interface CategoryBillsModalProps {
  /** Null closes it — the category is what identifies the contents. */
  label: string | null;
  icon?: string;
  bills: BillWithStatus[];
  /** Feeds the default summary line; unused when `summary` is given. */
  yearlyAmount?: number;
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onOpenBill: (bill: BillWithStatus) => void;
  /** The line above the rows. The count and the yearly total unless told otherwise. */
  summary?: { left: string; right: string; tone?: string };
  /** Each row's detail. Frequency and share of a month unless told otherwise. */
  describeRow?: (bill: BillWithStatus) => BillRowDescription;
}

/**
 * A set of bills, opened out — one bar of the yearly projection, every active
 * bill, or the late ones.
 *
 * The projection answers "how much of the year goes on subscriptions"; the
 * obvious next question is "which subscriptions", and that was previously
 * answerable only by scrolling the whole list and adding up by eye. The same
 * goes for a count of late bills: the number is the headline, the names are
 * what you act on. The list is the same shape each time, so it is one
 * component; what the rows say about each bill is what changes.
 */
export default function CategoryBillsModal({ label, icon, bills, yearlyAmount = 0, formatCurrency, onClose, onOpenBill, summary, describeRow }: CategoryBillsModalProps) {
  const { t } = useTranslation();

  const describe =
    describeRow ??
    ((bill: BillWithStatus): BillRowDescription => {
      const frequency = getFrequencyLabel(bill);
      return {
        meta: t(frequency.key, { count: frequency.count }),
        amount: formatCurrency(bill.amount),
        sub: `${formatCurrency(bill.monthlyEquivalent)} ${t("bills.perMonthShort")}`,
      };
    });

  const head = summary ?? { left: t("bills.billsInCategory", { count: bills.length }), right: t("bills.perYearShort", { amount: formatCurrency(yearlyAmount) }) };

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
          <span>{head.left}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: head.tone, fontWeight: head.tone ? 600 : undefined }}>{head.right}</span>
        </div>

        {bills.map((bill) => {
          const row = describe(bill);
          return (
            // Straight through to the bill itself: having found the €140 line
            // you did not recognise, the next thing you want is to open it.
            <button key={bill.id} type="button" className={styles.categoryBillRow} onClick={() => onOpenBill(bill)}>
              <span className={styles.categoryBillName}>
                <span className={styles.categoryBillTitle}>{bill.name}</span>
                <span className={styles.categoryBillMeta} style={{ color: row.tone }}>
                  {row.meta}
                </span>
              </span>
              <span className={styles.categoryBillAmount}>
                <span style={{ color: row.tone }}>{row.amount}</span>
                <span className={styles.categoryBillMeta}>{row.sub}</span>
              </span>
            </button>
          );
        })}
      </ModalBody>
    </Modal>
  );
}

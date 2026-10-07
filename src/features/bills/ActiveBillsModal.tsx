import { Badge, Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { cadenceTone, getFrequencyLabel, groupByCadence } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import styles from "./css/BillsPage.module.css";

interface ActiveBillsModalProps {
  isOpen: boolean;
  bills: BillWithStatus[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onOpenBill: (bill: BillWithStatus) => void;
}

/**
 * Every active bill, as small cards grouped by how often they come — every
 * month, every two, every three, … every year — shortest cycle first.
 *
 * Each group is headed by a chip saying how often; a card under it is the
 * name and a chip of what it costs. As many cards to a row as fit, so a dozen
 * monthly subscriptions read as one block rather than a long list. A card
 * opens the bill itself.
 */
export default function ActiveBillsModal({ isOpen, bills, formatCurrency, onClose, onOpenBill }: ActiveBillsModalProps) {
  const { t } = useTranslation();
  const yearly = bills.reduce((sum, b) => sum + b.monthlyEquivalent * 12, 0);

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered scrollable size="lg">
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2" style={{ fontSize: 15 }}>
          <span aria-hidden>🧾</span>
          {t("bills.activeBillsTitle")}
        </span>
      </ModalHeader>

      <ModalBody className="pt-2">
        <div className="d-flex justify-content-between align-items-baseline mb-3 small text-body-secondary">
          <span>{t("bills.billsInCategory", { count: bills.length })}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{t("bills.perYearShort", { amount: formatCurrency(yearly) })}</span>
        </div>

        {groupByCadence(bills).map((group) => {
          const tone = cadenceTone(group.bills[0]);
          const freq = getFrequencyLabel(group.bills[0]);
          const cadence = t(freq.key, { count: freq.count });
          const perMonth = group.bills.reduce((sum, b) => sum + b.monthlyEquivalent, 0);

          return (
            <section key={group.key} className="mb-3" aria-label={cadence}>
              {/* How often, once, as a chip over its cards: the cards themselves only say what each costs. */}
              <div className="d-flex align-items-center gap-2">
                <Badge pill color={`${tone}-subtle`} className={`text-${tone}-emphasis border border-${tone}-subtle ${styles.cadenceChip}`}>
                  {cadence} · {group.bills.length}
                </Badge>
                <span className="ms-auto small text-body-secondary" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrency(perMonth)} {t("bills.perMonthShort")}
                </span>
              </div>

              <div className={styles.activeCards}>
                {group.bills.map((bill) => (
                  <button key={bill.id} type="button" className={styles.activeCard} onClick={() => onOpenBill(bill)}>
                    <span className={styles.activeCardName}>{bill.name}</span>
                    <Badge pill color="light" className={`text-body border ${styles.activeCardChip}`}>
                      {bill.isVariableAmount ? "~" : ""}
                      {formatCurrency(bill.amount)}
                    </Badge>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </ModalBody>
    </Modal>
  );
}

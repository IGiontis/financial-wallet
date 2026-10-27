import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../../../shared/types/IndexTypes";
import type { LedgerCategory } from "../ledger";
import styles from "../pages/css/Ledger.module.css";

interface LedgerCategoryModalProps {
  icon: string;
  name: string;
  entry: LedgerCategory;
  /** The stretch it covers, as the page heads it — «Οκτώβριος 2026». */
  period: string;
  /** The figures' colour: money out or money in. */
  tone: string;
  formatCurrency: (n: number) => string;
  dayFmt: Intl.DateTimeFormat;
  cardOf: (tx: Transaction) => string | undefined;
  onOpen: (tx: Transaction) => void;
  onClose: () => void;
}

/**
 * One line of «Πού πήγαν» / «Από πού ήρθαν», opened out: the records that make
 * up its total, newest first, under the page's own filters. The total is the
 * line's own, so what the list adds up to is what the bar said.
 */
export default function LedgerCategoryModal({ icon, name, entry, period, tone, formatCurrency, dayFmt, cardOf, onOpen, onClose }: LedgerCategoryModalProps) {
  const { t } = useTranslation();
  return (
    <Modal isOpen toggle={onClose} centered scrollable size="sm">
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2">
          <span aria-hidden>{icon}</span>
          {name}
        </span>
      </ModalHeader>
      <ModalBody className="pt-2">
        <div className={styles.catModalHead}>
          <span>
            {t("ledger.count", { count: entry.count })} · {period}
          </span>
          <strong style={{ color: tone }}>{formatCurrency(entry.amount)}</strong>
        </div>
        <div className={styles.catModalList}>
          {entry.rows.map((r) => {
            const card = cardOf(r.tx);
            return (
              // Straight on to the record itself, as a row of the list does.
              <button key={r.tx.id} type="button" className={`${styles.row} ${styles.rowDated}`} onClick={() => onOpen(r.tx)}>
                <span className={styles.time}>{dayFmt.format(r.date)}</span>
                <span className={styles.what}>
                  <span className={styles.desc}>{r.tx.description || name}</span>
                  {card && (
                    <span className={styles.meta}>
                      <span className={styles.card}>{card}</span>
                    </span>
                  )}
                </span>
                <span className={styles.amount} style={{ color: tone }}>
                  {formatCurrency(r.amount)}
                </span>
              </button>
            );
          })}
        </div>
      </ModalBody>
    </Modal>
  );
}

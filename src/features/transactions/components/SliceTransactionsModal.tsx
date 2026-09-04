import { useState } from "react";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { firestoreToDate } from "../../../shared/utils/dates";
import type { Transaction } from "../../../shared/types/IndexTypes";
import styles from "./css/TransactionInsights.module.css";

interface SliceTransactionsModalProps {
  /** Null closes it. */
  title: string | null;
  transactions: Transaction[];
  total: number;
  formatCurrency: (n: number) => string;
  locale: string;
  onClose: () => void;
}

/**
 * The rows behind one slice of the ring.
 *
 * Opening the list here rather than sending the reader to the Transactions
 * screen keeps the question and the answer in the same place: they asked what
 * is in this slice, not to go somewhere else and re-find it. A row expands in
 * place, because the follow-up is nearly always "what was that one" rather than
 * "let me edit it".
 */
export default function SliceTransactionsModal({ title, transactions, total, formatCurrency, locale, onClose }: SliceTransactionsModalProps) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <Modal isOpen={title !== null} toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{title}</span>
      </ModalHeader>

      <ModalBody className="pt-2">
        <div className="d-flex justify-content-between align-items-baseline mb-2" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span>{t("transactions.transactionCount", { count: transactions.length })}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{formatCurrency(total)}</span>
        </div>

        {transactions.map((tx) => {
          const expanded = openId === tx.id;
          return (
            <div key={tx.id} className={styles.sliceRow}>
              <button type="button" className={styles.sliceRowHead} onClick={() => setOpenId(expanded ? null : tx.id)} aria-expanded={expanded}>
                {expanded ? <FiChevronDown size={13} className="flex-shrink-0" /> : <FiChevronRight size={13} className="flex-shrink-0" />}
                <span className={styles.sliceRowName}>
                  <span className={styles.sliceRowTitle}>{tx.description}</span>
                  <span className={styles.sliceRowDate}>{dateFmt.format(firestoreToDate(tx.date))}</span>
                </span>
                <span className={styles.sliceRowAmount}>{formatCurrency(Math.abs(tx.amount))}</span>
              </button>

              {expanded && (
                <dl className={styles.sliceDetail}>
                  <dt>{t("common.date")}</dt>
                  <dd>{dateFmt.format(firestoreToDate(tx.date))}</dd>
                  <dt>{t("transactions.payee")}</dt>
                  <dd>{tx.description}</dd>
                  <dt>{t("common.amount")}</dt>
                  <dd>{formatCurrency(Math.abs(tx.amount))}</dd>
                  {tx.notes && (
                    <>
                      <dt>{t("common.notes")}</dt>
                      <dd>{tx.notes}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          );
        })}
      </ModalBody>
    </Modal>
  );
}

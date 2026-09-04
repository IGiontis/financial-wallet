import { useMemo, useState } from "react";
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
  /** What a row was filed under, so a nameless slice can still say what is in it. */
  categoryFor?: (tx: Transaction) => { icon: string; name: string };
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
export default function SliceTransactionsModal({ title, transactions, total, categoryFor, formatCurrency, locale, onClose }: SliceTransactionsModalProps) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  // Only worth drawing when the slice holds more than one category — for a
  // named slice it would just repeat the title back with the same total.
  const breakdown = useMemo(() => {
    if (!categoryFor) return [];
    const byName = new Map<string, { icon: string; name: string; amount: number; count: number }>();
    for (const tx of transactions) {
      const { icon, name } = categoryFor(tx);
      const entry = byName.get(name) ?? { icon, name, amount: 0, count: 0 };
      entry.amount += Math.abs(tx.amount);
      entry.count += 1;
      byName.set(name, entry);
    }
    const rows = Array.from(byName.values()).sort((a, b) => b.amount - a.amount);
    return rows.length > 1 ? rows : [];
  }, [transactions, categoryFor]);

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

        {breakdown.length > 0 && (
          <div className={styles.sliceBreakdown}>
            <span className={styles.sliceBreakdownTitle}>{t("transactions.insideOther")}</span>
            {breakdown.map((row) => (
              <div key={row.name} className={styles.sliceBreakdownRow}>
                <span className={styles.sliceBreakdownName}>
                  <span aria-hidden>{row.icon}</span> {row.name}
                </span>
                <span className={styles.sliceBreakdownAmount}>{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {transactions.map((tx) => {
          const expanded = openId === tx.id;
          const category = categoryFor?.(tx);
          return (
            <div key={tx.id} className={styles.sliceRow}>
              <button type="button" className={styles.sliceRowHead} onClick={() => setOpenId(expanded ? null : tx.id)} aria-expanded={expanded}>
                {expanded ? <FiChevronDown size={13} className="flex-shrink-0" /> : <FiChevronRight size={13} className="flex-shrink-0" />}
                <span className={styles.sliceRowName}>
                  <span className={styles.sliceRowTitle}>{tx.description}</span>
                  {/* The category rides on the date line rather than taking one
                      of its own: two lines is the height the row already is. */}
                  <span className={styles.sliceRowDate}>
                    {dateFmt.format(firestoreToDate(tx.date))}
                    {category && (
                      <>
                        {" · "}
                        <span aria-hidden>{category.icon}</span> {category.name}
                      </>
                    )}
                  </span>
                </span>
                <span className={styles.sliceRowAmount}>{formatCurrency(Math.abs(tx.amount))}</span>
              </button>

              {expanded && (
                <dl className={styles.sliceDetail}>
                  {category && (
                    <>
                      <dt>{t("common.category")}</dt>
                      <dd>
                        <span aria-hidden>{category.icon}</span> {category.name}
                      </dd>
                    </>
                  )}
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

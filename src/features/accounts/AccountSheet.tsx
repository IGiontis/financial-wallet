import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2 } from "react-icons/fi";

import { firestoreToDate } from "../../shared/utils/dates";
import { isAfterReading } from "../../shared/utils/balance";
import type { Transaction } from "../../shared/types/IndexTypes";
import { BankCard } from "./BankCard";
import type { CardColor } from "./accountTones";
import type { MoneyAccount } from "./accountsUtils";
import styles from "./css/AccountsPage.module.css";
import { DeleteButton } from "../../shared/components/DeleteButton";

const SHOWN = 25;

/**
 * One card, opened: what it holds, what it held at the last reading, and the
 * records made with it — newest first, with the reading marked where it falls,
 * so what has moved it since is plain to see.
 */
export default function AccountSheet({
  account,
  finish,
  holds,
  isMain,
  readAt,
  readAmount,
  movements,
  formatCurrency,
  dateFmt,
  onEdit,
  onDelete,
  deleteLocked,
  onClose,
}: {
  account: MoneyAccount;
  finish: CardColor | "cash";
  holds: number;
  isMain: boolean;
  readAt?: Date;
  readAmount?: number;
  /** The records that count against this account, any order. */
  movements: Transaction[];
  formatCurrency: (n: number) => string;
  dateFmt: Intl.DateTimeFormat;
  onEdit: () => void;
  onDelete: () => void;
  deleteLocked: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sorted = [...movements].sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime() || firestoreToDate(b.createdAt).getTime() - firestoreToDate(a.createdAt).getTime());
  const shown = sorted.slice(0, SHOWN);
  const signed = (tx: Transaction) => (tx.type === "income" || tx.contributionType === "withdrawal" ? tx.amount : -tx.amount);
  const since = readAt ? sorted.filter((tx) => isAfterReading(tx, readAt)) : [];
  const sinceNet = Math.round(since.reduce((sum, tx) => sum + signed(tx), 0) * 100) / 100;

  // Where the reading falls in the list: after the last record newer than it.
  const markerAt = readAt ? shown.findIndex((tx) => !isAfterReading(tx, readAt)) : -1;
  const marker = readAt && readAmount !== undefined && (
    <div className={styles.readingMark} key="reading">
      <span>{t("accounts.readingMark", { date: dateFmt.format(readAt) })}</span>
      <span className="fw-semibold">{formatCurrency(readAmount)}</span>
    </div>
  );

  return (
    <Modal isOpen toggle={onClose} centered scrollable fullscreen="sm">
      <ModalHeader toggle={onClose}>{account.name}</ModalHeader>
      <ModalBody>
        <div style={{ maxWidth: 240 }} className="mx-auto mb-3">
          <BankCard name={account.name} kind={account.kind} finish={finish} amount={formatCurrency(holds)} badge={isMain ? t("accounts.mainShort") : undefined} />
        </div>

        <dl className={styles.sum} style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <dt>{t("accounts.holdsNowLabel")}</dt>
            <dd>{formatCurrency(holds)}</dd>
          </div>
          {readAt && readAmount !== undefined && (
            <div>
              <dt>{t("accounts.atReading", { date: dateFmt.format(readAt) })}</dt>
              <dd>{formatCurrency(readAmount)}</dd>
            </div>
          )}
          {readAt && (
            <div>
              <dt>{t("accounts.movedSince", { count: since.length })}</dt>
              <dd style={{ color: sinceNet < 0 ? "var(--color-expense-text)" : sinceNet > 0 ? "var(--color-income-text)" : undefined }}>
                {sinceNet === 0 ? formatCurrency(0) : `${sinceNet > 0 ? "+" : "−"}${formatCurrency(Math.abs(sinceNet))}`}
              </dd>
            </div>
          )}
        </dl>

        <div className="small fw-semibold text-body-secondary mt-3 mb-1">{t("accounts.movementsTitle")}</div>
        {isMain && <p className="small text-body-secondary mb-2">{t("accounts.movementsMainHint")}</p>}
        {shown.length === 0 ? (
          <>
            {marker}
            <p className="small text-body-secondary mb-0">{t("accounts.noMovements")}</p>
          </>
        ) : (
          <div>
            {shown.map((tx, i) => (
              <div key={tx.id}>
                {i === markerAt && marker}
                <div className={styles.history}>
                  <span style={{ minWidth: 0 }}>
                    <span className="d-block text-truncate">{tx.description}</span>
                    <span className={styles.when}>{dateFmt.format(firestoreToDate(tx.date))}</span>
                  </span>
                  <span className="fw-semibold text-nowrap" style={{ fontVariantNumeric: "tabular-nums", color: signed(tx) > 0 ? "var(--color-income-text)" : undefined }}>
                    {signed(tx) > 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(tx.amount))}
                  </span>
                </div>
              </div>
            ))}
            {markerAt === -1 && marker}
            {sorted.length > SHOWN && <p className="small text-body-secondary mt-2 mb-0">{t("accounts.moreMovements", { count: sorted.length - SHOWN })}</p>}
          </div>
        )}
      </ModalBody>
      <ModalFooter className="justify-content-between">
        <DeleteButton opensConfirm onClick={onDelete} disabled={deleteLocked} />
        <Button color="primary" onClick={onEdit}>
          <FiEdit2 size={15} className="me-1" aria-hidden />
          {t("accounts.edit")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

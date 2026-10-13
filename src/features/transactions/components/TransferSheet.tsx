import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { firestoreToDate } from "../../../shared/utils/dates";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { formatTable } from "../transactionDates";
import styles from "./css/TransactionWizard.module.css";

/**
 * A transfer opened from the list: from, to, how much, when — and the two
 * things done to it, edit and delete, both on the pair. Its halves are never
 * offered as transactions of their own: changing one alone would leave money
 * that left one account and arrived nowhere.
 */
export default function TransferSheet({
  out,
  inn,
  formatCurrency,
  onEdit,
  onDelete,
  onClose,
}: {
  out: Transaction;
  inn?: Transaction;
  formatCurrency: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const accounts = useAccountList();
  const deleteGuard = useOfflineGuard("delete");
  const name = (id?: string) => accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <Modal isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>{t("transactions.transfer.title")}</ModalHeader>
      <ModalBody>
        <div className={styles.reviewRows}>
          <div>
            <span>{t("transactions.transfer.stepFrom")}</span>
            <strong>{name(out.accountId)}</strong>
          </div>
          <div>
            <span>{t("transactions.transfer.stepTo")}</span>
            <strong>{name(inn?.accountId)}</strong>
          </div>
          <div>
            <span>{t("common.amount")}</span>
            <strong>{formatCurrency(out.amount)}</strong>
          </div>
          <div>
            <span>{t("common.date")}</span>
            <strong>{formatTable(firestoreToDate(out.date), i18n.resolvedLanguage ?? "en")}</strong>
          </div>
          {out.notes && (
            <div>
              <span>{t("transactions.transfer.note")}</span>
              <strong>{out.notes}</strong>
            </div>
          )}
        </div>
        <p className="small text-body-secondary mt-3 mb-0">{t("transactions.transfer.neither")}</p>
      </ModalBody>
      <ModalFooter className="justify-content-between">
        {/* Asks first, as every delete does, and takes both halves. */}
        <DeleteButton iconOnly onClick={onDelete} what={out.description} disabled={deleteGuard.locked} title={deleteGuard.reason} />
        <Button color="primary" onClick={onEdit}>
          {t("common.edit")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

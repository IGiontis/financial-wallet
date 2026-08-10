import { useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, InputGroup, FormFeedback } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiTrash2, FiPlus, FiCheck, FiX } from "react-icons/fi";
import { validatePayee, MAX_PAYEE_LENGTH, type PayeeError } from "../payeeStore";
import styles from "./css/ManagePayeesModal.module.css";

const ERROR_KEY: Record<PayeeError, string> = {
  empty: "validation.nameRequired",
  duplicate: "transactions.payeeExists",
  tooLong: "validation.maxChars",
};

interface ManagePayeesModalProps {
  payees: string[];
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
  onRename: (from: string, to: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
}

/**
 * Add, rename and delete saved payees. Editing happens inline on each row so
 * the list stays visible — a second dialog on top of this one (which is itself
 * opened from the transaction form) would be three layers deep.
 */
export default function ManagePayeesModal({ payees, onClose, onAdd, onRename, onRemove }: ManagePayeesModalProps) {
  const { t } = useTranslation();

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addError = draft.trim() ? validatePayee(payees, draft) : undefined;
  const editError = editing && editValue.trim() ? validatePayee(payees, editValue, editing) : undefined;

  const errorText = (error: PayeeError | undefined) => (error ? t(ERROR_KEY[error], { count: MAX_PAYEE_LENGTH }) : undefined);

  const run = async (action: () => Promise<void>, after: () => void) => {
    setBusy(true);
    try {
      await action();
      after();
    } catch {
      // usePayees already rolled the list back; leaving the field as-is lets
      // the user retry without retyping.
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = () => {
    if (!draft.trim() || addError || busy) return;
    run(() => onAdd(draft), () => setDraft(""));
  };

  const submitRename = () => {
    if (!editing || !editValue.trim() || editError || busy) return;
    const from = editing;
    run(() => onRename(from, editValue), () => setEditing(null));
  };

  return (
    <Modal isOpen toggle={onClose} centered size="md" scrollable zIndex={1070}>
      <ModalHeader toggle={onClose}>{t("transactions.managePayees")}</ModalHeader>

      <ModalBody>
        {/* ── Add ── */}
        <InputGroup>
          <Input
            value={draft}
            placeholder={t("transactions.newPayeePlaceholder")}
            maxLength={MAX_PAYEE_LENGTH + 1}
            invalid={!!addError}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitAdd();
              }
            }}
          />
          <Button color="primary" onClick={submitAdd} disabled={!draft.trim() || !!addError || busy}>
            <FiPlus size={15} className="me-1" />
            {t("transactions.addPayee")}
          </Button>
          <FormFeedback>{errorText(addError)}</FormFeedback>
        </InputGroup>

        <p className="text-body-secondary mt-2 mb-3" style={{ fontSize: 11.5 }}>
          {t("transactions.managePayeesHint")}
        </p>

        {/* ── List ── */}
        {payees.length === 0 ? (
          <p className="text-body-secondary text-center mb-0 py-4" style={{ fontSize: 13 }}>
            {t("transactions.noSavedPayeesYet")}
          </p>
        ) : (
          <div className="d-flex flex-column gap-1">
            {payees.map((name) => {
              const isEditing = editing === name;
              const isConfirming = confirmDelete === name;

              if (isEditing) {
                return (
                  <div key={name} className={styles.row}>
                    <Input
                      autoFocus
                      bsSize="sm"
                      value={editValue}
                      maxLength={MAX_PAYEE_LENGTH + 1}
                      invalid={!!editError}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitRename();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditing(null);
                        }
                      }}
                    />
                    <Button color="success" size="sm" onClick={submitRename} disabled={!editValue.trim() || !!editError || busy} aria-label={t("common.save")}>
                      <FiCheck size={14} />
                    </Button>
                    <Button color="secondary" outline size="sm" onClick={() => setEditing(null)} aria-label={t("common.cancel")}>
                      <FiX size={14} />
                    </Button>
                    {editError && <span className={styles.rowError}>{errorText(editError)}</span>}
                  </div>
                );
              }

              if (isConfirming) {
                return (
                  <div key={name} className={`${styles.row} ${styles.rowDanger}`}>
                    <span className={styles.name}>{t("transactions.deletePayeeConfirm", { name })}</span>
                    <Button color="danger" size="sm" onClick={() => run(() => onRemove(name), () => setConfirmDelete(null))} disabled={busy}>
                      {t("common.delete")}
                    </Button>
                    <Button color="secondary" outline size="sm" onClick={() => setConfirmDelete(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                );
              }

              return (
                <div key={name} className={styles.row}>
                  <span className={styles.name}>{name}</span>
                  <Button
                    color="light"
                    size="sm"
                    aria-label={t("transactions.renamePayee", { name })}
                    title={t("common.edit")}
                    onClick={() => {
                      setConfirmDelete(null);
                      setEditing(name);
                      setEditValue(name);
                    }}
                  >
                    <FiEdit2 size={13} />
                  </Button>
                  <Button
                    color="light"
                    size="sm"
                    className="text-danger"
                    aria-label={t("transactions.deletePayee", { name })}
                    title={t("common.delete")}
                    onClick={() => {
                      setEditing(null);
                      setConfirmDelete(name);
                    }}
                  >
                    <FiTrash2 size={13} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

import type { ReactNode } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";

// The "are you sure?" step in front of anything on this page that cannot be
// taken back from here: deleting an income, and undoing an «Ήρθε» — which
// deletes its transaction. The same small sheet the Bills and Transactions
// pages put in front of their deletes.

export function ConfirmSheet({
  title,
  body,
  hint,
  confirmLabel,
  lockedReason,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  hint?: ReactNode;
  confirmLabel: string;
  /** Set while the action waits for a connection — see `useOfflineGuard`. */
  lockedReason?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>{title}</ModalHeader>
      <ModalBody>
        <p className="mb-0" style={{ fontSize: 14 }}>
          {body}
        </p>
        {hint && (
          <p className="mb-0 mt-2 text-body-secondary" style={{ fontSize: 12.5 }}>
            {hint}
          </p>
        )}
        {lockedReason && (
          <p className="mb-0 mt-2 text-body-secondary" style={{ fontSize: 12 }}>
            {lockedReason}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button color="danger" onClick={onConfirm} disabled={!!lockedReason}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

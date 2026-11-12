import type { ReactNode } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useRunOnce } from "../../../shared/hooks/useRunOnce";

// The "are you sure?" step in front of anything on this page that cannot be
// taken back from here: deleting an income, and undoing an «Ήρθε» — which
// deletes its transaction. The same small sheet the Bills and Transactions
// pages put in front of their deletes.
//
// It runs once: when `onConfirm` returns the action's promise, until that
// answers the confirm says `busyLabel` («Διαγραφή…» unless told) and nothing in
// the sheet can be pressed or closed (`useRunOnce`). The handler reports the
// result (toast) and closes the sheet.

export function ConfirmSheet({
  title,
  body,
  hint,
  confirmLabel,
  lockedReason,
  onConfirm,
  onClose,
  busyLabel,
}: {
  title: string;
  body: ReactNode;
  hint?: ReactNode;
  confirmLabel: string;
  /** Set while the action waits for a connection — see `useOfflineGuard`. */
  lockedReason?: string;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
  /** What the confirm says while the action runs; «Διαγραφή…» unless told. */
  busyLabel?: string;
}) {
  const { t } = useTranslation();
  const [run, running] = useRunOnce();
  const close = () => {
    if (!running) onClose();
  };
  return (
    <Modal isOpen toggle={close} centered size="sm" backdrop={running ? "static" : true} keyboard={!running}>
      <ModalHeader toggle={running ? undefined : close}>{title}</ModalHeader>
      <ModalBody>
        <p className="mb-0" style={{ fontSize: "var(--fs-lead)" }}>
          {body}
        </p>
        {hint && (
          <p className="mb-0 mt-2 text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
            {hint}
          </p>
        )}
        {lockedReason && (
          <p className="mb-0 mt-2 text-body-secondary" style={{ fontSize: "var(--fs-small)" }}>
            {lockedReason}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={close} disabled={running}>
          {t("common.cancel")}
        </Button>
        <Button
          color="danger"
          onClick={() => void run(onConfirm)}
          disabled={!!lockedReason || running}
          aria-busy={running || undefined}
        >
          {running ? (busyLabel ?? t("common.deleting")) : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

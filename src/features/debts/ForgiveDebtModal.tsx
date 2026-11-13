import { useState } from "react";
import { Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiGift } from "react-icons/fi";
import { DateField } from "../../shared/components/DateField";
import { parseISODay, toISODay } from "../../shared/utils/dates";
import { forgiveness } from "./debtsUtils";
import { useUpdateDebt } from "./useDebts";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";
import { FORM_MODAL } from "../../shared/components/formModal";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { toast } from "react-toastify";

const NOTE_MAX = 200;

/**
 * «Χαρίστηκε» — a debt let go of, rather than deleted.
 *
 * What is still owed is forgiven whole: the payments already made stay as they
 * were, and the rest is written on the debt with the day and, if given, why.
 * No card moves — nothing was paid and nothing received — and the debt stays in
 * the list with its history, closed. Taken back from the same sheet if it was a
 * mistake.
 */
export function ForgiveDebtModal({ debt, formatCurrency, onClose }: { debt: DebtWithStatus; formatCurrency: (n: number) => string; onClose: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateDebt();
  const [date, setDate] = useState(() => toISODay(new Date()));
  const [note, setNote] = useState("");
  const borrowed = debt.direction === "owed_by_me";
  const when = parseISODay(date);
  const values = { amount: formatCurrency(debt.remaining), who: debt.person };

  // Runs once and never waits for the server (`saveWithoutWaiting`): the debt
  // reads as forgiven at once, the dialog closes with the toast; a refusal
  // puts it back and `useUpdateDebt` says so.
  const [run, running] = useRunOnce();
  const working = running;
  const close = () => {
    if (!working) onClose();
  };
  const save = () =>
    run(() => {
      if (!when) return;
      void saveWithoutWaiting(update, { debtId: debt.id, data: { forgiven: forgiveness(debt, when, note) } }, undefined, [["debts", debt.id]]);
      toast.success(t("toasts.debtForgiven", { who: debt.person }));
      onClose();
    });

  return (
    <Modal {...FORM_MODAL} isOpen toggle={close} keyboard={!working} centered>
      <ModalHeader toggle={working ? undefined : close}>
        <span className="d-inline-flex align-items-center gap-2" style={{ fontSize: "var(--fs-lead)" }}>
          <FiGift aria-hidden /> {t("debts.forgiveTitle")}
        </span>
      </ModalHeader>
      <ModalBody>
        <p className="mb-3" style={{ fontSize: "var(--fs-lead)" }}>
          {t(borrowed ? "debts.forgiveTheyLetGo" : "debts.forgiveILetGo", values)}
        </p>

        <FormGroup>
          <Label className="small fw-medium" for="forgive-date">
            {t("debts.forgiveDate")}
            <RequiredMark />
          </Label>
          <DateField id="forgive-date" name="forgive-date" value={date} onChange={setDate} />
        </FormGroup>

        <FormGroup className="mb-3">
          <Label className="small fw-medium" for="forgive-note">
            {t("debts.forgiveNote")}
          </Label>
          <Input id="forgive-note" type="textarea" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("debts.forgiveNotePlaceholder")} />
        </FormGroup>

        {/* What it does, said before it is done. */}
        <ul className="small text-body-secondary mb-0 ps-3">
          <li>{t("debts.forgiveNoMoney")}</li>
          <li>{t("debts.forgiveStays")}</li>
        </ul>
      </ModalBody>
      <ModalFooter className="justify-content-between">
        <Button color="secondary" outline onClick={close} disabled={working}>
          {t("common.cancel")}
        </Button>
        <Button color="primary" onClick={() => void save()} disabled={!when || working} aria-busy={working || undefined}>
          <FiGift size={14} aria-hidden /> {working ? t("common.saving") : t("debts.forgiveConfirm", values)}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ForgiveDebtModal;

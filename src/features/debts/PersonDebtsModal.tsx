import { useState } from "react";
import { Button, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { firestoreToDate } from "../../shared/utils/dates";
import { useDeleteDebt, useDeleteRepayment, useRecordRepayment } from "./useDebts";
import styles from "./css/DebtsPage.module.css";
import type { DebtPerson, DebtWithStatus } from "../../shared/types/IndexTypes";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * One person's record: every loan with them and every repayment against it.
 *
 * Loans stay separate rather than collapsing into a single balance, because
 * that is what keeping a record means — two hundred in March for the rent and
 * fifty in May are two things you will want to recognise later, even though the
 * total is all you check day to day.
 */
export default function PersonDebtsModal({
  person,
  formatCurrency,
  locale,
  onClose,
}: {
  person: DebtPerson;
  formatCurrency: (n: number) => string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const record = useRecordRepayment();
  const removeRepayment = useDeleteRepayment();
  const removeDebt = useDeleteDebt();

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [deleting, setDeleting] = useState<DebtWithStatus | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  const openRepay = (debt: DebtWithStatus) => {
    setPayingId(debt.id);
    // Pre-filled with what is left: settling in full is the common case, and a
    // part payment is one edit away from there.
    setPayAmount(String(debt.remaining));
    setPayDate(today());
  };

  const submitRepay = (debt: DebtWithStatus) => {
    const value = parseFloat(payAmount);
    if (!Number.isFinite(value) || value <= 0) return;
    record.mutate({ debtId: debt.id, amount: value, date: new Date(payDate) }, { onSuccess: () => setPayingId(null) });
  };

  const headline =
    person.owedByMe > 0 && person.owedToMe > 0
      ? t("debts.bothWays", { out: formatCurrency(person.owedByMe), in: formatCurrency(person.owedToMe) })
      : person.owedByMe > 0
        ? t("debts.youOweAmount", { amount: formatCurrency(person.owedByMe) })
        : person.owedToMe > 0
          ? t("debts.owesYouAmount", { amount: formatCurrency(person.owedToMe) })
          : t("debts.settledUp");

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{person.person}</span>
      </ModalHeader>

      <ModalBody className="pt-2">
        <div
          className="mb-3 fw-semibold"
          style={{ fontSize: 14, color: person.owedByMe > 0 ? "var(--color-expense)" : person.owedToMe > 0 ? "var(--color-income)" : undefined }}
        >
          {headline}
        </div>

        {person.debts.map((debt) => {
          const progress = debt.amount > 0 ? Math.min((debt.paid / debt.amount) * 100, 100) : 0;

          return (
            <div key={debt.id} className={styles.loan}>
              <div className={styles.loanHead}>
                <span>{debt.label || t(debt.direction === "owed_by_me" ? "debts.iBorrowed" : "debts.iLent")}</span>
                <span>
                  {debt.isSettled ? <span className={styles.settledTag}>{t("debts.settled")}</span> : t("debts.remaining", { amount: formatCurrency(debt.remaining) })}
                </span>
              </div>

              <div className={styles.loanMeta}>
                {dateFmt.format(firestoreToDate(debt.date))} ·{" "}
                {t(debt.direction === "owed_by_me" ? "debts.tookAmount" : "debts.gaveAmount", { amount: formatCurrency(debt.amount) })}
                {debt.dueDate ? ` · ${t("debts.dueBy", { date: dateFmt.format(firestoreToDate(debt.dueDate)) })}` : ""}
              </div>

              <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${progress}%` }} />
              </div>

              {debt.payments.map((p) => (
                <div key={p.id} className={styles.repayment}>
                  <span>
                    {dateFmt.format(firestoreToDate(p.date))} · {t(debt.direction === "owed_by_me" ? "debts.paidBack" : "debts.gotBack")}
                  </span>
                  <span className="d-flex align-items-center gap-1">
                    {formatCurrency(p.amount)}
                    <button type="button" className={styles.repaymentRemove} onClick={() => removeRepayment.mutate(p.id)} aria-label={t("common.delete")}>
                      <FiX size={13} />
                    </button>
                  </span>
                </div>
              ))}

              {payingId === debt.id ? (
                <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                  <InputGroup size="sm" style={{ width: 150 }}>
                    <Input
                      autoFocus
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      aria-label={t("common.amount")}
                    />
                    <InputGroupText>{t("debts.of", { amount: formatCurrency(debt.remaining) })}</InputGroupText>
                  </InputGroup>
                  <Input type="date" bsSize="sm" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ width: 145 }} aria-label={t("debts.when")} />
                  <Button color="primary" size="sm" onClick={() => submitRepay(debt)} disabled={record.isPending}>
                    {t("common.save")}
                  </Button>
                  <Button color="secondary" outline size="sm" onClick={() => setPayingId(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="d-flex align-items-center gap-3">
                  {!debt.isSettled && (
                    <button type="button" className={styles.loanAction} onClick={() => openRepay(debt)}>
                      <FiPlus size={13} /> {t(debt.direction === "owed_by_me" ? "debts.recordPayback" : "debts.recordReceipt")}
                    </button>
                  )}
                  <button type="button" className={styles.loanAction} style={{ color: "var(--color-expense)" }} onClick={() => setDeleting(debt)}>
                    <FiTrash2 size={13} /> {t("common.delete")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </ModalBody>

      {deleting && (
        <Modal isOpen toggle={() => setDeleting(null)} centered size="sm">
          <ModalHeader toggle={() => setDeleting(null)}>{t("debts.deleteLoan")}</ModalHeader>
          <ModalBody>
            <p className="mb-0" style={{ fontSize: 14 }}>
              {t("debts.deleteLoanConfirm")}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" outline onClick={() => setDeleting(null)} disabled={removeDebt.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              color="danger"
              disabled={removeDebt.isPending}
              onClick={() => removeDebt.mutate({ debtId: deleting.id, paymentIds: deleting.payments.map((p) => p.id) }, { onSuccess: () => setDeleting(null) })}
            >
              {removeDebt.isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </Modal>
  );
}

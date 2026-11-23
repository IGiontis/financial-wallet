import { useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { DialogFooter } from "../../shared/components/DialogFooter";
import { moneyToneHead } from "../../shared/components/formModal";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiGift, FiRotateCcw } from "react-icons/fi";
import { toast } from "react-toastify";
import AddDebtModal from "./AddDebtModal";
import { ForgiveDebtModal } from "./ForgiveDebtModal";
import { CoveredLoadFailed } from "./CoveredLoadFailed";
import { useDeleteClosedDebts, useDeleteDebt, useUpdateDebt } from "./useDebts";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { closedDeletePlan } from "./debtSides";
import { useCoveredLink } from "../budget/useCoveredLink";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import styles from "./css/DebtsPage.module.css";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";

type Step = "menu" | "edit" | "forgive" | "delete";

/**
 * «Ενέργειες» for one debt — ONE dialog, its forms steps inside it (owner,
 * 2026-11-16: never a dialog on a dialog). The menu: change the debt («Αλλαγή
 * στοιχείων», the loan wizard), let it go («Χαρίστηκε…»), take that back, and
 * delete it far left. Each form's Cancel / ‹ Πίσω comes back to the menu;
 * a save closes the sheet with its toast.
 *
 * Archive needs nothing here: a settled, forgiven or cancelled debt is in the
 * archive by itself (no stored flag, so no manual «Στο αρχείο»).
 */
export function DebtActionsSheet({
  debt,
  knownPeople,
  formatCurrency,
  onClose,
  onRenamed,
  onDeleted,
}: {
  debt: DebtWithStatus;
  knownPeople: string[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
  /** A change saved under another name — the page it was on is that person's no more. */
  onRenamed?: (person: string) => void;
  /** The debt is gone (the page it was on may have nothing left). */
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("menu");
  const deleteGuard = useOfflineGuard("delete");
  const removeDebt = useDeleteDebt();
  // A closed debt is the archive's: deleted, its money stays in Συναλλαγές
  // (owner, 2026-11-17). An open one — typed by mistake — goes with its money, as before.
  const removeClosed = useDeleteClosedDebts();
  const { data: transactions = [] } = useTransactions();
  const keeps = debt.isSettled;
  const plan = closedDeletePlan([debt], transactions);
  const unforgive = useUpdateDebt();
  const [runRemove, removing] = useRunOnce();
  const [runUnforgive, unforgiving] = useRunOnce();
  // A debt that paid part of a goal takes the goal's deposit and its expense
  // with it — said in the question, and only what is still there.
  const deletingLink = useCoveredLink(step === "delete" && !keeps ? debt : null);
  const name = debt.label || t(debt.direction === "owed_by_me" ? "debts.iBorrowed" : "debts.iLent");

  /** Back to the menu — never while the delete is answering. */
  const toMenu = () => {
    if (!removing) setStep("menu");
  };
  const close = () => {
    if (!removing) onClose();
  };
  const form = step !== "menu";

  const content = (() => {
    if (step === "edit") {
      return (
        <AddDebtModal
          embedded
          debt={debt}
          knownPeople={knownPeople}
          onClose={toMenu}
          onSaved={({ person }) => {
            onClose();
            if (person.trim() !== debt.person.trim()) onRenamed?.(person);
          }}
          // The wizard's bin hands over to the delete step, which says what
          // goes with a loan that paid part of a goal.
          onDelete={() => setStep("delete")}
          deleteLocked={deleteGuard.locked}
          deleteReason={deleteGuard.reason}
        />
      );
    }
    if (step === "forgive") return <ForgiveDebtModal embedded debt={debt} formatCurrency={formatCurrency} onClose={toMenu} onSaved={onClose} />;
    if (step === "delete") {
      return (
        <>
          <ModalHeader toggle={removing ? undefined : toMenu}>{t("debts.deleteLoan")}</ModalHeader>
          {keeps ? (
            <ModalBody>
              <p className="mb-0" style={{ fontSize: "var(--fs-lead)" }}>
                {t("debts.archiveDeleteBody", { count: 1, repayments: plan.repayments })}
              </p>
              <p className="mb-0 mt-2 text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
                {t("debts.archiveDeleteKeeps", { count: plan.keptMoney })}
                {plan.covered > 0 && <span className="d-block mt-1">{t("debts.archiveDeleteCovered", { count: 1 })}</span>}
              </p>
            </ModalBody>
          ) : (
            <ModalBody>
              <p className="mb-0" style={{ fontSize: "var(--fs-lead)" }}>
                {t("debts.deleteLoanConfirm")}
              </p>
              {deletingLink.link?.contribution && (
                <p className="mb-0 mt-2" style={{ fontSize: "var(--fs-lead)" }}>
                  {t("debts.deleteCoveredDeposit", { amount: formatCurrency(deletingLink.link.contribution.amount), goal: deletingLink.goalName || debt.label || "" })}
                </p>
              )}
              {deletingLink.failed && <CoveredLoadFailed onRetry={deletingLink.retry} />}
              {deletingLink.link?.expense && (
                <p className="mb-0 mt-2" style={{ fontSize: "var(--fs-lead)" }}>
                  {t("debts.deleteCoveredExpense", { amount: formatCurrency(deletingLink.link.expense.amount) })}
                </p>
              )}
            </ModalBody>
          )}
          <ModalFooter>
            <Button color="secondary" outline onClick={toMenu} disabled={removing}>
              {t("common.cancel")}
            </Button>
            <Button
              color="danger"
              disabled={removing || deleteGuard.locked || (!keeps && !deletingLink.ready)}
              aria-busy={removing || undefined}
              title={deleteGuard.reason}
              onClick={() =>
                // Online only: waits for the answer, 7 s at most (`answerOrLetGo`). A
                // failure is said by `useDeleteDebt`; the debt stays on screen.
                void runRemove(() =>
                  keeps
                    ? answerOrLetGo(() => removeClosed.mutateAsync([debt.id]), {
                        records: [["debts", debt.id]],
                        close: onClose,
                        succeeded: (done) => {
                          toast.success(t("debts.archiveDeleted", { count: done.debtIds.length }));
                          onDeleted?.();
                        },
                      })
                    : answerOrLetGo(
                        () =>
                          removeDebt.mutateAsync({
                            debtId: debt.id,
                            paymentIds: debt.payments.map((p) => p.id),
                            covered: { contributionId: deletingLink.link?.contribution?.id, expenseId: deletingLink.link?.expense?.id },
                          }),
                        {
                          records: [["debts", debt.id]],
                          close: onClose,
                          succeeded: () => {
                            toast.success(t("toasts.debtDeleted", { who: debt.person }));
                            onDeleted?.();
                          },
                        },
                      ),
                )
              }
            >
              {removing ? t("common.deleting") : t("common.delete")}
            </Button>
          </ModalFooter>
        </>
      );
    }
    return (
      <>
        {/* The debt's own direction on the HEADER (rule 15a). */}
        <ModalHeader className={moneyToneHead(debt.direction === "owed_by_me" ? "expense" : "income")} toggle={close}>
          {t("debts.actionsTitle", { name })}
        </ModalHeader>
        <ModalBody>
          <div className={styles.actionsList}>
            <Button color="secondary" outline onClick={() => setStep("edit")}>
              <FiEdit2 size={14} aria-hidden /> {t("debts.actionEdit")}
            </Button>
            {!debt.isSettled && (
              <Button color="secondary" outline onClick={() => setStep("forgive")}>
                <FiGift size={14} aria-hidden /> {t("debts.forgiveAction")}
              </Button>
            )}
            {/* A refund went with its goal and its expense: taking it back would leave a debt for nothing. */}
            {debt.forgiven && !debt.forgiven.refund && (
              <Button
                color="secondary"
                outline
                disabled={unforgive.isPending || unforgiving}
                aria-busy={unforgiving || undefined}
                onClick={() =>
                  // An edit: on screen at once, never waiting for the server (`saveWithoutWaiting`).
                  void runUnforgive(() => {
                    void saveWithoutWaiting(unforgive, { debtId: debt.id, data: { forgiven: null } }, undefined, [["debts", debt.id]]);
                    toast.success(t("toasts.debtUnforgiven", { who: debt.person }));
                    onClose();
                  })
                }
              >
                <FiRotateCcw size={14} aria-hidden /> {unforgiving ? t("common.saving") : t("debts.unforgive")}
              </Button>
            )}
          </div>
          {/* Closed debts are the archive: there by themselves, never deleted by it. */}
          {debt.isSettled && <p className={styles.actionsNote}>{t("debts.archivedNote")}</p>}
          {deleteGuard.reason && <p className={styles.actionsNote}>{deleteGuard.reason}</p>}
        </ModalBody>
        {/* Delete far left, a rule, then the way out (rule 15b, `DialogFooter`). */}
        <DialogFooter
          remove={<DeleteButton opensConfirm wordFromSm label={t("debts.deleteLoan")} onClick={() => setStep("delete")} disabled={deleteGuard.locked} title={deleteGuard.reason} />}
          back={
            <Button color="secondary" outline onClick={close}>
              {t("common.close")}
            </Button>
          }
        />
      </>
    );
  })();

  // Forms and the question keep the form rules: no close on a tap outside. Esc
  // from a step goes back to the menu, from the menu out.
  return (
    <Modal isOpen toggle={form ? toMenu : close} backdrop={form ? "static" : true} keyboard={!removing} centered scrollable>
      {content}
    </Modal>
  );
}

export default DebtActionsSheet;

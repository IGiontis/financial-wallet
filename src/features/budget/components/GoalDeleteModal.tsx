import { useState } from "react";
import { Button, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { Trans, useTranslation } from "react-i18next";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import AccountPicker from "../../accounts/AccountPicker";
import CategoryPicker from "../../categories/CategoryPicker";
import { useCategories } from "../../transactions/hooks/useTransactions";

/** What deleting a goal with money in it means for that money. */
export interface GoalEnding {
  /** Absent: given up — the money goes back to spendable. Present: it was spent. */
  spent?: { accountId?: string; categoryId: string };
}

/**
 * Deleting a savings goal that has money in it asks what became of the money.
 *
 *   • Given up on — "I'm not doing this one after all": the money was only ever
 *     set aside in the bank, so it goes back to spendable, as if it had never
 *     been put in. Nothing else is written.
 *   • Done — the trip happened, the laptop was bought: the money has left. An
 *     expense of what the goal held is written off the card it left, then the
 *     goal goes.
 *
 * Nothing is chosen for you: deleting either way without saying which put the
 * money in the wrong place half the time.
 */
export function GoalDeleteModal({ goal, isDeleting, onConfirm, onClose }: { goal: InvestmentGoalWithStats; isDeleting: boolean; onConfirm: (ending: GoalEnding) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  const { format } = useCurrencyConverter();
  const { data: categories = [] } = useCategories();
  const held = goal.totalSaved > 0;

  const [ending, setEnding] = useState<"dropped" | "spent" | null>(held ? null : "dropped");
  const [account, setAccount] = useState("");
  const [picked, setPicked] = useState("");
  const otherExpense = categories.find((c) => c.type === "expense" && c.name === "Other Expense")?.id ?? "";
  const category = picked || otherExpense;
  const ready = ending === "dropped" || (ending === "spent" && !!category);

  return (
    <Modal isOpen toggle={onClose} centered scrollable size={held ? undefined : "sm"}>
      <ModalHeader toggle={onClose}>{t("common.delete")}</ModalHeader>
      <ModalBody>
        <p style={{ fontSize: 14, marginBottom: 8 }}>
          {/* The name goes in as an element, so whatever the user typed is never read as markup. */}
          <Trans
            i18nKey="investments.deleteConfirm"
            components={{
              name: (
                <strong>
                  {goal.icon} {goal.name}
                </strong>
              ),
            }}
          />
        </p>

        {held ? (
          <>
            <p className="fw-semibold mb-2" style={{ fontSize: 14 }}>
              {t("goalDelete.ask", { amount: format(goal.totalSaved) })}
            </p>
            <div className="d-flex flex-column gap-2" role="radiogroup" aria-label={t("goalDelete.ask", { amount: format(goal.totalSaved) })}>
              {(["dropped", "spent"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={ending === value}
                  className={`btn text-start ${ending === value ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setEnding(value)}
                >
                  <div className="fw-semibold">{t(`goalDelete.${value}`)}</div>
                  <div className="small" style={{ opacity: 0.8 }}>
                    {t(`goalDelete.${value}Hint`, { amount: format(goal.totalSaved) })}
                  </div>
                </button>
              ))}
            </div>

            {ending === "spent" && (
              <div className="mt-3">
                <Label className="small fw-medium">{t("goalDelete.leftFrom")}</Label>
                <AccountPicker value={account} onChoose={setAccount} income={false} />
                <Label className="small fw-medium mt-3">{t("common.category")}</Label>
                <CategoryPicker categories={categories} value={category} type="expense" onChange={(id) => setPicked(id)} />
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 0 }}>{t("investments.deleteWarning")}</p>
        )}

        {deleteGuard.locked && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{deleteGuard.reason}</p>}
      </ModalBody>
      <ModalFooter className="justify-content-between">
        <Button color="secondary" outline onClick={onClose} disabled={isDeleting}>
          {t("common.cancel")}
        </Button>
        <Button
          color="danger"
          disabled={isDeleting || deleteGuard.locked || !ready}
          onClick={() => onConfirm(ending === "spent" ? { spent: { accountId: account || undefined, categoryId: category } } : {})}
        >
          {isDeleting ? t("common.deleting") : t(ending === "spent" ? "goalDelete.confirmSpent" : "common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

import { useMemo, useState } from "react";
import { Button, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { Trans, useTranslation } from "react-i18next";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { categoryLabel } from "../../../shared/utils/categories";
import AccountPicker from "../../accounts/AccountPicker";
import { useMoneyAccounts } from "../../accounts/useMoneyAccounts";
import { expectedByAccount, goalHeldTotal, mainAccount } from "../../accounts/accountsUtils";
import CategoryPicker from "../../categories/CategoryPicker";
import { useCategories } from "../../transactions/hooks/useTransactions";
import wizard from "../../transactions/components/css/TransactionWizard.module.css";

/** What deleting a goal with money in it means for that money. */
export interface GoalEnding {
  /** Absent: given up — the money goes back to spendable. Present: it was spent. */
  spent?: { accountId?: string; categoryId: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deleting a savings goal that has money in it asks what became of the money,
 * then shows what will happen — and only there deletes.
 *
 *   • Given up on — "I'm not doing this one after all": the money was only ever
 *     set aside in the bank, so it goes back to spendable, as if it had never
 *     been put in. Nothing else is written.
 *   • Done — the trip happened, the laptop was bought: the money has left. An
 *     expense of what the goal held is written off the card it left, then the
 *     goal goes.
 *
 * Nothing is chosen for you, the card included: a default put the money in the
 * wrong place for exactly the case that mattered.
 */
export function GoalDeleteModal({ goal, isDeleting, onConfirm, onClose }: { goal: InvestmentGoalWithStats; isDeleting: boolean; onConfirm: (ending: GoalEnding) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  const { format } = useCurrencyConverter();
  const { data: categories = [] } = useCategories();
  const { accounts, latest, transactions } = useMoneyAccounts({ fetch: false });
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  const held = goal.totalSaved > 0;

  const [stage, setStage] = useState<"choose" | "review">(held ? "choose" : "review");
  const [ending, setEnding] = useState<"dropped" | "spent" | null>(held ? null : "dropped");
  const [account, setAccount] = useState("");
  const [cardPicked, setCardPicked] = useState(false);
  const [picked, setPicked] = useState("");
  const [changingCategory, setChangingCategory] = useState(false);
  const [tried, setTried] = useState(false);
  const otherExpense = categories.find((c) => c.type === "expense" && c.name === "Other Expense")?.id ?? "";
  const category = picked || otherExpense;
  const categoryName = category ? categoryLabel(categories.find((c) => c.id === category)?.name, t) : "—";
  const ready = ending === "dropped" || (ending === "spent" && cardPicked && !!category);

  // ── What it does, in figures ──
  const saved = goal.totalSaved;
  const named = accounts.find((a) => a.id === account);
  const main = mainAccount(accounts);
  const card = named ?? main;
  const cardName = named ? named.name : main ? t("bills.pay.mainCard", { name: main.name }) : t("accounts.noCard");
  const cardNow = card ? holds[card.id] : undefined;
  const total = round2(Object.values(holds).reduce((sum, n) => sum + n, 0));
  const spendable = round2(total - goalHeldTotal(transactions));

  const next = () => {
    setTried(true);
    if (ready) setStage("review");
  };

  const name = (
    <strong>
      {goal.icon} {goal.name}
    </strong>
  );

  return (
    <Modal isOpen toggle={onClose} centered scrollable size={held ? undefined : "sm"}>
      <ModalHeader toggle={onClose}>{t("common.delete")}</ModalHeader>
      <ModalBody>
        {stage === "choose" && (
          <>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              {/* The name goes in as an element, so whatever the user typed is never read as markup. */}
              <Trans i18nKey="investments.deleteConfirm" components={{ name }} />
            </p>
            <p className="fw-semibold mb-2" style={{ fontSize: 14 }}>
              {t("goalDelete.ask", { amount: format(saved) })}
            </p>
            <div className="d-flex flex-column gap-2" role="radiogroup" aria-label={t("goalDelete.ask", { amount: format(saved) })}>
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
                    {t(`goalDelete.${value}Hint`, { amount: format(saved) })}
                  </div>
                </button>
              ))}
            </div>
            {tried && ending === null && <div className="small text-danger mt-2">{t("goalDelete.pickOne")}</div>}

            {ending === "spent" && (
              <div className="mt-3">
                <Label className="small fw-medium">{t("goalDelete.leftFrom")}</Label>
                <AccountPicker
                  value={account}
                  unset={!cardPicked}
                  onChoose={(id) => {
                    setAccount(id);
                    setCardPicked(true);
                  }}
                  income={false}
                />
                {tried && !cardPicked && <div className="small text-danger mt-1">{t("goalWizard.pickCard")}</div>}
                <div className="small text-body-secondary mt-3 d-flex flex-wrap align-items-center gap-2">
                  <span>
                    {t("common.category")}: <strong>{categoryName}</strong>
                  </span>
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setChangingCategory((v) => !v)}>
                    {t(changingCategory ? "common.close" : "goalWizard.changeCategory")}
                  </button>
                </div>
                {changingCategory && (
                  <div className="mt-2">
                    <CategoryPicker
                      categories={categories}
                      value={category}
                      type="expense"
                      onChange={(id) => {
                        setPicked(id);
                        setChangingCategory(false);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {stage === "review" && !held && (
          <>
            <p style={{ fontSize: 14, margin: 0 }}>
              <Trans i18nKey="investments.deleteConfirm" components={{ name }} />
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{t("investments.deleteWarning")}</p>
          </>
        )}

        {stage === "review" && held && (
          <>
            <p className={wizard.prompt}>{t("goalDelete.reviewTitle")}</p>
            <div className={wizard.reviewRows}>
              <button type="button" onClick={() => setStage("choose")}>
                <span>{t("goalDelete.rowGoal")}</span>
                <strong>
                  {goal.icon} {goal.name} · {format(saved)}
                </strong>
              </button>
              <button type="button" onClick={() => setStage("choose")}>
                <span>{t("goalDelete.rowChoice")}</span>
                <strong>{t(`goalDelete.${ending}`)}</strong>
              </button>
              {ending === "spent" && (
                <>
                  <button type="button" onClick={() => setStage("choose")}>
                    <span>{t("goalDelete.rowLeftFrom")}</span>
                    <strong>{cardName}</strong>
                  </button>
                  <button type="button" onClick={() => setStage("choose")}>
                    <span>{t("common.category")}</span>
                    <strong>{categoryName}</strong>
                  </button>
                </>
              )}
            </div>

            <div className={`${wizard.reviewRows} mt-3`} role="group" aria-label={t("goalWizard.willHappen")}>
              <div>
                <span>{t("goalWizard.willHappen")}</span>
              </div>
              <div>
                <span>{t("goalDelete.theGoal")}</span>
                <strong>{t("goalDelete.goesAway")}</strong>
              </div>
              {ending === "dropped" ? (
                <>
                  <div>
                    <span>{t("goalDelete.theMoney", { amount: format(saved) })}</span>
                    <strong>{t("goalDelete.backToSpendable")}</strong>
                  </div>
                  <div>
                    <span>{t("goalDelete.spendable")}</span>
                    <strong>
                      {format(spendable)} → {format(round2(spendable + saved))}
                    </strong>
                  </div>
                  <div>
                    <span>{t("goalDelete.cards")}</span>
                    <strong>{t("goalWizard.cardUnchanged")}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>{t("goalWizard.andExpense")}</span>
                    <strong>
                      −{format(saved)} · {categoryName}
                    </strong>
                  </div>
                  {cardNow !== undefined && (
                    <div>
                      <span>{cardName}</span>
                      <strong>
                        {format(cardNow)} → {format(round2(cardNow - saved))}
                      </strong>
                    </div>
                  )}
                  <div>
                    <span>{t("goalDelete.spendable")}</span>
                    <strong>{t("goalDelete.spendableSame", { amount: format(spendable) })}</strong>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {deleteGuard.locked && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{deleteGuard.reason}</p>}
      </ModalBody>
      <ModalFooter className="justify-content-between">
        {stage === "review" && held ? (
          <Button color="secondary" outline onClick={() => setStage("choose")} disabled={isDeleting}>
            ‹ {t("common.back")}
          </Button>
        ) : (
          <Button color="secondary" outline onClick={onClose} disabled={isDeleting}>
            {t("common.cancel")}
          </Button>
        )}
        {stage === "choose" ? (
          <Button color="primary" onClick={next}>
            {t("common.next")} ›
          </Button>
        ) : (
          <Button
            color="danger"
            disabled={isDeleting || deleteGuard.locked || !ready}
            onClick={() => onConfirm(ending === "spent" ? { spent: { accountId: account || undefined, categoryId: category } } : {})}
          >
            {isDeleting ? t("common.deleting") : t(ending === "spent" ? "goalDelete.confirmSpent" : "common.delete")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

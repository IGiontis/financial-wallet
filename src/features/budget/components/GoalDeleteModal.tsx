import { useMemo, useState } from "react";
import { Button, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { Trans, useTranslation } from "react-i18next";
import type { CreateTransactionDTO, InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { categoryLabel } from "../../../shared/utils/categories";
import { parseISODay, toISODay } from "../../../shared/utils/dates";
import AccountPicker from "../../accounts/AccountPicker";
import { useMoneyAccounts } from "../../accounts/useMoneyAccounts";
import { expectedByAccount, goalHeldTotal, mainAccount } from "../../accounts/accountsUtils";
import CategoryPicker from "../../categories/CategoryPicker";
import { useCategories } from "../../transactions/hooks/useTransactions";
import { closingRecords, goalHolding, undoByAccount } from "../goalHolding";
import wizard from "../../transactions/components/css/TransactionWizard.module.css";
import { SkeletonRows } from "../../../shared/components/Skeletons";

/** What deleting a goal means for its money. */
export interface GoalEnding {
  /**
   * Absent: given up on — every record taken back, money handed to someone
   * returned to the card it left, money in your bank set free. Present: done,
   * the money spent — these records close the goal before it goes (see
   * `closingRecords`), and its history stays in Transactions.
   */
  close?: CreateTransactionDTO[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deleting a savings goal that has money in it asks what became of the money,
 * shows what will happen — card by card — and only then deletes.
 *
 *   • Given up on: whoever was holding some of it gives it back to the card it
 *     came from; what sat in your bank is free again.
 *   • Done: it was spent. What someone held left your card when it was handed
 *     over, so that card does not go down again; what sat in your bank leaves
 *     the card chosen.
 *
 * Nothing is chosen for you, the card included.
 */
export function GoalDeleteModal({ goal, isDeleting, onConfirm, onClose }: { goal: InvestmentGoalWithStats; isDeleting: boolean; onConfirm: (ending: GoalEnding) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  const { format } = useCurrencyConverter();
  const { data: categories = [] } = useCategories();
  // Fetched — see `ContributionWizard`: without the goal's records, money
  // handed to someone reads as money in the bank.
  const { accounts, latest, transactions, isLoading: moneyLoading } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  const holding = useMemo(() => goalHolding(goal, transactions), [goal, transactions]);
  const undo = useMemo(() => undoByAccount(goal.id, transactions), [goal.id, transactions]);
  const held = goal.totalSaved > 0;
  const inBanks = holding.inBanks > 0.005;

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
  // A card is asked for only where money leaves one now: what sat in your bank.
  const ready = ending === "dropped" || (ending === "spent" && (!inBanks || cardPicked) && !!category);

  // ── Card by card ──
  const main = mainAccount(accounts);
  const nameOf = (id: string | undefined) => {
    const named = accounts.find((a) => a.id === id);
    return named ? named.name : main ? t("bills.pay.mainCard", { name: main.name }) : t("accounts.noCard");
  };
  const idOf = (id: string | undefined) => (accounts.some((a) => a.id === id) ? (id as string) : (main?.id ?? ""));
  const total = round2(Object.values(holds).reduce((sum, n) => sum + n, 0));
  const spendable = round2(total - goalHeldTotal(transactions));

  const closing = useMemo(
    () =>
      ending === "spent"
        ? closingRecords(goal, transactions, { bankAccountId: account || undefined, categoryId: category, date: parseISODay(toISODay(new Date()))!, note: t("goalWizard.fromGoal", { name: goal.name }) })
        : [],
    [ending, goal, transactions, account, category, t],
  );

  const next = () => {
    setTried(true);
    if (ready) setStage("review");
  };

  const name = (
    <strong>
      {goal.icon} {goal.name}
    </strong>
  );

  const cardRow = (id: string, delta: number, note?: string) => {
    const now = holds[idOf(id)];
    return (
      <div key={`${id}:${note ?? ""}`}>
        <span>
          {nameOf(id)}
          {note && <span className="d-block small text-body-secondary">{note}</span>}
        </span>
        <strong>{now === undefined || Math.abs(delta) < 0.005 ? t("goalWizard.cardUnchanged") : `${format(now)} → ${format(round2(now + delta))}`}</strong>
      </div>
    );
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable size={held ? undefined : "sm"}>
      <ModalHeader toggle={onClose}>{t("common.delete")}</ModalHeader>
      <ModalBody>
        {moneyLoading && <SkeletonRows count={3} icon={false} />}
        {!moneyLoading && stage === "choose" && (
          <>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              {/* The name goes in as an element, so whatever the user typed is never read as markup. */}
              <Trans i18nKey="investments.deleteConfirm" components={{ name }} />
            </p>
            {holding.holders.length > 0 && (
              <p className="small text-body-secondary mb-2">
                {holding.holders.map((h) => t("goalDelete.heldByNote", { who: h.name, amount: format(h.amount) })).join(" · ")}
                {inBanks && ` · ${t("goalDelete.inBanksNote", { amount: format(holding.inBanks) })}`}
              </p>
            )}
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
                    {t(`goalDelete.${value}Hint${holding.holders.length > 0 ? "Held" : ""}`, { amount: format(goal.totalSaved) })}
                  </div>
                </button>
              ))}
            </div>
            {tried && ending === null && <div className="small text-danger mt-2">{t("goalDelete.pickOne")}</div>}

            {ending === "spent" && (
              <div className="mt-3">
                {inBanks && (
                  <>
                    <Label className="small fw-medium">{t("goalDelete.bankLeftFrom", { amount: format(holding.inBanks) })}</Label>
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
                  </>
                )}
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

        {!moneyLoading && stage === "review" && !held && (
          <>
            <p style={{ fontSize: 14, margin: 0 }}>
              <Trans i18nKey="investments.deleteConfirm" components={{ name }} />
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{t("investments.deleteWarning")}</p>
          </>
        )}

        {!moneyLoading && stage === "review" && held && (
          <>
            <p className={wizard.prompt}>{t("goalDelete.reviewTitle")}</p>
            <div className={wizard.reviewRows}>
              <button type="button" onClick={() => setStage("choose")}>
                <span>{t("goalDelete.rowGoal")}</span>
                <strong>
                  {goal.icon} {goal.name} · {format(goal.totalSaved)}
                </strong>
              </button>
              <button type="button" onClick={() => setStage("choose")}>
                <span>{t("goalDelete.rowChoice")}</span>
                <strong>{t(`goalDelete.${ending}`)}</strong>
              </button>
              {ending === "spent" && (
                <button type="button" onClick={() => setStage("choose")}>
                  <span>{t("common.category")}</span>
                  <strong>{categoryName}</strong>
                </button>
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
                  {holding.holders.map((h) => (
                    <div key={h.name}>
                      <span>{t("goalDelete.givesBack", { who: h.name })}</span>
                      <strong>{format(h.amount)}</strong>
                    </div>
                  ))}
                  {Object.entries(undo).map(([id, delta]) => cardRow(id, delta))}
                  {inBanks && (
                    <div>
                      <span>{t("goalDelete.theMoney", { amount: format(holding.inBanks) })}</span>
                      <strong>{t("goalDelete.backToSpendable")}</strong>
                    </div>
                  )}
                  <div>
                    <span>{t("goalDelete.spendable")}</span>
                    <strong>
                      {format(spendable)} → {format(round2(spendable + goal.totalSaved))}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  {closing
                    .filter((r) => r.type === "expense")
                    .map((r, i) => (
                      <div key={i}>
                        <span>{t("goalWizard.andExpense")}</span>
                        <strong>
                          −{format(r.amount)} · {r.description}
                        </strong>
                      </div>
                    ))}
                  {holding.holders.map((h) => cardRow(h.accountId ?? "", 0, t("goalDelete.alreadyLeft", { who: h.name })))}
                  {inBanks && cardRow(account, -holding.inBanks)}
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
          <Button color="primary" onClick={next} disabled={moneyLoading}>
            {t("common.next")} ›
          </Button>
        ) : (
          <Button color="danger" disabled={isDeleting || deleteGuard.locked || !ready || moneyLoading} onClick={() => onConfirm(ending === "spent" ? { close: closing } : {})}>
            {isDeleting ? t("common.deleting") : t(ending === "spent" ? "goalDelete.confirmSpent" : "common.delete")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

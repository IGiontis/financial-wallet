import { Fragment, useMemo, useState } from "react";
import { Button, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { Trans, useTranslation } from "react-i18next";
import type { CreateTransactionDTO, InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { categoryLabel } from "../../../shared/utils/categories";
import { parseISODay, toISODay } from "../../../shared/utils/dates";
import AccountPicker from "../../accounts/AccountPicker";
import { useMoneyAccounts } from "../../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount, expectedByAccount, goalHeldTotal, mainAccount } from "../../accounts/accountsUtils";
import CategoryPicker from "../../categories/CategoryPicker";
import { useCategories } from "../../transactions/hooks/useTransactions";
import { closingRecords, goalHolding, ownSaved, undoByAccount } from "../goalHolding";
import wizard from "../../transactions/components/css/TransactionWizard.module.css";
import { SkeletonRows } from "../../../shared/components/Skeletons";
import { goalLoans, type GoalLoan, type LoanAnswer } from "../goalLoans";
import { useGoalLoans } from "../useGoalLoans";
import type { CoveredErase } from "../../../firebase/firestore";
import { RequiredMark } from "../../../shared/components/RequiredMark";
import { useRunOnce } from "../../../shared/hooks/useRunOnce";

/** What deleting a goal means for its money. */
export interface GoalEnding {
  /**
   * Absent: given up on — every record taken back, money handed to someone
   * returned to the card it left, money in your bank set free. Present: done,
   * the money spent — these records close the goal before it goes (see
   * `closingRecords`), and its history stays in Transactions.
   */
  close?: CreateTransactionDTO[];
  /**
   * Loans someone took on for the goal that are owed no more — cancelled and
   * refunded to them, or typed by mistake: taken back with the goal, as if they
   * never happened (`CoveredErase`). Loans not named here stay in «Χρέη».
   */
  erase?: CoveredErase[];
  /** Who those loans were with, and who is still owed — for the toast. */
  erasedNames?: string[];
  keptNames?: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Each person once, in the order asked. */
const names = (loans: GoalLoan[]) => [...new Set(loans.map((l) => l.person))];

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
 * And for each loan someone took on to pay part of it (`goalLoans`, found by
 * their stored links): still owed — the debt and its expense stay — or owed no
 * more — the debt, its expense, its deposit and its cash records go with the
 * goal. A loan already partly paid back is not asked: it stays, and says so.
 *
 * Nothing is chosen for you, the card included.
 */
export function GoalDeleteModal({ goal, isDeleting, onConfirm, onClose }: { goal: InvestmentGoalWithStats; isDeleting: boolean; onConfirm: (ending: GoalEnding) => void | Promise<unknown>; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  // Runs once: from the press until the delete answers, nothing here can be
  // pressed again or close the dialog (`.claude/rules/ui.md`).
  const [run, running] = useRunOnce();
  const working = running || isDeleting;
  const close = () => {
    if (!working) onClose();
  };
  const deleteGuard = useOfflineGuard("delete");
  const { format } = useCurrencyConverter();
  const { data: categories = [] } = useCategories();
  // Fetched — see `ContributionWizard`: without the goal's records, money
  // handed to someone reads as money in the bank.
  const { accounts, latest, transactions, isLoading: accountsLoading } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  const holding = useMemo(() => goalHolding(goal, transactions), [goal, transactions]);
  const undo = useMemo(() => undoByAccount(goal.id, transactions), [goal.id, transactions]);
  const inBanks = holding.inBanks > 0.005;
  // What someone else paid of it: every loan the goal links to, complete — the
  // debts list waited for, and any linked debt it lacks read from the server.
  const { debts, loading: loansLoading } = useGoalLoans(goal);
  const moneyLoading = accountsLoading || loansLoading;
  const loans = useMemo(() => goalLoans(goal, debts, transactions), [goal, debts, transactions]);
  // Per loan, not per person: the same person's two loans may end differently
  // (one still owed, one typed twice by mistake). Nothing is chosen for you.
  const [answers, setAnswers] = useState<Record<string, LoanAnswer>>({});
  const { asked, loansChosen, erased, kept } = useMemo(() => {
    const open = loans.filter((l) => l.state === "open");
    return {
      asked: open,
      loansChosen: open.every((l) => answers[l.debtId] !== undefined),
      erased: open.filter((l) => answers[l.debtId] === "erase"),
      kept: loans.filter((l) => l.state !== "closed" && answers[l.debtId] !== "erase"),
    };
  }, [loans, answers]);
  const held = goal.totalSaved > 0 || asked.length > 0;
  // Asked only of money that was yours: a goal paid all by someone else has none to free or spend.
  const ownHeld = ownSaved(goal) > 0.005;

  // Chosen once the loans are known: a goal whose only money is a loan still opens on the question.
  const [stageSet, setStage] = useState<"choose" | "review" | null>(null);
  const stage = stageSet ?? (held ? "choose" : "review");
  const [ending, setEnding] = useState<"dropped" | "spent" | null>(held && ownHeld ? null : "dropped");
  const [account, setAccount] = useState("");
  // Required (item 97a); with one place only, that one — see `chosenAccount`.
  const bankAccount = chosenAccount(accounts, account);
  const [picked, setPicked] = useState("");
  const [changingCategory, setChangingCategory] = useState(false);
  const [tried, setTried] = useState(false);
  const otherExpense = categories.find((c) => c.type === "expense" && c.name === "Other Expense")?.id ?? "";
  const category = picked || otherExpense;
  const categoryName = category ? categoryLabel(categories.find((c) => c.id === category)?.name, t) : "—";
  // A card is asked for only where money leaves one now: what sat in your bank.
  const ready = loansChosen && (ending === "dropped" || (ending === "spent" && (!inBanks || !accountMissing(accounts, account)) && !!category));

  const dayFmt = useMemo(() => new Intl.DateTimeFormat(i18n.language === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "short" }), [i18n.language]);
  // A person with two loans on the goal: each question names its day, so the two can be told apart.
  const twice = (l: GoalLoan) => loans.filter((o) => o.person === l.person).length > 1;
  const askOf = (l: GoalLoan) => t(twice(l) ? "goalDelete.askCoveredOn" : "goalDelete.askCovered", { who: l.person, amount: format(l.amount), date: dayFmt.format(l.date) });

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
        ? closingRecords(goal, transactions, { bankAccountId: bankAccount || undefined, categoryId: category, date: parseISODay(toISODay(new Date()))!, note: t("goalWizard.fromGoal", { name: goal.name }) })
        : [],
    [ending, goal, transactions, bankAccount, category, t],
  );

  // What giving it up frees and closing it spends: what someone else paid was spent the day they paid.
  const own = ownSaved(goal);

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
    <Modal isOpen toggle={close} centered scrollable size={held ? undefined : "sm"} backdrop={working ? "static" : true} keyboard={!working}>
      <ModalHeader toggle={working ? undefined : close}>{t("common.delete")}</ModalHeader>
      <ModalBody>
        {moneyLoading && <SkeletonRows count={3} icon={false} />}
        {!moneyLoading && stage === "choose" && (
          <>
            <p style={{ fontSize: "var(--fs-lead)", marginBottom: 8 }}>
              {/* The name goes in as an element, so whatever the user typed is never read as markup. */}
              <Trans i18nKey="investments.deleteConfirm" components={{ name }} />
            </p>
            {holding.holders.length > 0 && (
              <p className="small text-body-secondary mb-2">
                {holding.holders.map((h) => t("goalDelete.heldByNote", { who: h.name, amount: format(h.amount) })).join(" · ")}
                {inBanks && ` · ${t("goalDelete.inBanksNote", { amount: format(holding.inBanks) })}`}
              </p>
            )}
            {/* What someone else paid: still owed, or owed no more — cancelled and refunded, or typed by mistake. */}
            {asked.map((l) => (
              <div key={l.debtId} className="mb-3">
                <p className="fw-semibold mb-2" style={{ fontSize: "var(--fs-lead)" }}>
                  {askOf(l)}
                  <RequiredMark />
                </p>
                <div className="d-flex flex-column gap-2" role="radiogroup" aria-label={askOf(l)} aria-required>
                  {(["kept", "erase"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={answers[l.debtId] === value}
                      className={`btn text-start ${answers[l.debtId] === value ? "btn-primary" : "btn-outline-secondary"}`}
                      onClick={() => setAnswers({ ...answers, [l.debtId]: value })}
                    >
                      <div className="fw-semibold">{t(value === "erase" ? "goalDelete.coveredErase" : "goalDelete.coveredKept")}</div>
                      <div className="small" style={{ opacity: 0.8 }}>
                        {t(value === "erase" ? "goalDelete.coveredEraseHint" : "goalDelete.coveredKeptHint", { who: l.person, amount: format(l.amount) })}
                      </div>
                    </button>
                  ))}
                </div>
                {tried && answers[l.debtId] === undefined && <div className="small text-danger mt-2">{t("goalDelete.pickOne")}</div>}
              </div>
            ))}
            {/* Paid back in part already: it stays, whatever becomes of the goal — erasing it would erase repayments that moved a card. */}
            {loans
              .filter((l) => l.state === "repaid")
              .map((l) => (
                <p key={l.debtId} className="small text-body-secondary mb-2">
                  {t("goalDelete.coveredRepaidNote", { who: l.person, amount: format(l.amount), repaid: format(l.repaid), left: format(l.remaining) })}
                </p>
              ))}
            {/* Settled or let go of already: history, nothing to ask. */}
            {loans
              .filter((l) => l.state === "closed")
              .map((l) => (
                <p key={l.debtId} className="small text-body-secondary mb-2">
                  {t("goalDelete.coveredNote", { who: l.person, amount: format(l.amount) })}
                </p>
              ))}
            {ownHeld && (
            <>
            <p className="fw-semibold mb-2" style={{ fontSize: "var(--fs-lead)" }}>
              {t("goalDelete.ask", { amount: format(own) })}
              <RequiredMark />
            </p>
            <div className="d-flex flex-column gap-2" role="radiogroup" aria-label={t("goalDelete.ask", { amount: format(own) })} aria-required>
              {(["dropped", "spent"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={ending === value}
                  className={`btn text-start ${ending === value ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => {
                    setEnding(value);
                    // A new answer opens fresh: its own fields are not wrong before they are touched.
                    setTried(false);
                  }}
                >
                  <div className="fw-semibold">{t(`goalDelete.${value}`)}</div>
                  <div className="small" style={{ opacity: 0.8 }}>
                    {t(`goalDelete.${value}Hint${holding.holders.length > 0 ? "Held" : ""}`, { amount: format(own) })}
                  </div>
                </button>
              ))}
            </div>
            {tried && ending === null && <div className="small text-danger mt-2">{t("goalDelete.pickOne")}</div>}
            </>
            )}

            {ending === "spent" && (
              <div className="mt-3">
                {inBanks && (
                  <>
                    <Label className="small fw-medium">
                      {t("goalDelete.bankLeftFrom", { amount: format(holding.inBanks) })}
                      <RequiredMark />
                    </Label>
                    <AccountPicker
                      value={account}
                      onChoose={setAccount}
                      income={false}
                      invalid={tried}
                    />
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
            <p style={{ fontSize: "var(--fs-lead)", margin: 0 }}>
              <Trans i18nKey="investments.deleteConfirm" components={{ name }} />
            </p>
            <p style={{ fontSize: "var(--fs-text)", color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{t("investments.deleteWarning")}</p>
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
              {/* Only money of his own was asked about; a goal someone else paid in full had no such question. */}
              {ownHeld && (
                <button type="button" onClick={() => setStage("choose")}>
                  <span>{t("goalDelete.rowChoice")}</span>
                  <strong>{t(`goalDelete.${ending}`)}</strong>
                </button>
              )}
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
              {/* Every loan, what becomes of it and of its expense — with the amounts. */}
              {loans
                .filter((l) => l.state !== "closed")
                .map((l) => {
                  const erase = answers[l.debtId] === "erase";
                  return (
                    <Fragment key={l.debtId}>
                      <div>
                        <span>{t("goalDelete.theDebtOf", { who: l.person, amount: format(l.state === "repaid" ? l.remaining : l.amount) })}</span>
                        <strong>{t(erase ? "goalDelete.erased" : l.state === "repaid" ? "goalDelete.debtStaysLeft" : "goalDelete.debtStays")}</strong>
                      </div>
                      {l.expenseId && (
                        <div>
                          <span>{t("goalDelete.theExpense", { amount: format(l.amount) })}</span>
                          <strong>{t(erase ? "goalDelete.erased" : "goalDelete.expenseStays")}</strong>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
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
                  {ownHeld && (
                    <div>
                      <span>{t("goalDelete.spendable")}</span>
                      <strong>
                        {format(spendable)} → {format(round2(spendable + own))}
                      </strong>
                    </div>
                  )}
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
                  {inBanks && cardRow(bankAccount, -holding.inBanks)}
                  <div>
                    <span>{t("goalDelete.spendable")}</span>
                    <strong>{t("goalDelete.spendableSame", { amount: format(spendable) })}</strong>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {deleteGuard.locked && <p style={{ fontSize: "var(--fs-small)", color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{deleteGuard.reason}</p>}
      </ModalBody>
      <ModalFooter className="justify-content-between">
        {stage === "review" && held ? (
          <Button color="secondary" outline onClick={() => setStage("choose")} disabled={working}>
            ‹ {t("common.back")}
          </Button>
        ) : (
          <Button color="secondary" outline onClick={close} disabled={working}>
            {t("common.cancel")}
          </Button>
        )}
        {stage === "choose" ? (
          <Button color="primary" onClick={next} disabled={moneyLoading}>
            {t("common.next")} ›
          </Button>
        ) : (
          <Button
            color="danger"
            aria-busy={working || undefined}
            disabled={working || deleteGuard.locked || !ready || moneyLoading}
            onClick={() =>
              void run(() =>
                onConfirm({
                  ...(ending === "spent" ? { close: closing } : {}),
                  ...(erased.length > 0 ? { erase: erased.map((l) => ({ debtId: l.debtId, ...(l.expenseId ? { expenseId: l.expenseId } : {}) })), erasedNames: names(erased) } : {}),
                  ...(kept.length > 0 ? { keptNames: names(kept) } : {}),
                }),
              )
            }
          >
            {working ? t("common.deleting") : t(ending === "spent" ? "goalDelete.confirmSpent" : "common.delete")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

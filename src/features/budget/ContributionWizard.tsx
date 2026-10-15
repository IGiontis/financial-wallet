import { useMemo, useState } from "react";
import { Alert, Button, FormFeedback, FormGroup, FormText, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { DateField } from "../../shared/components/DateField";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { parseISODay, toISODay } from "../../shared/utils/dates";
import type { CreateInvestmentContributionDTO, CreateTransactionDTO, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { useCategories, useCreateTransaction } from "../transactions/hooks/useTransactions";
import CategoryPicker from "../categories/CategoryPicker";
import { categoryLabel } from "../../shared/utils/categories";
import AccountPicker from "../accounts/AccountPicker";
import { useMoneyAccounts } from "../accounts/useMoneyAccounts";
import { expectedByAccount, mainAccount } from "../accounts/accountsUtils";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { formatTable } from "../transactions/transactionDates";
import wizard from "../transactions/components/css/TransactionWizard.module.css";

const ALL_STEPS = ["amount", "when", "use", "card", "review"] as const;
type Step = (typeof ALL_STEPS)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Money into a goal or an investment, or out of one — in four steps, the
 * check last and Save only there, as every form that moves money now is.
 *
 * The card means two different things, and the check says which:
 *   • a savings GOAL keeps its money in your banks, set aside (see
 *     `goalHeldDelta`): the card is the bank it sits in, and its balance does
 *     not change;
 *   • an INVESTMENT is money gone to a broker: the card is the one it left —
 *     or, taken out, the one it came back into — and that card moves.
 * Either way the record lands in Transactions, marked as the goal's or the
 * investment's, with the card on it.
 *
 * Out of a goal there is one more question: what became of the money. Kept,
 * it is only set free again — still in the bank, the card unchanged. Given or
 * spent — the trip money handed to whoever books it — it left the bank: an
 * expense is written with it, under the category chosen, off the card it left.
 * The goal's withdrawal counts as money in and the expense as money out, so
 * the month's net is untouched: it was savings, not this month's pay.
 */
export default function ContributionWizard({
  goal,
  kind,
  isGoal,
  onClose,
  onSubmit,
}: {
  goal: InvestmentGoalWithStats;
  kind: "deposit" | "withdrawal";
  /** A savings goal (Goals page) rather than an investment. */
  isGoal: boolean;
  onClose: () => void;
  onSubmit: (data: CreateInvestmentContributionDTO) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const { accounts, latest, transactions } = useMoneyAccounts({ fetch: false });
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);

  const deposit = kind === "deposit";
  // Only out of a goal can the money have been spent rather than kept.
  const STEPS = (isGoal && !deposit ? ALL_STEPS : ALL_STEPS.filter((s) => s !== "use")) as readonly Step[];
  const { data: categories = [] } = useCategories();
  const createExpense = useCreateTransaction();
  const toBase = (n: number) => (baseCurrency === displayCurrency ? n : convertToBase(n));

  // A goal with a deadline cannot take more than it still needs.
  const isDeadlineGoal = goal.goalType === "targeted" && goal.targetPeriod !== "monthly" && goal.targetPeriod !== "yearly";
  const remaining = goal.remaining ?? 0;
  const capped = deposit && isDeadlineGoal;
  const full = capped && remaining <= 0;

  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [gain, setGain] = useState("");
  const [date, setDate] = useState(() => toISODay(new Date()));
  const [notes, setNotes] = useState("");
  const [account, setAccount] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spent, setSpent] = useState(false);
  const [spentOn, setSpentOn] = useState("");
  const [spentCategory, setSpentCategory] = useState("");

  const typed = parseFloat(amount);
  const typedGain = Math.max(parseFloat(gain) || 0, 0);
  const balance = goal.totalSaved;
  const balanceInDisplay = round2(convert(balance));
  // Taking it all out: what came on top of it, if anything, is a gain.
  const takingAll = !deposit && Number.isFinite(typed) && Math.abs(typed - balanceInDisplay) < 0.01;
  const total = (Number.isFinite(typed) ? typed : 0) + (takingAll ? typedGain : 0);
  const totalInBase = round2(toBase(total));

  const amountError = (() => {
    if (!Number.isFinite(typed) || typed <= 0) return t("validation.amountPositive");
    if (capped && totalInBase > remaining + 0.005) return t("investments.cannotExceedRemaining", { amount: format(remaining) });
    if (typed > 10_000_000) return t("validation.amountTooLarge");
    return undefined;
  })();
  const when = parseISODay(date);
  const notesTooLong = notes.length > 40;

  const index = STEPS.indexOf(step);
  const goTo = (target: Step) => {
    const to = STEPS.indexOf(target);
    if (to > 0 && amountError) {
      setTried(true);
      return setStep("amount");
    }
    if (to > 1 && (!when || notesTooLong)) return setStep("when");
    if (spent && to > STEPS.indexOf("use") && (!spentCategory || !spentOn.trim())) {
      setTried(true);
      return setStep("use");
    }
    setStep(target);
  };

  // ── What it does ──
  const savedAfter = round2(balance + (deposit ? totalInBase : -totalInBase));
  const gainPart = !deposit && totalInBase > balance + 0.005 ? round2(totalInBase - balance) : 0;
  const named = accounts.find((a) => a.id === account);
  const main = mainAccount(accounts);
  const cardName = named ? named.name : main ? t("bills.pay.mainCard", { name: main.name }) : t("accounts.noCard");
  const card = named ?? main;
  const cardNow = card ? holds[card.id] : undefined;
  // A goal's money stays in the bank — unless it was spent; an investment's leaves or comes back.
  const cardMoves = !isGoal || spent;
  const cardAfter = cardNow === undefined || !cardMoves ? undefined : round2(cardNow + (deposit || spent ? -totalInBase : totalInBase));
  const spentCategoryName = spentCategory ? categoryLabel(categories.find((c) => c.id === spentCategory)?.name, t) : undefined;

  const save = async () => {
    if (amountError || !when) return;
    setSaving(true);
    const dto: CreateInvestmentContributionDTO = {
      goalId: goal.id,
      amount: totalInBase,
      contributionType: kind,
      date: when,
      notes: notes.trim() || undefined,
      accountId: account || undefined,
    };
    try {
      await onSubmit(dto);
      if (spent) {
        // What it was spent on, off the card it left: an ordinary expense.
        const expense: CreateTransactionDTO = {
          amount: totalInBase,
          type: "expense",
          categoryId: spentCategory,
          date: when,
          description: spentOn.trim(),
          notes: t("goalWizard.fromGoal", { name: goal.name }),
          accountId: account || undefined,
        };
        await saveWithoutWaiting(createExpense, expense, () => toast.error(t("transactions.saveFailed")));
      }
      toast.success(t(deposit ? "goalWizard.doneIn" : spent ? "goalWizard.doneSpent" : "goalWizard.doneOut", { amount: format(totalInBase), name: goal.name, on: spentOn.trim() }));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const rows: { step: Step; label: string; value: string }[] = [
    { step: "amount", label: t("common.amount"), value: format(totalInBase) },
    { step: "when", label: t("common.date"), value: when ? formatTable(when, lang) : "—" },
    ...(spent ? [{ step: "use" as Step, label: t("goalWizard.rowSpentOn"), value: `${spentOn.trim()} · ${spentCategoryName ?? ""}` }] : []),
    { step: "card", label: t(spent ? "goalWizard.rowFrom" : isGoal ? "goalWizard.rowHeldIn" : deposit ? "goalWizard.rowFrom" : "goalWizard.rowInto"), value: cardName },
    ...(notes.trim() ? [{ step: "when" as Step, label: t("common.notes"), value: notes.trim() }] : []),
  ];

  const title = t(deposit ? "investments.addDepositTitle" : "investments.withdrawTitle", { icon: goal.icon ?? "💰", name: goal.name });
  const ask = (s: Step) => {
    if (s === "use") return t("goalWizard.askUse");
    if (s === "card") return t(spent ? "goalWizard.askLeft" : isGoal ? "goalWizard.askHeldIn" : deposit ? "goalWizard.askFrom" : "goalWizard.askInto");
    return t(`goalWizard.ask_${s}_${deposit ? "in" : "out"}`);
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{title}</ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") void save();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => t(`goalWizard.step_${s}`)} />
          <p className={wizard.prompt}>{ask(step)}</p>

          {step === "amount" && (
            <>
              {capped && !full && (
                <Alert color="info" className="py-2" style={{ fontSize: 12.5 }}>
                  {t("investments.deadlineGoalHint", { amount: format(remaining) })}
                </Alert>
              )}
              {full && (
                <Alert color="success" className="py-2" style={{ fontSize: 12.5 }}>
                  {t("investments.goalFullyFunded")}
                </Alert>
              )}
              <FormGroup className="mb-2">
                <Label for="contribution-amount" className="small fw-medium">
                  {t("investments.amountLabel", { currency: displayCurrency })} *
                </Label>
                <InputGroup>
                  <Input
                    id="contribution-amount"
                    autoFocus
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    disabled={full}
                    invalid={tried && !!amountError}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {!deposit && <InputGroupText>{t("goalWizard.of", { amount: format(balance) })}</InputGroupText>}
                  <FormFeedback>{amountError}</FormFeedback>
                </InputGroup>
                {capped && !full && <FormText style={{ fontSize: 11 }}>{t("investments.maxDepositHint", { amount: format(remaining) })}</FormText>}
              </FormGroup>
              {!deposit && balance > 0 && (
                <Button type="button" size="sm" color="secondary" outline onClick={() => setAmount(String(balanceInDisplay))}>
                  {t("investments.withdrawAll")} · {format(balance)}
                </Button>
              )}
              {/* Taking it all out of something that grew: what came on top is the gain. */}
              {takingAll && (
                <FormGroup className="mt-3 mb-0">
                  <Label for="contribution-gain" className="small fw-medium">
                    {t("investments.profitLabel", { currency: displayCurrency })}
                  </Label>
                  <Input id="contribution-gain" type="number" min={0} step="0.01" inputMode="decimal" value={gain} onChange={(e) => setGain(e.target.value)} placeholder="0" />
                  <FormText style={{ fontSize: 11 }}>{t("investments.profitHint", { amount: format(balance) })}</FormText>
                </FormGroup>
              )}
            </>
          )}

          {step === "when" && (
            <>
              <FormGroup>
                <Label className="small fw-medium">{t("common.date")} *</Label>
                <DateField value={date} onChange={setDate} placeholder={t("common.date")} />
              </FormGroup>
              <FormGroup className="mb-0">
                <Label for="contribution-notes" className="small fw-medium">
                  {t("common.notes")}
                </Label>
                <Input id="contribution-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("common.optionalNote")} invalid={notesTooLong} />
                <FormFeedback>{t("validation.maxChars", { count: 40 })}</FormFeedback>
                <FormText style={{ fontSize: 11 }}>{notes.length} / 40</FormText>
              </FormGroup>
            </>
          )}

          {step === "use" && (
            <>
              <div className="d-flex flex-column gap-2 mb-3" role="radiogroup" aria-label={t("goalWizard.askUse")}>
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={spent === value}
                    className={`btn text-start ${spent === value ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setSpent(value)}
                  >
                    <div className="fw-semibold">{t(value ? "goalWizard.useSpent" : "goalWizard.useKept")}</div>
                    <div className="small" style={{ opacity: 0.8 }}>
                      {t(value ? "goalWizard.useSpentHint" : "goalWizard.useKeptHint")}
                    </div>
                  </button>
                ))}
              </div>
              {spent && (
                <>
                  <FormGroup>
                    <Label for="contribution-spent-on" className="small fw-medium">
                      {t("goalWizard.spentOn")} *
                    </Label>
                    <Input
                      id="contribution-spent-on"
                      value={spentOn}
                      onChange={(e) => setSpentOn(e.target.value)}
                      placeholder={t("goalWizard.spentOnPlaceholder")}
                      invalid={tried && !spentOn.trim()}
                    />
                  </FormGroup>
                  <Label className="small fw-medium">{t("common.category")} *</Label>
                  {tried && !spentCategory && <div className="small text-danger mb-1">{t("goalWizard.pickCategory")}</div>}
                  <CategoryPicker categories={categories} value={spentCategory} type="expense" onChange={(id) => setSpentCategory(id)} />
                </>
              )}
            </>
          )}

          {step === "card" && (
            <>
              <AccountPicker value={account} onChoose={setAccount} income={!deposit && !spent} />
              <p className="small text-body-secondary mt-2 mb-0">{t(spent ? "goalWizard.leftHint" : isGoal ? "goalWizard.heldHint" : deposit ? "goalWizard.leavesHint" : "goalWizard.returnsHint")}</p>
            </>
          )}

          {step === "review" && (
            <>
              <div className={wizard.reviewRows}>
                {rows.map((row) => (
                  <button key={row.label} type="button" onClick={() => goTo(row.step)}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </button>
                ))}
              </div>

              <div className={`${wizard.reviewRows} mt-3`} role="group" aria-label={t("goalWizard.willHappen")}>
                <div>
                  <span>{t("goalWizard.willHappen")}</span>
                </div>
                <div>
                  <span>{t(isGoal ? "goalWizard.theGoal" : "goalWizard.theInvestment")}</span>
                  <strong>
                    {format(balance)} → {format(Math.max(savedAfter, 0))}
                  </strong>
                </div>
                {capped && (
                  <div>
                    <span>{t("goalWizard.stillNeeded")}</span>
                    <strong>{format(Math.max(round2(remaining - totalInBase), 0))}</strong>
                  </div>
                )}
                {gainPart > 0 && (
                  <div>
                    <span>{t("goalWizard.gain")}</span>
                    <strong style={{ color: "var(--color-income)" }}>+{format(gainPart)}</strong>
                  </div>
                )}
                <div>
                  <span>{cardName}</span>
                  <strong>{!cardMoves || cardNow === undefined || cardAfter === undefined ? t("goalWizard.cardUnchanged") : `${format(cardNow)} → ${format(cardAfter)}`}</strong>
                </div>
                <div>
                  <span>{t("goalWizard.inTransactions")}</span>
                  <strong>{t(deposit ? "goalWizard.recordIn" : "goalWizard.recordOut", { amount: format(totalInBase) })}</strong>
                </div>
                {spent && (
                  <div>
                    <span>{t("goalWizard.andExpense")}</span>
                    <strong>
                      −{format(totalInBase)} · {spentOn.trim()}
                    </strong>
                  </div>
                )}
              </div>
            </>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {step === "amount" ? (
            <Button type="button" color="secondary" outline onClick={onClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])} disabled={saving}>
              ‹ {t("common.back")}
            </Button>
          )}
          {step === "review" ? (
            <Button type="submit" color="success" disabled={saving || !!amountError}>
              {saving ? t("common.saving") : t(deposit ? "investments.addDeposit" : "investments.confirmWithdrawal")}
            </Button>
          ) : (
            <Button type="submit" color="primary" disabled={full}>
              {t("common.next")} ›
            </Button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { Button, FormFeedback, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { PayeeInput } from "../transactions/components/PayeeInput";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { formatTable } from "../transactions/transactionDates";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCreateDebt, useEditDebt } from "./useDebts";
import { monthlyInstalment } from "./debtsUtils";
import { DateField } from "../../shared/components/DateField";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { YesNoChoice } from "../../shared/components/YesNoChoice";
import { RateHelpButton } from "./RateExplainer";
import styles from "./css/DebtsPage.module.css";
import wiz from "../../shared/css/Wizard.module.css";
import segmented from "../../shared/css/Segmented.module.css";
import { firestoreToDate, parseISODay, toISODay, happenedDayError } from "../../shared/utils/dates";
import type { CreateDebtDTO, Debt, DebtDirection, DebtRateType } from "../../shared/types/IndexTypes";
import { MoneyMovedPicker } from "./MoneyMovedPicker";
import { FORM_MODAL } from "../../shared/components/formModal";
import { toast } from "react-toastify";
import { useInvestmentGoals } from "../budget/useInvestments";
import { isSavingsGoal } from "../budget/goalKinds";
import { useCoveredFunding } from "../budget/useCoveredFunding";
import { coveredFundingVars } from "../budget/coveredFunding";
import { coveredEdit, isLive } from "../budget/coveredLink";
import { useCoveredLink } from "../budget/useCoveredLink";
import { CoveredLoadFailed } from "./CoveredLoadFailed";
import { useCategories } from "../transactions/hooks/useTransactions";
import { categoryLabel } from "../../shared/utils/categories";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount, mainAccount } from "../accounts/accountsUtils";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { useFormChanged } from "../../shared/hooks/useFormChanged";
import { UnchangedHint } from "../../shared/components/UnchangedHint";
import { asNumber } from "../../shared/utils/sameValues";

// Local calendar day, not `toISOString()`: in Greece that is still yesterday
// until three in the morning.
const today = () => toISODay(new Date());
const asInput = (n: number | undefined) => (n === undefined || n === null ? "" : String(n));
const cents = (n: number) => Math.round(n * 100) / 100;

const DEBT_STEPS = ["who", "interest", "dates", "money", "review"] as const;
type Step = (typeof DEBT_STEPS)[number];
const STEP_LABEL: Record<Step, string> = {
  who: "debts.addWizard.stepWho",
  interest: "debts.addWizard.stepInterest",
  dates: "debts.addWizard.stepDates",
  money: "debts.addWizard.stepMoney",
  review: "debts.addWizard.stepReview",
};

/**
 * Recording a loan, as numbered steps: who and how much, whether it is a loan
 * with interest, when, whether money moved — then a review listing every
 * answer and the receipt of what gets paid back. Save is only on the review.
 *
 * Direction is a pair of buttons rather than a sign on the amount: "which way
 * did the money go" is the one thing that must never be ambiguous, and a minus
 * sign in a text field is exactly the kind of detail that is misread once and
 * then never noticed again.
 *
 * Given a `debt`, the same wizard corrects it instead (the rail is open, so any
 * step can be reached at once). Same fields, same rules, filled in from what
 * was saved — a second form for editing would be a second place for the two to
 * drift apart.
 */
export default function AddDebtModal({
  knownPeople,
  onClose,
  debt,
  defaultPerson,
  onDelete,
  deleteLocked,
  deleteReason,
}: {
  knownPeople: string[];
  onClose: () => void;
  debt?: Debt;
  /** Who a new loan is with, when it is added from their own sheet. */
  defaultPerson?: string;
  /** Editing only: hands over to the sheet's own delete question. */
  onDelete?: () => void;
  deleteLocked?: boolean;
  deleteReason?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { baseCurrency, format: formatCurrency } = useCurrencyConverter();
  // The same locale the money formatter uses: 3,5% in Greek, 3.5% in English.
  const pct = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const create = useCreateDebt();
  const edit = useEditDebt();
  // Runs once: from the press until the server answers (debts wait for it),
  // Save says «Αποθήκευση…» and nothing can save again or close the dialog.
  const [runSave, savingNow] = useRunOnce();
  const saving = savingNow;
  const [savingCovered, setSavingCovered] = useState(false);
  const accounts = useAccountList();

  const [step, setStep] = useState<Step>("who");
  const [direction, setDirection] = useState<DebtDirection>(debt?.direction ?? "owed_by_me");
  const [person, setPerson] = useState(debt?.person ?? defaultPerson ?? "");
  const [label, setLabel] = useState(debt?.label ?? "");
  const [amount, setAmount] = useState(asInput(debt?.amount));
  const [date, setDate] = useState(() => (debt ? toISODay(debt.date) : today()));
  const [dueDate, setDueDate] = useState(() => (debt?.dueDate ? toISODay(debt.dueDate) : ""));
  // A term is what made it a loan when it was saved (see below), so it is what
  // answers the question for a saved debt. A new one starts unanswered.
  const [withInterest, setWithInterest] = useState<boolean | undefined>(debt ? (debt.termMonths ?? 0) > 0 : undefined);
  const [rateType, setRateType] = useState<DebtRateType>(debt?.rateType ?? "fixed");
  const [rate, setRate] = useState(debt?.rateType === "floating" ? "" : asInput(debt?.interestRate));
  const [base, setBase] = useState(asInput(debt?.baseRate));
  const [margin, setMargin] = useState(asInput(debt?.margin));
  const [term, setTerm] = useState(asInput(debt?.termMonths));
  const [free, setFree] = useState(asInput(debt?.interestFreeMonths));
  const [touched, setTouched] = useState(false);
  const [askedInterest, setAskedInterest] = useState(false);
  // Where the money went or came from. `null`: not answered yet — a new debt
  // starts with neither tile chosen (no prefill, tiles included); an edit shows
  // what is stored. `undefined` is «Όχι», a debt with no money handed over (or
  // one saved before cards existed). A string is «Ναι»: a card must then be
  // chosen (item 97a), and a saved "" (the main account, from before cards were
  // required) asks again.
  const [account, setAccount] = useState<string | undefined | null>(debt ? debt.accountId : null);
  const [moneyTried, setMoneyTried] = useState(false);
  // «No change, no Save»: a correction saved with nothing changed would still
  // write (and bump `updatedAt` on every device), so it is not offered. What is
  // typed, by meaning (`useFormChanged`): figures as numbers, names trimmed, and
  // the loan's figures only when it is a loan (and the rate's parts only for
  // its kind). The card answer keeps «not answered» / «Όχι» / «Ναι, κάρτα» apart.
  const loanAnswers = withInterest === true;
  const typedNow = {
    direction,
    person,
    label,
    amount: asNumber(amount),
    date,
    dueDate,
    withInterest,
    rateType: loanAnswers ? rateType : undefined,
    rate: loanAnswers && rateType !== "floating" ? asNumber(rate) : undefined,
    base: loanAnswers && rateType === "floating" ? asNumber(base) : undefined,
    margin: loanAnswers && rateType === "floating" ? asNumber(margin) : undefined,
    term: loanAnswers ? asNumber(term) : undefined,
    free: loanAnswers ? asNumber(free) : undefined,
    account: account === null ? "unanswered" : account === undefined ? "no" : `card:${account}`,
  };
  const [opened] = useState(typedNow);
  const { unchanged } = useFormChanged(debt ? opened : undefined, typedNow);
  // Borrowed, with no money reaching a card, because it went to a goal — the
  // friend who paid the ski hotel. Only on a new debt: it writes the goal's
  // deposit and the expense with it, as «Το πλήρωσε κάποιος για μένα» does.
  const { data: allGoals = [] } = useInvestmentGoals();
  const goals = allGoals.filter((g) => isSavingsGoal(g) && g.isActive && !g.isCompleted);
  const { data: categories = [] } = useCategories();
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const otherExpense = expenseCategories.find((c) => c.name === "Other Expense")?.id ?? expenseCategories[0]?.id ?? "";
  const [goalId, setGoalId] = useState("");
  const [goalCategory, setGoalCategory] = useState("");
  const coveredFunding = useCoveredFunding();
  const forGoal = !debt && direction === "owed_by_me" && account === undefined ? goals.find((g) => g.id === goalId) : undefined;
  // A saved debt that paid part of a goal: the goal's deposit and the expense
  // follow what is saved here (see `coveredEdit`), and which way the money went
  // and that no card moved stay as they are — they are what make it that debt.
  const covered = useCoveredLink(debt);
  const linked = isLive(covered.link);
  // «Ναι» needs its card; a covered debt's money step is not asked (no card moved).
  const moneyMissing = !linked && (account === null || (account !== undefined && accountMissing(accounts, account)));
  // As written: the card chosen, or the only place there is. With no places at all, as before.
  const writtenAccount = account === null ? undefined : account === undefined || accounts.length === 0 || linked ? account : chosenAccount(accounts, account);

  const value = parseFloat(amount);
  const termValue = parseInt(term, 10);
  const freeValue = Number.isFinite(parseInt(free, 10)) ? Math.max(parseInt(free, 10), 0) : 0;
  // A term is enough to make it a loan: twelve άτοκες δόσεις charge nothing and
  // are still a fixed payment with a known end.
  const isLoanEntry = withInterest === true && Number.isFinite(termValue) && termValue > 0;

  // A floating loan is quoted in two parts, and only the second one is the
  // bank's for keeps. What every figure below is worked out from is their sum —
  // which is true today and will be something else at the next reset.
  const floating = rateType === "floating";
  const num = (raw: string) => (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : 0);
  const allInRate = floating ? Math.max(num(base) + num(margin), 0) : Math.max(num(rate), 0);
  const instalment = isLoanEntry && Number.isFinite(value) ? monthlyInstalment(value, allInRate, termValue, freeValue) : 0;
  const personOk = person.trim() !== "";
  const amountOk = Number.isFinite(value) && value > 0;
  const when = parseISODay(date);
  // The day the debt began happened: today or earlier, whether or not money
  // moved (the safer reading of the owner's rule, 2026-11-14). An edit may keep
  // the day it had. The due date is a plan and may be later.
  const dateError = happenedDayError(date, new Date(), debt ? toISODay(debt.date) : undefined);

  const index = DEBT_STEPS.indexOf(step);
  // Forward only as far as what is filled in allows; back is always free.
  const goTo = (target: Step) => {
    const to = DEBT_STEPS.indexOf(target);
    if (to > 0 && (!personOk || !amountOk)) {
      setTouched(true);
      setStep("who");
      return;
    }
    if (to > 1 && withInterest === undefined) {
      setAskedInterest(true);
      setStep("interest");
      return;
    }
    if (to > 2 && (!when || dateError)) {
      setStep("dates");
      return;
    }
    if (to > 3 && moneyMissing) {
      setMoneyTried(true);
      setStep("money");
      return;
    }
    setStep(target);
  };

  // The two cells that appear in both layouts, written once.
  const termField = (
    <FormGroup className="flex-fill">
      <Label className="small fw-medium" for="debt-term">
        {t("debts.termMonths")}
      </Label>
      <InputGroup>
        <Input id="debt-term" type="number" min={1} step="1" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="60" />
        <InputGroupText>{t("debts.monthsUnit")}</InputGroupText>
      </InputGroup>
    </FormGroup>
  );

  const freeField = (
    <FormGroup className="flex-fill">
      <Label className="small fw-medium" for="debt-free">
        {t("debts.interestFree")}
      </Label>
      <InputGroup>
        <Input id="debt-free" type="number" min={0} step="1" inputMode="numeric" value={free} onChange={(e) => setFree(e.target.value)} placeholder="0" />
        <InputGroupText>{t("debts.monthsUnit")}</InputGroupText>
      </InputGroup>
    </FormGroup>
  );

  const save = () => void runSave(saveNow);
  const saveNow = async () => {
    if (unchanged) return;
    setTouched(true);
    if (!personOk || !amountOk || !when || dateError) return;
    if (moneyMissing) {
      setMoneyTried(true);
      setStep("money");
      return;
    }

    // The index date says when the rate was last read. Re-saving a loan to fix
    // its label has not re-read anything, so an unchanged rate keeps its date.
    const rateUnchanged = debt?.rateType === "floating" && debt.baseRate === num(base) && debt.margin === num(margin);
    const reviewedAt = rateUnchanged && debt?.rateReviewedAt ? debt.rateReviewedAt : new Date();

    const data: CreateDebtDTO = {
      person: person.trim(),
      direction,
      label: label.trim() || undefined,
      amount: value,
      date: when,
      dueDate: parseISODay(dueDate) ?? undefined,
      // Only when both are there: a rate without a term cannot be amortised,
      // and half a loan is worse than none. On a floating loan the stored rate
      // is the sum of the two parts, so anything reading only that still gets
      // the rate in force; the parts are kept beside it so the index can be
      // updated on its own when it moves.
      interestRate: isLoanEntry && allInRate > 0 ? allInRate : undefined,
      termMonths: isLoanEntry ? termValue : undefined,
      interestFreeMonths: isLoanEntry && freeValue > 0 ? freeValue : undefined,
      rateType: isLoanEntry && floating ? "floating" : undefined,
      baseRate: isLoanEntry && floating ? num(base) : undefined,
      margin: isLoanEntry && floating ? num(margin) : undefined,
      rateReviewedAt: isLoanEntry && floating ? reviewedAt : undefined,
      accountId: writtenAccount,
    };

    if (forGoal) {
      const who = person.trim();
      setSavingCovered(true);
      void saveWithoutWaiting(
        coveredFunding,
        coveredFundingVars({
          goal: forGoal,
          who,
          amount: value,
          date: when,
          categoryId: goalCategory || otherExpense,
          notes: t("goalWizard.coveredNote", { who }),
          expenseNotes: t("goalWizard.coveredExpenseNote", { who }),
          debt: { label: data.label ?? forGoal.name, dueDate: data.dueDate },
        }),
        () => toast.error(t("goalWizard.coveredFailed")),
      ).finally(() => {
        setSavingCovered(false);
        // The new debt's id is the batch's own: the row that appears is lit.
        celebrateSave({ collection: "debts" });
        toast.success(t("toasts.debtCreated", { name: who }));
        onClose();
      });
      return;
    }
    if (debt) {
      if (!covered.ready) return;
      const plan = coveredEdit(debt, data, covered.link);
      if (!plan.ok) {
        toast.error(t("debts.coveredLocked"));
        return;
      }
      // Never waits for the server (`saveWithoutWaiting`): the debt and its
      // money are on screen at once, the dialog closes with the toast; a
      // refusal puts them back and the hook says so (`debts.saveFailed`).
      void saveWithoutWaiting(edit, { debtId: debt.id, data, covered: plan.edit, storedDate: firestoreToDate(debt.date) }, undefined, [["debts", debt.id]]);
      celebrateSave({ collection: "debts", id: debt.id });
      toast.success(t("toasts.debtUpdated", { name: data.person }));
      onClose();
      return;
    }
    // A new debt's id is made by the hook: the row that appears is the one lit.
    void saveWithoutWaiting(create, data);
    celebrateSave({ collection: "debts" });
    toast.success(t("toasts.debtCreated", { name: data.person }));
    onClose();
  };

  // ── The review ──────────────────────────────────────────────────────────
  const borrowed = direction === "owed_by_me";
  const due = parseISODay(dueDate);
  const cardName = (() => {
    if (account === undefined) return t("debts.noMoney");
    if (account === null) return "—";
    const named = accounts.find((a) => a.id === writtenAccount);
    if (named) return named.name;
    if (accounts.length > 0 && !linked) return t("accounts.notChosen");
    const main = mainAccount(accounts);
    return main ? t("debts.wizard.mainCard", { name: main.name }) : t("accounts.noCard");
  })();
  const otherName = (() => {
    const c = expenseCategories.find((x) => x.id === otherExpense);
    return c ? categoryLabel(c.name, t) : "—";
  })();
  const goalCategoryName = (() => {
    const c = expenseCategories.find((x) => x.id === (goalCategory || otherExpense));
    return c ? `${c.icon ?? ""} ${categoryLabel(c.name, t)}`.trim() : "—";
  })();
  const rows: { step: Step; label: string; value: string }[] = [
    { step: "who", label: t("debts.direction"), value: t(borrowed ? "debts.iBorrowed" : "debts.iLent") },
    { step: "who", label: t("debts.person"), value: person.trim() || "—" },
    { step: "who", label: t("common.amount"), value: formatCurrency(amountOk ? value : 0) },
    { step: "who", label: t("debts.what"), value: label.trim() || forGoal?.name || "—" },
    { step: "interest", label: t("debts.addWizard.stepInterest"), value: isLoanEntry ? t("debts.addWizard.interestYes") : t("debts.addWizard.plain") },
    ...(isLoanEntry
      ? [
          { step: "interest" as Step, label: t("debts.addWizard.rateType"), value: t(floating ? "debts.rateFloating" : "debts.rateFixed") },
          {
            step: "interest" as Step,
            label: t("debts.interestRate"),
            value: floating ? `${t("debts.rateParts", { base: pct.format(num(base)), margin: pct.format(num(margin)) })} = ${pct.format(allInRate)}%` : `${pct.format(allInRate)}%`,
          },
          { step: "interest" as Step, label: t("debts.termMonths"), value: t("debts.addWizard.months", { count: termValue }) },
          { step: "interest" as Step, label: t("debts.interestFree"), value: freeValue > 0 ? t("debts.addWizard.months", { count: freeValue }) : "—" },
        ]
      : []),
    { step: "dates", label: t("debts.when"), value: when ? formatTable(when, lang) : "—" },
    { step: "dates", label: t("debts.dueDate"), value: due ? formatTable(due, lang) : "—" },
    ...(linked ? [] : [{ step: "money" as Step, label: t(borrowed ? "debts.loanInto" : "debts.loanFrom"), value: cardName }]),
    ...(forGoal
      ? [
          { step: "money" as Step, label: t("debts.toGoal"), value: `${forGoal.icon ?? "🎯"} ${forGoal.name}` },
          { step: "money" as Step, label: t("debts.toGoalCategory"), value: goalCategoryName },
        ]
      : []),
  ];
  // The receipt adds up to the cent: the total is the instalments, rounded once,
  // and the interest is what is left of it after the loan itself.
  const receiptTotal = isLoanEntry && amountOk ? cents(instalment * termValue) : amountOk ? value : 0;
  const receiptInterest = isLoanEntry && amountOk ? Math.max(cents(receiptTotal - value), 0) : 0;

  const title = (() => {
    if (step === "who") return t("debts.addWizard.titleWho");
    if (step === "interest") return t("debts.addWizard.titleInterest");
    if (step === "dates") return t("debts.addWizard.titleDates");
    if (step === "money") return t(borrowed ? "debts.moneyMovedIn" : "debts.moneyMovedOut");
    return t("debts.addWizard.titleReview");
  })();

  return (
    <Modal {...FORM_MODAL} isOpen toggle={saving || savingCovered ? () => undefined : onClose} keyboard={!(saving || savingCovered)} centered scrollable>
      <ModalHeader toggle={saving || savingCovered ? undefined : onClose}>{debt ? t("debts.editLoan") : t("debts.add")}</ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") {
            if (!unchanged) save();
          }
          else goTo(DEBT_STEPS[index + 1]);
        }}
      >
        <ModalBody className={borrowed ? "wash-expense" : "wash-income"}>
          <WizardSteps steps={DEBT_STEPS} current={step} onGo={goTo} label={(s) => t(STEP_LABEL[s])} open={!!debt} large />
          {covered.failed && <CoveredLoadFailed onRetry={covered.retry} />}
          {/* The interest step asks its question in the tiles' own label. */}
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }} aria-hidden={step === "interest" || step === "money" ? true : undefined}>
            {title}
            {/* These two steps are one question each, asked in the title; the tiles' group says it is required. */}
            {(step === "interest" || (step === "money" && !linked)) && <RequiredMark />}
          </div>

          {step === "who" && (
            <>
              {/* Two answers, half the row each, and the selected side filled in
                  the colour that side means everywhere else: red is money you owe. */}
              <div className={`${segmented.group} ${segmented.even} mb-3`} role="group" aria-label={t("debts.direction")}>
                <button
                  type="button"
                  className={`${segmented.item} ${segmented.owe} ${direction === "owed_by_me" ? segmented.active : ""}`}
                  aria-pressed={direction === "owed_by_me"}
                  disabled={linked}
                  onClick={() => setDirection("owed_by_me")}
                >
                  {t("debts.iBorrowed")}
                </button>
                <button
                  type="button"
                  className={`${segmented.item} ${segmented.lend} ${direction === "owed_to_me" ? segmented.active : ""}`}
                  aria-pressed={direction === "owed_to_me"}
                  disabled={linked}
                  onClick={() => setDirection("owed_to_me")}
                >
                  {t("debts.iLent")}
                </button>
              </div>
              {linked && <p className="small text-body-secondary">{t("debts.coveredEditHint", { goal: covered.goalName || debt?.label || "" })}</p>}

              <FormGroup>
                <Label className="small fw-medium">
                  {t("debts.person")}
                  <RequiredMark />
                </Label>
                {/* The same picker the payee field uses. It was a native
                    `datalist`, which most phone keyboards ignore outright — so
                    there were no suggestions at all, and a name spelled a shade
                    differently started a second person with the debts split. */}
                <PayeeInput
                  required
                  value={person}
                  payees={knownPeople}
                  onChange={setPerson}
                  invalid={touched && !personOk}
                  placeholder={t("debts.personPlaceholder")}
                  wording={{ field: "debts.person", useTyped: "debts.useTypedPerson", empty: "debts.noPersonMatches" }}
                />
                {touched && !personOk && <div className="invalid-feedback d-block">{t("debts.addWizard.personNeeded")}</div>}
              </FormGroup>

              <FormGroup>
                <Label className="small fw-medium" for="debt-amount">
                  {t("common.amount")}
                  <RequiredMark />
                </Label>
                <InputGroup>
                  <InputGroupText>{baseCurrency}</InputGroupText>
                  <Input id="debt-amount" aria-required type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={touched && !amountOk} placeholder="0" />
                  <FormFeedback>{t("debts.wizard.amountNeeded")}</FormFeedback>
                </InputGroup>
              </FormGroup>

              <FormGroup className="mb-0">
                <Label className="small fw-medium" for="debt-what">
                  {t("debts.what")}
                </Label>
                <Input id="debt-what" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("debts.whatPlaceholder")} />
              </FormGroup>
            </>
          )}

          {/* A loan, rather than money between two people. Two figures turn one
              into the other, and the cost of it appears before anything is
              saved — which is the moment it is worth knowing. */}
          {step === "interest" && (
            <YesNoChoice
              required
              question={t("debts.addWizard.titleInterest")}
              hideQuestion
              value={withInterest}
              onChange={setWithInterest}
              yesLabel={t("debts.addWizard.interestYes")}
              yesHint={t("debts.addWizard.interestYesHint")}
              noLabel={t("debts.addWizard.interestNo")}
              noHint={t("debts.addWizard.interestNoHint")}
              className="mb-0"
            >
              {/* Fixed or floating, before any figure is typed. Most mortgages
                  here are floating — an index plus a margin, re-read every few
                  months — and a loan recorded as fixed quietly promises a
                  payment the bank never promised. */}
              <div className={`${segmented.group} ${segmented.even} mb-1`} role="group" aria-label={t("debts.addWizard.rateType")}>
                <button type="button" className={`${segmented.item} ${!floating ? segmented.active : ""}`} aria-pressed={!floating} onClick={() => setRateType("fixed")}>
                  {t("debts.rateFixed")}
                </button>
                <button type="button" className={`${segmented.item} ${floating ? segmented.active : ""}`} aria-pressed={floating} onClick={() => setRateType("floating")}>
                  {t("debts.rateFloating")}
                </button>
              </div>
              <small className="text-body-secondary d-block mb-2">
                {t("debts.rateTypeHint")}
                <RateHelpButton formatCurrency={formatCurrency} locale={lang} />
              </small>

              {/* Two fields to a row, never three. At 375px a third one squeezes
                  the number inputs to forty pixels and "300" cannot be read in
                  the box it was typed into. */}
              {floating ? (
                <>
                  <div className="d-flex gap-2">
                    <FormGroup className="flex-fill">
                      <Label className="small fw-medium" for="debt-base">
                        {t("debts.baseRate")}
                      </Label>
                      <InputGroup>
                        <Input id="debt-base" type="number" min={0} step="0.01" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="2.4" />
                        <InputGroupText>%</InputGroupText>
                      </InputGroup>
                    </FormGroup>

                    <FormGroup className="flex-fill">
                      <Label className="small fw-medium" for="debt-margin">
                        {t("debts.margin")}
                      </Label>
                      <InputGroup>
                        <Input id="debt-margin" type="number" min={0} step="0.01" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="1.2" />
                        <InputGroupText>%</InputGroupText>
                      </InputGroup>
                    </FormGroup>
                  </div>

                  <div className="d-flex gap-2">
                    {termField}
                    {freeField}
                  </div>
                </>
              ) : (
                <>
                  <div className="d-flex gap-2">
                    <FormGroup className="flex-fill">
                      <Label className="small fw-medium" for="debt-rate">
                        {t("debts.interestRate")}
                      </Label>
                      <InputGroup>
                        <Input id="debt-rate" type="number" min={0} step="0.01" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7" />
                        <InputGroupText>%</InputGroupText>
                      </InputGroup>
                    </FormGroup>
                    {termField}
                  </div>

                  <div className="d-flex gap-2">
                    {freeField}
                    <div className="flex-fill" />
                  </div>
                </>
              )}
              <small className="text-body-secondary d-block mb-2">{t("debts.interestFreeHint")}</small>
              {!isLoanEntry && <div className={`${wiz.wizNote} mb-2`}>{t("debts.addWizard.noTermNote")}</div>}

              {instalment > 0 && (
                <div className={styles.loanPreview}>
                  <span className={styles.loanPreviewAmount}>
                    {t("debts.instalmentIs", { amount: formatCurrency(instalment) })}
                    {floating && <span className={styles.loanPreviewNote}> · {t("debts.atTodaysRate")}</span>}
                  </span>
                  <span className={styles.loanPreviewCost}>{t("debts.loanCost", { total: formatCurrency(receiptTotal), interest: formatCurrency(receiptInterest) })}</span>
                  {floating && <span className={styles.loanPreviewCost}>{t("debts.rateParts", { base: pct.format(num(base)), margin: pct.format(num(margin)) })} = {pct.format(allInRate)}%</span>}
                  {freeValue > 0 && allInRate > 0 && <span className={styles.loanPreviewCost}>{t("debts.freeThenCharged", { free: freeValue, rate: pct.format(allInRate) })}</span>}
                </div>
              )}
            </YesNoChoice>
          )}
          {step === "interest" && askedInterest && withInterest === undefined && <div className="invalid-feedback d-block">{t("debts.addWizard.answerNeeded")}</div>}

          {step === "dates" && (
            <>
              <FormGroup>
                <Label className="small fw-medium" for="debt-date">
                  {t("debts.when")}
                  <RequiredMark />
                </Label>
                <DateField id="debt-date" name="debt-date" happened value={date} onChange={setDate} placeholder={t("common.date")} invalid={!!dateError} />
                {!when && <div className="invalid-feedback d-block">{t("debts.addWizard.dateNeeded")}</div>}
                {dateError && <div className="invalid-feedback d-block">{t(dateError)}</div>}
              </FormGroup>
              <FormGroup className="mb-0">
                <Label className="small fw-medium" for="debt-due">
                  {t("debts.dueDate")}
                </Label>
                <DateField id="debt-due" name="debt-due" clearable value={dueDate} onChange={setDueDate} placeholder={t("debts.dueDate")} />
                <small className="text-body-secondary">{t("debts.dueDateHint")}</small>
              </FormGroup>
            </>
          )}

          {/* Borrowed: which card it came into. Lent: which card it left. It
              moves that card, as a transaction would — and, being a loan, is
              neither income nor spending. Kept in the tree on a covered debt,
              hidden: which way and "no card" are what make that debt. */}
          {step === "money" && (
            <>
              {linked && <p className="small text-body-secondary">{t("debts.coveredEditHint", { goal: covered.goalName || debt?.label || "" })}</p>}
              <div className={linked ? "d-none" : undefined}>
                <MoneyMovedPicker
                  value={account}
                  onChange={(next) => {
                    // A new yes / no answer opens fresh: its card is not wrong before it is asked.
                    if (typeof next !== typeof account) setMoneyTried(false);
                    setAccount(next);
                  }}
                  income={borrowed}
                  invalid={moneyTried}
                  hideQuestion
                  toGoal={
                    !debt && borrowed && goals.length > 0 ? (
                      <div className={styles.toGoal}>
                        <Label className="small fw-medium" for="debt-goal">
                          {t("debts.toGoal")}
                        </Label>
                        <Input id="debt-goal" type="select" bsSize="sm" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                          <option value="">{t("debts.toGoalNone")}</option>
                          {goals.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.icon ?? "🎯"} {g.name}
                            </option>
                          ))}
                        </Input>
                        {forGoal && (
                          <>
                            <Label className="small fw-medium mt-2" for="debt-goal-category">
                              {t("debts.toGoalCategory")}
                            </Label>
                            {/* Nothing chosen in advance: left empty, the expense goes to «Άλλα
                                έξοδα» at save — and the review says so. */}
                            <Input id="debt-goal-category" type="select" bsSize="sm" value={goalCategory} onChange={(e) => setGoalCategory(e.target.value)}>
                              <option value="">{t("debts.toGoalCategoryNone", { fallback: otherName })}</option>
                              {expenseCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.icon} {categoryLabel(c.name, t)}
                                </option>
                              ))}
                            </Input>
                            <p className="small text-body-secondary mb-0 mt-2">{t("debts.toGoalHint", { goal: forGoal.name })}</p>
                          </>
                        )}
                      </div>
                    ) : undefined
                  }
                />
              </div>
            </>
          )}

          {step === "review" && (
            <>
              <div className={wiz.wizCard}>
                {rows.map((row) => (
                  <button key={row.label} type="button" className={wiz.wizRow} onClick={() => goTo(row.step)}>
                    <span className={wiz.wizLabel}>{row.label}</span>
                    <span className={wiz.wizValue}>{row.value}</span>
                  </button>
                ))}
              </div>

              {/* The receipt: the loan, the interest on it, and the total —
                  which is exactly the instalments, so the lines add up. */}
              <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t(borrowed ? "debts.addWizard.receiptOut" : "debts.addWizard.receiptIn")}>
                <div className={styles.wizEffectHead}>{t(borrowed ? "debts.addWizard.receiptOut" : "debts.addWizard.receiptIn")}</div>
                <div className={wiz.wizStatic}>
                  <span className={wiz.wizLabel}>{t("debts.addWizard.principal")}</span>
                  <span className={wiz.wizValue}>{formatCurrency(amountOk ? value : 0)}</span>
                </div>
                <div className={wiz.wizStatic}>
                  <span className={wiz.wizLabel}>{t("debts.addWizard.interestTotal")}</span>
                  <span className={wiz.wizValue}>{formatCurrency(receiptInterest)}</span>
                </div>
                <div className={wiz.wizStatic}>
                  <span className={`${wiz.wizLabel} fw-semibold`}>{t("debts.addWizard.total")}</span>
                  <span className={`${wiz.wizValue} fw-bold`}>{formatCurrency(receiptTotal)}</span>
                </div>
                {isLoanEntry && amountOk && (
                  <div className={wiz.wizStatic}>
                    <span className={wiz.wizLabel}>{t("debts.addWizard.instalment")}</span>
                    <span className={wiz.wizValue}>
                      {formatCurrency(instalment)}
                      {floating && ` · ${t("debts.atTodaysRate")}`}
                    </span>
                  </div>
                )}
              </div>
              {withInterest && !isLoanEntry && <div className={`${wiz.wizNote} mt-2`}>{t("debts.addWizard.noTermNote")}</div>}
            </>
          )}
        </ModalBody>

        {/* Delete far left (editing), then Back / Cancel; Next / Save alone on the right. */}
        <ModalFooter className="justify-content-between">
          <div className="d-flex gap-2">
            {debt && onDelete && <DeleteButton opensConfirm iconOnly label={t("debts.deleteLoan")} onClick={onDelete} disabled={deleteLocked || saving} title={deleteReason} />}
            {step === "who" ? (
              <Button type="button" color="secondary" outline onClick={onClose} disabled={saving}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(DEBT_STEPS[index - 1])} disabled={saving || savingCovered}>
                ‹ {t("common.back")}
              </Button>
            )}
          </div>
          <div className="d-flex align-items-center gap-2">
            {step === "review" && <UnchangedHint show={unchanged} />}
            {step === "review" ? (
              <Button type="submit" color="primary" disabled={saving || savingCovered || !covered.ready || unchanged}>
                {saving || savingCovered ? t("common.saving") : t("common.save")}
              </Button>
            ) : (
              <Button type="submit" color="primary">
                {t("common.next")} ›
              </Button>
            )}
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}

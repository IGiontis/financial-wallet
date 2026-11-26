import { useMemo, useState } from "react";
import { Alert, Button, FormFeedback, FormGroup, FormText, Input, InputGroupText, Label, Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { DateField } from "../../shared/components/DateField";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { parseISODay, toISODay, happenedDayError, formatRecordDay } from "../../shared/utils/dates";
import type { CreateInvestmentContributionDTO, CreateTransactionDTO, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { useCategories, useCreateTransaction } from "../transactions/hooks/useTransactions";
import CategoryPicker from "../categories/CategoryPicker";
import { PayeeInput } from "../transactions/components/PayeeInput";
import { usePayees } from "../transactions/hooks/usePayees";
import { categoryLabel } from "../../shared/utils/categories";
import AccountPicker from "../accounts/AccountPicker";
import { useMoneyAccounts } from "../accounts/useMoneyAccounts";
import { chosenAccount, expectedByAccount, freeByAccount, mainAccount } from "../accounts/accountsUtils";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { goalHolding } from "./goalHolding";
import { useCoveredFunding } from "./useCoveredFunding";
import { coveredFundingVars } from "./coveredFunding";
import { SkeletonRows } from "../../shared/components/Skeletons";
import wizard from "../transactions/components/css/TransactionWizard.module.css";
import { FORM_MODAL, moneyToneHead } from "../../shared/components/formModal";
import { DialogFooter } from "../../shared/components/DialogFooter";
import { useStepTried } from "../../shared/hooks/useStepTried";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { MoneyInput } from "../../shared/components/MoneyInput";

// "use" first on a goal: where the money goes, or what became of it, decides
// everything after — which card moves, who holds it, whether an expense is written.
// Then WHERE before HOW MUCH (owner, 2026-11-12): the card, then the amount.
const ALL_STEPS = ["use", "card", "amount", "when", "review"] as const;
type Step = (typeof ALL_STEPS)[number];

/**
 * What happens to the money, on a savings goal.
 *
 * In:   kept      — set aside in your own bank; no card moves.
 *       given     — handed to someone to keep for the goal (the friend booking
 *                   the trip): it leaves the card it came from.
 *       covered   — someone paid it for you (Nikos paid the hotel): no money of
 *                   yours moves, and you owe them. An expense, a debt and the
 *                   goal's deposit, written together — see `createCoveredFunding`.
 * Out:  kept      — set aside no longer, still in your bank; no card moves.
 *       spent     — from your bank, given or spent: an expense, the card goes down.
 *       returned  — what someone held, given back: the card it comes into goes up.
 *       theySpent — what someone held, spent for the goal: an expense, and no
 *                   card moves — it left when it was handed over.
 */
type Mode = "kept" | "given" | "spent" | "returned" | "theySpent" | "covered";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Money into a goal or an investment, or out of one — in steps, the check last
 * and Save only there.
 *
 * On an INVESTMENT the card is the one the money left, or came back into, and
 * it moves. On a savings GOAL the first question is where the money goes, or
 * what became of it (see `Mode`); nothing is chosen for you, the card included
 * where the money leaves it, since a default once kept the card unchanged for
 * money that had in fact gone.
 *
 * Every record lands in Transactions, marked as the goal's or the
 * investment's, with the card and — handed to someone — the person on it. A
 * goal's withdrawal counts as money in and its expense as money out, so a
 * month's net is untouched by spending what was saved.
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
  // Fetched, not only read from what is loaded: the Goals page loads no
  // transactions of its own, and without them who holds the goal's money and
  // what each card holds both read as nothing.
  const { accounts, latest, transactions, isLoading: moneyLoading } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  // What each card holds that is not already in a goal (item 97d) — known only where a reading read it.
  const freeMoney = useMemo(() => freeByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  const holding = useMemo(() => goalHolding(goal, transactions), [goal, transactions]);
  const { data: categories = [] } = useCategories();
  const { payees } = usePayees();
  const createExpense = useCreateTransaction();
  const coveredFunding = useCoveredFunding();
  const toBase = (n: number) => (baseCurrency === displayCurrency ? n : convertToBase(n));

  const deposit = kind === "deposit";
  const STEPS = (isGoal ? ALL_STEPS : ALL_STEPS.filter((s) => s !== "use")) as readonly Step[];

  // A goal with a deadline cannot take more than it still needs.
  const isDeadlineGoal = goal.goalType === "targeted" && goal.targetPeriod !== "monthly" && goal.targetPeriod !== "yearly";
  const remaining = goal.remaining ?? 0;
  const capped = deposit && isDeadlineGoal;
  const full = capped && remaining <= 0;

  const [step, setStep] = useState<Step>(STEPS[0]);
  const [amount, setAmount] = useState("");
  const [gain, setGain] = useState("");
  const [date, setDate] = useState(() => toISODay(new Date()));
  const [notes, setNotes] = useState("");
  const [account, setAccount] = useState("");
  const { tried: triedOn, mark: markTried } = useStepTried<Step>();
  const tried = triedOn(step);
  const [saving, setSaving] = useState(false);
  // An investment has one way in and one out; a goal asks.
  const [mode, setMode] = useState<Mode | null>(isGoal ? null : "kept");
  /** For "returned" and "theySpent": whose money it is. */
  const [holderName, setHolderName] = useState("");
  /** "given": who to; "spent": to whom or for what. */
  const [person, setPerson] = useState("");
  const [pickedCategory, setPickedCategory] = useState("");
  const [changingCategory, setChangingCategory] = useState(false);

  const holder = holding.holders.find((h) => h.name === holderName);
  const otherExpense = categories.find((c) => c.type === "expense" && c.name === "Other Expense")?.id ?? "";
  const category = pickedCategory || otherExpense;
  const categoryName = category ? categoryLabel(categories.find((c) => c.id === category)?.name, t) : "—";

  // ── What each mode needs ──
  const leavesCard = !isGoal ? deposit : mode === "given" || mode === "spent";
  const entersCard = !isGoal ? !deposit : mode === "returned";
  /**
   * The card is said, not assumed (item 97a): wherever money leaves or enters
   * one, and for money set aside, which bank holds it. Not when someone else
   * paid (no card of yours moves) or spent what they held (it left when handed
   * over). With one place only, that one is the answer — see `chosenAccount`.
   */
  const pickedAccount = chosenAccount(accounts, account);
  const cardMustBeChosen = accounts.length > 0 && mode !== null && mode !== "covered" && mode !== "theySpent";
  const isCovered = isGoal && mode === "covered";
  const needsPerson = isGoal && (mode === "given" || mode === "spent" || mode === "covered");
  const writesExpense = isGoal && (mode === "spent" || mode === "theySpent");
  // "theySpent" moves no card: the record is written on the card it was handed from.
  const cardAccount = mode === "theySpent" ? (holder?.accountId ?? "") : pickedAccount;

  const typed = parseFloat(amount);
  const typedGain = Math.max(parseFloat(gain) || 0, 0);
  const balance = goal.totalSaved;
  /** What this withdrawal may take: your bank's part, or one person's. */
  const available = !isGoal ? balance : mode === "returned" || mode === "theySpent" ? (holder?.amount ?? 0) : holding.inBanks;
  const availableInDisplay = round2(convert(available));
  // Taking all of an investment out: what came on top of it is a gain.
  const takingAll = !isGoal && !deposit && Number.isFinite(typed) && Math.abs(typed - availableInDisplay) < 0.01;
  const total = (Number.isFinite(typed) ? typed : 0) + (takingAll ? typedGain : 0);
  const totalInBase = round2(toBase(total));

  const amountError = (() => {
    if (!Number.isFinite(typed) || typed <= 0) return t("validation.amountPositive");
    if (capped && totalInBase > remaining + 0.005) return t("investments.cannotExceedRemaining", { amount: format(remaining) });
    if (isGoal && !deposit && totalInBase > available + 0.005) return t("goalWizard.moreThanThere", { amount: format(available) });
    if (typed > 10_000_000) return t("validation.amountTooLarge");
    return undefined;
  })();
  const when = parseISODay(date);
  // Money that moved (or was paid for you, or spent): today or earlier — the
  // owner's report, 2026-11-14: a deposit could be dated next week.
  const dateError = happenedDayError(date);
  const notesTooLong = notes.length > 40;

  // A deposit cannot set aside, or hand over, money the card does not have
  // (item 97d): kept in it, given from it, or into an investment from it. Its
  // free money is what it holds less what goals already keep in it. A card whose
  // balance is unknown (no reading yet) is never refused on a guess.
  const checksFree = deposit && (!isGoal || mode === "kept" || mode === "given");
  const cardFree = checksFree && pickedAccount ? freeMoney[pickedAccount] : undefined;
  const overFree = !!cardFree && totalInBase > cardFree.free + 0.005;
  const freeMessage = (id: string) => {
    const known = freeMoney[id];
    const name = accounts.find((a) => a.id === id)?.name ?? "";
    if (!known) return "";
    const values = { name, free: format(Math.max(known.free, 0)), held: format(known.held) };
    return known.held > 0.005 ? t("goalWizard.freeOnCardHeld", values) : t("goalWizard.freeOnCard", values);
  };

  const index = STEPS.indexOf(step);
  /** Whether a step is filled in enough to go past it. */
  const done = (s: Step) => {
    if (s === "use") return mode !== null && (mode !== "returned" && mode !== "theySpent" ? true : !!holder);
    // The card's free money is checked where the amount is typed: the card comes first.
    if (s === "amount") return !amountError && !overFree;
    if (s === "when") return !!when && !dateError && !notesTooLong;
    if (s === "card") return (!cardMustBeChosen || !!pickedAccount) && (!needsPerson || !!person.trim()) && ((!writesExpense && !isCovered) || !!category);
    return true;
  };
  // Forward only as far as what is filled in allows; back is always free.
  const goTo = (target: Step) => {
    const to = STEPS.indexOf(target);
    const blocked = STEPS.slice(0, to).find((s) => !done(s));
    if (blocked) {
      markTried(blocked);
      return setStep(blocked);
    }
    setStep(target);
  };

  // ── What it does, in figures ──
  const savedAfter = round2(balance + (deposit ? totalInBase : -totalInBase));
  /** This deposit completes a goal to reach once: the one milestone here (confetti). */
  const reachesTarget = deposit && isDeadlineGoal && !!goal.targetAmount && balance < goal.targetAmount - 0.005 && savedAfter >= goal.targetAmount - 0.005;
  const gainPart = takingAll && totalInBase > balance + 0.005 ? round2(totalInBase - balance) : 0;
  const named = accounts.find((a) => a.id === cardAccount);
  const main = mainAccount(accounts);
  const cardName = named ? named.name : main ? t("bills.pay.mainCard", { name: main.name }) : t("accounts.noCard");
  const card = named ?? main;
  const cardNow = card ? holds[card.id] : undefined;
  const cardDelta = leavesCard ? -totalInBase : entersCard ? totalInBase : 0;
  const cardAfter = cardNow === undefined || cardDelta === 0 ? undefined : round2(cardNow + cardDelta);
  const heldBy = mode === "given" ? person.trim() : mode === "returned" || mode === "theySpent" ? holder?.name : undefined;

  const save = async () => {
    if (amountError || !when || dateError || (cardMustBeChosen && !pickedAccount) || overFree) return;
    setSaving(true);
    if (isCovered) {
      // Someone else paid: the goal's deposit, the debt to them and the expense,
      // as one — no card moves, so none is asked.
      try {
        const who = person.trim();
        await saveWithoutWaiting(
          coveredFunding,
          coveredFundingVars({
            goal,
            who,
            amount: totalInBase,
            date: when,
            categoryId: category,
            notes: notes.trim() || t("goalWizard.coveredNote", { who }),
            expenseNotes: t("goalWizard.coveredExpenseNote", { who }),
          }),
          () => toast.error(t("goalWizard.coveredFailed")),
        );
        toast.success(doneMessage());
        // The goal card's tanks play the move once this dialog has gone (item 95).
        celebrateSave({ collection: "investmentContributions", id: goal.id, milestone: reachesTarget });
        onClose();
      } finally {
        setSaving(false);
      }
      return;
    }
    const dto: CreateInvestmentContributionDTO = {
      goalId: goal.id,
      amount: totalInBase,
      contributionType: kind,
      date: when,
      notes: notes.trim() || undefined,
      accountId: cardAccount || undefined,
      heldBy,
    };
    try {
      await onSubmit(dto);
      if (writesExpense) {
        // What it was spent on: an ordinary expense, on the card the money left — for
        // "theySpent" the card it was handed from, where it cancels the withdrawal.
        const expense: CreateTransactionDTO = {
          amount: totalInBase,
          type: "expense",
          categoryId: category,
          date: when,
          description: mode === "spent" ? person.trim() : `${goal.name} · ${holder?.name ?? ""}`,
          notes: t("goalWizard.fromGoal", { name: goal.name }),
          accountId: cardAccount || undefined,
        };
        await saveWithoutWaiting(createExpense, expense, () => toast.error(t("transactions.saveFailed")));
      }
      toast.success(doneMessage());
      celebrateSave({ collection: "investmentContributions", id: goal.id, milestone: reachesTarget });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const doneMessage = () => {
    const values = { amount: format(totalInBase), name: goal.name, on: person.trim(), who: holder?.name ?? person.trim() };
    if (deposit) return t(mode === "given" ? "goalWizard.doneGiven" : mode === "covered" ? "goalWizard.doneCovered" : "goalWizard.doneIn", values);
    if (mode === "spent") return t("goalWizard.doneSpent", values);
    if (mode === "returned") return t("goalWizard.doneReturned", values);
    if (mode === "theySpent") return t("goalWizard.doneTheySpent", values);
    return t("goalWizard.doneOut", values);
  };

  // ── The choices on the first step ──
  type Choice = { key: string; mode: Mode; holder?: string; title: string; hint: string };
  const choices: Choice[] = deposit
    ? [
        { key: "kept", mode: "kept", title: t("goalWizard.inKept"), hint: t("goalWizard.inKeptHint") },
        { key: "given", mode: "given", title: t("goalWizard.inGiven"), hint: t("goalWizard.inGivenHint") },
        { key: "covered", mode: "covered", title: t("goalWizard.inCovered"), hint: t("goalWizard.inCoveredHint") },
      ]
    : [
        ...holding.holders.flatMap((h): Choice[] => [
          { key: `returned:${h.name}`, mode: "returned", holder: h.name, title: t("goalWizard.outReturned", { who: h.name }), hint: t("goalWizard.outReturnedHint", { who: h.name, amount: format(h.amount) }) },
          { key: `theySpent:${h.name}`, mode: "theySpent", holder: h.name, title: t("goalWizard.outTheySpent", { who: h.name }), hint: t("goalWizard.outTheySpentHint", { amount: format(h.amount) }) },
        ]),
        ...(holding.inBanks > 0.005
          ? [
              { key: "spent", mode: "spent" as Mode, title: t("goalWizard.useSpent"), hint: t("goalWizard.useSpentHint") },
              { key: "kept", mode: "kept" as Mode, title: t("goalWizard.useKept"), hint: t("goalWizard.useKeptHint") },
            ]
          : []),
      ];
  const chosenKey = mode === null ? null : mode === "returned" || mode === "theySpent" ? `${mode}:${holderName}` : mode;

  const rows: { step: Step; label: string; value: string }[] = [
    ...(isGoal && mode ? [{ step: "use" as Step, label: t("goalWizard.rowWhat"), value: choices.find((c) => c.key === chosenKey)?.title ?? "" }] : []),
    ...(mode === "given" ? [{ step: "card" as Step, label: t("goalWizard.rowGivenTo"), value: person.trim() }] : []),
    ...(mode === "spent" ? [{ step: "card" as Step, label: t("goalWizard.rowSpentOn"), value: `${person.trim()} · ${categoryName}` }] : []),
    ...(mode === "theySpent" ? [{ step: "card" as Step, label: t("common.category"), value: categoryName }] : []),
    ...(isCovered
      ? [
          { step: "card" as Step, label: t("goalWizard.rowCoveredBy"), value: person.trim() },
          { step: "card" as Step, label: t("common.category"), value: categoryName },
        ]
      : [{ step: "card" as Step, label: t(cardRowKey()), value: cardName }]),
    // The card (or who) before the amount, as the steps ask them.
    { step: "amount", label: t("common.amount"), value: format(totalInBase) },
    { step: "when", label: t("common.date"), value: when ? formatRecordDay(when, lang) : "—" },
    ...(notes.trim() ? [{ step: "when" as Step, label: t("common.notes"), value: notes.trim() }] : []),
  ];

  function cardRowKey() {
    if (!isGoal) return deposit ? "goalWizard.rowFrom" : "goalWizard.rowInto";
    if (mode === "kept") return "goalWizard.rowHeldIn";
    if (mode === "returned") return "goalWizard.rowInto";
    if (mode === "theySpent") return "goalWizard.rowHandedFrom";
    return "goalWizard.rowFrom";
  }

  const ask = (s: Step) => {
    if (s === "use") return t(deposit ? "goalWizard.askWhere" : "goalWizard.askUse");
    if (s === "card") {
      if (!isGoal) return t(deposit ? "goalWizard.askFrom" : "goalWizard.askInto");
      if (mode === "kept") return t("goalWizard.askHeldIn");
      if (mode === "covered") return t("goalWizard.askCoveredBy");
      if (mode === "returned") return t("goalWizard.askReturnedInto");
      if (mode === "theySpent") return t("goalWizard.askTheySpent");
      return t("goalWizard.askLeft");
    }
    return t(`goalWizard.ask_${s}_${deposit ? "in" : "out"}`);
  };

  const cardHint = () => {
    if (!isGoal) return t(deposit ? "goalWizard.leavesHint" : "goalWizard.returnsHint");
    if (mode === "kept") return t("goalWizard.heldHint");
    if (mode === "returned") return t("goalWizard.returnedHint");
    return t("goalWizard.leftHint");
  };

  const categoryChooser = (
    <>
      <div className="small text-body-secondary mt-2 d-flex flex-wrap align-items-center gap-2">
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
            manage="link"
            categories={categories}
            value={category}
            type="expense"
            onChange={(id) => {
              setPickedCategory(id);
              setChangingCategory(false);
            }}
          />
        </div>
      )}
    </>
  );

  const title = t(deposit ? "investments.addDepositTitle" : "investments.withdrawTitle", { icon: goal.icon ?? "💰", name: goal.name });

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable>
      {/* Which way the money goes, on the HEADER (rule 15a): a deposit takes money
          off a card (red), a withdrawal brings it back (green). */}
      <ModalHeader className={moneyToneHead(deposit ? "expense" : "income")} toggle={onClose}>
        {title}
      </ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") void save();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => (s === "card" && isCovered ? t("goalWizard.step_who") : t(`goalWizard.step_${s}${s === "use" && deposit ? "_in" : ""}`))} />
          <p className={wizard.prompt}>
            {ask(step)}
            {/* The use, and the card when one has to be chosen, are asked; the steps with fields mark their fields. */}
            {(step === "use" || (step === "card" && cardMustBeChosen)) && <RequiredMark />}
          </p>

          {moneyLoading && <SkeletonRows count={3} icon={false} />}

          {!moneyLoading && step === "use" && (
            <>
              <div className="d-flex flex-column gap-2 mb-2" role="radiogroup" aria-label={ask("use")} aria-required>
                {choices.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={chosenKey === c.key}
                    className={`btn text-start ${chosenKey === c.key ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => {
                      setMode(c.mode);
                      setHolderName(c.holder ?? "");
                      // A new answer here asks the card again: nothing carried over from another use.
                      setAccount("");
                    }}
                  >
                    <div className="fw-semibold">{c.title}</div>
                    <div className="small" style={{ opacity: 0.8 }}>
                      {c.hint}
                    </div>
                  </button>
                ))}
              </div>
              {tried && mode === null && <div className="small text-danger">{t(deposit ? "goalWizard.pickWhere" : "goalWizard.pickUse")}</div>}
            </>
          )}

          {step === "amount" && (
            <>
              {capped && !full && (
                <Alert color="info" className="py-2" style={{ fontSize: "var(--fs-text)" }}>
                  {t("investments.deadlineGoalHint", { amount: format(remaining) })}
                </Alert>
              )}
              {full && (
                <Alert color="success" className="py-2" style={{ fontSize: "var(--fs-text)" }}>
                  {t("investments.goalFullyFunded")}
                </Alert>
              )}
              <FormGroup className="mb-2">
                <Label for="contribution-amount" className="small fw-medium">
                  {t("common.amount")}
                  <RequiredMark />
                </Label>
                <MoneyInput id="contribution-amount" required autoFocus min={0} value={amount} disabled={full} invalid={tried && (!!amountError || overFree)} onChange={setAmount}>
                  {!deposit && <InputGroupText>{t("goalWizard.of", { amount: format(available) })}</InputGroupText>}
                  <FormFeedback>{amountError}</FormFeedback>
                </MoneyInput>
                {/* More than the chosen card has free: said as it is typed. */}
                {overFree && cardFree && (
                  <div className="invalid-feedback d-block" role="alert">
                    {t(cardFree.held > 0.005 ? "goalWizard.tooLittleFreeHeld" : "goalWizard.tooLittleFree", {
                      name: accounts.find((a) => a.id === pickedAccount)?.name ?? "",
                      free: format(Math.max(cardFree.free, 0)),
                      held: format(cardFree.held),
                    })}
                  </div>
                )}
                {capped && !full && <FormText style={{ fontSize: "var(--fs-caption)" }}>{t("investments.maxDepositHint", { amount: format(remaining) })}</FormText>}
                {/* What the chosen card can give (chosen on the step before); without one, what each can. */}
                {checksFree && !overFree && pickedAccount && cardFree && (
                  <FormText className="d-block" style={{ fontSize: "var(--fs-caption)" }}>
                    {freeMessage(pickedAccount)}
                  </FormText>
                )}
                {checksFree && !pickedAccount && Object.keys(freeMoney).length > 0 && (
                  <FormText className="d-block" style={{ fontSize: "var(--fs-caption)" }}>
                    {t("goalWizard.freeNow", {
                      list: accounts
                        .filter((a) => freeMoney[a.id])
                        .map((a) => `${a.name} ${format(Math.max(freeMoney[a.id].free, 0))}`)
                        .join(" · "),
                    })}
                  </FormText>
                )}
              </FormGroup>
              {!deposit && available > 0 && (
                <Button type="button" size="sm" color="secondary" outline onClick={() => setAmount(String(availableInDisplay))}>
                  {t("investments.withdrawAll")} · {format(available)}
                </Button>
              )}
              {takingAll && (
                <FormGroup className="mt-3 mb-0">
                  <Label for="contribution-gain" className="small fw-medium">
                    {t("investments.profitLabel")}
                  </Label>
                  <MoneyInput id="contribution-gain" min={0} value={gain} onChange={setGain} />
                  <FormText style={{ fontSize: "var(--fs-caption)" }}>{t("investments.profitHint", { amount: format(balance) })}</FormText>
                </FormGroup>
              )}
            </>
          )}

          {step === "when" && (
            <>
              <FormGroup>
                <Label className="small fw-medium">
                  {t("common.date")}
                  <RequiredMark />
                </Label>
                <DateField happened value={date} onChange={setDate} placeholder={t("common.date")} invalid={tried && !!dateError} />
                {tried && dateError && <div className="invalid-feedback d-block">{t(dateError)}</div>}
              </FormGroup>
              <FormGroup className="mb-0">
                <Label for="contribution-notes" className="small fw-medium">
                  {t("common.notes")}
                </Label>
                <Input id="contribution-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("common.optionalNote")} invalid={notesTooLong} />
                <FormFeedback>{t("validation.maxChars", { count: 40 })}</FormFeedback>
                <FormText style={{ fontSize: "var(--fs-caption)" }}>{notes.length} / 40</FormText>
              </FormGroup>
            </>
          )}

          {step === "card" && (
            <>
              {isCovered ? (
                // Nothing to choose: no card of yours moves — someone else paid.
                <p className="small text-body-secondary mb-0">{t("goalWizard.coveredNoCard")}</p>
              ) : mode === "theySpent" ? (
                // Nothing to choose: it left the card it was handed from, and stays gone.
                <p className="small mb-0">{t("goalWizard.theySpentCard", { who: holder?.name ?? "", card: cardName })}</p>
              ) : (
                <>
                  <AccountPicker
                    value={account}
                    onChoose={setAccount}
                    income={entersCard}
                    invalid={cardMustBeChosen && tried}
                    free={checksFree ? { amounts: freeMoney, need: totalInBase } : undefined}
                  />
                  {/* Said as soon as the card is chosen: choosing it is the touch. */}
                  {overFree && cardFree ? (
                    <div className="invalid-feedback d-block mt-2" role="alert">
                      {t(cardFree.held > 0.005 ? "goalWizard.tooLittleFreeHeld" : "goalWizard.tooLittleFree", {
                        name: accounts.find((a) => a.id === pickedAccount)?.name ?? "",
                        free: format(Math.max(cardFree.free, 0)),
                        held: format(cardFree.held),
                      })}
                    </div>
                  ) : (
                    cardFree && <p className="small text-body-secondary mt-2 mb-0">{freeMessage(pickedAccount)}</p>
                  )}
                  <p className="small text-body-secondary mt-2 mb-0">{cardHint()}</p>
                </>
              )}

              {/* To whom: the payee field the transactions use, offering the names already written. */}
              {needsPerson && (
                <div className="mt-3">
                  <p className={wizard.prompt}>
                    {t(mode === "given" ? "goalWizard.askGivenTo" : mode === "covered" ? "goalWizard.askWhoPaid" : "goalWizard.askWho")}
                    <RequiredMark />
                  </p>
                  <PayeeInput required value={person} payees={payees} onChange={setPerson} invalid={tried && !person.trim()} placeholder={t(mode === "covered" ? "goalWizard.paidByPlaceholder" : "goalWizard.spentOnPlaceholder")} />
                </div>
              )}
              {(writesExpense || isCovered) && categoryChooser}
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
                {heldBy && (
                  <div>
                    <span>{t("goalWizard.holds", { who: heldBy })}</span>
                    <strong>{format(Math.max(round2((mode === "given" ? (holding.holders.find((h) => h.name.toLowerCase() === heldBy.toLowerCase())?.amount ?? 0) + totalInBase : (holder?.amount ?? 0) - totalInBase)), 0))}</strong>
                  </div>
                )}
                {gainPart > 0 && (
                  <div>
                    <span>{t("goalWizard.gain")}</span>
                    <strong style={{ color: "var(--color-income)" }}>+{format(gainPart)}</strong>
                  </div>
                )}
                {isCovered ? (
                  <>
                    <div>
                      <span>{t("goalWizard.coveredCards")}</span>
                      <strong>{t("goalWizard.cardUnchanged")}</strong>
                    </div>
                    <div>
                      <span>{t("goalWizard.andExpense")}</span>
                      <strong>
                        −{format(totalInBase)} · {categoryName}
                      </strong>
                    </div>
                    <div>
                      <span>{t("goalWizard.coveredDebt", { who: person.trim() })}</span>
                      <strong style={{ color: "var(--color-expense-text)" }}>{format(totalInBase)}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span>{cardName}</span>
                      <strong>{cardAfter === undefined || cardNow === undefined ? t(mode === "theySpent" ? "goalWizard.cardAlreadyLeft" : "goalWizard.cardUnchanged") : `${format(cardNow)} → ${format(cardAfter)}`}</strong>
                    </div>
                    <div>
                      <span>{t("goalWizard.inTransactions")}</span>
                      <strong>{t(deposit ? "goalWizard.recordIn" : "goalWizard.recordOut", { amount: format(totalInBase) })}</strong>
                    </div>
                  </>
                )}
                {writesExpense && (
                  <div>
                    <span>{t("goalWizard.andExpense")}</span>
                    <strong>
                      −{format(totalInBase)} · {mode === "spent" ? person.trim() : categoryName}
                    </strong>
                  </div>
                )}
              </div>
            </>
          )}
        </ModalBody>

        {/* Ακύρωση / Πίσω on the left, the way forward on the right; a delete would go
            first on the left with the rule between them (rule 15b, `DialogFooter`). */}
        <DialogFooter
          back={
            index === 0 ? (
              <Button type="button" color="secondary" outline onClick={onClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])} disabled={saving}>
                ‹ {t("common.back")}
              </Button>
            )
          }
        >
          {step === "review" ? (
            <Button type="submit" color="primary" disabled={saving || !!amountError}>
              {saving ? t("common.saving") : t(deposit ? "investments.addDeposit" : "investments.confirmWithdrawal")}
            </Button>
          ) : (
            <Button type="submit" color="primary" disabled={full || moneyLoading}>
              {t("common.next")} ›
            </Button>
          )}
        </DialogFooter>
      </form>
    </Modal>
  );
}

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
import { PayeeInput } from "../transactions/components/PayeeInput";
import { usePayees } from "../transactions/hooks/usePayees";
import { categoryLabel } from "../../shared/utils/categories";
import AccountPicker from "../accounts/AccountPicker";
import { useMoneyAccounts } from "../accounts/useMoneyAccounts";
import { expectedByAccount, mainAccount } from "../accounts/accountsUtils";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { formatTable } from "../transactions/transactionDates";
import { goalHolding } from "./goalHolding";
import { useCoveredFunding } from "./useCoveredFunding";
import { coveredFundingVars } from "./coveredFunding";
import { SkeletonRows } from "../../shared/components/Skeletons";
import wizard from "../transactions/components/css/TransactionWizard.module.css";
import { FORM_MODAL } from "../../shared/components/formModal";

// "use" first on a goal: where the money goes, or what became of it, decides
// everything after — which card moves, who holds it, whether an expense is written.
const ALL_STEPS = ["use", "amount", "when", "card", "review"] as const;
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
  const [cardPicked, setCardPicked] = useState(false);
  const [tried, setTried] = useState(false);
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
  /** The card is said, not assumed, wherever the money leaves or enters one. */
  const cardMustBeChosen = isGoal && (mode === "given" || mode === "spent" || mode === "returned");
  const isCovered = isGoal && mode === "covered";
  const needsPerson = isGoal && (mode === "given" || mode === "spent" || mode === "covered");
  const writesExpense = isGoal && (mode === "spent" || mode === "theySpent");
  // "theySpent" moves no card: the record is written on the card it was handed from.
  const cardAccount = mode === "theySpent" ? (holder?.accountId ?? "") : account;

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
  const notesTooLong = notes.length > 40;

  const index = STEPS.indexOf(step);
  /** Whether a step is filled in enough to go past it. */
  const done = (s: Step) => {
    if (s === "use") return mode !== null && (mode !== "returned" && mode !== "theySpent" ? true : !!holder);
    if (s === "amount") return !amountError;
    if (s === "when") return !!when && !notesTooLong;
    if (s === "card") return (!cardMustBeChosen || cardPicked) && (!needsPerson || !!person.trim()) && ((!writesExpense && !isCovered) || !!category);
    return true;
  };
  // Forward only as far as what is filled in allows; back is always free.
  const goTo = (target: Step) => {
    const to = STEPS.indexOf(target);
    const blocked = STEPS.slice(0, to).find((s) => !done(s));
    if (blocked) {
      setTried(true);
      return setStep(blocked);
    }
    setStep(target);
  };

  // ── What it does, in figures ──
  const savedAfter = round2(balance + (deposit ? totalInBase : -totalInBase));
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
    if (amountError || !when) return;
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
    { step: "amount", label: t("common.amount"), value: format(totalInBase) },
    { step: "when", label: t("common.date"), value: when ? formatTable(when, lang) : "—" },
    ...(mode === "given" ? [{ step: "card" as Step, label: t("goalWizard.rowGivenTo"), value: person.trim() }] : []),
    ...(mode === "spent" ? [{ step: "card" as Step, label: t("goalWizard.rowSpentOn"), value: `${person.trim()} · ${categoryName}` }] : []),
    ...(mode === "theySpent" ? [{ step: "card" as Step, label: t("common.category"), value: categoryName }] : []),
    ...(isCovered
      ? [
          { step: "card" as Step, label: t("goalWizard.rowCoveredBy"), value: person.trim() },
          { step: "card" as Step, label: t("common.category"), value: categoryName },
        ]
      : [{ step: "card" as Step, label: t(cardRowKey()), value: cardName }]),
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
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => (s === "card" && isCovered ? t("goalWizard.step_who") : t(`goalWizard.step_${s}${s === "use" && deposit ? "_in" : ""}`))} />
          <p className={wizard.prompt}>{ask(step)}</p>

          {moneyLoading && <SkeletonRows count={3} icon={false} />}

          {!moneyLoading && step === "use" && (
            <>
              <div className="d-flex flex-column gap-2 mb-2" role="radiogroup" aria-label={ask("use")}>
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
                      setCardPicked(false);
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
                  {!deposit && <InputGroupText>{t("goalWizard.of", { amount: format(available) })}</InputGroupText>}
                  <FormFeedback>{amountError}</FormFeedback>
                </InputGroup>
                {capped && !full && <FormText style={{ fontSize: 11 }}>{t("investments.maxDepositHint", { amount: format(remaining) })}</FormText>}
              </FormGroup>
              {!deposit && available > 0 && (
                <Button type="button" size="sm" color="secondary" outline onClick={() => setAmount(String(availableInDisplay))}>
                  {t("investments.withdrawAll")} · {format(available)}
                </Button>
              )}
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
                    unset={cardMustBeChosen && !cardPicked}
                    onChoose={(id) => {
                      setAccount(id);
                      setCardPicked(true);
                    }}
                    income={entersCard}
                  />
                  {cardMustBeChosen && tried && !cardPicked && <div className="small text-danger mt-1">{t("goalWizard.pickCard")}</div>}
                  <p className="small text-body-secondary mt-2 mb-0">{cardHint()}</p>
                </>
              )}

              {/* To whom: the payee field the transactions use, offering the names already written. */}
              {needsPerson && (
                <div className="mt-3">
                  <p className={wizard.prompt}>{t(mode === "given" ? "goalWizard.askGivenTo" : mode === "covered" ? "goalWizard.askWhoPaid" : "goalWizard.askWho")}</p>
                  <PayeeInput value={person} payees={payees} onChange={setPerson} invalid={tried && !person.trim()} placeholder={t(mode === "covered" ? "goalWizard.paidByPlaceholder" : "goalWizard.spentOnPlaceholder")} />
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

        <ModalFooter className="justify-content-between">
          {index === 0 ? (
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
            <Button type="submit" color="primary" disabled={full || moneyLoading}>
              {t("common.next")} ›
            </Button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

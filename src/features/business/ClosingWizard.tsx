import { Fragment, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiPlus, FiX } from "react-icons/fi";
import { DateField } from "../../shared/components/DateField";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { FORM_MODAL } from "../../shared/components/formModal";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { useStepTried } from "../../shared/hooks/useStepTried";
import { categoryLabel, VIRTUAL_CATEGORIES, BUSINESS_CATEGORY_ID } from "../../shared/utils/categories";
import { cleanLine } from "../../shared/utils/cleanText";
import { firestoreToDate, parseISODay, toISODay, happenedDayError, formatRecordDay } from "../../shared/utils/dates";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { SavedCheck } from "../transactions/components/SavedCheck";
import page from "../transactions/components/css/TransactionWizard.module.css";
import { useTransactions } from "../transactions/hooks/useTransactions";
import AccountPicker from "../accounts/AccountPicker";
import ReviewCard from "../accounts/ReviewCard";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount, mainAccount } from "../accounts/accountsUtils";
import type { Business, BusinessEntry, BusinessExpense, BusinessIncome, BusinessLine } from "../../shared/types/IndexTypes";
import { LINES_MAX as CLOSING_LINES_MAX } from "./businessKeys";
import { closingFigures, personalMove, personalRecord } from "./businessSummary";
import { businessOf, expenseName, lineName, profitTone, signed } from "./businessFormat";
import { useSaveClosing } from "./useBusiness";
import styles from "./css/Business.module.css";
import tiles from "../../shared/components/css/YesNoChoice.module.css";
import wiz from "../../shared/css/Wizard.module.css";
import { useFormChanged } from "../../shared/hooks/useFormChanged";
import { UnchangedHint } from "../../shared/components/UnchangedHint";

// «Κλείσιμο ημέρας» of one business: which business and which day, what each of
// its income lines took in, what each of its expense lines paid out (and any
// one-off «άλλο έξοδο»), where the day's profit goes in the owner's own money —
// or where its loss comes out of — and the check, which shows every figure and
// is the only place Save is. Every money field starts EMPTY, with a
// placeholder; an empty one counts as 0. The business is asked only when there
// is more than one, and comes chosen when the page shows one.
//
// A correction opens on the check, every step a tap away, and the check says
// what changes: before → after.

// WHERE before HOW MUCH (owner, 2026-11-12): the card the day's money goes to
// (or comes from) is asked before the lines' amounts.
const STEPS = ["day", "account", "incomes", "expenses", "review"] as const;
type Step = (typeof STEPS)[number];

const AMOUNT_MAX = 1e9;
const NOTE_MAX = 1000;
const ONE_OFF_NAME_MAX = 80;

interface OneOff {
  key: number;
  name: string;
  amount: string;
  note?: string;
}

const parse = (text: string) => parseFloat(text.replace(",", "."));
/** A money field as typed: empty is 0; anything else must be a number from 0 to the limit. */
const amountOk = (text: string) => text.trim() === "" || (Number.isFinite(parse(text)) && parse(text) >= 0 && parse(text) <= AMOUNT_MAX);
const amountOf = (text: string) => (text.trim() === "" || !amountOk(text) ? 0 : parse(text));
const blankOneOff = (o: OneOff) => !o.name.trim() && !o.amount.trim();
const oneOffOk = (o: OneOff) => blankOneOff(o) || (!!cleanLine(o.name) && amountOk(o.amount) && amountOf(o.amount) > 0);

/** The lines a closing of `business` offers: the ones on it now, and — for a correction — any taken off since that this closing names. */
function linesFor(business: Business | undefined, kind: "incomeLines" | "expenseLines", named: readonly (string | undefined)[]): BusinessLine[] {
  if (!business) return [];
  return business[kind].filter((l) => !l.removed || named.includes(l.id));
}

/**
 * The same wizard in two frames: a dialog over the «Δουλειά» page, or the
 * whole of a page of its own (`/business/new`, from the menu) — as
 * «Νέα συναλλαγή» is (`AddTransactionModal asPage`). Only the frame differs;
 * on the page a save shows what went in, with «Νέο κλείσιμο» again
 * (`onAgain`) and the way to the summary (`onClose`).
 */
export default function ClosingWizard({
  entry,
  businesses,
  preset,
  onClose,
  onDelete,
  asPage = false,
  onAgain,
}: {
  entry?: BusinessEntry;
  businesses: readonly Business[];
  preset?: string;
  onClose: () => void;
  onDelete?: () => void;
  asPage?: boolean;
  onAgain?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const accounts = useAccountList();
  // The personal record being corrected: the shared list, usually held already (delta-synced when not).
  const { data: transactions } = useTransactions();
  const save = useSaveClosing();
  const deleteGuard = useOfflineGuard("delete");
  const { tried, mark } = useStepTried<Step>();
  const ids = { date: useId(), notes: useId(), field: useId() };
  // On the page, what was just saved — shown until «Νέο κλείσιμο» starts another.
  const [saved, setSaved] = useState<Record<"business" | "date" | "turnover" | "expenses" | "profit" | "money", string> & { tone: string; loss: boolean; profitTone: string } | null>(null);
  // Run once: a second tap on Save while the first is still on screen does nothing.
  const submitted = useRef(false);

  const editing = !!entry;
  const linked = editing ? transactions?.find((tx) => tx.id === entry.linkedTransactionId) : undefined;
  const shown = (n: number) => String(Math.round(convert(n) * 100) / 100);
  const base = (n: number) => Math.round((baseCurrency === displayCurrency ? n : convertToBase(n)) * 100) / 100;
  const single = businesses.length === 1;

  const [step, setStep] = useState<Step>(editing ? "review" : "day");
  const [businessId, setBusinessId] = useState(() => entry?.businessId ?? (preset && businessOf(businesses, preset) ? preset : single ? businesses[0].id : ""));
  const [date, setDate] = useState(editing ? toISODay(entry.date) : toISODay(new Date()));
  const [notes, setNotes] = useState(editing ? (entry.notes ?? "") : "");
  // Every amount by its line's id, as typed; nothing typed for a line is 0.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const typed: Record<string, string> = {};
    for (const l of [...(entry?.incomes ?? []), ...(entry?.expenses ?? [])]) if ("lineId" in l && l.lineId) typed[l.lineId] = shown(l.amount);
    return typed;
  });
  const [oneOffs, setOneOffs] = useState<OneOff[]>(() => (entry?.expenses ?? []).filter((l) => !l.lineId).map((l, i) => ({ key: i, name: l.name ?? "", amount: shown(l.amount), note: l.note })));
  const [account, setAccount] = useState(editing ? (linked?.accountId ?? entry.accountId ?? "") : "");

  // ── What has been typed, checked ──
  const business = businessOf(businesses, businessId);
  const named = [...(entry?.incomes ?? []).map((l) => l.lineId), ...(entry?.expenses ?? []).map((l) => l.lineId)];
  const keepNamed = editing && entry.businessId === businessId ? named : [];
  const incomeLines = linesFor(business, "incomeLines", keepNamed);
  const expenseLines = linesFor(business, "expenseLines", keepNamed);
  const when = parseISODay(date);
  // A day that was closed: today or earlier — a corrected closing may keep the day it had.
  const dateError = happenedDayError(date, new Date(), editing ? toISODay(entry.date) : undefined);
  const typedOf = (id: string) => amounts[id] ?? "";
  const incomesOk = incomeLines.every((l) => amountOk(typedOf(l.id)));
  const expenseFieldsOk = expenseLines.every((l) => amountOk(typedOf(l.id))) && oneOffs.every(oneOffOk);
  const notesOfLine = new Map((entry?.expenses ?? []).filter((l) => l.lineId && l.note).map((l) => [l.lineId!, l.note!]));

  const incomes: BusinessIncome[] = incomeLines.filter((l) => amountOf(typedOf(l.id)) > 0).map((l) => ({ lineId: l.id, amount: base(amountOf(typedOf(l.id))) }));
  const expenses: BusinessExpense[] = [
    ...expenseLines.filter((l) => amountOf(typedOf(l.id)) > 0).map((l) => ({ lineId: l.id, amount: base(amountOf(typedOf(l.id))), ...(notesOfLine.get(l.id) ? { note: notesOfLine.get(l.id) } : {}) })),
    ...oneOffs.filter((o) => !blankOneOff(o) && oneOffOk(o)).map((o) => ({ name: cleanLine(o.name), amount: base(amountOf(o.amount)), ...(o.note ? { note: o.note } : {}) })),
  ];
  const anyAmount = incomes.length + expenses.length > 0;
  const tooMany = incomes.length > CLOSING_LINES_MAX || expenses.length > CLOSING_LINES_MAX;
  const expensesOk = expenseFieldsOk && anyAmount && !tooMany;
  const figures = closingFigures({ incomes, expenses });
  const move = personalMove(figures.profit);
  const written = accounts.length > 0 ? chosenAccount(accounts, account) : undefined;
  const accountGap = !!move && accountMissing(accounts, account);
  const dayOk = !!when && !dateError && !!business;
  const ready = dayOk && incomesOk && expensesOk && !accountGap;
  // Asked before the amounts, the card is needed whenever there is one to pick —
  // unless the amounts are already in (going back, or a correction) and the day
  // came to zero: then nothing moves and nothing is asked.
  const accountStepOk = !accountGap && (!!move || anyAmount || accounts.length === 0 || !accountMissing(accounts, account));

  const index = STEPS.indexOf(step);
  const goTo = (target: Step) => {
    // Each step before the target, in the order they are asked.
    const ok: Record<Step, boolean> = { day: dayOk, account: accountStepOk, incomes: incomesOk, expenses: expensesOk, review: true };
    const blocked = STEPS.slice(0, STEPS.indexOf(target)).find((s) => !ok[s]);
    if (blocked) {
      mark(blocked);
      return setStep(blocked);
    }
    setStep(target);
  };

  const setAmount = (lineId: string, text: string) => setAmounts((all) => ({ ...all, [lineId]: text }));
  const nextKey = Math.max(-1, ...oneOffs.map((o) => o.key)) + 1;
  const setOneOff = (key: number, patch: Partial<OneOff>) => setOneOffs((all) => all.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const describe = (type: "income" | "expense") => t(type === "income" ? "business.recordProfit" : "business.recordLoss", { name: business?.name ?? "" });

  const submit = () => {
    if (nothingChanged) return;
    if (!ready || !when || !business) return goTo("review");
    if (submitted.current) return;
    submitted.current = true;
    const closing = { businessId: business.id, date: when, incomes, expenses, notes: notes.trim() || undefined, accountId: move ? written || undefined : undefined };
    void saveWithoutWaiting(
      save,
      {
        editing: editing ? { id: entry.id, previousTransactionId: entry.linkedTransactionId, createdAt: firestoreToDate(entry.createdAt), storedDate: firestoreToDate(entry.date) } : undefined,
        closing,
        personal: personalRecord(closing, describe),
      },
      () => toast.error(t("business.saveFailed")),
    );
    celebrateSave({ collection: "businessEntries", id: editing ? entry.id : undefined });
    toast.success(t("business.saved", { day: formatRecordDay(when, lang), name: business.name }));
    if (asPage) setSaved({ business: now.business, date: now.date, turnover: now.turnover, expenses: now.expenses, profit: now.profit, money: now.money, loss: Math.round(figures.profit * 100) < 0, profitTone: profitTone(figures.profit, styles), tone: move ? (move.type === "income" ? styles.positive : styles.negative) : "" });
    else onClose();
  };

  // ── The check ──
  const placeName = (id: string | undefined) => {
    const named = accounts.find((a) => a.id === id);
    if (named) return named.name;
    if (accounts.length > 0) return t("accounts.notChosen");
    return mainAccount(accounts)?.name ?? t("business.mainAccount");
  };
  const moveText = (m: ReturnType<typeof personalMove>, place: string) => (m ? `${signed(m.amount, format, m.type === "income" ? "+" : "−")} · ${place}` : t("business.nothingMoves"));
  const before = editing ? closingFigures(entry) : undefined;
  const beforeMove = before ? personalMove(before.profit) : null;
  const now = {
    date: when ? formatRecordDay(when, lang) : "—",
    business: business?.name ?? "—",
    turnover: signed(figures.turnover, format, "+"),
    expenses: signed(figures.expenses, format, "−"),
    profit: signed(figures.profit, format),
    money: moveText(move, placeName(written)),
    notes: notes.trim() || "—",
  };
  const was = before
    ? {
        date: formatRecordDay(firestoreToDate(entry!.date), lang),
        business: businessOf(businesses, entry!.businessId)?.name ?? "—",
        turnover: signed(before.turnover, format, "+"),
        expenses: signed(before.expenses, format, "−"),
        profit: signed(before.profit, format),
        money: moveText(beforeMove, placeName(linked?.accountId ?? entry!.accountId)),
        notes: entry!.notes?.trim() || "—",
      }
    : undefined;
  // «No change, no Save»: the closing as it would be saved against the one
  // opened — the same facts the before → after rows show, so «nothing changed»
  // is «no row marked» (`useFormChanged`: amounts as numbers, the day as a day,
  // notes trimmed; the card only counts when money moves).
  const linesOf = (e: { incomes: BusinessIncome[]; expenses: BusinessExpense[] }) => ({
    incomes: e.incomes.map((l) => ({ lineId: l.lineId, amount: l.amount })),
    expenses: e.expenses.map((l) => ({ lineId: l.lineId, name: l.name, amount: l.amount })),
  });
  const { unchanged: nothingChanged } = useFormChanged(
    editing ? { businessId: entry.businessId, date: toISODay(entry.date), notes: entry.notes, ...linesOf(entry), account: beforeMove ? (linked?.accountId ?? entry.accountId) : undefined } : undefined,
    { businessId, date, notes, ...linesOf({ incomes, expenses }), account: move ? written : undefined },
  );
  const wasMark = (field: keyof typeof now) => (was && was[field] !== now[field] ? <s className={styles.was}>{was[field]} →</s> : null);
  const row = (target: Step, label: string, value: ReactNode, className = "") => (
    <button type="button" className={wiz.wizRow} onClick={() => goTo(target)}>
      <span className={wiz.wizLabel}>{label}</span>
      <span className={`${wiz.wizValue} ${className}`}>{value}</span>
    </button>
  );
  const businessCategory = VIRTUAL_CATEGORIES[BUSINESS_CATEGORY_ID];

  /** One money field per line: its name over it, empty with a placeholder, empty = 0. */
  const moneyFields = (lines: BusinessLine[], kind: "incomes" | "expenses") => (
    <ul className={styles.moneyRows}>
      {lines.map((l) => {
        const text = typedOf(l.id);
        const fieldId = `${ids.field}-${l.id}`;
        return (
          <li key={l.id} className={styles.moneyRow}>
            <Label for={fieldId} className={styles.moneyLabel}>
              {l.name}
              {l.removed && <span className="text-body-secondary fw-normal"> · {t("business.lineRemovedTag")}</span>}
            </Label>
            <Input
              id={fieldId}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className={styles.moneyInput}
              placeholder={t("business.amountPlaceholder")}
              value={text}
              invalid={tried(kind) && !amountOk(text)}
              onChange={(e) => setAmount(l.id, e.target.value)}
            />
          </li>
        );
      })}
    </ul>
  );

  const stepLabel = (s: Step) => (s === "day" ? t(single ? "business.step_day" : "business.step_businessDay") : t(`business.step_${s}`));
  const ask = step === "account" && !anyAmount ? t("business.ask_accountFirst") : step === "account" && move?.type === "expense" ? t("business.ask_accountLoss") : step === "account" && !move ? t("business.ask_accountZero") : step === "day" ? t(single ? "business.ask_day" : "business.ask_businessDay") : t(`business.ask_${step}`);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "review") submit();
    else goTo(STEPS[index + 1]);
  };

  // ── Saved, on the page: a tick, one line, and what went in ──
  if (asPage && saved) {
    const savedRow = (label: string, value: string, className = "") => (
      <div className={wiz.wizStatic}>
        <span className={wiz.wizLabel}>{label}</span>
        <span className={`${wiz.wizValue} ${className}`}>{value}</span>
      </div>
    );
    return (
      <div className={page.page}>
        <div className={page.pageBody}>
          <div className={page.savedPanel} role="status">
            <SavedCheck />
            <h2 className={page.savedTitle}>{t("business.closingSavedTitle")}</h2>
            <p className={page.savedSub}>{t("business.closingSavedSub")}</p>
            <div className={page.savedDetails}>
              <p style={{ fontSize: "var(--fs-text)", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>{t("business.closingSavedDetails")}</p>
              <div className={wiz.wizCard}>
                {savedRow(t("business.business"), saved.business)}
                {savedRow(t("common.date"), saved.date)}
                {savedRow(t("business.turnover"), saved.turnover, styles.total)}
                {savedRow(t("business.expenses"), saved.expenses, styles.total)}
                {savedRow(t(saved.loss ? "business.loss" : "business.profit"), saved.profit, `${styles.total} ${saved.profitTone}`)}
                {savedRow(t(saved.tone === styles.negative ? "business.moneyOut" : "business.moneyIn"), saved.money, saved.tone)}
              </div>
            </div>
          </div>
        </div>
        <div className={`${page.pageFooter} ${page.footerSplit}`}>
          <Button color="secondary" outline onClick={onClose}>
            {t("business.pageOverview")}
          </Button>
          <Button color="primary" onClick={onAgain}>
            + {t("nav.newClosing")}
          </Button>
        </div>
      </div>
    );
  }

  const header = (
    <>
      {t(editing ? "business.editClosingTitle" : "business.closingTitle")}
      {business && step !== "day" ? ` · ${business.name}` : ""}
    </>
  );

  const content = (
    <>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} open={editing} label={stepLabel} />
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }}>
            {ask}
          </div>

          {step === "day" && (
            <>
              {!single && (
                <BusinessTiles
                  label={t("business.whichBusiness")}
                  businesses={businesses}
                  value={businessId}
                  onChange={setBusinessId}
                  invalid={tried("day") && !business}
                />
              )}
              <FormGroup>
                <Label for={ids.date} className="small fw-medium mb-1">
                  {t("common.date")}
                  <RequiredMark />
                </Label>
                <DateField id={ids.date} happened value={date} onChange={setDate} invalid={tried("day") && (!when || !!dateError)} placeholder={t("common.date")} />
                {tried("day") && dateError && <div className="invalid-feedback d-block">{t(dateError)}</div>}
              </FormGroup>
              <FormGroup className="mb-0">
                <Label for={ids.notes} className="small fw-medium mb-1">
                  {t("common.notes")} <span className="text-body-secondary fw-normal">{t("business.optional")}</span>
                </Label>
                <Input id={ids.notes} type="textarea" rows={2} value={notes} maxLength={NOTE_MAX} placeholder={t("business.notesPlaceholder")} onChange={(e) => setNotes(e.target.value)} />
              </FormGroup>
            </>
          )}

          {step === "incomes" && (
            <>
              <p className="small text-body-secondary mb-2">{t("business.emptyIsZero")}</p>
              {moneyFields(incomeLines, "incomes")}
              {tried("incomes") && !incomesOk && <div className="invalid-feedback d-block mb-2">{t("business.amountBad")}</div>}
              <div className={`${wiz.wizNote} mt-3 d-flex justify-content-between gap-2`}>
                <span>{t("business.turnover")}</span>
                <span className={styles.total}>{signed(figures.turnover, format, "+")}</span>
              </div>
            </>
          )}

          {step === "expenses" && (
            <>
              <p className="small text-body-secondary mb-2">{t("business.emptyIsZero")}</p>
              {expenseLines.length > 0 ? moneyFields(expenseLines, "expenses") : <p className="small text-body-secondary">{t("business.noExpenseLinesHere")}</p>}
              {oneOffs.length > 0 && (
                <ul className={styles.lines}>
                  {oneOffs.map((o, i) => {
                    const bad = tried("expenses") && !oneOffOk(o);
                    return (
                      <li key={o.key} className={styles.line} aria-label={t("business.oneOffN", { n: i + 1 })}>
                        <Input
                          aria-label={t("business.oneOffName")}
                          aria-required
                          placeholder={t("business.oneOffNamePlaceholder")}
                          maxLength={ONE_OFF_NAME_MAX}
                          value={o.name}
                          invalid={bad && !cleanLine(o.name)}
                          onChange={(e) => setOneOff(o.key, { name: e.target.value })}
                        />
                        <button type="button" className={styles.lineRemove} onClick={() => setOneOffs((all) => all.filter((x) => x.key !== o.key))} aria-label={t("business.lineRemove", { n: i + 1 })} title={t("business.lineRemove", { n: i + 1 })}>
                          <FiX aria-hidden />
                        </button>
                        <Input
                          className={styles.lineAmount}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`${t("common.amount")} (${displayCurrency})`}
                          aria-required
                          placeholder={t("business.amountPlaceholder")}
                          value={o.amount}
                          invalid={bad && !(amountOk(o.amount) && amountOf(o.amount) > 0)}
                          onChange={(e) => setOneOff(o.key, { amount: e.target.value })}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button
                type="button"
                color="primary"
                outline
                size="sm"
                onClick={() => setOneOffs((all) => [...all, { key: nextKey, name: "", amount: "" }])}
                disabled={expenseLines.length + oneOffs.length >= CLOSING_LINES_MAX}
                className="d-inline-flex align-items-center gap-1"
              >
                <FiPlus aria-hidden /> {t("business.addOneOff")}
              </Button>
              {tried("expenses") && !expenseFieldsOk && <div className="invalid-feedback d-block mt-2">{t("business.oneOffNeeded")}</div>}
              {tried("expenses") && expenseFieldsOk && !anyAmount && <div className="invalid-feedback d-block mt-2">{t("business.someAmountNeeded")}</div>}
              <div className={`${wiz.wizNote} mt-3 d-flex justify-content-between gap-2`}>
                <span>{t("business.expenses")}</span>
                <span className={styles.total}>{signed(figures.expenses, format, "−")}</span>
              </div>
              <div className={`${wiz.wizNote} mt-2 d-flex justify-content-between gap-2`}>
                <span>{t(Math.round(figures.profit * 100) < 0 ? "business.loss" : "business.profit")}</span>
                <span className={`${styles.total} ${profitTone(figures.profit, styles)}`}>{signed(figures.profit, format)}</span>
              </div>
            </>
          )}

          {step === "account" && !anyAmount && (
            <>
              {/* Before the amounts: profit or loss is not known yet, so both are said. */}
              <p className="small mb-2">
                {t("business.accountFirstHint")}
                <RequiredMark />
              </p>
              <AccountPicker value={account} onChoose={setAccount} income invalid={tried("account")} />
              {accounts.length === 0 && <div className={wiz.wizNote}>{t("business.noAccounts")}</div>}
            </>
          )}

          {step === "account" && anyAmount && (
            <>
              <div className={`${wiz.wizNote} mb-3 d-flex justify-content-between gap-2`}>
                <span>{t(Math.round(figures.profit * 100) < 0 ? "business.loss" : "business.profit")}</span>
                <span className={`${styles.total} ${profitTone(figures.profit, styles)}`}>{signed(figures.profit, format)}</span>
              </div>
              {move ? (
                <>
                  <p className="small mb-2">
                    {t(move.type === "income" ? "business.profitGoesInto" : "business.lossComesFrom", { amount: format(move.amount) })}
                    <RequiredMark />
                  </p>
                  <AccountPicker value={account} onChoose={setAccount} income={move.type === "income"} invalid={tried("account")} />
                  {accounts.length === 0 && <div className={wiz.wizNote}>{t("business.noAccounts")}</div>}
                </>
              ) : (
                <div className={wiz.wizNote}>{t("business.nothingMovesExplain")}</div>
              )}
            </>
          )}

          {step === "review" && (
            <>
              <div className={wiz.wizCard}>
                {row("day", t("business.business"), <>{wasMark("business")}{now.business}</>)}
                {row("day", t("common.date"), <>{wasMark("date")}{now.date}</>)}
                {/* The card before the amounts, as the steps ask them. */}
                {move && accounts.length > 0 && row("account", t("business.step_account"), placeName(written))}
              </div>
              <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t("business.incomeLines")}>
                <div className={styles.sideHead}>{t("business.incomeLines")}</div>
                {incomes.map((l) => (
                  <Fragment key={l.lineId}>{row("incomes", lineName(business, l.lineId, t("business.lineGone")), signed(l.amount, format, "+"))}</Fragment>
                ))}
                {row("incomes", t("business.turnover"), <>{wasMark("turnover")}{now.turnover}</>, styles.total)}
              </div>
              <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t("business.expenseLines")}>
                <div className={styles.sideHead}>{t("business.expenseLines")}</div>
                {expenses.map((l, i) => (
                  <Fragment key={l.lineId ?? `once-${i}`}>{row("expenses", `${expenseName(business, l, t("business.lineGone"))}${l.lineId ? "" : ` · ${t("business.oneOffTag")}`}`, signed(l.amount, format, "−"))}</Fragment>
                ))}
                {row("expenses", t("business.expenses"), <>{wasMark("expenses")}{now.expenses}</>, styles.total)}
              </div>
              <div className={`${wiz.wizCard} mt-3`}>
                {row("expenses", t(Math.round(figures.profit * 100) < 0 ? "business.loss" : "business.profit"), <>{wasMark("profit")}{now.profit}</>, `${styles.total} ${profitTone(figures.profit, styles)}`)}
                {row("day", t("common.notes"), <>{wasMark("notes")}{now.notes}</>)}
              </div>

              {/* What reaches the owner's own money. */}
              <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t("business.sidePersonal")}>
                <div className={styles.sideHead}>{t("business.sidePersonal")}</div>
                {row("account", t(move?.type === "expense" ? "business.moneyOut" : "business.moneyIn"), <>{wasMark("money")}{now.money}</>, move ? (move.type === "income" ? styles.positive : styles.negative) : "")}
                {move && row("account", t("common.category"), `${businessCategory.icon} ${categoryLabel(businessCategory.name, t)}`)}
                {move && row("account", t("business.recordName"), describe(move.type))}
              </div>
              {move && written && !editing && <ReviewCard accountId={written} income={move.type === "income"} delta={move.type === "income" ? move.amount : -move.amount} />}
              {/* «Nothing changed» is said once, by Save (`UnchangedHint`). */}
              <div className={`${wiz.wizNote} mt-3`}>{t("business.onlyProfitNote")}</div>
            </>
          )}
    </>
  );

  const footer = (
    <>
          <div className="d-flex gap-2">
            {editing && onDelete && <DeleteButton opensConfirm iconOnly onClick={onDelete} disabled={deleteGuard.locked} title={deleteGuard.reason} />}
            {index === 0 || (editing && step === "review") ? (
              <Button type="button" color="secondary" outline onClick={onClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )}
          </div>
          {step === "review" ? (
            <div className="d-flex align-items-center gap-2">
              <UnchangedHint show={nothingChanged} />
              <Button type="submit" color="primary" disabled={nothingChanged || !ready}>
                {t("common.save")}
              </Button>
            </div>
          ) : (
            <Button type="submit" color="primary">
              {t("common.next")} ›
            </Button>
          )}
    </>
  );

  // On the page: the steps across the page, Back and Next riding along the
  // bottom of the screen (`TransactionWizard.module.css`, as «Νέα συναλλαγή»).
  if (asPage)
    return (
      <form noValidate onSubmit={onSubmit} className={page.page}>
        <div className={page.pageBody}>{content}</div>
        <div className={`${page.pageFooter} ${page.footerSplit}`}>{footer}</div>
      </form>
    );

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{header}</ModalHeader>
      <form noValidate onSubmit={onSubmit}>
        <ModalBody>{content}</ModalBody>
        <ModalFooter className="justify-content-between">{footer}</ModalFooter>
      </form>
    </Modal>
  );
}

/**
 * «Ποια δουλειά;» as choice tiles — the yes/no tiles' look, one per business,
 * wrapping onto as many rows as needed. A radio group: one tab stop, the arrows
 * move and pick, nothing picked until the reader picks (unless the page came
 * filtered to one).
 */
function BusinessTiles({ label, businesses, value, onChange, invalid }: { label: string; businesses: readonly Business[]; value: string; onChange: (id: string) => void; invalid: boolean }) {
  const { t } = useTranslation();
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = businesses.findIndex((b) => b.id === value);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (i + step + businesses.length) % businesses.length;
    refs.current[next]?.focus();
    onChange(businesses[next].id);
  };
  return (
    <div className="mb-3">
      <div id={labelId} className="small fw-medium mb-2">
        {label}
        <RequiredMark />
      </div>
      <div className={`${tiles.group} ${styles.tileWrap}`} role="radiogroup" aria-labelledby={labelId} aria-required aria-invalid={invalid || undefined}>
        {businesses.map((b, i) => (
          <button
            key={b.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={b.id === value}
            tabIndex={(at === -1 ? i === 0 : i === at) ? 0 : -1}
            className={`${tiles.option} ${b.id === value ? tiles.on : ""}`}
            onClick={() => onChange(b.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {b.name}
          </button>
        ))}
      </div>
      {invalid && <div className="invalid-feedback d-block">{t("business.pickBusiness")}</div>}
    </div>
  );
}


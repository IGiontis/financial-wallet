import { useId, useState } from "react";
import { Button, Input, InputGroup, InputGroupText } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiArrowDownLeft, FiArrowUpRight, FiEdit2, FiGift, FiMoreHorizontal, FiPlus, FiRotateCcw, FiSlash, FiX } from "react-icons/fi";
import { differenceInCalendarMonths } from "date-fns";
import { firestoreToDate, parseISODay, toISODay, happenedDayError, dateFormat } from "../../shared/utils/dates";
import { forgivenTag, currentRate, isFloating, type DebtProgress, loanReceipt, type ReceiptLine, loanPayoff, loanSplits, loanState, payoffSaving, rateOutlook } from "./debtsUtils";
import { useDeleteRepayment, useUpdateDebt, useUpdateRepayment } from "./useDebts";
import { DateField } from "../../shared/components/DateField";
import { RateHelpButton } from "./RateExplainer";
import styles from "./css/DebtsPage.module.css";
import segmented from "../../shared/css/Segmented.module.css";
import type { DebtPayment, DebtWithStatus } from "../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { MoneyMovedPicker } from "./MoneyMovedPicker";
import { moneyMovedName } from "./moneyMovedName";
import { PaymentNote } from "./PaymentNote";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount } from "../accounts/accountsUtils";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { usePendingRecords } from "../../shared/hooks/usePendingRecords";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import { toast } from "react-toastify";
import { useFormChanged } from "../../shared/hooks/useFormChanged";
import { UnchangedHint } from "../../shared/components/UnchangedHint";
import { asNumber } from "../../shared/utils/sameValues";
import type { Density } from "../../shared/hooks/useDensity";

// Local calendar day, not `toISOString()`: in Greece that is still yesterday
// until three in the morning.
const today = () => toISODay(new Date());

/**
 * What paying a little more each month would do.
 *
 * The one question a borrower has that a bank statement never answers. Every
 * euro above the interest goes straight at the principal, so a small regular
 * addition takes months off the end and saves several times itself.
 */
function PayMore({ debt, formatCurrency }: { debt: DebtWithStatus; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const [extra, setExtra] = useState("");

  const amount = parseFloat(extra);
  const saving = Number.isFinite(amount) && amount > 0 ? payoffSaving(debt, amount) : undefined;

  return (
    <div className={styles.payMore}>
      <div className={styles.payMoreHead}>{t("debts.payMoreTitle")}</div>
      <InputGroup size="sm" style={{ maxWidth: 190 }}>
        <Input type="number" min={0} step="10" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="100" aria-label={t("debts.payMoreTitle")} />
        <InputGroupText>{t("debts.perMonthSuffix")}</InputGroupText>
      </InputGroup>

      {saving === undefined ? (
        <div className={styles.payMoreIdle}>{t("debts.payMorePrompt")}</div>
      ) : saving.monthsSaved <= 0 ? (
        <div className={styles.payMoreIdle}>{t("debts.payMoreNothing")}</div>
      ) : (
        <div className={styles.payMoreResult}>{t("debts.payMoreResult", { months: saving.monthsSaved, amount: formatCurrency(saving.interestSaved) })}</div>
      )}
    </div>
  );
}

/** The moves worth trying. A cut, and the three rises a borrower is warned about. */
const RATE_MOVES = [-1, 0.5, 1, 2];

/**
 * What a move in the index would do — and the one field that keeps it honest.
 *
 * A floating loan is repriced rather than restarted: the bank keeps the end date
 * and recalculates the payment on what is still owed. So a point on the index is
 * not a point on the payment — on a mortgage with twenty years left it is nearer
 * a tenth of it — and that is the figure this answers.
 *
 * The index field is what stops the rest of the screen from lying. Every number
 * on this row is worked out from a rate that was true the day it was typed, and
 * a floating rate left alone for a year is a guess wearing two decimal places.
 */
function RateWatch({ debt, formatCurrency, locale }: { debt: DebtWithStatus; formatCurrency: (n: number) => string; locale: string }) {
  const { t } = useTranslation();
  const update = useUpdateDebt();
  const [delta, setDelta] = useState<number | null>(null);
  const [index, setIndex] = useState(() => String(debt.baseRate ?? 0));

  const outlook = delta === null ? undefined : rateOutlook(debt, delta);
  // Greek writes 0,5 where English writes 0.5, and a rate is a number like any
  // other. The signed one is for the moves, which only read as a pair with it.
  const move = new Intl.NumberFormat(locale, { signDisplay: "always", maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const dateFmt = dateFormat("day", locale);

  const typed = parseFloat(index);
  // «No change, no Save»: the index as stored, by value (0,5 = 0.50 = 0.5).
  const { unchanged } = useFormChanged(debt.baseRate ?? 0, asNumber(index));
  const changed = Number.isFinite(typed) && typed >= 0 && !unchanged;
  // The hint only once a figure was typed: the panel is always open, and an
  // index nobody touched has nothing to explain.
  const [typedOnce, setTypedOnce] = useState(false);
  const reviewed = debt.rateReviewedAt ? firestoreToDate(debt.rateReviewedAt) : undefined;
  // Half a year is longer than every reset period a Greek mortgage uses, so by
  // then the figure on file is certainly not the one the bank is charging.
  const stale = reviewed ? differenceInCalendarMonths(new Date(), reviewed) >= 6 : false;

  // Runs once and never waits for the server (`saveWithoutWaiting`): the new
  // rate is on screen at once with the toast; a refusal puts it back and
  // `useUpdateDebt` says so.
  const [runIndex, savingIndex] = useRunOnce();
  const saveIndex = () =>
    runIndex(() => {
      if (!changed) return;
      // The stored rate stays the sum of the parts. Writing one without the other
      // would leave the payment and the rate beside it disagreeing.
      const allIn = Math.round((typed + (debt.margin ?? 0)) * 100) / 100;
      void saveWithoutWaiting(update, { debtId: debt.id, data: { baseRate: typed, interestRate: allIn, rateReviewedAt: new Date() } }, undefined, [["debts", debt.id]]);
      toast.success(t("toasts.rateUpdated"));
    });

  return (
    <div className={styles.payMore}>
      <div className={styles.payMoreHead}>
        {t("debts.rateWatchTitle")}
        <RateHelpButton debt={debt} formatCurrency={formatCurrency} locale={locale} />
      </div>

      <div className={segmented.group} role="group" aria-label={t("debts.rateWatchTitle")}>
        {RATE_MOVES.map((step) => (
          <button
            key={step}
            type="button"
            className={`${segmented.item} ${delta === step ? segmented.active : ""}`}
            aria-pressed={delta === step}
            onClick={() => setDelta(delta === step ? null : step)}
          >
            {move.format(step)}%
          </button>
        ))}
      </div>

      {outlook === undefined ? (
        <div className={styles.payMoreIdle}>{t("debts.rateWatchPrompt")}</div>
      ) : outlook.instalmentDelta === 0 ? (
        <div className={styles.payMoreIdle}>{t("debts.rateWatchSame")}</div>
      ) : (
        <>
          <div className={outlook.instalmentDelta > 0 ? styles.rateWatchUp : styles.payMoreResult}>
            {t(outlook.instalmentDelta > 0 ? "debts.rateWatchMore" : "debts.rateWatchLess", {
              amount: formatCurrency(outlook.instalment),
              delta: formatCurrency(Math.abs(outlook.instalmentDelta)),
            })}
          </div>
          <div className={styles.payMoreIdle}>
            {t(outlook.interestDelta > 0 ? "debts.rateWatchInterestMore" : "debts.rateWatchInterestLess", {
              amount: formatCurrency(Math.abs(outlook.interestDelta)),
            })}
          </div>
        </>
      )}

      <div className={styles.rateIndex}>
        <span className={styles.rateIndexLabel}>{t("debts.baseRate")}</span>
        <InputGroup size="sm" style={{ width: 120 }}>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={index}
            onChange={(e) => {
              setIndex(e.target.value);
              setTypedOnce(true);
            }}
            aria-label={t("debts.baseRate")}
          />
          <InputGroupText>%</InputGroupText>
        </InputGroup>
        <Button color="secondary" outline size="sm" disabled={!changed || savingIndex} onClick={() => void saveIndex()} aria-busy={savingIndex || undefined}>
          {savingIndex ? t("common.saving") : t("debts.updateIndex")}
        </Button>
        <UnchangedHint show={typedOnce && unchanged} />
      </div>

      <div className={stale ? styles.rateWatchUp : styles.payMoreIdle}>
        {t("debts.rateParts", { base: pct.format(debt.baseRate ?? 0), margin: pct.format(debt.margin ?? 0) })}
        {reviewed ? ` · ${t(stale ? "debts.rateStale" : "debts.rateAsOf", { date: dateFmt.format(reviewed) })}` : ""}
      </div>
    </div>
  );
}

/**
 * The amount and the day of one repayment — for a new one, or for correcting
 * one typed wrong.
 *
 * One panel for both, so that recording and correcting look and behave the
 * same. Delete lives in here rather than on the row: it used to be a small ✕
 * beside every amount, one mis-tap from gone with nothing to confirm it.
 * Opening the payment first is the confirmation.
 */
function PaymentPanel({
  amount,
  date,
  saving,
  onAmount,
  onDate,
  onSave,
  onCancel,
  onDelete,
  account,
  onAccount,
  income,
  notes,
  onNotes,
  unchanged = false,
  storedDate,
}: {
  amount: string;
  date: string;
  /** The repayment's day as stored ("yyyy-MM-dd"): kept, it is never refused, even if in the future. */
  storedDate?: string;
  notes: string;
  /** A correction that would save nothing new (`useFormChanged`): Save waits, with the hint. */
  unchanged?: boolean;
  onNotes: (value: string) => void;
  /** The card or cash it went through; "" for no particular one. Undefined: an older repayment that names none. */
  account: string | undefined;
  onAccount: (id: string | undefined) => void;
  /** Money coming in (repaid to me) rather than going out — the picker words itself to match. */
  income: boolean;
  saving: boolean;
  onAmount: (value: string) => void;
  onDate: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  const dateId = useId();
  const value = parseFloat(amount);
  const amountValid = Number.isFinite(value) && value > 0;
  // A repayment happened: today or earlier — the day it already had may stay.
  const dateError = happenedDayError(date, new Date(), storedDate);
  const valid = amountValid && parseISODay(date) !== null && !dateError;
  // «Ναι» needs its card (item 97a) — an older repayment that names none is asked for one.
  const places = useAccountList();
  const cardMissing = account !== undefined && accountMissing(places, account);
  const [tried, setTried] = useState(false);

  return (
    <div className={styles.paymentPanel}>
      {/* WHERE before HOW MUCH (owner, 2026-11-12). Which card it left or
          reached, as on any transaction — it moves that card. Or none: settled
          without money changing hands. The picker asks that as its own question. */}
      <div className={styles.paymentAccount}>
        <MoneyMovedPicker value={account} onChange={onAccount} income={income} invalid={tried} />
      </div>
      {/* Two fields to a row: at 375px a third squeezes the amount out of sight. */}
      <div className={styles.paymentFields}>
        <InputGroup size="sm">
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={amount}
            invalid={amount !== "" && !amountValid}
            onChange={(e) => onAmount(e.target.value)}
            aria-label={t("common.amount")}
            aria-required
          />
        </InputGroup>
        {/* The app's own calendar, like every other date in it — not the
            browser's, which opens from a small icon and looks different on
            every phone. */}
        <div>
          <label htmlFor={dateId} className="visually-hidden">
            {t("debts.when")}
          </label>
          <DateField id={dateId} small happened value={date} onChange={onDate} placeholder={t("debts.when")} invalid={!!dateError} />
          {dateError && <div className="invalid-feedback d-block">{t(dateError)}</div>}
        </div>
      </div>
      <PaymentNote value={notes} onChange={onNotes} className="mb-2" small />
      <div className={styles.paymentButtons}>
        <Button
          color="primary"
          size="sm"
          onClick={() => {
            if (cardMissing) return setTried(true);
            onSave();
          }}
          disabled={saving || !valid || unchanged}
        >
          {t("common.save")}
        </Button>
        {/* Asks first («Διαγραφή;»), on the page — the one dialog there is. */}
        {onDelete && (
          <DeleteButton size="sm" onClick={onDelete} disabled={deleteGuard.locked} title={deleteGuard.reason} />
        )}
        {/* A cross rather than a word: at 375px "Cancel" beside the other two
            fell onto a line of its own. Tapping the row again closes it too. */}
        <Button color="secondary" outline size="sm" onClick={onCancel} className={styles.paymentClose} aria-label={t("common.cancel")} title={t("common.cancel")}>
          <FiX size={15} aria-hidden />
        </Button>
      </div>
      <UnchangedHint show={unchanged} className="d-block mt-1" />
      {onDelete && deleteGuard.reason && <div className={styles.paymentHint}>{deleteGuard.reason}</div>}
    </div>
  );
}


/** How much of the debt is gone — not how much has been handed over. */
function clearedPercent(debt: DebtWithStatus, loan: ReturnType<typeof loanState>): number {
  if (debt.amount <= 0) return 0;
  // On a loan those differ by the interest: six payments of €198 on a €10,000
  // loan is 12% handed over and 8% repaid, and a ring drawing the first would
  // be the flattering one.
  const cleared = loan ? debt.amount - loan.balance : debt.paid;
  return Math.min(Math.max((cleared / debt.amount) * 100, 0), 100);
}

/**
 * Where the debt began and where it is now, on one bar.
 *
 * The bar is everything that has changed hands or still will: what came off
 * the debt, what went on interest, and what is left. Between people there is
 * no interest, and the words turn round when the money was lent rather than
 * borrowed.
 */
export function ProgressPanel({
  progress: p,
  borrowed,
  formatCurrency,
  title,
}: {
  progress: DebtProgress;
  borrowed: boolean;
  formatCurrency: (n: number) => string;
  /** Above the figures, when this is a total rather than one loan. */
  title?: string;
}) {
  const { t } = useTranslation();
  const whole = p.principal + p.interest + p.remaining;
  const share = (n: number) => (whole > 0 ? `${(n / whole) * 100}%` : "0%");

  const rows = [
    { label: t(borrowed ? "debts.progressPaidOff" : "debts.progressGotBack"), value: p.principal, tone: "var(--color-income)" },
    ...(p.interest > 0 ? [{ label: t(borrowed ? "debts.progressInterestOut" : "debts.progressInterestIn"), value: p.interest, tone: "var(--color-goal)" }] : []),
    { label: t(borrowed ? "debts.leftToGive" : "debts.leftToGet"), value: p.remaining, tone: "var(--color-border-primary)" },
  ];

  return (
    <div className={styles.progress}>
      {title && <div className={styles.progressTitle}>{title}</div>}
      <div className={styles.progressStart}>
        <span>{t(borrowed ? "debts.progressStartedOut" : "debts.progressStartedIn")}</span>
        <strong>{formatCurrency(p.started)}</strong>
      </div>
      <div className={styles.progressBar} aria-hidden>
        {rows.map((row) => (
          <span key={row.label} style={{ width: share(row.value), background: row.tone }} />
        ))}
      </div>
      <dl className={styles.details}>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>
              <span className={styles.progressKey} style={{ background: row.tone }} aria-hidden />
              {row.label}
            </dt>
            <dd>{formatCurrency(row.value)}</dd>
          </div>
        ))}
      </dl>
      {p.handedBack > 0 && <p className={styles.payEmpty}>{t(borrowed ? "debts.progressHandedOut" : "debts.progressHandedIn", { amount: formatCurrency(p.handedBack) })}</p>}
    </div>
  );
}

/**
 * One debt on a person's page, said at the reader's density (`useDensity`):
 *
 * - «Απλό»: what it is, what is left (or how it closed), one line.
 * - «Κανονικό»: + how much of it is gone, its dates, the last repayment.
 * - «Αναλυτικό»: + the receipt that adds up to what is left, a bank loan's
 *   terms, every repayment (tapped to correct it, delete inside), what paying
 *   more would do.
 *
 * At its foot «Ενέργειες» and the one thing to do: «+ Επιστροφή», or «Ήρθε»
 * for money owed to you. Neither opens anything here — the page owns its one
 * dialog (`onRecord`, `onActions`), so this card would sit as well in any
 * container.
 */
export function DebtCard({
  debt,
  density,
  formatCurrency,
  locale,
  onRecord,
  onActions,
  className = "",
}: {
  debt: DebtWithStatus;
  density: Density;
  formatCurrency: (n: number) => string;
  locale: string;
  /** Record a repayment against it, the wizard opening on this figure. */
  onRecord: (amount: number) => void;
  onActions: () => void;
  /** The saved flash / pending mark of the record (`useSavedFlash`). */
  className?: string;
}) {
  const { t } = useTranslation();
  const updateRepayment = useUpdateRepayment();
  const removeRepayment = useDeleteRepayment();
  const accounts = useAccountList();
  const { busy } = usePendingRecords();
  const pending = busy("debts", debt.id);
  // A correction, saved and deleted once at a time.
  const [runPanel, panelBusy] = useRunOnce();
  // One correction open at a time: two half-finished forms and no way to tell which Save is which.
  const [panel, setPanel] = useState<DebtPayment | null>(null);
  const [panelAmount, setPanelAmount] = useState("");
  const [panelDate, setPanelDate] = useState(today);
  // Which card a repayment went through: an older one's own — or none at all, which it keeps unless one is chosen.
  const [panelAccount, setPanelAccount] = useState<string | undefined>("");
  const [panelNotes, setPanelNotes] = useState("");
  // «No change, no Save»: a correction that changes nothing is not offered. The
  // card answer keeps «none named» apart from «Ναι» with or without a card.
  const cardAnswer = (id: string | undefined) => (id === undefined ? "none" : `card:${id}`);
  const { unchanged: panelUnchanged } = useFormChanged(
    panel ? { amount: panel.amount, date: toISODay(panel.date), account: cardAnswer(panel.accountId), notes: panel.notes } : undefined,
    { amount: asNumber(panelAmount), date: panelDate, account: cardAnswer(panelAccount), notes: panelNotes },
  );

  const dateFmt = dateFormat("day", locale);
  const shortFmt = dateFormat("dayShort", locale);
  const monthFmt = dateFormat("monthYearShort", locale);
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const borrowed = debt.direction === "owed_by_me";
  const loan = loanState(debt);
  const payoff = loan ? loanPayoff(debt) : undefined;
  const splits = loan ? loanSplits(debt) : undefined;
  const cleared = clearedPercent(debt, loan);
  const name = debt.label || t(borrowed ? "debts.iBorrowed" : "debts.iLent");
  const tone = debt.isSettled ? "var(--color-text-secondary)" : borrowed ? "var(--color-expense)" : "var(--color-income)";
  const closedTag = t(debt.forgiven ? forgivenTag(debt) : "debts.settled");
  const normal = density !== "simple";
  const detailed = density === "detailed";

  // What the button says and what it fills in. On a loan that is the month's
  // payment — the thing actually being paid — or what is left, if that is less.
  const instalmentDue = loan && !debt.isSettled ? Math.min(loan.instalment, debt.remaining) : undefined;
  const ctaLabel =
    instalmentDue !== undefined
      ? t(borrowed ? "debts.ctaBackAmount" : "debts.ctaArrivedAmount", { amount: formatCurrency(instalmentDue) })
      : t(borrowed ? "debts.ctaBack" : "debts.ctaArrived");

  const rateText = !loan
    ? t("debts.noInterest")
    : currentRate(debt) <= 0
      ? t("debts.interestFreeLoan")
      : t(isFloating(debt) ? "debts.rateFloatingShort" : "debts.rateFixedShort", { rate: pct.format(currentRate(debt)) });

  // The one line every density says: how it began, or how it closed.
  const closedDay = debt.forgiven ? firestoreToDate(debt.forgiven.date) : debt.payments[0] ? firestoreToDate(debt.payments[0].date) : undefined;
  const oneLine = debt.isSettled
    ? `${closedTag}${closedDay ? ` ${dateFmt.format(closedDay)}` : ""} · ${t(borrowed ? "debts.took" : "debts.gave")} ${formatCurrency(debt.amount)}`
    : `${t(borrowed ? "debts.took" : "debts.gave")} ${formatCurrency(debt.amount)} · ${dateFmt.format(firestoreToDate(debt.date))}`;
  const last = debt.payments[0];

  const openEdit = (payment: DebtPayment) => {
    // Tapping the open one again closes it, like any other row that expands.
    if (panel?.id === payment.id) return setPanel(null);
    setPanel(payment);
    setPanelAmount(String(payment.amount));
    setPanelDate(toISODay(payment.date));
    setPanelAccount(payment.accountId);
    setPanelNotes(payment.notes ?? "");
  };

  const savePanel = () => {
    if (panelUnchanged || !panel) return;
    const value = parseFloat(panelAmount);
    const when = parseISODay(panelDate);
    if (!Number.isFinite(value) || value <= 0 || !when) return;
    if (happenedDayError(panelDate, new Date(), toISODay(panel.date))) return;
    if (panelAccount !== undefined && accountMissing(accounts, panelAccount)) return;
    // As written: the card chosen, or the only place there is. With no places at all, as before.
    const written = panelAccount === undefined || accounts.length === 0 ? panelAccount : chosenAccount(accounts, panelAccount);
    // `null` when switched off, so the card it had is taken off rather than kept.
    // Never waits for the server (`saveWithoutWaiting`): corrected on screen at
    // once, the panel closes with the toast; a refusal puts it back and
    // `useUpdateRepayment` says so.
    const vars = { paymentId: panel.id, debtId: debt.id, amount: value, date: when, accountId: written ?? null, notes: panelNotes.trim() || null, storedDate: firestoreToDate(panel.date) };
    void runPanel(() => {
      void saveWithoutWaiting(updateRepayment, vars, undefined, [["debts", debt.id]]);
      setPanel(null);
      toast.success(t("toasts.repaymentUpdated"));
    });
  };

  // Online only: returned to `DeleteButton`, which keeps its question up,
  // locked, until the answer — 7 s at most (`answerOrLetGo`); then it lets go,
  // the debt stays disabled and the toast comes with the answer. A failure is
  // said by `useDeleteRepayment`.
  const deletePanelPayment = () =>
    runPanel(() => {
      if (!panel) return;
      const paymentId = panel.id;
      return answerOrLetGo(() => removeRepayment.mutateAsync({ paymentId, debtId: debt.id }), {
        records: [["debts", debt.id]],
        close: () => setPanel((open) => (open?.id === paymentId ? null : open)),
        succeeded: () => toast.success(t("toasts.repaymentDeleted")),
      });
    });

  const receipt = loanReceipt(debt);
  const receiptLabel = (key: ReceiptLine["key"]) =>
    key === "started"
      ? `${t(borrowed ? "debts.took" : "debts.gave")}, ${dateFmt.format(firestoreToDate(debt.date))}`
      : key === "handedBack"
        ? t(borrowed ? "debts.repaidOut" : "debts.repaidIn")
        : key === "interest"
          ? t("debts.statInterest")
          : key === "over"
            ? t("debts.receiptOver")
            : t(forgivenTag(debt));

  // What a bank loan is besides its sum: the instalment, how many are left,
  // when it ends, and the terms it was taken on.
  const loanFacts: { label: string; value: string }[] = loan
    ? [
        { label: t("debts.statInstalment"), value: formatCurrency(loan.instalment) },
        { label: t("debts.statPaymentsLeft"), value: payoff ? String(payoff.months) : "—" },
        { label: t("debts.statFinishes"), value: payoff ? monthFmt.format(payoff.finishDate) : t("debts.settled") },
        { label: t("debts.termMonths"), value: `${debt.termMonths} ${t("debts.monthsUnit")}` },
        ...((debt.interestFreeMonths ?? 0) > 0 ? [{ label: t("debts.interestFree"), value: `${debt.interestFreeMonths} ${t("debts.monthsUnit")}` }] : []),
        ...(isFloating(debt) ? [{ label: t("debts.interestRate"), value: `${rateText} (${t("debts.rateParts", { base: pct.format(debt.baseRate ?? 0), margin: pct.format(debt.margin ?? 0) })})` }] : []),
      ]
    : [];

  return (
    <article className={`${styles.debtCard} ${className}`} style={{ borderLeftColor: tone }} aria-label={name}>
      <div className={styles.debtHead}>
        <span className={styles.receiptName}>{name}</span>
        {debt.isSettled ? <span className={styles.settledTag}>{closedTag}</span> : <span className={styles.debtLeft} style={{ color: `var(--color-${borrowed ? "expense" : "income"}-text)` }}>{formatCurrency(debt.remaining)}</span>}
      </div>
      <div className={styles.debtLine}>{oneLine}</div>

      {normal && (
        <>
          <div className={styles.receiptBar} aria-hidden>
            <span style={{ width: `${cleared}%` }} />
          </div>
          <div className={styles.receiptSub}>
            {t("debts.receiptCleared", { percent: Math.floor(cleared) })}
            {debt.dueDate && !debt.isSettled ? ` · ${t("debts.receiptBy", { date: shortFmt.format(firestoreToDate(debt.dueDate)) })}` : ""} · {rateText}
          </div>
          {last && !detailed && <div className={styles.debtLine}>{t("debts.cardLast", { when: `${dateFmt.format(firestoreToDate(last.date))} · ${formatCurrency(last.amount)}` })}</div>}
        </>
      )}

      {detailed && (
        <>
          {/* The debt as a receipt: what started it, what came back, what is
              left — a sum that adds up (loanReceipt). */}
          <div className={styles.receipt}>
            {receipt.map((line) => (
              <div key={line.key} className={styles.receiptRow}>
                <span>{receiptLabel(line.key)}</span>
                {/* The sign by the line, not the figure: nothing handed back is −0, which printed «+ -0,00». */}
                <span>
                  {line.key === "started" ? "" : line.key === "handedBack" || line.key === "forgiven" ? "− " : "+ "}
                  {formatCurrency(Math.abs(line.amount))}
                </span>
              </div>
            ))}
            <div className={styles.receiptTotal}>
              <span>{t(borrowed ? "debts.leftToGive" : "debts.leftToGet")}</span>
              <span>{formatCurrency(debt.remaining)}</span>
            </div>
          </div>
          {/* Paid off: the day of the last payment, and where it went. Let go: when, and why. */}
          {debt.isSettled && !debt.forgiven && last && (
            <div className={styles.heroSub}>{t("debts.settledLine", { date: dateFmt.format(firestoreToDate(last.date)), how: moneyMovedName(last.accountId, accounts, t) })}</div>
          )}
          {debt.forgiven && (
            <div className={styles.heroSub}>
              {t(debt.forgiven.refund ? "debts.cancelledLine" : "debts.forgivenLine", { amount: formatCurrency(debt.forgiven.amount), date: dateFmt.format(firestoreToDate(debt.forgiven.date)) })}
              {debt.forgiven.note && <span className="d-block fst-italic">«{debt.forgiven.note}»</span>}
            </div>
          )}

          {/* A bank loan's own terms, which the receipt has no line for. */}
          {loanFacts.length > 0 && (
            <dl className={styles.details}>
              {loanFacts.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <section className={styles.paysSection} aria-labelledby={`debt-pays-${debt.id}`}>
            <h3 id={`debt-pays-${debt.id}`} className={styles.paysHead}>
              {t("debts.tabPayments")} · {debt.payments.length}
            </h3>
            <ul className={styles.payList} aria-label={t("debts.tabPayments")}>
              {debt.payments.map((payment) => {
                const open = panel?.id === payment.id;
                const split = splits?.get(payment.id);
                return (
                  <li key={payment.id}>
                    {/* The row is the way in: tap a payment to put it right. */}
                    <button type="button" className={styles.payRow} onClick={() => openEdit(payment)} aria-expanded={open} disabled={pending}>
                      <span className={styles.payWhen}>
                        <span>{shortFmt.format(firestoreToDate(payment.date))}</span>
                        {/* How it went: into or out of which card, or no money at all. */}
                        <span className={styles.payHow}>
                          {payment.accountId === undefined ? <FiSlash size={11} aria-hidden /> : borrowed ? <FiArrowUpRight size={11} aria-hidden /> : <FiArrowDownLeft size={11} aria-hidden />}
                          {moneyMovedName(payment.accountId, accounts, t)}
                        </span>
                        {split && <span className={styles.paySplit}>{t("debts.splitRow", { principal: formatCurrency(split.principal), interest: formatCurrency(split.interest) })}</span>}
                        {payment.notes && <span className={styles.payNote}>«{payment.notes}»</span>}
                      </span>
                      <span className={styles.payAmount}>{formatCurrency(payment.amount)}</span>
                      <FiEdit2 size={13} aria-hidden className={styles.payEdit} />
                    </button>
                    {open && (
                      <PaymentPanel
                        amount={panelAmount}
                        date={panelDate}
                        saving={panelBusy}
                        onAmount={setPanelAmount}
                        onDate={setPanelDate}
                        onSave={savePanel}
                        onCancel={() => setPanel(null)}
                        onDelete={deletePanelPayment}
                        account={panelAccount}
                        onAccount={setPanelAccount}
                        notes={panelNotes}
                        onNotes={setPanelNotes}
                        income={!borrowed}
                        unchanged={panelUnchanged}
                        storedDate={toISODay(payment.date)}
                      />
                    )}
                  </li>
                );
              })}
              {/* Let go of: in the history like a payment, but not one — no money moved. */}
              {debt.forgiven && (
                <li className={`${styles.payRow} ${styles.payOrigin}`}>
                  <span className={styles.payWhen}>
                    <span className="d-inline-flex align-items-center gap-1">
                      {debt.forgiven.refund ? <FiRotateCcw size={13} aria-hidden /> : <FiGift size={13} aria-hidden />} {t(forgivenTag(debt))}
                    </span>
                    <span className={styles.paySplit}>
                      {dateFmt.format(firestoreToDate(debt.forgiven.date))}
                      {debt.forgiven.note ? ` · «${debt.forgiven.note}»` : ""}
                    </span>
                  </span>
                  <span className={styles.payAmount} style={{ color: "var(--color-text-secondary)" }}>
                    {formatCurrency(debt.forgiven.amount)}
                  </span>
                </li>
              )}
              {/* Where it started. Changed through the debt itself, in «Ενέργειες». */}
              <li className={`${styles.payRow} ${styles.payOrigin}`}>
                <span className={styles.payWhen}>
                  <span>{t(borrowed ? "debts.took" : "debts.gave")}</span>
                  <span className={styles.paySplit}>{dateFmt.format(firestoreToDate(debt.date))}</span>
                </span>
                <span className={styles.payAmount} style={{ color: "var(--color-text-primary)" }}>
                  {formatCurrency(debt.amount)}
                </span>
              </li>
            </ul>
            {debt.payments.length === 0 && <p className={styles.payEmpty}>{t("debts.noPayments")}</p>}
          </section>

          {!!loan && !debt.isSettled && (
            <details className={styles.whatIf}>
              <summary>{t("debts.tabWhatIf")}</summary>
              <div className="d-flex flex-column gap-3 pt-2">
                <PayMore debt={debt} formatCurrency={formatCurrency} />
                {isFloating(debt) && <RateWatch debt={debt} formatCurrency={formatCurrency} locale={locale} />}
              </div>
            </details>
          )}
        </>
      )}

      {/* «Ενέργειες» at its word's width, the one thing to do taking the rest. */}
      <div className={styles.debtButtons}>
        <Button color="secondary" outline onClick={onActions} disabled={pending} className={styles.ctaActions} aria-label={`${t("debts.actions")} — ${name}`}>
          <FiMoreHorizontal size={16} aria-hidden /> {t("debts.actions")}
        </Button>
        {!debt.isSettled && (
          <Button color="primary" onClick={() => onRecord(instalmentDue ?? debt.remaining)} disabled={pending} className={styles.ctaMain}>
            <FiPlus size={16} aria-hidden /> {ctaLabel}
          </Button>
        )}
      </div>
    </article>
  );
}

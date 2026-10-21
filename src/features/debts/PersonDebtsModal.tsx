import { useId, useMemo, useState } from "react";
import { Button, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiArrowDownLeft, FiArrowUpRight, FiColumns, FiEdit2, FiGift, FiLayers, FiPlus, FiRotateCcw, FiSlash, FiSquare, FiX } from "react-icons/fi";
import { differenceInCalendarMonths } from "date-fns";
import { firestoreToDate, parseISODay, toISODay } from "../../shared/utils/dates";
import { currentRate, debtProgress, isFloating, personProgress, type DebtProgress, loanPayoff, loanSplits, loanState, payoffSaving, rateOutlook } from "./debtsUtils";
import { useDeleteDebt, useDeleteRepayment, useUpdateDebt, useUpdateRepayment } from "./useDebts";
import AddDebtModal from "./AddDebtModal";
import { DateField } from "../../shared/components/DateField";
import { RateHelpButton } from "./RateExplainer";
import styles from "./css/DebtsPage.module.css";
import segmented from "../../shared/css/Segmented.module.css";
import type { DebtPayment, DebtPerson, DebtWithStatus } from "../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { MoneyMovedPicker } from "./MoneyMovedPicker";
import { moneyMovedName } from "./moneyMovedName";
import { PaymentNote } from "./PaymentNote";
import { useAccountList } from "../accounts/useMoneyAccounts";
import RepaymentWizard from "./RepaymentWizard";
import { ForgiveDebtModal } from "./ForgiveDebtModal";
import { LoanCards, MiniRing } from "./LoanCards";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";

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
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  const typed = parseFloat(index);
  const changed = Number.isFinite(typed) && typed >= 0 && typed !== (debt.baseRate ?? 0);
  const reviewed = debt.rateReviewedAt ? firestoreToDate(debt.rateReviewedAt) : undefined;
  // Half a year is longer than every reset period a Greek mortgage uses, so by
  // then the figure on file is certainly not the one the bank is charging.
  const stale = reviewed ? differenceInCalendarMonths(new Date(), reviewed) >= 6 : false;

  const saveIndex = () => {
    if (!changed) return;
    // The stored rate stays the sum of the parts. Writing one without the other
    // would leave the payment and the rate beside it disagreeing.
    const allIn = Math.round((typed + (debt.margin ?? 0)) * 100) / 100;
    update.mutate({ debtId: debt.id, data: { baseRate: typed, interestRate: allIn, rateReviewedAt: new Date() } });
  };

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
          <Input type="number" min={0} step="0.01" inputMode="decimal" value={index} onChange={(e) => setIndex(e.target.value)} aria-label={t("debts.baseRate")} />
          <InputGroupText>%</InputGroupText>
        </InputGroup>
        <Button color="secondary" outline size="sm" disabled={!changed || update.isPending} onClick={saveIndex}>
          {t("debts.updateIndex")}
        </Button>
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
}: {
  amount: string;
  date: string;
  notes: string;
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
  const accountLabelId = useId();
  const dateId = useId();
  const value = parseFloat(amount);
  const amountValid = Number.isFinite(value) && value > 0;
  const valid = amountValid && parseISODay(date) !== null;

  return (
    <div className={styles.paymentPanel}>
      {/* Two fields to a row: at 375px a third squeezes the amount out of sight. */}
      <div className={styles.paymentFields}>
        <InputGroup size="sm">
          <Input
            autoFocus
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={amount}
            invalid={amount !== "" && !amountValid}
            onChange={(e) => onAmount(e.target.value)}
            aria-label={t("common.amount")}
          />
        </InputGroup>
        {/* The app's own calendar, like every other date in it — not the
            browser's, which opens from a small icon and looks different on
            every phone. */}
        <div>
          <label htmlFor={dateId} className="visually-hidden">
            {t("debts.when")}
          </label>
          <DateField id={dateId} small value={date} onChange={onDate} placeholder={t("debts.when")} />
        </div>
      </div>
      {/* Which card it left or reached, as on any transaction — it moves that
          card. Or none: settled without money changing hands. */}
      <div className={styles.paymentAccount} role="group" aria-labelledby={accountLabelId}>
        <div id={accountLabelId} className={styles.paymentAccountLabel}>
          {t(income ? "debts.paidInto" : "debts.paidFrom")}
        </div>
        <MoneyMovedPicker value={account} onChange={onAccount} income={income} />
      </div>
      <PaymentNote value={notes} onChange={onNotes} className="mb-2" small />
      <div className={styles.paymentButtons}>
        <Button color="primary" size="sm" onClick={onSave} disabled={saving || !valid}>
          {t("common.save")}
        </Button>
        {onDelete && (
          <DeleteButton size="sm" onClick={onDelete} disabled={deleteGuard.locked} title={deleteGuard.reason} />
        )}
        {/* A cross rather than a word: at 375px "Cancel" beside the other two
            fell onto a line of its own. Tapping the row again closes it too. */}
        <Button color="secondary" outline size="sm" onClick={onCancel} className={styles.paymentClose} aria-label={t("common.cancel")} title={t("common.cancel")}>
          <FiX size={15} aria-hidden />
        </Button>
      </div>
      {onDelete && deleteGuard.reason && <div className={styles.paymentHint}>{deleteGuard.reason}</div>}
    </div>
  );
}

type SheetTab = "pays" | "progress" | "whatif" | "details";

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
function ProgressPanel({
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

/** A circle that fills as the debt comes down. */
function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={styles.ring}>
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden>
        <circle cx="52" cy="52" r={radius} className={styles.ringTrack} />
        {/* Nothing at 0%: a round cap on a zero-length stroke draws a stray dot. */}
        {percent > 0 && <circle cx="52" cy="52" r={radius} className={styles.ringFill} strokeDasharray={`${(circumference * percent) / 100} ${circumference}`} />}
      </svg>
      <div className={styles.ringCentre}>
        <strong>{Math.floor(percent)}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

/**
 * One person's loans, one loan at a time.
 *
 * The loan in front gets the whole sheet: how much is left and how much of it
 * is gone, the four figures that describe it, and three tabs — the payments
 * against it, what paying more or a rate move would do, and its details. With
 * more than one loan, chips at the top swap which one is in front.
 *
 * On a phone it fills the screen, with the payment button held at the bottom
 * where a thumb finds it; on a wide screen it splits into two columns, the loan
 * on the left and the tabs beside it, so nothing needs scrolling to compare.
 *
 * Loans stay separate rather than collapsing into a single balance, because
 * that is what keeping a record means — two hundred in March for the rent and
 * fifty in May are two things you will want to recognise later.
 */
export default function PersonDebtsModal({
  person,
  formatCurrency,
  locale,
  onClose,
  knownPeople = [],
  inline = false,
}: {
  person: DebtPerson;
  formatCurrency: (n: number) => string;
  locale: string;
  onClose: () => void;
  /** As a panel in the page, beside the list — for a wide screen — rather than a dialog over it. */
  inline?: boolean;
  /** For the name field when a loan is corrected or added. */
  knownPeople?: string[];
}) {
  const { t } = useTranslation();
  const updateRepayment = useUpdateRepayment();
  const removeRepayment = useDeleteRepayment();
  const deleteGuard = useOfflineGuard("delete");
  const removeDebt = useDeleteDebt();

  // Open loans first: a settled one is history, and the sheet should open on
  // something that still needs doing.
  const loans = useMemo(() => [...person.debts.filter((d) => !d.isSettled), ...person.debts.filter((d) => d.isSettled)], [person.debts]);

  const [pickedId, setPickedId] = useState<string | undefined>(() => loans[0]?.id);
  // A deleted loan cannot stay in front; fall back to whatever is first.
  const debt = loans.find((d) => d.id === pickedId) ?? loans[0];

  const [tab, setTab] = useState<SheetTab>("pays");
  // One loan at a time, or every loan as a card down the screen. Remembered,
  // since whoever reads it as columns will want it that way next time too.
  const [view, setView] = useLocalStorage<"all" | "columns" | "one">("debts-sheet-view", "all");
  // With a single loan there is nothing to list.
  const asColumns = view === "columns" && loans.length > 1;
  // Everything with the person at a glance, nothing to press — the first of the three.
  const asAll = view === "all" && loans.length > 1;
  // One panel open at a time: a new payment and a correction open together is
  // two half-finished forms and no way to tell which Save is which.
  const [panel, setPanel] = useState<{ kind: "edit"; payment: DebtPayment } | null>(null);
  // Recording a new repayment is the four-step wizard, over this sheet; only a
  // correction opens in place.
  // Holds the amount it opens with.
  const [recording, setRecording] = useState<number | null>(null);
  const [panelAmount, setPanelAmount] = useState("");
  const [panelDate, setPanelDate] = useState(today);
  // Which card a repayment went through: "" (the main account) for a new one,
  // and an older one's own — or none at all, which it keeps unless one is chosen.
  const [panelAccount, setPanelAccount] = useState<string | undefined>("");
  const [panelNotes, setPanelNotes] = useState("");
  const accounts = useAccountList();
  const [deleting, setDeleting] = useState<DebtWithStatus | null>(null);
  const [editing, setEditing] = useState<DebtWithStatus | null>(null);
  const [adding, setAdding] = useState(false);
  // Letting the shown debt go — see `ForgiveDebtModal` — and taking that back.
  const [forgiving, setForgiving] = useState(false);
  const unforgive = useUpdateDebt();

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const shortFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const headline =
    person.owedByMe > 0 && person.owedToMe > 0
      ? t("debts.bothWays", { out: formatCurrency(person.owedByMe), in: formatCurrency(person.owedToMe) })
      : person.owedByMe > 0
        ? t("debts.youOweAmount", { amount: formatCurrency(person.owedByMe) })
        : person.owedToMe > 0
          ? t("debts.owesYouAmount", { amount: formatCurrency(person.owedToMe) })
          : t("debts.settledUp");
  const headlineTone = person.owedByMe > 0 ? "var(--color-expense-text)" : person.owedToMe > 0 ? "var(--color-income-text)" : undefined;

  const newLoan = (
    <Button color="primary" size="sm" onClick={() => setAdding(true)} className={styles.sheetNew} aria-label={t("debts.newLoanShort")}>
      <FiPlus size={14} aria-hidden /> <span className="d-none d-sm-inline">{t("debts.newLoanShort")}</span>
    </Button>
  );

  const modals = (
    <>
      {editing && <AddDebtModal debt={editing} knownPeople={knownPeople.length > 0 ? knownPeople : [person.person]} onClose={() => setEditing(null)} />}
      {adding && <AddDebtModal defaultPerson={person.person} knownPeople={knownPeople.length > 0 ? knownPeople : [person.person]} onClose={() => setAdding(false)} />}
      {recording !== null && debt && <RepaymentWizard debt={debt} suggested={recording} formatCurrency={formatCurrency} onClose={() => setRecording(null)} />}
      {forgiving && debt && <ForgiveDebtModal debt={debt} formatCurrency={formatCurrency} onClose={() => setForgiving(false)} />}
    </>
  );

  if (!debt) {
    // Everything with this person was deleted from under the sheet.
    if (inline) return <div className={styles.pane}><p className="text-body-secondary small p-3 mb-0">{t("debts.settledUp")}</p></div>;
    return (
      <Modal isOpen toggle={onClose} centered>
        <ModalHeader toggle={onClose}>{person.person}</ModalHeader>
        <ModalBody className="text-body-secondary small">{t("debts.settledUp")}</ModalBody>
      </Modal>
    );
  }

  const borrowed = debt.direction === "owed_by_me";
  const loan = loanState(debt);
  const payoff = loan ? loanPayoff(debt) : undefined;
  const splits = loan ? loanSplits(debt) : undefined;
  const cleared = clearedPercent(debt, loan);
  const canWhatIf = !!loan && !debt.isSettled;
  const shownTab: SheetTab = tab === "whatif" && !canWhatIf ? "pays" : tab;
  const saving = updateRepayment.isPending;
  const lastPayment = debt.payments[0];

  // What the button says and what it fills in. On a loan that is the month's
  // payment — the thing actually being paid — or what is left, if that is less.
  const instalmentDue = loan && !debt.isSettled ? Math.min(loan.instalment, debt.remaining) : undefined;
  const ctaLabel =
    instalmentDue !== undefined
      ? t(borrowed ? "debts.payAmountOut" : "debts.payAmountIn", { amount: formatCurrency(instalmentDue) })
      : t(borrowed ? "debts.payShortOut" : "debts.payShortIn");

  const pick = (id: string) => {
    setPickedId(id);
    setPanel(null);
  };

  const openRecord = () => {
    setTab("pays");
    setPanel(null);
    // A part payment is one edit away from here; the month's payment, or settling, is the common case.
    setRecording(instalmentDue ?? debt.remaining);
  };

  const shownView = asAll ? "all" : asColumns ? "columns" : "one";
  const VIEWS = [
    { id: "all", icon: FiLayers, label: "debts.viewAll" },
    { id: "columns", icon: FiColumns, label: "debts.viewColumns" },
    { id: "one", icon: FiSquare, label: "debts.viewOne" },
  ] as const;
  // Held at the top of the sheet while it scrolls: with many loans it rode up
  // and out of sight, under the cards, and there was no way back but up.
  const viewToggle = loans.length > 1 && (
    <div className={`${segmented.group} ${styles.viewToggle}`} role="group" aria-label={t("debts.viewLabel")}>
      {VIEWS.map(({ id, icon: Icon, label }) => (
        <button key={id} type="button" className={`${segmented.item} ${shownView === id ? segmented.active : ""}`} aria-pressed={shownView === id} onClick={() => setView(id)}>
          <Icon size={13} aria-hidden /> {t(label)}
        </button>
      ))}
    </div>
  );

  // «Όλα μαζί»: the person's totals, then each loan with how much of it is gone. To look at only.
  const allTogether = (
    <>
      <div className={styles.personTotal}>
        {personProgress(loans).map((total) => (
          <ProgressPanel
            key={total.direction}
            progress={total.progress}
            borrowed={total.direction === "owed_by_me"}
            formatCurrency={formatCurrency}
            title={t(total.direction === "owed_by_me" ? "debts.totalBorrowed" : "debts.totalLent", { count: total.count })}
          />
        ))}
      </div>
      <ul className={styles.allList}>
        {loans.map((d) => {
          const tone = d.isSettled ? "var(--color-text-secondary)" : d.direction === "owed_by_me" ? "var(--color-expense)" : "var(--color-income)";
          return (
            <li key={d.id} className={styles.allRow} style={{ borderLeftColor: tone }}>
              <span className={styles.allMain}>
                <span className={styles.allName}>{d.label || t(d.direction === "owed_by_me" ? "debts.iBorrowed" : "debts.iLent")}</span>
                <span className={styles.allMeta}>{t("debts.of", { amount: formatCurrency(d.amount) })}</span>
              </span>
              <span className={styles.allAmount}>{d.isSettled ? t(d.forgiven ? "debts.forgivenTag" : "debts.settled") : formatCurrency(d.remaining)}</span>
              <MiniRing percent={clearedPercent(d, loanState(d))} tone={tone} label={t("debts.cleared")} />
            </li>
          );
        })}
      </ul>
    </>
  );

  // From a column: that loan in front, one at a time, where it can be corrected.
  const openFromColumn = (d: DebtWithStatus) => {
    pick(d.id);
    setTab("pays");
    setView("one");
  };

  // From a column: the wizard for that loan, over the columns. Picked first,
  // so the wizard and the figure it opens with are that loan's.
  const recordFromColumn = (d: DebtWithStatus) => {
    pick(d.id);
    const state = loanState(d);
    setRecording(state ? Math.min(state.instalment, d.remaining) : d.remaining);
  };

  const openEdit = (payment: DebtPayment) => {
    // Tapping the open one again closes it, like any other row that expands.
    if (panel?.payment.id === payment.id) {
      setPanel(null);
      return;
    }
    setPanel({ kind: "edit", payment });
    setPanelAmount(String(payment.amount));
    setPanelDate(toISODay(payment.date));
    setPanelAccount(payment.accountId);
    setPanelNotes(payment.notes ?? "");
  };

  const savePanel = () => {
    const value = parseFloat(panelAmount);
    const when = parseISODay(panelDate);
    if (!panel || !Number.isFinite(value) || value <= 0 || !when) return;

    // `null` when switched off, so the card it had is taken off rather than kept.
    updateRepayment.mutate(
      { paymentId: panel.payment.id, debtId: debt.id, amount: value, date: when, accountId: panelAccount ?? null, notes: panelNotes.trim() || null },
      { onSuccess: () => setPanel(null) },
    );
  };

  const deletePanelPayment = () => {
    if (!panel) return;
    removeRepayment.mutate({ paymentId: panel.payment.id, debtId: debt.id }, { onSuccess: () => setPanel(null) });
  };

  const rateText = !loan
    ? t("debts.noInterest")
    : currentRate(debt) <= 0
      ? t("debts.interestFreeLoan")
      : t(isFloating(debt) ? "debts.rateFloatingShort" : "debts.rateFixedShort", { rate: pct.format(currentRate(debt)) });

  // The four figures that describe this loan. A loan and money between people
  // are different things, so they are described by different figures.
  const stats: { label: string; value: string }[] = loan
    ? [
        { label: t("debts.statInstalment"), value: formatCurrency(loan.instalment) },
        { label: t("debts.statPaymentsLeft"), value: payoff ? String(payoff.months) : "—" },
        { label: t("debts.statFinishes"), value: payoff ? monthFmt.format(payoff.finishDate) : t("debts.settled") },
        { label: t("debts.statInterest"), value: formatCurrency(loan.interestPaid) },
      ]
    : [
        { label: t("debts.statOriginal"), value: formatCurrency(debt.amount) },
        { label: t(borrowed ? "debts.repaidOut" : "debts.repaidIn"), value: formatCurrency(debt.paid) },
        { label: t("debts.statLast"), value: lastPayment ? shortFmt.format(firestoreToDate(lastPayment.date)) : "—" },
        { label: t("debts.dueDate"), value: debt.dueDate ? shortFmt.format(firestoreToDate(debt.dueDate)) : "—" },
      ];

  const details: { label: string; value: string }[] = [
    { label: t(borrowed ? "debts.took" : "debts.gave"), value: `${formatCurrency(debt.amount)} · ${dateFmt.format(firestoreToDate(debt.date))}` },
    { label: t("debts.interestRate"), value: loan && isFloating(debt) ? `${rateText} (${t("debts.rateParts", { base: pct.format(debt.baseRate ?? 0), margin: pct.format(debt.margin ?? 0) })})` : rateText },
    ...(loan ? [{ label: t("debts.termMonths"), value: `${debt.termMonths} ${t("debts.monthsUnit")}` }] : []),
    ...(loan && (debt.interestFreeMonths ?? 0) > 0 ? [{ label: t("debts.interestFree"), value: `${debt.interestFreeMonths} ${t("debts.monthsUnit")}` }] : []),
    ...(debt.dueDate ? [{ label: t("debts.dueDate"), value: dateFmt.format(firestoreToDate(debt.dueDate)) }] : []),
  ];

  const tabs: { id: SheetTab; label: string }[] = [
    { id: "pays", label: `${t("debts.tabPayments")} · ${debt.payments.length}` },
    { id: "progress", label: t("debts.tabProgress") },
    ...(canWhatIf ? [{ id: "whatif" as const, label: t("debts.tabWhatIf") }] : []),
    { id: "details", label: t("debts.tabDetails") },
  ];

  const rest = (
    <>
      {asAll ? (
        <ModalBody className={styles.columnsBody}>
          {viewToggle}
          {allTogether}
        </ModalBody>
      ) : asColumns ? (
        <ModalBody className={styles.columnsBody}>
          {viewToggle}
          <LoanCards loans={loans} formatCurrency={formatCurrency} locale={locale} onOpen={openFromColumn} onRecord={recordFromColumn} />
        </ModalBody>
      ) : (
      <ModalBody className={styles.sheetBody}>
        <div className={styles.sheetLeft}>
          {viewToggle}
          {/* The person's totals are «Όλα μαζί», a tab of their own. */}

          {loans.length > 1 && (
            <div className={styles.picker} role="group" aria-label={t("debts.pickerLabel")}>
              {loans.map((d) => (
                <button key={d.id} type="button" className={`${styles.pick} ${d.id === debt.id ? styles.pickOn : ""}`} aria-pressed={d.id === debt.id} onClick={() => pick(d.id)}>
                  <span
                    className={styles.pickDot}
                    style={{ background: d.isSettled ? "var(--color-text-secondary)" : d.direction === "owed_by_me" ? "var(--color-expense)" : "var(--color-income)" }}
                    aria-hidden
                  />
                  <span className={styles.pickName}>{d.label || t(d.direction === "owed_by_me" ? "debts.iBorrowed" : "debts.iLent")}</span>
                  <span className={styles.pickAmount}>{d.isSettled ? t(d.forgiven ? "debts.forgivenTag" : "debts.settled") : formatCurrency(d.remaining)}</span>
                  <span className={styles.pickBar} aria-hidden>
                    <span style={{ width: `${clearedPercent(d, loanState(d))}%` }} />
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className={styles.hero}>
            <ProgressRing percent={cleared} label={t("debts.cleared")} />
            <div className={styles.heroText}>
              <div className={styles.heroName}>{debt.label || t(borrowed ? "debts.iBorrowed" : "debts.iLent")}</div>
              {debt.isSettled ? (
                <>
                  <span className={styles.settledTag}>{t(debt.forgiven ? "debts.forgivenTag" : "debts.settled")}</span>
                  {/* Paid off: the day of the last payment, and where it went. */}
                  {!debt.forgiven && debt.payments[0] && (
                    <div className={styles.heroSub}>
                      {t("debts.settledLine", { date: dateFmt.format(firestoreToDate(debt.payments[0].date)), how: moneyMovedName(debt.payments[0].accountId, accounts, t) })}
                    </div>
                  )}
                  {/* What was let go, when, and why — the reason the debt is kept rather than deleted. */}
                  {debt.forgiven && (
                    <div className={styles.heroSub}>
                      {t("debts.forgivenLine", { amount: formatCurrency(debt.forgiven.amount), date: dateFmt.format(firestoreToDate(debt.forgiven.date)) })}
                      {debt.forgiven.note && <span className="d-block fst-italic">«{debt.forgiven.note}»</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={styles.heroLabel}>{t(borrowed ? "debts.leftToGive" : "debts.leftToGet")}</div>
                  <div className={styles.heroAmount}>{formatCurrency(debt.remaining)}</div>
                </>
              )}
              <div className={styles.heroSub}>
                {t("debts.of", { amount: formatCurrency(debt.amount) })} · {rateText}
              </div>
            </div>
          </div>

          <dl className={styles.stats}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.stat}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>

        </div>

        <div className={styles.sheetRight}>
          <div className={`nav nav-underline ${styles.tabs}`} role="tablist" aria-label={person.person}>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`debt-tab-${item.id}`}
                aria-selected={shownTab === item.id}
                aria-controls={`debt-panel-${item.id}`}
                className={`nav-link ${shownTab === item.id ? "active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`debt-panel-${shownTab}`} aria-labelledby={`debt-tab-${shownTab}`} className={styles.tabPanel}>
            {shownTab === "pays" && (
              <>
                <ul className={styles.payList} aria-label={t("debts.tabPayments")}>
                  {debt.payments.map((payment) => {
                    const open = panel?.payment.id === payment.id;
                    const split = splits?.get(payment.id);
                    return (
                      <li key={payment.id}>
                        {/* The row is the way in: tap a payment to put it right. */}
                        <button type="button" className={styles.payRow} onClick={() => openEdit(payment)} aria-expanded={open}>
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
                            saving={saving}
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
                          <FiGift size={13} aria-hidden /> {t("debts.forgivenTag")}
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
                  {/* Where it started. Changed through the loan itself, in Details. */}
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
              </>
            )}

            {shownTab === "progress" && <ProgressPanel progress={debtProgress(debt)} borrowed={borrowed} formatCurrency={formatCurrency} />}

            {shownTab === "whatif" && canWhatIf && (
              <div className="d-flex flex-column gap-3">
                <PayMore debt={debt} formatCurrency={formatCurrency} />
                {isFloating(debt) && <RateWatch debt={debt} formatCurrency={formatCurrency} locale={locale} />}
              </div>
            )}

            {shownTab === "details" && (
              <>
                <dl className={styles.details}>
                  {details.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.detailButtons}>
                  <Button color="secondary" outline onClick={() => setEditing(debt)}>
                    <FiEdit2 size={14} aria-hidden /> {t("debts.editLoan")}
                  </Button>
                  {!debt.isSettled && (
                    <Button color="secondary" outline onClick={() => setForgiving(true)}>
                      <FiGift size={14} aria-hidden /> {t("debts.forgiveAction")}
                    </Button>
                  )}
                  {debt.forgiven && (
                    <Button color="secondary" outline disabled={unforgive.isPending} onClick={() => unforgive.mutate({ debtId: debt.id, data: { forgiven: null } })}>
                      <FiRotateCcw size={14} aria-hidden /> {t("debts.unforgive")}
                    </Button>
                  )}
                  <DeleteButton opensConfirm label={t("debts.deleteLoan")} onClick={() => setDeleting(debt)} disabled={deleteGuard.locked} title={deleteGuard.reason} />
                </div>
                {deleteGuard.reason && <div className={styles.paymentHint}>{deleteGuard.reason}</div>}
              </>
            )}
          </div>
        </div>
      </ModalBody>
      )}

      {/* The one thing to do, in the footer: always at the foot of the sheet,
          outside what scrolls. Sticky inside the body it rode up with its
          column on a phone, where the columns stack. */}
      {/* As cards, each open loan has its own button instead. */}
      {!debt.isSettled && !asColumns && !asAll && (
        <ModalFooter className={styles.ctaFooter}>
          <Button color="primary" className="w-100" onClick={openRecord}>
            <FiPlus size={16} aria-hidden /> {ctaLabel}
          </Button>
        </ModalFooter>
      )}


      {modals}

      {deleting && (
        <Modal isOpen toggle={() => setDeleting(null)} centered size="sm">
          <ModalHeader toggle={() => setDeleting(null)}>{t("debts.deleteLoan")}</ModalHeader>
          <ModalBody>
            <p className="mb-0" style={{ fontSize: 14 }}>
              {t("debts.deleteLoanConfirm")}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" outline onClick={() => setDeleting(null)} disabled={removeDebt.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              color="danger"
              disabled={removeDebt.isPending || deleteGuard.locked}
              title={deleteGuard.reason}
              onClick={() => removeDebt.mutate({ debtId: deleting.id, paymentIds: deleting.payments.map((p) => p.id) }, { onSuccess: () => setDeleting(null) })}
            >
              {removeDebt.isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );

  // Beside the list: a panel in the page. The person is its title, and the sheet's
  // ✕ has nothing to close — choosing someone else in the list replaces it.
  if (inline) {
    return (
      <div className={styles.pane}>
        <div className={styles.paneHead}>
          <span className={styles.sheetTitle}>
            <span>{person.person}</span>
            <span className={styles.sheetHeadline} style={{ color: headlineTone }}>
              {headline}
            </span>
          </span>
          {newLoan}
        </div>
        {rest}
      </div>
    );
  }

  return (
    <Modal isOpen toggle={onClose} centered scrollable fullscreen="sm" size="lg">
      <ModalHeader
        toggle={onClose}
        className={styles.sheetHeader}
        close={
          // Apart, with a rule between: the blue "+" and the ✕ side by side were one
          // slip of the thumb from each other.
          <div className="d-flex align-items-center gap-3 flex-shrink-0">
            {newLoan}
            <span className={styles.headDivider} aria-hidden />
            <button type="button" className="btn-close" onClick={onClose} aria-label={t("common.close")} />
          </div>
        }
      >
        <span className={styles.sheetTitle}>
          <span>{person.person}</span>
          <span className={styles.sheetHeadline} style={{ color: headlineTone }}>
            {headline}
          </span>
        </span>
      </ModalHeader>

      {rest}
    </Modal>
  );
}

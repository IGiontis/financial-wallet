import { useState } from "react";
import { Button, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { differenceInCalendarMonths } from "date-fns";
import { firestoreToDate, parseISODay, toISODay } from "../../shared/utils/dates";
import { currentRate, isFloating, loanPayoff, loanState, payoffSaving, rateOutlook } from "./debtsUtils";
import { useDeleteDebt, useDeleteRepayment, useRecordRepayment, useUpdateDebt, useUpdateRepayment } from "./useDebts";
import AddDebtModal from "./AddDebtModal";
import { RateHelpButton } from "./RateExplainer";
import styles from "./css/DebtsPage.module.css";
import segmented from "../../shared/css/Segmented.module.css";
import type { DebtPayment, DebtPerson, DebtWithStatus } from "../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";

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
  hint,
  saving,
  onAmount,
  onDate,
  onSave,
  onCancel,
  onDelete,
}: {
  amount: string;
  date: string;
  /** Beside the amount — "of €300" while recording, nothing while correcting. */
  hint?: string;
  saving: boolean;
  onAmount: (value: string) => void;
  onDate: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
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
          {hint && <InputGroupText>{hint}</InputGroupText>}
        </InputGroup>
        <Input type="date" bsSize="sm" value={date} onChange={(e) => onDate(e.target.value)} aria-label={t("debts.when")} />
      </div>
      <div className={styles.paymentButtons}>
        <Button color="primary" size="sm" onClick={onSave} disabled={saving || !valid}>
          {t("common.save")}
        </Button>
        {onDelete && (
          <Button color="danger" outline size="sm" onClick={onDelete} disabled={deleteGuard.locked} title={deleteGuard.reason}>
            <FiTrash2 size={13} aria-hidden /> {t("common.delete")}
          </Button>
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

/**
 * One person's record: every loan with them and every repayment against it.
 *
 * Loans stay separate rather than collapsing into a single balance, because
 * that is what keeping a record means — two hundred in March for the rent and
 * fifty in May are two things you will want to recognise later, even though the
 * total is all you check day to day.
 *
 * Each loan reads as a line through time: the day the money changed hands, each
 * repayment in the order it happened, and today with what is left. The same
 * shape the Bills page uses for a month, and for the same reason — the order is
 * the story, and a list sorted newest-first made a debt read backwards.
 */
export default function PersonDebtsModal({
  person,
  formatCurrency,
  locale,
  onClose,
  knownPeople = [],
}: {
  person: DebtPerson;
  formatCurrency: (n: number) => string;
  locale: string;
  onClose: () => void;
  /** For the name field when a loan is corrected. */
  knownPeople?: string[];
}) {
  const { t } = useTranslation();
  const record = useRecordRepayment();
  const updateRepayment = useUpdateRepayment();
  const removeRepayment = useDeleteRepayment();
  const deleteGuard = useOfflineGuard("delete");
  const removeDebt = useDeleteDebt();

  // One panel open at a time, whichever loan it belongs to: a new payment on
  // one loan and a correction on another, open together, is two half-finished
  // forms and no way to tell which Save is which.
  const [panel, setPanel] = useState<{ kind: "record"; debtId: string } | { kind: "edit"; debtId: string; payment: DebtPayment } | null>(null);
  const [panelAmount, setPanelAmount] = useState("");
  const [panelDate, setPanelDate] = useState(today);
  const [deleting, setDeleting] = useState<DebtWithStatus | null>(null);
  const [editing, setEditing] = useState<DebtWithStatus | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const shortFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const saving = record.isPending || updateRepayment.isPending;

  const openRecord = (debt: DebtWithStatus) => {
    setPanel({ kind: "record", debtId: debt.id });
    // Pre-filled with what is left: settling in full is the common case, and a
    // part payment is one edit away from there.
    setPanelAmount(String(debt.remaining));
    setPanelDate(today());
  };

  const openEdit = (debt: DebtWithStatus, payment: DebtPayment) => {
    // Tapping the open one again closes it, like any other row that expands.
    if (panel?.kind === "edit" && panel.payment.id === payment.id) {
      setPanel(null);
      return;
    }
    setPanel({ kind: "edit", debtId: debt.id, payment });
    setPanelAmount(String(payment.amount));
    setPanelDate(toISODay(payment.date));
  };

  const savePanel = () => {
    const value = parseFloat(panelAmount);
    const when = parseISODay(panelDate);
    if (!panel || !Number.isFinite(value) || value <= 0 || !when) return;

    if (panel.kind === "record") record.mutate({ debtId: panel.debtId, amount: value, date: when }, { onSuccess: () => setPanel(null) });
    else updateRepayment.mutate({ paymentId: panel.payment.id, amount: value, date: when }, { onSuccess: () => setPanel(null) });
  };

  const deletePanelPayment = () => {
    if (panel?.kind !== "edit") return;
    removeRepayment.mutate(panel.payment.id, { onSuccess: () => setPanel(null) });
  };

  const headline =
    person.owedByMe > 0 && person.owedToMe > 0
      ? t("debts.bothWays", { out: formatCurrency(person.owedByMe), in: formatCurrency(person.owedToMe) })
      : person.owedByMe > 0
        ? t("debts.youOweAmount", { amount: formatCurrency(person.owedByMe) })
        : person.owedToMe > 0
          ? t("debts.owesYouAmount", { amount: formatCurrency(person.owedToMe) })
          : t("debts.settledUp");

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{person.person}</span>
      </ModalHeader>

      <ModalBody className="pt-2">
        <div
          className="mb-3 fw-semibold"
          style={{ fontSize: 14, color: person.owedByMe > 0 ? "var(--color-expense)" : person.owedToMe > 0 ? "var(--color-income)" : undefined }}
        >
          {headline}
        </div>

        {person.debts.map((debt) => {
          // Once per row: the payoff walk is sixty iterations and the row reads
          // it four times.
          const loan = loanState(debt);
          const payoff = loan ? loanPayoff(debt) : undefined;
          // How much of the debt is gone, not how much has been handed over.
          // On a loan those differ by the interest: six payments of €198 on a
          // €10,000 loan is 12% handed over and 8% repaid, and the bar was
          // drawing the flattering one.
          const cleared = loan ? debt.amount - loan.balance : debt.paid;
          const progress = debt.amount > 0 ? Math.min(Math.max((cleared / debt.amount) * 100, 0), 100) : 0;
          const borrowed = debt.direction === "owed_by_me";
          // Oldest first: the line reads the way it happened.
          const history = [...debt.payments].sort((a, b) => firestoreToDate(a.date).getTime() - firestoreToDate(b.date).getTime());

          return (
            <div key={debt.id} className={styles.loan}>
              <div className={styles.loanHead}>
                <span className="fw-semibold">{debt.label || t(borrowed ? "debts.iBorrowed" : "debts.iLent")}</span>
                <span>
                  {debt.isSettled ? <span className={styles.settledTag}>{t("debts.settled")}</span> : t("debts.remaining", { amount: formatCurrency(debt.remaining) })}
                </span>
              </div>

              {debt.dueDate && <div className={styles.loanMeta}>{t("debts.dueBy", { date: dateFmt.format(firestoreToDate(debt.dueDate)) })}</div>}

              <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${progress}%` }} />
              </div>

              {/* A loan owes more than it was lent, and pays it back on a
                  schedule. Both of those are facts the row could not show while
                  every debt was "handed over less handed back". */}
              {loan && (
                <>
                  <div className={styles.loanFacts}>
                    <span>
                      <strong>{t("debts.instalmentIs", { amount: formatCurrency(loan.instalment) })}</strong>
                    </span>
                    <span>
                      <strong>{formatCurrency(debt.remaining)}</strong> {t("debts.owedNow")}
                    </span>
                    {payoff && (
                      <>
                        <span>{t("debts.paymentsLeft", { count: payoff.months })}</span>
                        <span>{t("debts.finishesOn", { date: dateFmt.format(payoff.finishDate) })}</span>
                      </>
                    )}
                    <span>{t("debts.interestSoFar", { amount: formatCurrency(loan.interestPaid) })}</span>
                    {/* On a floating loan the rate is the one fact on this row
                        with a date attached to it, so it says so. */}
                    {isFloating(debt) && <span>{t("debts.allInRate", { rate: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(currentRate(debt)) })}</span>}
                  </div>

                  {!debt.isSettled && <PayMore debt={debt} formatCurrency={formatCurrency} />}
                  {!debt.isSettled && isFloating(debt) && <RateWatch debt={debt} formatCurrency={formatCurrency} locale={locale} />}
                </>
              )}

              {/* Real buttons, one row, the thing you came to do widest. They
                  were text links before, and on a phone a text link is a guess
                  about where to tap. */}
              <div className={styles.loanButtons}>
                {!debt.isSettled && (
                  <Button color="primary" className={styles.loanButtonMain} onClick={() => openRecord(debt)} aria-expanded={panel?.kind === "record" && panel.debtId === debt.id}>
                    <FiPlus size={15} aria-hidden /> {t(borrowed ? "debts.payShortOut" : "debts.payShortIn")}
                  </Button>
                )}
                <Button color="secondary" outline className={styles.loanButtonSide} onClick={() => setEditing(debt)}>
                  <FiEdit2 size={14} aria-hidden /> {t("debts.editShort")}
                </Button>
                <Button
                  color="danger"
                  outline
                  className={styles.loanButtonIcon}
                  onClick={() => setDeleting(debt)}
                  disabled={deleteGuard.locked}
                  title={deleteGuard.reason ?? t("debts.deleteLoan")}
                  aria-label={t("debts.deleteLoan")}
                >
                  <FiTrash2 size={15} aria-hidden />
                </Button>
              </div>

              {panel?.kind === "record" && panel.debtId === debt.id && (
                <PaymentPanel
                  amount={panelAmount}
                  date={panelDate}
                  hint={t("debts.of", { amount: formatCurrency(debt.remaining) })}
                  saving={saving}
                  onAmount={setPanelAmount}
                  onDate={setPanelDate}
                  onSave={savePanel}
                  onCancel={() => setPanel(null)}
                />
              )}

              <ol className={styles.history} aria-label={t("debts.history")}>
                <li className={styles.historyRow}>
                  <span className={`${styles.historyDot} ${borrowed ? styles.historyDotOut : styles.historyDotIn}`} aria-hidden />
                  <span className={styles.historyWhat}>
                    {t(borrowed ? "debts.took" : "debts.gave")}
                    <span className={styles.historyWhen}> · {shortFmt.format(firestoreToDate(debt.date))}</span>
                  </span>
                  <span className={styles.historyAmount}>{formatCurrency(debt.amount)}</span>
                </li>

                {history.map((payment) => {
                  const open = panel?.kind === "edit" && panel.payment.id === payment.id;
                  return (
                    <li key={payment.id}>
                      {/* The row is the way in: tap a repayment to put it right. */}
                      <button type="button" className={`${styles.historyRow} ${styles.historyRowTappable}`} onClick={() => openEdit(debt, payment)} aria-expanded={open}>
                        <span className={`${styles.historyDot} ${styles.historyDotPaid}`} aria-hidden />
                        <span className={styles.historyWhat}>
                          {t(borrowed ? "debts.repaidOut" : "debts.repaidIn")}
                          <span className={styles.historyWhen}> · {shortFmt.format(firestoreToDate(payment.date))}</span>
                        </span>
                        <span className={styles.historyAmount} style={{ color: "var(--color-income-text)" }}>
                          {formatCurrency(payment.amount)}
                          <FiEdit2 size={12} aria-hidden className={styles.historyEdit} />
                        </span>
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
                        />
                      )}
                    </li>
                  );
                })}

                {/* Where the line stands now: a hollow ring while something is
                    still owed, filled once it is not. */}
                <li className={styles.historyRow}>
                  <span className={`${styles.historyDot} ${debt.isSettled ? styles.historyDotPaid : styles.historyDotNow}`} aria-hidden />
                  <span className={`${styles.historyWhat} ${styles.historyWhen}`}>{t("debts.today")}</span>
                  <span className={styles.historyAmount}>
                    {debt.isSettled ? <span className={styles.settledTag}>{t("debts.settled")}</span> : t("debts.remaining", { amount: formatCurrency(debt.remaining) })}
                  </span>
                </li>
              </ol>
            </div>
          );
        })}
      </ModalBody>

      {editing && <AddDebtModal debt={editing} knownPeople={knownPeople.length > 0 ? knownPeople : [person.person]} onClose={() => setEditing(null)} />}

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
    </Modal>
  );
}

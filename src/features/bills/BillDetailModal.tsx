import { useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Badge, Input, InputGroup, Row, Col } from "reactstrap";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { FiCheck, FiEdit2, FiFastForward, FiRotateCcw, FiTrash2, FiX } from "react-icons/fi";
import type { BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";
import { dateFnsLocale, firestoreToDate, parseISODay, toISODay } from "../../shared/utils/dates";
import { DateField } from "../../shared/components/DateField";
import { expectedAmount, getFrequencyLabel, getFrequencyToken, sinkingFund, type MonthCell } from "./billsUtils";
import { BillYearGrid } from "./BillYearGrid";
import styles from "./css/BillsPage.module.css";

interface BillDetailModalProps {
  bill: BillWithStatus;
  categoryLabel: string;
  formatCurrency: (n: number) => string;
  isBusy: boolean;
  onClose: () => void;
  onMarkPaid: (bill: BillWithStatus) => void;
  onUndoPayment: (bill: BillWithStatus) => void;
  /** Correct one recorded payment - its amount, its date, or both. */
  onEditPayment: (payment: BillPayment, changes: { amount?: number; paidDate?: Date }) => void;
  /** Remove one recorded payment, and the expense it wrote. */
  onDeletePayment: (payment: BillPayment) => void;
  /** Settle a specific month, chosen from the year grid. */
  onPayPeriod: (bill: BillWithStatus, cell: MonthCell) => void;
  onEdit: (bill: BillWithStatus) => void;
  onDelete: (bill: BillWithStatus) => void;
}

/** Read-only fact, e.g. "Amount — €25.50". `sub` adds a small qualifier below,
 * e.g. "avg" when a variable bill's amount is a forecast, not a fixed figure. */
function Fact({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="p-2" style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
      <div className="text-uppercase text-body-secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div className="fw-semibold" style={{ fontSize: 14, color: accent ?? "var(--color-text-primary)" }}>
        {value}
        {sub && (
          <span className="text-body-secondary fw-normal ms-1" style={{ fontSize: 10 }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BillDetailModal({ bill, categoryLabel, formatCurrency, isBusy, onClose, onMarkPaid, onUndoPayment, onEditPayment, onDeletePayment, onPayPeriod, onEdit, onDelete }: BillDetailModalProps) {
  const { t, i18n } = useTranslation();
  const freq = getFrequencyLabel(bill);
  const paid = bill.isPaidThisPeriod;
  const paidDate = bill.payment ? firestoreToDate(bill.payment.paidDate) : undefined;
  const fund = sinkingFund(bill);

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "2-digit", month: "short", year: "numeric" });

  // Every payment, not a capped preview: this list is now where a mistyped
  // amount or a wrong date gets corrected, so the one you need has to be in it.
  const history = [...bill.payments].sort((a, b) => firestoreToDate(b.paidDate).getTime() - firestoreToDate(a.paidDate).getTime());

  // One row at a time is editable or confirming. Two half-finished corrections
  // open at once is a way to save the wrong one.
  const [editing, setEditing] = useState<{ id: string; amount: string; date: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // Tapping a settled month brings you to that payment rather than making you
  // find it: the grid says which one, the list is where it can be changed.
  const [focusedPayment, setFocusedPayment] = useState<string | null>(null);

  const startEdit = (payment: BillPayment) => {
    setConfirmingDelete(null);
    setEditing({ id: payment.id, amount: String(payment.amount), date: toISODay(firestoreToDate(payment.paidDate)) });
  };

  const openPaymentFor = (cell: MonthCell) => {
    if (!cell.payment) return;
    setConfirmingDelete(null);
    setFocusedPayment(cell.payment.id);
    startEdit(cell.payment);
    document.getElementById(`payment-${cell.payment.id}`)?.scrollIntoView({ block: "nearest" });
  };

  const saveEdit = (payment: BillPayment) => {
    if (!editing) return;
    const amount = parseFloat(editing.amount);
    const paidDate = parseISODay(editing.date) ?? undefined;

    onEditPayment(payment, {
      // Only what actually moved: an untouched field should not be rewritten.
      amount: Number.isFinite(amount) && amount > 0 && amount !== payment.amount ? amount : undefined,
      paidDate: paidDate && paidDate.getTime() !== firestoreToDate(payment.paidDate).getTime() ? paidDate : undefined,
    });
    setEditing(null);
  };

  return (
    <Modal isOpen toggle={onClose} centered size="md" scrollable>
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2">
          {bill.name}
          <Badge color={paid ? "success" : "secondary"} pill style={{ fontSize: 10 }}>
            {paid ? t("bills.paidThisPeriodShort") : t("bills.unpaid")}
          </Badge>
        </span>
      </ModalHeader>

      <ModalBody>
        <Row className="g-2 mb-3">
          <Col xs={6}>
            {/* Same figure as the list row — the recent average once a variable
                bill has real payments, never the stale original estimate. */}
            <Fact
              label={t("common.amount")}
              value={formatCurrency(expectedAmount(bill))}
              sub={bill.isVariableAmount ? (bill.averagePaidAmount ? t("bills.averageShort") : t("bills.variesLabel")) : undefined}
            />
          </Col>
          <Col xs={6}>
            {/* Same colour scale as the list, so cadence stays recognisable */}
            <Fact label={t("bills.repeats")} value={t(freq.key, { count: freq.count })} accent={`var(${getFrequencyToken(bill)})`} />
          </Col>
          <Col xs={6}>
            <Fact label={t("common.category")} value={categoryLabel} />
          </Col>
          <Col xs={6}>
            <Fact label={t("bills.perMonth")} value={formatCurrency(bill.monthlyEquivalent)} />
          </Col>
        </Row>

        {/* Where this bill stands right now */}
        <div
          className="p-3 mb-3"
          style={{
            borderRadius: "var(--border-radius-md)",
            background: `color-mix(in srgb, var(${paid ? "--color-income" : "--color-goal"}) 10%, transparent)`,
            border: `1px solid color-mix(in srgb, var(${paid ? "--color-income" : "--color-goal"}) 30%, transparent)`,
          }}
        >
          {paid && paidDate ? (
            <>
              <div className="fw-semibold mb-1" style={{ fontSize: 13, color: "var(--color-income)" }}>
                ✓ {t("bills.paidOn", { date: dateFmt.format(paidDate) })}
              </div>
              <div className="text-body-secondary" style={{ fontSize: 12 }}>
                {t("bills.amountPaid", { amount: formatCurrency(bill.payment?.amount ?? bill.amount) })}
                {bill.nextDueDate && <> · {t("bills.nextDue", { date: dateFmt.format(bill.nextDueDate) })}</>}
              </div>
              {/* Paid beyond this period — say so, or the next due date looks
                  like an ordinary one rather than an already-covered gap. */}
              {bill.paidAheadCount > 0 && (
                <div className="fw-semibold mt-1" style={{ fontSize: 12, color: "var(--color-income)" }}>
                  ⏩ {t("bills.paidAheadNote", { count: bill.paidAheadCount })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="fw-semibold mb-1" style={{ fontSize: 13, color: "var(--color-goal)" }}>
                {t("bills.notPaidYet")}
              </div>
              <div className="text-body-secondary" style={{ fontSize: 12 }}>
                {bill.nextDueDate ? t("bills.dueOn", { date: dateFmt.format(bill.nextDueDate) }) : t("bills.noDueDateSet")}
                {bill.lastPaidDate && <> · {t("bills.lastPaid", { date: dateFmt.format(bill.lastPaidDate) })}</>}
              </div>
            </>
          )}
        </div>

        {/* What to put by, for bills spaced far enough apart that it matters.
            Strictly a suggestion: the app has no record of anyone's savings, so
            it states a rate and a deadline and claims nothing about a balance.
            It used to show time-elapsed as money-already-saved, which was an
            invented figure. */}
        {fund && !paid && (
          <div className="p-3 mb-3" style={{ borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}>
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
              <span className="fw-semibold" style={{ fontSize: 13 }}>
                🐷 {t("bills.setAsideTitle")}
              </span>
              <span className="fw-semibold" style={{ fontSize: 15, fontVariantNumeric: "tabular-nums", color: "var(--color-goal)" }}>
                {t("bills.setAsidePerMonth", { amount: formatCurrency(fund.perMonth) })}
              </span>
            </div>

            {/* Time left, not money put by — and labelled as such. */}
            <div style={{ height: 6, borderRadius: 3, background: "var(--color-border-tertiary)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(fund.elapsed * 100)}%`, background: "var(--color-goal)", borderRadius: 3, transition: "width 0.3s ease" }} />
            </div>

            <div className="text-body-secondary mt-2" style={{ fontSize: 12 }}>
              {fund.monthsLeft === 0
                ? t("bills.setAsideThisMonth", { amount: formatCurrency(fund.target), date: dateFmt.format(fund.dueDate) })
                : t("bills.setAsideUntil", { amount: formatCurrency(fund.target), date: dateFmt.format(fund.dueDate), months: fund.monthsLeft })}
            </div>
          </div>
        )}

        {bill.notes && (
          <p className="text-body-secondary mb-3" style={{ fontSize: 13 }}>
            {bill.notes}
          </p>
        )}

        <BillYearGrid bill={bill} now={new Date()} formatCurrency={formatCurrency} onPay={(cell) => onPayPeriod(bill, cell)} onOpenPayment={openPaymentFor} />

        {/* Payment history */}
        <div className="text-uppercase text-body-secondary mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em" }}>
          {t("bills.paymentHistory")}
        </div>

        {history.length === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 13 }}>
            {t("bills.noPaymentsYet")}
          </p>
        ) : (
          <div className={styles.paymentList}>
            {history.map((p) => {
              if (editing?.id === p.id) {
                return (
                  <div key={p.id} id={`payment-${p.id}`} className={`${styles.paymentRowEditing} ${focusedPayment === p.id ? styles.paymentRowFocused : ""}`}>
                    <DateField small value={editing.date} onChange={(date) => setEditing({ ...editing, date })} maxDate={new Date()} />
                    <InputGroup size="sm" className={styles.paymentAmountField}>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={editing.amount}
                        onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                        aria-label={t("common.amount")}
                      />
                    </InputGroup>
                    <Button color="success" size="sm" onClick={() => saveEdit(p)} aria-label={t("common.save")} title={t("common.save")}>
                      <FiCheck size={14} />
                    </Button>
                    <Button color="secondary" outline size="sm" onClick={() => setEditing(null)} aria-label={t("common.cancel")} title={t("common.cancel")}>
                      <FiX size={14} />
                    </Button>
                  </div>
                );
              }

              if (confirmingDelete === p.id) {
                return (
                  /* Confirmed in place rather than in a second dialog: this also
                     deletes the expense the payment wrote, so it deserves a
                     stop - but not a modal stacked on a modal. */
                  <div key={p.id} id={`payment-${p.id}`} className={styles.paymentRow}>
                    <span className={styles.paymentWarn}>{t("bills.deletePaymentConfirm")}</span>
                    <Button
                      color="danger"
                      size="sm"
                      onClick={() => {
                        onDeletePayment(p);
                        setConfirmingDelete(null);
                      }}
                    >
                      {t("common.delete")}
                    </Button>
                    <Button color="secondary" outline size="sm" onClick={() => setConfirmingDelete(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                );
              }

              return (
                <div key={p.id} id={`payment-${p.id}`} className={`${styles.paymentRow} ${focusedPayment === p.id ? styles.paymentRowFocused : ""}`}>
                  <span className={styles.paymentDate}>{format(firestoreToDate(p.paidDate), "dd MMM yyyy", { locale: dateFnsLocale(i18n.resolvedLanguage) })}</span>
                  <span className={styles.paymentAmount}>{formatCurrency(p.amount)}</span>
                  <button type="button" className={styles.paymentAction} onClick={() => startEdit(p)} aria-label={t("common.edit")} title={t("common.edit")}>
                    <FiEdit2 size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.paymentAction + " " + styles.paymentActionDanger}
                    onClick={() => {
                      setEditing(null);
                      setConfirmingDelete(p.id);
                    }}
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </ModalBody>

      {/* Four actions do not fit one line on a phone. Rather than letting them
          wrap into a ragged second row, the footer becomes two full-width rows
          below `sm` — payment nearest the thumb, edit and delete above it — and
          collapses back to a single row on wider screens. */}
      <ModalFooter className="flex-column flex-sm-row justify-content-sm-between align-items-stretch align-items-sm-center gap-2">
        <div className="d-flex gap-2">
          <Button color="secondary" outline onClick={() => onEdit(bill)} disabled={isBusy} className="flex-fill flex-sm-grow-0 text-nowrap">
            {t("common.edit")}
          </Button>
          {/* Icon-only: this is the destructive, less-common action, so it stays
              visually quieter than Edit rather than matching its weight. */}
          <Button color="danger" outline onClick={() => onDelete(bill)} disabled={isBusy} aria-label={t("common.delete")} title={t("common.delete")} className="flex-shrink-0">
            <FiTrash2 size={15} />
          </Button>
        </div>

        {paid ? (
          <div className="d-flex gap-2">
            <Button color="warning" outline onClick={() => onUndoPayment(bill)} disabled={isBusy} className="flex-fill flex-sm-grow-0 text-nowrap">
              <FiRotateCcw size={15} className="me-1" />
              {t("bills.undoPayment")}
            </Button>
            {/* Settled for now, but the next one can still be cleared early —
                without this the modal offers no way back to the payment form. */}
            <Button color="success" outline onClick={() => onMarkPaid(bill)} disabled={isBusy} className="flex-fill flex-sm-grow-0 text-nowrap">
              <FiFastForward size={15} className="me-1" />
              {t("bills.payAhead")}
            </Button>
          </div>
        ) : (
          <Button color="success" onClick={() => onMarkPaid(bill)} disabled={isBusy} className="text-nowrap">
            <FiCheck size={16} className="me-1" />
            {t("bills.payNow", { amount: formatCurrency(bill.amount) })}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

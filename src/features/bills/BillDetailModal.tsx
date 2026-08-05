import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Badge, Row, Col } from "reactstrap";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { FiCheck, FiRotateCcw } from "react-icons/fi";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { dateFnsLocale, firestoreToDate } from "../../shared/utils/dates";
import { expectedAmount, getFrequencyLabel, getFrequencyToken, sinkingFund } from "./billsUtils";

interface BillDetailModalProps {
  bill: BillWithStatus;
  categoryLabel: string;
  formatCurrency: (n: number) => string;
  isBusy: boolean;
  onClose: () => void;
  onMarkPaid: (bill: BillWithStatus) => void;
  onUndoPayment: (bill: BillWithStatus) => void;
  onEdit: (bill: BillWithStatus) => void;
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

export default function BillDetailModal({ bill, categoryLabel, formatCurrency, isBusy, onClose, onMarkPaid, onUndoPayment, onEdit }: BillDetailModalProps) {
  const { t, i18n } = useTranslation();
  const freq = getFrequencyLabel(bill);
  const paid = bill.isPaidThisPeriod;
  const paidDate = bill.payment ? firestoreToDate(bill.payment.paidDate) : undefined;
  const fund = sinkingFund(bill);

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "2-digit", month: "short", year: "numeric" });

  // Newest first, capped — the full ledger lives in Transactions.
  const history = bill.payments.slice(0, 8);

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

        {/* Saving-ahead plan — only for bills spaced far enough apart that
            putting money by actually matters. */}
        {fund && !paid && (
          <div className="p-3 mb-3" style={{ borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}>
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
              <span className="fw-semibold" style={{ fontSize: 13 }}>
                🐷 {t("bills.setAsideTitle")}
              </span>
              <span className="fw-semibold" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(fund.saved)} <span className="text-body-secondary fw-normal">/ {formatCurrency(fund.target)}</span>
              </span>
            </div>

            <div style={{ height: 6, borderRadius: 3, background: "var(--color-border-tertiary)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(fund.progress * 100)}%`, background: "var(--color-income)", borderRadius: 3, transition: "width 0.3s ease" }} />
            </div>

            <div className="text-body-secondary mt-2" style={{ fontSize: 12 }}>
              {fund.remaining <= 0 ? t("bills.setAsideReady") : `${t("bills.setAsideToGo", { amount: formatCurrency(fund.remaining) })} · ${t("bills.setAsideExplain", { amount: formatCurrency(fund.perMonth) })}`}
            </div>
          </div>
        )}

        {bill.notes && (
          <p className="text-body-secondary mb-3" style={{ fontSize: 13 }}>
            {bill.notes}
          </p>
        )}

        {/* Payment history */}
        <div className="text-uppercase text-body-secondary mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em" }}>
          {t("bills.paymentHistory")}
        </div>

        {history.length === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 13 }}>
            {t("bills.noPaymentsYet")}
          </p>
        ) : (
          <div className="d-flex flex-column gap-1">
            {history.map((p) => (
              <div
                key={p.id}
                className="d-flex align-items-center justify-content-between px-2 py-2"
                style={{ borderRadius: "var(--border-radius-sm)", background: "var(--color-background-secondary)", fontSize: 13 }}
              >
                <span>{format(firestoreToDate(p.paidDate), "dd MMM yyyy", { locale: dateFnsLocale(i18n.resolvedLanguage) })}</span>
                <span className="fw-semibold">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </ModalBody>

      <ModalFooter className="d-flex justify-content-between">
        <Button color="secondary" outline onClick={() => onEdit(bill)} disabled={isBusy}>
          {t("common.edit")}
        </Button>

        {paid ? (
          <Button color="warning" outline onClick={() => onUndoPayment(bill)} disabled={isBusy}>
            <FiRotateCcw size={15} className="me-1" />
            {t("bills.undoPayment")}
          </Button>
        ) : (
          <Button color="success" onClick={() => onMarkPaid(bill)} disabled={isBusy}>
            <FiCheck size={16} className="me-1" />
            {t("bills.payNow", { amount: formatCurrency(bill.amount) })}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

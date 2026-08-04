import { useMemo, useState } from "react";
import { Alert, Badge, Button, Col, Container, Row, Spinner, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiMoreVertical, FiCheck } from "react-icons/fi";
import type { Bill, BillWithStatus, CreateBillDTO, Category } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCategories } from "../transactions/hooks/useTransactions";
import { useBills, useCreateBill, useUpdateBill, useDeleteBill, useMarkBillPaid, useUnmarkBillPaid } from "./useBills";
import { computePeriodTotals, daysUntilDue, expectedAmount, getFrequencyLabel, groupBills, yearlyBreakdown, type BillGroup } from "./billsUtils";
import { DROPDOWN_MENU_MODIFIERS } from "../../shared/utils/dropdown";
import AddBillModal from "./AddBillModal";
import BillDetailModal from "./BillDetailModal";
import MarkPaidModal from "./MarkPaidModal";
import styles from "./css/BillsPage.module.css";

// ─── Section styling ─────────────────────────────────────────────────────────

const SECTION_META: Record<BillGroup, { dot: string; titleKey: string }> = {
  overdue: { dot: "var(--color-expense)", titleKey: "bills.sectionOverdue" },
  upcoming: { dot: "var(--color-goal)", titleKey: "bills.sectionUpcoming" },
  paid: { dot: "var(--color-income)", titleKey: "bills.sectionPaid" },
};

/** Bars in the yearly panel cycle through the semantic accents. */
const CATEGORY_COLORS = ["var(--bs-primary)", "var(--color-goal)", "var(--color-invest)", "var(--color-income)", "var(--color-expense)"];

// ─── Period summary — the signature card ─────────────────────────────────────

function PeriodSummary({ bills, formatCurrency }: { bills: BillWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const totals = useMemo(() => computePeriodTotals(bills), [bills]);

  // The calendar month is the frame people think in, even for odd intervals.
  const periodEnd = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }, []);
  const endLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" }).format(periodEnd);

  const settled = totals.due <= 0 && totals.totalCount > 0;

  return (
    <div className={`${styles.periodCard} p-3 p-lg-4 mb-3`}>
      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
        <span className="text-uppercase fw-semibold text-body-secondary" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
          {settled ? t("bills.allSettled") : t("bills.toPayThisPeriod")}
        </span>
        <Badge color="secondary" pill style={{ fontSize: 10, fontWeight: 500 }}>
          {t("bills.periodEnds", { date: endLabel })}
        </Badge>
      </div>

      <div className="d-flex align-items-baseline flex-wrap gap-2 mb-1">
        <span className={`${styles.bigAmount} ${settled ? styles.bigAmountSettled : ""}`}>{formatCurrency(settled ? totals.paid : totals.due)}</span>
        {!settled && totals.total > 0 && (
          <span className="text-body-secondary" style={{ fontSize: 13 }}>
            {t("bills.ofTotal", { total: formatCurrency(totals.total) })}
          </span>
        )}
      </div>

      {totals.totalCount === 0 ? (
        <p className="text-body-secondary mb-0" style={{ fontSize: 12 }}>
          {t("bills.noBillsHint")}
        </p>
      ) : (
        <>
          <p className="text-body-secondary mb-2" style={{ fontSize: 12 }}>
            {settled ? t("bills.allSettledHint") : t("bills.alreadyPaid", { amount: formatCurrency(totals.paid) })}
          </p>

          <div className={styles.progressTrack} role="progressbar" aria-valuenow={Math.round(totals.paidPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className={styles.progressFill} style={{ width: `${Math.min(totals.paidPct, 100)}%` }} />
          </div>

          <div className="d-flex justify-content-between mt-2 text-body-secondary" style={{ fontSize: 11.5 }}>
            <span>{t("bills.pctCovered", { pct: Math.round(totals.paidPct) })}</span>
            <span>{t("bills.nOfMPending", { pending: totals.unpaidCount, total: totals.totalCount })}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Quick stats ─────────────────────────────────────────────────────────────

function QuickStats({ bills, formatCurrency }: { bills: BillWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const active = bills.filter((b) => b.isActive);
  const overdueCount = groupBills(active).overdue.length;
  const avgMonthly = active.reduce((s, b) => s + b.monthlyEquivalent, 0);

  const stats = [
    { value: String(overdueCount), label: t("bills.overdueCount"), color: overdueCount > 0 ? "var(--color-expense)" : "var(--color-text-primary)" },
    { value: formatCurrency(avgMonthly), label: t("bills.avgMonthly"), color: "var(--bs-primary)" },
    { value: String(active.length), label: t("bills.totalActive"), color: "var(--color-invest)" },
  ];

  return (
    <Row className="g-2 mb-4">
      {stats.map((s) => (
        <Col xs={4} key={s.label}>
          <div className={styles.statBox}>
            <div className={styles.statValue} style={{ color: s.color }}>
              {s.value}
            </div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ─── Due indicator ───────────────────────────────────────────────────────────

function DueChip({ bill }: { bill: BillWithStatus }) {
  const { t, i18n } = useTranslation();

  if (bill.isPaidThisPeriod) {
    const paidOn = bill.lastPaidDate;
    return (
      <span className="fw-medium" style={{ fontSize: 11.5, color: "var(--color-income)" }}>
        ✓ {t("bills.paidRecently")}
        {paidOn && ` ${new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" }).format(paidOn)}`}
      </span>
    );
  }

  const days = daysUntilDue(bill);
  if (days === undefined) return null;

  // Red once late, amber as it approaches, muted while it's still far off.
  const color = days < 0 ? "var(--color-expense)" : days <= 5 ? "var(--color-goal)" : "var(--color-text-secondary)";
  const label = days < 0 ? t("bills.overdueByDays", { count: Math.abs(days) }) : days === 0 ? t("bills.dueToday") : t("bills.dueInDays", { count: days });

  return (
    <span className="fw-medium" style={{ fontSize: 11.5, color }}>
      {label}
    </span>
  );
}

// ─── Bill row ────────────────────────────────────────────────────────────────

function BillRow({
  bill,
  category,
  formatCurrency,
  isBusy,
  onOpenDetails,
  onMarkPaid,
  onEdit,
  onDelete,
}: {
  bill: BillWithStatus;
  category: Category | undefined;
  formatCurrency: (n: number) => string;
  isBusy: boolean;
  onOpenDetails: (b: BillWithStatus) => void;
  onMarkPaid: (b: BillWithStatus) => void;
  onEdit: (b: BillWithStatus) => void;
  onDelete: (b: BillWithStatus) => void;
}) {
  const { t } = useTranslation();
  const freq = getFrequencyLabel(bill);
  const paid = bill.isPaidThisPeriod;
  const overdue = !paid && (daysUntilDue(bill) ?? 0) < 0;

  return (
    <div
      className={`${styles.billRow} ${overdue ? styles.billRowOverdue : ""} ${paid ? styles.billRowPaid : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(bill)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetails(bill);
        }
      }}
      title={t("bills.viewDetails")}
    >
      <span className={styles.iconTile} aria-hidden>
        {category?.icon ?? "🧾"}
      </span>

      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
          <span className="fw-semibold text-truncate text-body-emphasis">{bill.name}</span>
          <Badge color="secondary" pill className="flex-shrink-0 fw-normal" style={{ fontSize: 9.5 }}>
            {t(freq.key, { count: freq.count })}
          </Badge>
        </div>

        <div className="d-flex align-items-center gap-2 text-truncate" style={{ minWidth: 0 }}>
          <span className="text-body-secondary text-truncate" style={{ fontSize: 12 }}>
            {category?.name ?? "—"}
          </span>
          <span className="text-body-secondary flex-shrink-0" style={{ fontSize: 11 }}>
            ·
          </span>
          <DueChip bill={bill} />
        </div>
      </div>

      <div className="text-end flex-shrink-0">
        <div className="fw-semibold text-body-emphasis" style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatCurrency(expectedAmount(bill))}
        </div>
        {bill.isVariableAmount && (
          <div className="text-body-secondary" style={{ fontSize: 9.5 }}>
            {bill.averagePaidAmount ? t("bills.averageShort") : t("bills.variesLabel")}
          </div>
        )}
      </div>

      {paid ? (
        <Button color="success" outline size="sm" className="flex-shrink-0" disabled onClick={(e) => e.stopPropagation()}>
          <FiCheck size={14} className="me-1" />
          {t("bills.paidAction")}
        </Button>
      ) : (
        <Button
          color="success"
          size="sm"
          className="flex-shrink-0"
          disabled={isBusy}
          onClick={(e) => {
            e.stopPropagation();
            onMarkPaid(bill);
          }}
        >
          {t("bills.payAction")}
        </Button>
      )}

      <UncontrolledDropdown onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <DropdownToggle tag="button" className="btn btn-link text-body-secondary p-1 border-0">
          <FiMoreVertical size={18} />
        </DropdownToggle>
        <DropdownMenu end modifiers={DROPDOWN_MENU_MODIFIERS}>
          <DropdownItem onClick={() => onOpenDetails(bill)}>{t("bills.viewDetails")}</DropdownItem>
          <DropdownItem onClick={() => onEdit(bill)}>{t("common.edit")}</DropdownItem>
          <DropdownItem className="text-danger" onClick={() => onDelete(bill)}>
            {t("common.delete")}
          </DropdownItem>
        </DropdownMenu>
      </UncontrolledDropdown>
    </div>
  );
}

// ─── Grouped section ─────────────────────────────────────────────────────────

function BillSection({ group, bills, children }: { group: BillGroup; bills: BillWithStatus[]; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (bills.length === 0) return null;

  const meta = SECTION_META[group];

  return (
    <section className="mb-4">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <span className="d-flex align-items-center gap-2">
          <span className={styles.sectionDot} style={{ background: meta.dot }} />
          <span className="fw-semibold text-body-emphasis" style={{ fontSize: 13 }}>
            {t(meta.titleKey)}
          </span>
        </span>
        <span className="text-body-secondary" style={{ fontSize: 12 }}>
          {bills.length}
        </span>
      </div>
      <div className="d-flex flex-column gap-2">{children}</div>
    </section>
  );
}

// ─── Yearly projection ───────────────────────────────────────────────────────

function YearlyProjection({ bills, categoryFor, formatCurrency }: { bills: BillWithStatus[]; categoryFor: (id: string) => Category | undefined; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();

  const { total, categories } = useMemo(
    () => yearlyBreakdown(bills, (id) => categoryFor(id)?.name ?? "—"),
    [bills, categoryFor],
  );

  return (
    <div className={`${styles.yearlyCard} p-3 p-lg-4`}>
      <div className="mb-3">
        <div className="fw-semibold" style={{ fontSize: 14 }}>
          {t("bills.yearlyProjection")}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.yearlyProjectionHint")}</div>
      </div>

      {categories.length === 0 ? (
        <p className="mb-0" style={{ fontSize: 13, opacity: 0.75 }}>
          {t("bills.noBillsToProject")}
        </p>
      ) : (
        <>
          <div className="d-flex align-items-baseline gap-2 mb-3">
            <span className={styles.yearlyAmount}>{formatCurrency(total)}</span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.perYear")}</span>
          </div>

          <div className="text-uppercase mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", opacity: 0.6 }}>
            {t("bills.byCategory")}
          </div>

          <div className="d-flex flex-column gap-2">
            {categories.map((c, i) => (
              <div key={c.categoryId}>
                <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1" style={{ fontSize: 12 }}>
                  <span className="text-truncate d-flex align-items-center gap-1">
                    <span aria-hidden>{categoryFor(c.categoryId)?.icon ?? "•"}</span>
                    {c.label}
                  </span>
                  <span className="flex-shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(c.yearlyAmount)} <span style={{ opacity: 0.6 }}>{Math.round(c.percentage)}%</span>
                  </span>
                </div>
                <div className={styles.yearlyTrack}>
                  <div className={styles.yearlyFill} style={{ width: `${c.percentage}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BillsPage() {
  const { t } = useTranslation();
  const { data: bills = [], isLoading, isError } = useBills();
  const { data: categories = [] } = useCategories();
  const { format: formatCurrency } = useCurrencyConverter();

  const createBill = useCreateBill();
  const updateBill = useUpdateBill();
  const deleteBill = useDeleteBill();
  const markPaid = useMarkBillPaid();
  const unmarkPaid = useUnmarkBillPaid();

  const [showModal, setShowModal] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BillWithStatus | null>(null);
  const [detailBill, setDetailBill] = useState<BillWithStatus | null>(null);
  const [payingBill, setPayingBill] = useState<BillWithStatus | null>(null);

  const categoryFor = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return (id: string) => map.get(id);
  }, [categories]);

  const groups = useMemo(() => groupBills(bills), [bills]);
  const busy = markPaid.isPending || unmarkPaid.isPending;

  // Keep an open detail modal in sync after a payment lands or is undone.
  const liveDetailBill = detailBill ? (bills.find((b) => b.id === detailBill.id) ?? null) : null;

  const handleConfirmPaid = (amountInBase: number, paidDate: Date) => {
    if (!payingBill) return;
    markPaid.mutate({ bill: payingBill, paidDate, paidAmount: amountInBase }, { onSuccess: () => setPayingBill(null) });
  };

  const handleUndoPayment = (bill: BillWithStatus) => {
    if (!bill.payment) return;
    unmarkPaid.mutate({ paymentId: bill.payment.id, transactionId: bill.payment.transactionId });
  };

  const handleSubmit = async (data: CreateBillDTO): Promise<void> => {
    if (editBill) {
      await new Promise<void>((resolve, reject) => updateBill.mutate({ billId: editBill.id, data }, { onSuccess: () => resolve(), onError: reject }));
    } else {
      await new Promise<void>((resolve, reject) => createBill.mutate(data, { onSuccess: () => resolve(), onError: reject }));
    }
  };

  const openNew = () => {
    setEditBill(null);
    setShowModal(true);
  };
  const openEdit = (bill: Bill) => {
    setEditBill(bill);
    setShowModal(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteBill.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const renderRow = (bill: BillWithStatus) => (
    <BillRow
      key={bill.id}
      bill={bill}
      category={categoryFor(bill.categoryId)}
      formatCurrency={formatCurrency}
      isBusy={busy}
      onOpenDetails={setDetailBill}
      onMarkPaid={setPayingBill}
      onEdit={openEdit}
      onDelete={setDeleteTarget}
    />
  );

  return (
    <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
        <div style={{ minWidth: 0 }}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("bills.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("bills.subtitle")}</p>
        </div>
        <Button color="primary" onClick={openNew} className="flex-shrink-0">
          <span className="d-none d-sm-inline">+ {t("bills.newBill")}</span>
          <span className="d-sm-none">+</span>
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner color="primary" />
        </div>
      )}
      {isError && <Alert color="danger">{t("common.failedToLoad")}</Alert>}

      {!isLoading && !isError && (
        <Row className="g-3 g-lg-4">
          {/* Summary + list */}
          <Col xs={12} lg={7} xl={8}>
            <PeriodSummary bills={bills} formatCurrency={formatCurrency} />
            <QuickStats bills={bills} formatCurrency={formatCurrency} />

            {bills.length === 0 ? (
              <div className="text-center text-body-secondary" style={{ padding: "3rem 0" }}>
                <p style={{ fontSize: 40 }}>🧾</p>
                <p className="fw-medium mb-1">{t("bills.noBillsYet")}</p>
                <p className="small mb-3">{t("bills.noBillsHint")}</p>
                <Button color="primary" onClick={openNew}>
                  + {t("bills.newBill")}
                </Button>
              </div>
            ) : (
              <>
                <BillSection group="overdue" bills={groups.overdue}>
                  {groups.overdue.map(renderRow)}
                </BillSection>
                <BillSection group="upcoming" bills={groups.upcoming}>
                  {groups.upcoming.map(renderRow)}
                </BillSection>
                <BillSection group="paid" bills={groups.paid}>
                  {groups.paid.map(renderRow)}
                </BillSection>
              </>
            )}
          </Col>

          {/* Yearly projection — beside the list on desktop, below it on mobile */}
          <Col xs={12} lg={5} xl={4}>
            <YearlyProjection bills={bills} categoryFor={categoryFor} formatCurrency={formatCurrency} />
          </Col>
        </Row>
      )}

      {/* ── Modals (unchanged) ── */}
      <AddBillModal isOpen={showModal} onClose={() => setShowModal(false)} categories={categories} bill={editBill} onSubmit={handleSubmit} />

      {liveDetailBill && (
        <BillDetailModal
          bill={liveDetailBill}
          categoryLabel={`${categoryFor(liveDetailBill.categoryId)?.icon ?? ""} ${categoryFor(liveDetailBill.categoryId)?.name ?? "—"}`.trim()}
          formatCurrency={formatCurrency}
          isBusy={busy}
          onClose={() => setDetailBill(null)}
          onMarkPaid={(b) => {
            // Hand off to the confirmation step — never stack the two modals.
            setDetailBill(null);
            setPayingBill(b);
          }}
          onUndoPayment={handleUndoPayment}
          onEdit={(b) => {
            setDetailBill(null);
            openEdit(b);
          }}
        />
      )}

      {payingBill && <MarkPaidModal bill={payingBill} isSaving={markPaid.isPending} onClose={() => setPayingBill(null)} onConfirm={handleConfirmPaid} />}

      <Modal isOpen={!!deleteTarget} toggle={() => setDeleteTarget(null)} size="sm">
        <ModalHeader toggle={() => setDeleteTarget(null)}>{t("bills.deleteBill")}</ModalHeader>
        <ModalBody>
          <p className="mb-0" style={{ fontSize: 14 }}>
            {t("bills.deleteConfirm", { name: deleteTarget?.name ?? "" })}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setDeleteTarget(null)} disabled={deleteBill.isPending}>
            {t("common.cancel")}
          </Button>
          <Button color="danger" onClick={confirmDelete} disabled={deleteBill.isPending}>
            {deleteBill.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </ModalFooter>
      </Modal>
    </Container>
  );
}

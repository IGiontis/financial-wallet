import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Col,
  Container,
  Row,
  Spinner,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "reactstrap";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { FiMoreVertical, FiCheck, FiClock } from "react-icons/fi";
import type { Bill, BillWithStatus, CreateBillDTO } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCategories } from "../transactions/hooks/useTransactions";
import { firestoreToDate } from "../../shared/utils/dates";
import { useBills, useCreateBill, useUpdateBill, useDeleteBill, useMarkBillPaid, useUnmarkBillPaid } from "./useBills";
import { getFrequencyLabel } from "./billsUtils";
import { DROPDOWN_MENU_MODIFIERS } from "../../shared/utils/dropdown";
import AddBillModal from "./AddBillModal";

const FREQUENCY_COLOR: Record<BillWithStatus["frequency"], string> = {
  weekly: "info",
  monthly: "primary",
  yearly: "secondary",
};

// ─── Summary cards ──────────────────────────────────────────────────────────

function SummaryCards({ bills, formatCurrency }: { bills: BillWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const active = bills.filter((b) => b.isActive);
  const dueNow = active.filter((b) => !b.isPaidThisPeriod).reduce((s, b) => s + b.amount, 0);
  const paid = active.filter((b) => b.isPaidThisPeriod).reduce((s, b) => s + b.amount, 0);
  const monthly = active.reduce((s, b) => s + b.monthlyEquivalent, 0);

  const cards = [
    { label: t("bills.dueNow"), value: formatCurrency(dueNow), sub: t("bills.unpaidThisPeriod"), accent: "var(--color-expense)", icon: "⏳" },
    { label: t("bills.paidThisPeriod"), value: formatCurrency(paid), sub: t("bills.alreadyCovered"), accent: "var(--color-income)", icon: "✅" },
    { label: t("bills.perMonth"), value: formatCurrency(monthly), sub: t("bills.acrossAllBills"), accent: "var(--bs-primary)", icon: "📅" },
    { label: t("bills.activeBills"), value: String(active.length), sub: active.length === 1 ? t("bills.billTracked") : t("bills.billsTracked"), accent: "var(--color-invest)", icon: "🧾" },
  ];

  return (
    <Row className="g-3 mb-4">
      {cards.map((c) => (
        <Col xs={6} lg={3} key={c.label} className="d-flex">
          <div
            className="w-100 p-3"
            style={{
              borderRadius: "var(--border-radius-lg)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-tertiary)",
              borderTop: `3px solid ${c.accent}`,
            }}
          >
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-uppercase fw-semibold text-body-secondary" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
                {c.label}
              </span>
              <span style={{ fontSize: 14 }}>{c.icon}</span>
            </div>
            <div className="fw-semibold" style={{ fontSize: 20, color: c.accent, lineHeight: 1.2 }}>
              {c.value}
            </div>
            <div className="text-body-secondary" style={{ fontSize: 11 }}>
              {c.sub}
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ─── Bill row ───────────────────────────────────────────────────────────────

function BillRow({
  bill,
  categoryLabel,
  formatCurrency,
  onTogglePaid,
  isToggling,
  onEdit,
  onDelete,
}: {
  bill: BillWithStatus;
  categoryLabel: string;
  formatCurrency: (n: number) => string;
  onTogglePaid: (bill: BillWithStatus) => void;
  isToggling: boolean;
  onEdit: (bill: BillWithStatus) => void;
  onDelete: (bill: BillWithStatus) => void;
}) {
  const { t } = useTranslation();
  const freqLabel = getFrequencyLabel(bill);
  const paid = bill.isPaidThisPeriod;
  const paidDate = bill.payment ? firestoreToDate(bill.payment.paidDate) : undefined;

  return (
    <Card style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", boxShadow: "none" }}>
      <CardBody className="d-flex align-items-center gap-3 py-3">
        {/* Paid toggle */}
        <Button
          color={paid ? "success" : "secondary"}
          outline={!paid}
          size="sm"
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 p-0"
          style={{ width: 40, height: 40 }}
          onClick={() => onTogglePaid(bill)}
          disabled={isToggling}
          title={paid ? t("bills.undoPayment") : t("bills.markAsPaid")}
        >
          <FiCheck size={18} />
        </Button>

        {/* Main */}
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            <span className="fw-semibold text-truncate text-body-emphasis">{bill.name}</span>
            <Badge color={FREQUENCY_COLOR[bill.frequency]} pill className="flex-shrink-0" style={{ fontSize: 10 }}>
              {t(freqLabel.key, { count: freqLabel.count })}
            </Badge>
          </div>
          <div className="text-body-secondary text-truncate" style={{ fontSize: 12 }}>
            {categoryLabel}
            {paid && paidDate ? (
              <span className="text-success">
                {" "}
                · {t("bills.paid")} {format(paidDate, "MMM d")}
              </span>
            ) : bill.nextDueDate ? (
              <span>
                {" "}
                · <FiClock size={11} style={{ verticalAlign: "-1px" }} /> {t("bills.due")} {format(bill.nextDueDate, "MMM d")}
              </span>
            ) : null}
          </div>
        </div>

        {/* Amount */}
        <div className="text-end flex-shrink-0">
          <div className="fw-semibold text-body-emphasis">{formatCurrency(bill.amount)}</div>
          {!bill.isActive && (
            <Badge color="secondary" pill style={{ fontSize: 10 }}>
              {t("common.paused")}
            </Badge>
          )}
        </div>

        {/* Menu */}
        <UncontrolledDropdown>
          <DropdownToggle tag="button" className="btn btn-link text-body-secondary p-1 border-0">
            <FiMoreVertical size={18} />
          </DropdownToggle>
          {/* Anchor to the toggle's right edge and keep the menu inside the
              viewport, so it opens inward instead of off-screen. */}
          <DropdownMenu end modifiers={DROPDOWN_MENU_MODIFIERS}>
            <DropdownItem onClick={() => onEdit(bill)}>{t("common.edit")}</DropdownItem>
            <DropdownItem className="text-danger" onClick={() => onDelete(bill)}>
              {t("common.delete")}
            </DropdownItem>
          </DropdownMenu>
        </UncontrolledDropdown>
      </CardBody>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

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

  const categoryLabel = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, `${c.icon ?? ""} ${c.name}`.trim()]));
    return (id: string) => map.get(id) ?? "Uncategorized";
  }, [categories]);

  const handleTogglePaid = (bill: BillWithStatus) => {
    if (bill.isPaidThisPeriod && bill.payment) {
      unmarkPaid.mutate({ paymentId: bill.payment.id, transactionId: bill.payment.transactionId });
    } else {
      markPaid.mutate({ bill, paidDate: new Date() });
    }
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

  const toggling = markPaid.isPending || unmarkPaid.isPending;

  return (
    <Container fluid className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 gap-2">
        <div style={{ minWidth: 0 }}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("bills.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("bills.subtitle")}</p>
        </div>
        <Button color="primary" onClick={openNew} className="flex-shrink-0">
          <span className="d-none d-sm-inline">+ {t("bills.newBill")}</span>
          <span className="d-sm-none">+ {t("bills.new")}</span>
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner color="primary" />
        </div>
      )}
      {isError && <Alert color="danger">{t("common.failedToLoad")}</Alert>}

      {!isLoading && !isError && (
        <>
          <SummaryCards bills={bills} formatCurrency={formatCurrency} />

          {bills.length === 0 ? (
            <div className="text-center text-body-secondary" style={{ padding: "4rem 0" }}>
              <p style={{ fontSize: 40 }}>🧾</p>
              <p className="fw-medium mb-1">{t("bills.noBillsYet")}</p>
              <p className="small mb-3">{t("bills.noBillsHint")}</p>
              <Button color="primary" onClick={openNew}>
                + {t("bills.newBill")}
              </Button>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {bills.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  categoryLabel={categoryLabel(bill.categoryId)}
                  formatCurrency={formatCurrency}
                  onTogglePaid={handleTogglePaid}
                  isToggling={toggling}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AddBillModal isOpen={showModal} onClose={() => setShowModal(false)} categories={categories} bill={editBill} onSubmit={handleSubmit} />

      {/* Delete confirmation */}
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

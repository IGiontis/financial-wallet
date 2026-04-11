import { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { Transaction, UpdateTransactionDTO, Category } from "../../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { format } from "date-fns";

interface EditTransactionFormValues {
  amount: number | "";
  type: "income" | "expense";
  categoryId: string;
  date: string;
  description: string;
  notes: string;
}

const toDateInputValue = (value: any): string => {
  if (!value) return "";
  const d = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return d.toISOString().split("T")[0];
};

const validationSchema = Yup.object({
  amount: Yup.number().typeError("Amount must be a number").required("Amount is required").positive("Must be greater than 0").max(10_000_000, "Amount is too large"),
  type: Yup.mixed<"income" | "expense">().oneOf(["income", "expense"]).required("Type is required"),
  categoryId: Yup.string().required("Category is required"),
  date: Yup.string().required("Date is required"),
  description: Yup.string().required("Payee is required").max(30, "Max 30 characters"),
  notes: Yup.string().max(300, "Max 300 characters"),
});

interface EditTransactionModalProps {
  transaction: Transaction;
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (transactionId: string, data: UpdateTransactionDTO) => Promise<void>;
}

function ReviewScreen({
  values,
  categories,
  onBack,
  onConfirm,
  isSubmitting,
  formatAmount,
}: {
  values: EditTransactionFormValues;
  categories: Category[];
  onBack: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  formatAmount: (n: number) => string;
}) {
  const category = categories.find((c) => c.id === values.categoryId);
  const isIncome = values.type === "income";
  const rows = [
    { label: "Type", value: isIncome ? "Income" : "Expense" },
    { label: "Amount", value: formatAmount(Number(values.amount)) },
    { label: "Date", value: format(new Date(values.date), "dd/MM/yyyy") },
    { label: "Payee", value: values.description },
    { label: "Category", value: `${category?.icon ?? ""} ${category?.name ?? "—"}` },
    ...(values.notes ? [{ label: "Notes", value: values.notes }] : []),
  ];
  return (
    <>
      <ModalBody>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Please review your changes before saving.</p>
        <div style={{ border: `2px solid ${isIncome ? "#10B981" : "#EF4444"}`, borderRadius: "var(--border-radius-lg)", padding: "1rem" }}>
          <div className="d-flex align-items-center gap-3 mb-3">
            <span style={{ fontSize: 28 }}>{category?.icon ?? "💳"}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>{values.description}</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{category?.name ?? "—"}</p>
            </div>
            <p style={{ fontWeight: 700, fontSize: 18, margin: 0, color: isIncome ? "#10B981" : "#EF4444" }}>
              {isIncome ? "+" : "−"}
              {formatAmount(Number(values.amount))}
            </p>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="d-flex justify-content-between" style={{ padding: "6px 0", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>{r.label}</span>
              <span style={{ fontWeight: 500 }}>{r.value}</span>
            </div>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button color="primary" onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Confirm & save"}
        </Button>
      </ModalFooter>
    </>
  );
}

export default function EditTransactionModal({ transaction, isOpen, onClose, categories, onSubmit }: EditTransactionModalProps) {
  const [step, setStep] = useState<"form" | "review">("form");
  const { convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  const displayAmount = baseCurrency === displayCurrency ? transaction.amount : Math.round(convert(transaction.amount) * 100) / 100;

  // Only income/expense transactions can be edited — investment type is read-only
  const editableType = (transaction.type === "investment" ? "expense" : transaction.type) as "income" | "expense";

  const formik = useFormik<EditTransactionFormValues>({
    enableReinitialize: true,
    initialValues: {
      amount: displayAmount,
      type: editableType,
      categoryId: transaction.categoryId,
      date: toDateInputValue(transaction.date),
      description: transaction.description,
      notes: transaction.notes ?? "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const amountInBase = baseCurrency === displayCurrency ? (values.amount as number) : convertToBase(values.amount as number);
        const data: UpdateTransactionDTO = {
          amount: amountInBase,
          type: values.type,
          categoryId: values.categoryId,
          date: new Date(values.date),
          description: values.description,
          notes: values.notes || undefined,
        };
        await onSubmit(transaction.id, data);
        toast.success(`Transaction "${values.description}" updated!`);
        resetForm();
        setStep("form");
        onClose();
      } catch (err) {
        toast.error("Failed to update transaction. Please try again.");
        console.error("EditTransactionModal submit error:", err);
      }
    },
  });

  const handleClose = () => {
    formik.resetForm();
    setStep("form");
    onClose();
  };
  const handleReview = async () => {
    const errors = await formik.validateForm();
    if (Object.keys(errors).length === 0) setStep("review");
    else formik.setTouched(Object.keys(formik.values).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
  };

  // Only income/expense categories — never investment
  const filteredCategories = categories.filter((c) => c.type === formik.values.type);
  const formatAmount = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: displayCurrency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="md">
      <ModalHeader toggle={handleClose}>{step === "form" ? "Edit transaction" : "Review changes"}</ModalHeader>

      {step === "review" ? (
        <ReviewScreen
          values={formik.values}
          categories={categories}
          onBack={() => setStep("form")}
          onConfirm={() => formik.submitForm()}
          isSubmitting={formik.isSubmitting}
          formatAmount={formatAmount}
        />
      ) : (
        <>
          <ModalBody>
            <form id="edit-transaction-form" onSubmit={formik.handleSubmit} noValidate>
              {/* ── Type toggle ── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Type *</Label>
                <Row className="g-2">
                  {(["expense", "income"] as ("income" | "expense")[]).map((t) => {
                    const isSelected = formik.values.type === t;
                    const color = t === "income" ? "#10B981" : "#EF4444";
                    const bg = t === "income" ? "#f0fdf4" : "#fff5f5";
                    return (
                      <Col xs={6} key={t}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            formik.setFieldValue("type", t);
                            formik.setFieldValue("categoryId", "");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              formik.setFieldValue("type", t);
                              formik.setFieldValue("categoryId", "");
                            }
                          }}
                          style={{
                            border: `2px solid ${isSelected ? color : "var(--color-border-tertiary)"}`,
                            borderRadius: "var(--border-radius-md)",
                            padding: "10px 12px",
                            cursor: "pointer",
                            background: isSelected ? bg : "var(--color-background-secondary)",
                            textAlign: "center",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: isSelected ? color : "inherit" }}>{t === "income" ? "Income" : "Expense"}</p>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </FormGroup>

              {/* ── Row 1: Amount + Date ── */}
              <Row className="g-3">
                <Col xs={6}>
                  <FormGroup className="mb-0">
                    <Label style={{ fontSize: 13, fontWeight: 500 }}>Amount ({displayCurrency}) *</Label>
                    <Input
                      type="number"
                      name="amount"
                      min={0.01}
                      step={0.01}
                      placeholder="0.00"
                      value={formik.values.amount}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.amount && formik.errors.amount)}
                    />
                    <FormFeedback>{formik.errors.amount}</FormFeedback>
                  </FormGroup>
                </Col>
                <Col xs={6}>
                  <FormGroup className="mb-0">
                    <Label style={{ fontSize: 13, fontWeight: 500 }}>Date *</Label>
                    <Input
                      type="date"
                      name="date"
                      value={formik.values.date}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.date && formik.errors.date)}
                    />
                    <FormFeedback>{formik.errors.date}</FormFeedback>
                  </FormGroup>
                </Col>
              </Row>

              {/* ── Row 2: Payee + Category ── */}
              <Row className="g-3 mt-1">
                <Col xs={6}>
                  <FormGroup className="mb-0">
                    <Label style={{ fontSize: 13, fontWeight: 500 }}>Payee *</Label>
                    <Input
                      type="text"
                      name="description"
                      placeholder='e.g. "Amazon"'
                      value={formik.values.description}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.description && formik.errors.description)}
                    />
                    <FormFeedback>{formik.errors.description}</FormFeedback>
                  </FormGroup>
                </Col>
                <Col xs={6}>
                  <FormGroup className="mb-0">
                    <Label style={{ fontSize: 13, fontWeight: 500 }}>Category *</Label>
                    <Input
                      type="select"
                      name="categoryId"
                      value={formik.values.categoryId}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.categoryId && formik.errors.categoryId)}
                    >
                      <option value="">Select...</option>
                      {filteredCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                    </Input>
                    <FormFeedback>{formik.errors.categoryId}</FormFeedback>
                  </FormGroup>
                </Col>
              </Row>

              {/* ── Notes ── */}
              <FormGroup className="mb-0 mt-3">
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Notes</Label>
                <Input
                  type="textarea"
                  name="notes"
                  rows={3}
                  placeholder="Optional note..."
                  value={formik.values.notes}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.notes && formik.errors.notes)}
                />
                <FormFeedback>{formik.errors.notes}</FormFeedback>
                <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 300</FormText>
              </FormGroup>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" outline onClick={handleClose}>
              Cancel
            </Button>
            <Button color="primary" disabled={!formik.dirty} onClick={handleReview}>
              Review changes
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

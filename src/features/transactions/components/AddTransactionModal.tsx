import { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { CreateTransactionDTO, TransactionType, Category } from "../../../shared/types/IndexTypes";

// ─── Internal form values ─────────────────────────────────────────────────────

interface TransactionFormValues {
  amount: number | "";
  type: TransactionType;
  categoryId: string;
  date: string;
  description: string;
  notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const today = new Date().toISOString().split("T")[0];

// ─── Validation ───────────────────────────────────────────────────────────────

const validationSchema = Yup.object({
  amount: Yup.number().typeError("Amount must be a number").required("Amount is required").positive("Amount must be greater than 0").max(10_000_000, "Amount is too large"),
  type: Yup.mixed<TransactionType>().oneOf(["income", "expense"]).required("Type is required"),
  categoryId: Yup.string().required("Category is required"),
  date: Yup.string().required("Date is required"),
  description: Yup.string().required("Description is required").max(100, "Max 100 characters"),
  notes: Yup.string().max(300, "Max 300 characters"),
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (data: CreateTransactionDTO) => Promise<void>;
}

// ─── Review screen ────────────────────────────────────────────────────────────

function ReviewScreen({
  values,
  categories,
  onBack,
  onConfirm,
  isSubmitting,
}: {
  values: TransactionFormValues;
  categories: Category[];
  onBack: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  const category = categories.find((c) => c.id === values.categoryId);
  const isIncome = values.type === "income";

  const rows = [
    { label: "Type", value: isIncome ? "Income" : "Expense" },
    { label: "Amount", value: formatCurrency(Number(values.amount)) },
    { label: "Date", value: values.date },
    { label: "Description", value: values.description },
    { label: "Category", value: `${category?.icon ?? ""} ${category?.name ?? "—"}` },
    ...(values.notes ? [{ label: "Notes", value: values.notes }] : []),
  ];

  return (
    <>
      <ModalBody>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Please review your transaction before saving.</p>

        <div
          style={{
            border: `2px solid ${isIncome ? "#10B981" : "#EF4444"}`,
            borderRadius: "var(--border-radius-lg)",
            padding: "1rem",
          }}
        >
          <div className="d-flex align-items-center gap-3 mb-3">
            <span style={{ fontSize: 28 }}>{category?.icon ?? "💳"}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>{values.description}</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{category?.name ?? "—"}</p>
            </div>
            <p
              style={{
                fontWeight: 700,
                fontSize: 18,
                margin: 0,
                color: isIncome ? "#10B981" : "#EF4444",
              }}
            >
              {isIncome ? "+" : "−"}
              {formatCurrency(Number(values.amount))}
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddTransactionModal({ isOpen, onClose, categories, onSubmit }: AddTransactionModalProps) {
  const [step, setStep] = useState<"form" | "review">("form");

  const formik = useFormik<TransactionFormValues>({
    enableReinitialize: true,
    initialValues: {
      amount: "",
      type: "expense",
      categoryId: "",
      date: today,
      description: "",
      notes: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const dto: CreateTransactionDTO = {
          amount: values.amount as number,
          type: values.type,
          categoryId: values.categoryId,
          date: new Date(values.date),
          description: values.description,
          notes: values.notes || undefined,
        };
        await onSubmit(dto);
        toast.success(`Transaction "${values.description}" added!`);
        resetForm();
        setStep("form");
        onClose();
      } catch (err) {
        toast.error("Failed to save transaction. Please try again.");
        console.error("AddTransactionModal submit error:", err);
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
    if (Object.keys(errors).length === 0) {
      setStep("review");
    } else {
      formik.setTouched(Object.keys(formik.values).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
    }
  };

  // Filter categories by selected type
  const filteredCategories = categories.filter((c) => c.type === formik.values.type);

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="md">
      <ModalHeader toggle={handleClose}>{step === "form" ? "Add transaction" : "Review transaction"}</ModalHeader>

      {step === "review" ? (
        <ReviewScreen values={formik.values} categories={categories} onBack={() => setStep("form")} onConfirm={() => formik.submitForm()} isSubmitting={formik.isSubmitting} />
      ) : (
        <>
          <ModalBody>
            <form id="add-transaction-form" onSubmit={formik.handleSubmit} noValidate>
              {/* ── Type toggle ───────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Type *</Label>
                <Row className="g-2">
                  {(["expense", "income"] as TransactionType[]).map((t) => {
                    const isSelected = formik.values.type === t;
                    const color = t === "income" ? "#10B981" : "#EF4444";
                    return (
                      <Col xs={6} key={t}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            formik.setFieldValue("type", t);
                            formik.setFieldValue("categoryId", ""); // reset category on type change
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
                            background: isSelected ? (t === "income" ? "#f0fdf4" : "#fff5f5") : "var(--color-background-secondary)",
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

              {/* ── Amount ───────────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Amount (USD) *</Label>
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

              {/* ── Description ──────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Description *</Label>
                <Input
                  type="text"
                  name="description"
                  placeholder='e.g. "Amazon", "Salary"'
                  value={formik.values.description}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.description && formik.errors.description)}
                />
                <FormFeedback>{formik.errors.description}</FormFeedback>
              </FormGroup>

              {/* ── Category ─────────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Category *</Label>
                <Input
                  type="select"
                  name="categoryId"
                  value={formik.values.categoryId}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.categoryId && formik.errors.categoryId)}
                >
                  <option value="">Select a category...</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </Input>
                <FormFeedback>{formik.errors.categoryId}</FormFeedback>
              </FormGroup>

              {/* ── Date ─────────────────────────────────────────────── */}
              <FormGroup>
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

              {/* ── Notes ────────────────────────────────────────────── */}
              <FormGroup className="mb-0">
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Notes</Label>
                <Input
                  type="textarea"
                  name="notes"
                  rows={2}
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
              Review transaction
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

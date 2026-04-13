import { useState, useEffect } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { Transaction, UpdateTransactionDTO, Category, FuelMetadata, FuelType } from "../../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { format } from "date-fns";
import { FuelDetailsPanel, getUnitLabel } from "../../categories/FuelDetailsPanel";

// ─── Form shape ──────────────────────────────────────────────────────────────

interface EditTransactionFormValues {
  amount: number | "";
  type: "income" | "expense";
  categoryId: string;
  date: string;
  description: string;
  notes: string;
  showFuelDetails: boolean;
  fuelType: FuelType | "";
  pricePerUnit: number | "";
  quantity: number | "";
  odometer: number | "";
  place: string;
}

const toDateInputValue = (value: any): string => {
  if (!value) return "";
  const d = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return d.toISOString().split("T")[0];
};

// ─── Validation ──────────────────────────────────────────────────────────────

const validationSchema = Yup.object({
  amount: Yup.number().typeError("Amount must be a number").required("Amount is required").positive("Must be greater than 0").max(10_000_000, "Amount is too large"),
  type: Yup.mixed<"income" | "expense">().oneOf(["income", "expense"]).required(),
  categoryId: Yup.string().required("Category is required"),
  date: Yup.string().required("Date is required"),
  description: Yup.string().required("Payee is required").max(30, "Max 30 characters"),
  notes: Yup.string().max(300, "Max 300 characters"),
  showFuelDetails: Yup.boolean(),
  fuelType: Yup.string().when("showFuelDetails", {
    is: true,
    then: (s) => s.required("Fuel type is required"),
    otherwise: (s) => s.optional(),
  }),
  pricePerUnit: Yup.number().when("showFuelDetails", {
    is: true,
    then: (s) => s.typeError("Must be a number").required("Price is required").positive("Must be > 0"),
    otherwise: (s) => s.optional(),
  }),
  quantity: Yup.number().when("showFuelDetails", {
    is: true,
    then: (s) => s.typeError("Must be a number").required("Quantity is required").positive("Must be > 0"),
    otherwise: (s) => s.optional(),
  }),
  odometer: Yup.number().typeError("Must be a number").min(0, "Must be positive").optional(),
  place: Yup.string().max(100, "Max 100 characters").optional(),
});

// ─── Review screen ───────────────────────────────────────────────────────────

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
  const unit = getUnitLabel(values.fuelType);

  const baseRows = [
    { label: "Type", value: isIncome ? "Income" : "Expense" },
    { label: "Amount", value: formatAmount(Number(values.amount)) },
    { label: "Date", value: format(new Date(values.date), "dd/MM/yyyy") },
    { label: "Payee", value: values.description },
    { label: "Category", value: `${category?.icon ?? ""} ${category?.name ?? "—"}` },
    ...(values.notes ? [{ label: "Notes", value: values.notes }] : []),
  ];

  const fuelRows = values.showFuelDetails
    ? [
        {
          label: "Fuel type",
          value: values.fuelType ? values.fuelType.charAt(0).toUpperCase() + values.fuelType.slice(1) : "—",
        },
        {
          label: "Price / unit",
          value: values.pricePerUnit !== "" ? `${values.pricePerUnit} / ${unit}` : "—",
        },
        {
          label: "Quantity",
          value: values.quantity !== "" ? `${values.quantity} ${unit}` : "—",
        },
        ...(values.odometer !== "" ? [{ label: "Odometer", value: `${values.odometer} km` }] : []),
        ...(values.place ? [{ label: "Place", value: values.place }] : []),
      ]
    : [];

  const rows = [...baseRows, ...fuelRows];

  return (
    <>
      <ModalBody>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Please review your changes before saving.</p>
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

// ─── Props ───────────────────────────────────────────────────────────────────

interface EditTransactionModalProps {
  transaction: Transaction;
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (transactionId: string, data: UpdateTransactionDTO) => Promise<void>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EditTransactionModal({ transaction, isOpen, onClose, categories, onSubmit }: EditTransactionModalProps) {
  const [step, setStep] = useState<"form" | "review">("form");
  const { convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  const initialIsFuelCategory = categories.find((c) => c.id === transaction.categoryId)?.name === "Fuel";
  const [isFuelCategory, setIsFuelCategory] = useState(initialIsFuelCategory);

  const displayAmount = baseCurrency === displayCurrency ? transaction.amount : Math.round(convert(transaction.amount) * 100) / 100;

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
      showFuelDetails: initialIsFuelCategory && !!transaction.metadata,
      fuelType: transaction.metadata?.fuelType ?? "",
      pricePerUnit: transaction.metadata?.pricePerUnit ?? "",
      quantity: transaction.metadata?.quantity ?? "",
      odometer: transaction.metadata?.odometer ?? "",
      place: transaction.metadata?.place ?? "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const amountInBase = baseCurrency === displayCurrency ? (values.amount as number) : convertToBase(values.amount as number);

        const metadata: FuelMetadata | undefined = values.showFuelDetails
          ? {
              fuelType: values.fuelType as FuelType,
              pricePerUnit: Number(values.pricePerUnit),
              quantity: Number(values.quantity),
              totalCost: amountInBase,
              ...(values.odometer !== "" ? { odometer: Number(values.odometer) } : {}),
              ...(values.place ? { place: values.place } : {}),
            }
          : undefined;

        const data: UpdateTransactionDTO = {
          amount: amountInBase,
          type: values.type,
          categoryId: values.categoryId,
          date: new Date(values.date),
          description: values.description,
          notes: values.notes || undefined,
          metadata,
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

  // Auto-calculate amount from pricePerUnit x quantity when fuel details are shown
  useEffect(() => {
    if (formik.values.showFuelDetails && formik.values.pricePerUnit !== "" && formik.values.quantity !== "") {
      const total = Math.round(Number(formik.values.pricePerUnit) * Number(formik.values.quantity) * 100) / 100;
      formik.setFieldValue("amount", total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.pricePerUnit, formik.values.quantity, formik.values.showFuelDetails]);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const catId = e.target.value;
    const isF = categories.find((c) => c.id === catId)?.name === "Fuel";
    formik.setFieldValue("categoryId", catId);
    setIsFuelCategory(isF);
    if (!isF) {
      formik.setFieldValue("showFuelDetails", false);
      formik.setFieldValue("fuelType", "");
      formik.setFieldValue("pricePerUnit", "");
      formik.setFieldValue("quantity", "");
      formik.setFieldValue("odometer", "");
      formik.setFieldValue("place", "");
    }
  };

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
      formik.setTouched(Object.keys(formik.values).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
    }
  };

  const filteredCategories = categories.filter((c) => c.type === formik.values.type);
  const formatAmount = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);

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
              {/* ── Type toggle — READ ONLY in edit ── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Type</Label>
                <Row className="g-2">
                  {(["expense", "income"] as ("income" | "expense")[]).map((t) => {
                    const isSelected = formik.values.type === t;
                    const color = t === "income" ? "#10B981" : "#EF4444";
                    const bg = t === "income" ? "#f0fdf4" : "#fff5f5";
                    return (
                      <Col xs={6} key={t}>
                        <div
                          style={{
                            border: `2px solid ${isSelected ? color : "var(--color-border-tertiary)"}`,
                            borderRadius: "var(--border-radius-md)",
                            padding: "10px 12px",
                            cursor: "not-allowed",
                            background: isSelected ? bg : "var(--color-background-secondary)",
                            textAlign: "center",
                            opacity: isSelected ? 1 : 0.3,
                            userSelect: "none",
                          }}
                        >
                          <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: isSelected ? color : "inherit" }}>{t === "income" ? "Income" : "Expense"}</p>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 5, marginBottom: 0 }}>Type cannot be changed. Delete and re-create to change it.</p>
              </FormGroup>

              {/* ── Amount + Date ── */}
              <Row className="g-3">
                <Col xs={6}>
                  <FormGroup className="mb-0">
                    <Label style={{ fontSize: 13, fontWeight: 500 }}>
                      Amount ({displayCurrency}) *{formik.values.showFuelDetails && <span style={{ fontSize: 11, color: "#3B82F6", marginLeft: 6 }}>auto-calculated</span>}
                    </Label>
                    <Input
                      type="number"
                      name="amount"
                      min={0.01}
                      step={0.01}
                      placeholder="0.00"
                      value={formik.values.amount}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      readOnly={formik.values.showFuelDetails}
                      style={formik.values.showFuelDetails ? { background: "#f1f5f9", cursor: "not-allowed" } : {}}
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

              {/* ── Payee + Category ── */}
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
                      onChange={handleCategoryChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.categoryId && formik.errors.categoryId)}
                    >
                      <option value="">Select...</option>
                      {[...filteredCategories]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                    </Input>
                    <FormFeedback>{formik.errors.categoryId}</FormFeedback>
                  </FormGroup>
                </Col>
              </Row>

              {/* ── Fuel toggle row ── */}
              {isFuelCategory && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    background: "#f8faff",
                    borderRadius: 10,
                    border: "1.5px solid #dbeafe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  onClick={() => {
                    const next = !formik.values.showFuelDetails;
                    formik.setFieldValue("showFuelDetails", next);
                    if (!next) {
                      formik.setFieldValue("fuelType", "");
                      formik.setFieldValue("pricePerUnit", "");
                      formik.setFieldValue("quantity", "");
                      formik.setFieldValue("odometer", "");
                      formik.setFieldValue("place", "");
                      formik.setFieldValue("amount", "");
                    }
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#3B82F6", margin: 0 }}>⛽ Fuel details</p>
                    <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
                      {formik.values.showFuelDetails ? "Liters, price/L, odometer, place — amount auto-calculated" : "Tap to add liters, price/L, odometer..."}
                    </p>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 22,
                      borderRadius: 11,
                      background: formik.values.showFuelDetails ? "#3B82F6" : "#CBD5E1",
                      position: "relative",
                      flexShrink: 0,
                      transition: "background 0.2s",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 3,
                        left: formik.values.showFuelDetails ? 21 : 3,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ── Full fuel details panel ── */}
              {isFuelCategory && formik.values.showFuelDetails && (
                <FuelDetailsPanel
                  fuelType={formik.values.fuelType}
                  pricePerUnit={formik.values.pricePerUnit}
                  quantity={formik.values.quantity}
                  odometer={formik.values.odometer}
                  place={formik.values.place}
                  errors={{
                    fuelType: formik.errors.fuelType,
                    pricePerUnit: formik.errors.pricePerUnit as string | undefined,
                    quantity: formik.errors.quantity as string | undefined,
                    odometer: formik.errors.odometer as string | undefined,
                    place: formik.errors.place,
                  }}
                  touched={{
                    fuelType: formik.touched.fuelType,
                    pricePerUnit: formik.touched.pricePerUnit,
                    quantity: formik.touched.quantity,
                    odometer: formik.touched.odometer,
                    place: formik.touched.place,
                  }}
                  setFieldValue={formik.setFieldValue}
                  setFieldTouched={formik.setFieldTouched}
                  displayCurrency={displayCurrency}
                />
              )}

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

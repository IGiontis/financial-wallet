import { useState, useEffect } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { CreateTransactionDTO, Category, FuelMetadata, FuelType } from "../../../shared/types/IndexTypes";
import { format } from "date-fns";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { FuelDetailsPanel, getUnitLabel } from "../../categories/FuelDetailsPanel";

// ─── Form shape ───────────────────────────────────────────────────────────────

interface TransactionFormValues {
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

const today = new Date().toISOString().split("T")[0];

// ─── Validation ───────────────────────────────────────────────────────────────

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
  place: Yup.string().max(20, "Max 20 characters").optional(),
});

// ─── Colors ───────────────────────────────────────────────────────────────────

const EXPENSE_COLORS = {
  cardBorder: "#EF4444",
  heroBg: "#FFF5F5",
  heroBorder: "#FED7D7",
  iconBg: "#FEE2E2",
  nameTxt: "#7F1D1D",
  subTxt: "#B91C1C",
  badgeBg: "#FEE2E2",
  badgeTxt: "#991B1B",
  amtTxt: "#B91C1C",
  sign: "−",
};

const INCOME_COLORS = {
  cardBorder: "#10B981",
  heroBg: "#F0FDF4",
  heroBorder: "#BBF7D0",
  iconBg: "#DCFCE7",
  nameTxt: "#14532D",
  subTxt: "#15803D",
  badgeBg: "#DCFCE7",
  badgeTxt: "#166534",
  amtTxt: "#15803D",
  sign: "+",
};

// ─── Small box cell ───────────────────────────────────────────────────────────
// Visible solid border so boxes always show regardless of theme CSS variables.

function GridCell({ label, value, fullWidth = false, accent }: { label: string; value: string; fullWidth?: boolean; accent?: string }) {
  return (
    <div
      style={{
        gridColumn: fullWidth ? "1 / -1" : undefined,
        border: "1.5px solid #e2e8f0",
        borderRadius: 8,
        padding: "8px 10px",
        background: "#fff",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "#4a4f57",
          margin: "0 0 3px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: accent ?? "#1e293b",
          margin: 0,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: "#94a3b8",
        margin: "12px 0 6px",
      }}
    >
      {label}
    </p>
  );
}

// ─── ReviewScreen ─────────────────────────────────────────────────────────────

function ReviewScreen({
  values,
  categories,
  onBack,
  onConfirm,
  isSubmitting,
  formatAmount,
}: {
  values: TransactionFormValues;
  categories: Category[];
  onBack: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  formatAmount: (n: number) => string;
}) {
  const category = categories.find((c) => c.id === values.categoryId);
  const isIncome = values.type === "income";
  const colors = isIncome ? INCOME_COLORS : EXPENSE_COLORS;
  const unit = getUnitLabel(values.fuelType);

  const hasFuel = values.showFuelDetails && values.fuelType && values.pricePerUnit !== "" && values.quantity !== "";

  const fuelCells: { label: string; value: string }[] = hasFuel
    ? [
        {
          label: "Fuel type",
          value: values.fuelType ? values.fuelType.charAt(0).toUpperCase() + values.fuelType.slice(1) : "—",
        },
        {
          label: `Price / ${unit}`,
          value: values.pricePerUnit !== "" ? `€${values.pricePerUnit}` : "—",
        },
        {
          label: "Quantity",
          value: values.quantity !== "" ? `${values.quantity} ${unit}` : "—",
        },
        ...(values.odometer !== "" ? [{ label: "Odometer", value: `${values.odometer} km` }] : []),
        ...(values.place ? [{ label: "Place", value: values.place }] : []),
      ]
    : [];

  return (
    <>
      <ModalBody>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: "1rem" }}>Please review your transaction before saving.</p>

        {/* Hero — colored top border card */}
        <div
          style={{
            border: `2px solid ${colors.cardBorder}`,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: colors.heroBg,
              borderBottom: `1px solid ${colors.heroBorder}`,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: colors.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              {category?.icon ?? "💳"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  margin: 0,
                  color: colors.nameTxt,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {values.description}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 12, color: colors.subTxt }}>
                  {category?.icon} {category?.name ?? "—"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 7px",
                    borderRadius: 20,
                    background: colors.badgeBg,
                    color: colors.badgeTxt,
                  }}
                >
                  {isIncome ? "Income" : "Expense"}
                </span>
              </div>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: colors.amtTxt, flexShrink: 0 }}>
              {colors.sign}
              {formatAmount(Number(values.amount))}
            </p>
          </div>
        </div>

        {/* Base fields — small boxes */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <GridCell label="Date" value={format(new Date(values.date), "dd/MM/yyyy")} />
          <GridCell label="Category" value={`${category?.icon ?? ""} ${category?.name ?? "—"}`} />
          <GridCell label="Amount" value={formatAmount(Number(values.amount))} accent={colors.amtTxt} />
          <GridCell label="Type" value={isIncome ? "Income" : "Expense"} accent={colors.amtTxt} />
          {values.notes && <GridCell label="Notes" value={values.notes} fullWidth />}
        </div>

        {/* Fuel details — small boxes */}
        {hasFuel && fuelCells.length > 0 && (
          <>
            <SectionHead label="Fuel details" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {fuelCells.map((cell) => (
                <GridCell key={cell.label} label={cell.label} value={cell.value} />
              ))}
            </div>
          </>
        )}
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (data: CreateTransactionDTO) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddTransactionModal({ isOpen, onClose, categories, onSubmit }: AddTransactionModalProps) {
  const [step, setStep] = useState<"form" | "review">("form");
  const [isFuelCategory, setIsFuelCategory] = useState(false);
  const { convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  const formik = useFormik<TransactionFormValues>({
    enableReinitialize: true,
    initialValues: {
      amount: "",
      type: "expense",
      categoryId: "",
      date: today,
      description: "",
      notes: "",
      showFuelDetails: false,
      fuelType: "",
      pricePerUnit: "",
      quantity: "",
      odometer: "",
      place: "",
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

        const dto: CreateTransactionDTO = {
          amount: amountInBase,
          type: values.type,
          categoryId: values.categoryId,
          date: new Date(values.date),
          description: values.description,
          notes: values.notes || undefined,
          metadata,
        };

        await onSubmit(dto);
        toast.success(`Transaction "${values.description}" added!`);
        resetForm();
        setStep("form");
        setIsFuelCategory(false);
        onClose();
      } catch {
        toast.error("Failed to save transaction. Please try again.");
      }
    },
  });

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
    setIsFuelCategory(false);
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
      <ModalHeader toggle={handleClose}>{step === "form" ? "Add transaction" : "Review transaction"}</ModalHeader>

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
            <form id="add-transaction-form" onSubmit={formik.handleSubmit} noValidate>
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
                            formik.setFieldValue("showFuelDetails", false);
                            formik.setFieldValue("fuelType", "");
                            formik.setFieldValue("pricePerUnit", "");
                            formik.setFieldValue("quantity", "");
                            formik.setFieldValue("odometer", "");
                            formik.setFieldValue("place", "");
                            setIsFuelCategory(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              formik.setFieldValue("type", t);
                              formik.setFieldValue("categoryId", "");
                              formik.setFieldValue("showFuelDetails", false);
                              setIsFuelCategory(false);
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

              {/* ── Amount + Date ── */}
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

              {/* ── Fuel toggle ── */}
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
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#3B82F6", margin: 0 }}>⛽ Add fuel details</p>
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

              {/* ── Fuel details panel ── */}
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
              Review transaction
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

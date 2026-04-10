import { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { InvestmentGoalWithStats, UpdateInvestmentGoalDTO, InvestmentGoalType, TargetPeriod } from "../../shared/types/IndexTypes";
import { format } from "date-fns";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_ICONS = ["💰", "🚗", "🏠", "✈️", "🎓", "💻", "🛡️", "🏖️", "🏋️", "💍", "🎸", "📱", "🌍", "🚀", "🐾", "🎉"];
const PRESET_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

// ─── Internal form values ─────────────────────────────────────────────────────

interface EditGoalFormValues {
  name: string;
  icon: string;
  color: string;
  notes: string;
  goalType: InvestmentGoalType;
  targetAmount: number | "";
  targetPeriod: TargetPeriod;
  deadline: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

const toDateInputValue = (value: any): string => {
  if (!value) return "";
  const d = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return d.toISOString().split("T")[0];
};

// ─── Validation ───────────────────────────────────────────────────────────────

const validationSchema = Yup.object({
  name: Yup.string().required("Goal name is required").max(60, "Max 60 characters"),
  icon: Yup.string().max(4, "Keep it short (1–2 chars)"),
  color: Yup.string(),
  goalType: Yup.mixed<InvestmentGoalType>().oneOf(["targeted", "open_ended"]).required(),
  targetAmount: Yup.number()
    .typeError("Target amount must be a number")
    .when("goalType", {
      is: "targeted",
      then: (schema) => schema.required("Target amount is required").positive("Must be greater than 0").max(10_000_000, "Amount is too large"),
      otherwise: (schema) => schema.optional().nullable(),
    }),
  targetPeriod: Yup.mixed<TargetPeriod>()
    .oneOf(["monthly", "yearly", "custom"])
    .when("goalType", {
      is: "targeted",
      then: (schema) => schema.required("Select a period"),
      otherwise: (schema) => schema.optional().nullable(),
    }),
  deadline: Yup.string().when("targetPeriod", {
    is: "custom",
    then: (schema) => schema.required("Deadline is required for a custom period"),
    otherwise: (schema) => schema.optional(),
  }),
  notes: Yup.string().max(300, "Max 300 characters"),
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditGoalModalProps {
  goal: InvestmentGoalWithStats;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (goalId: string, data: UpdateInvestmentGoalDTO) => Promise<void>;
}

// ─── Review screen ────────────────────────────────────────────────────────────

function ReviewScreen({ values, onBack, onConfirm, isSubmitting }: { values: EditGoalFormValues; onBack: () => void; onConfirm: () => void; isSubmitting: boolean }) {
  const isTargeted = values.goalType === "targeted";

  const rows = [
    { label: "Type", value: isTargeted ? "Targeted goal" : "Open-ended" },
    ...(isTargeted && values.targetAmount ? [{ label: "Target", value: formatCurrency(Number(values.targetAmount)) }] : []),
    ...(isTargeted ? [{ label: "Period", value: values.targetPeriod }] : []),
    ...(values.deadline ? [{ label: "Deadline", value: format(new Date(values.deadline), "dd/MM/yyyy") }] : []),
    ...(values.notes ? [{ label: "Notes", value: values.notes }] : []),
  ];

  return (
    <>
      <ModalBody>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Please review your changes before saving.</p>

        {/* Goal preview card */}
        <div
          style={{
            border: `2px solid ${values.color || "#3B82F6"}`,
            borderRadius: "var(--border-radius-lg)",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div className="d-flex align-items-center gap-3 mb-3">
            <span style={{ fontSize: 32 }}>{values.icon || "💰"}</span>
            <div>
              <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>{values.name}</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{isTargeted ? "Targeted goal" : "Open-ended goal"}</p>
            </div>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: values.color || "#3B82F6",
                marginLeft: "auto",
                flexShrink: 0,
              }}
            />
          </div>

          {rows.map((r) => (
            <div
              key={r.label}
              className="d-flex justify-content-between"
              style={{
                padding: "6px 0",
                borderTop: "0.5px solid var(--color-border-tertiary)",
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--color-text-secondary)" }}>{r.label}</span>
              <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{r.value}</span>
            </div>
          ))}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button type="button" color="secondary" outline onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button type="button" color="primary" onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Confirm & save"}
        </Button>
      </ModalFooter>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditGoalModal({ goal, isOpen, onClose, onSubmit }: EditGoalModalProps) {
  const [step, setStep] = useState<"form" | "review">("form");

  const formik = useFormik<EditGoalFormValues>({
    enableReinitialize: true,
    initialValues: {
      name: goal.name,
      icon: goal.icon ?? "",
      color: goal.color ?? "#3B82F6",
      notes: goal.notes ?? "",
      goalType: goal.goalType,
      targetAmount: goal.targetAmount ?? "",
      targetPeriod: goal.targetPeriod ?? "monthly",
      deadline: toDateInputValue(goal.deadline),
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const data: UpdateInvestmentGoalDTO = {
          name: values.name,
          icon: values.icon || undefined,
          color: values.color || undefined,
          notes: values.notes || undefined,
          targetAmount: values.goalType === "targeted" ? (values.targetAmount as number) : undefined,
          targetPeriod: values.goalType === "targeted" ? values.targetPeriod : undefined,
          deadline: values.goalType === "targeted" && values.targetPeriod === "custom" && values.deadline ? new Date(values.deadline) : undefined,
        };
        await onSubmit(goal.id, data);
        toast.success(`Goal "${values.name}" updated successfully!`);
        resetForm();
        setStep("form");
        onClose();
      } catch (err) {
        toast.error("Failed to update goal. Please try again.");
        console.error("EditGoalModal submit error:", err);
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

  const isTargeted = formik.values.goalType === "targeted";
  const isCustomPeriod = formik.values.targetPeriod === "custom";

  const handleIconSelect = (icon: string) => formik.setFieldValue("icon", formik.values.icon === icon ? "" : icon);
  const handleColorSelect = (color: string) => formik.setFieldValue("color", color);

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="lg" scrollable>
      <ModalHeader toggle={handleClose}>{step === "form" ? `Edit goal — ${goal.icon ?? "💰"} ${goal.name}` : "Review your changes"}</ModalHeader>

      {step === "review" ? (
        <ReviewScreen values={formik.values} onBack={() => setStep("form")} onConfirm={() => formik.submitForm()} isSubmitting={formik.isSubmitting} />
      ) : (
        <>
          <ModalBody>
            <form id="edit-goal-form" onSubmit={formik.handleSubmit} noValidate>
              {/* ── Goal name ────────────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Goal name *</Label>
                <Input
                  type="text"
                  name="name"
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.name && formik.errors.name)}
                />
                <FormFeedback>{formik.errors.name}</FormFeedback>
              </FormGroup>

              {/* ── Goal type ────────────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Goal type *</Label>
                <Row className="g-2">
                  {(["targeted", "open_ended"] as InvestmentGoalType[]).map((type) => {
                    const isSelected = formik.values.goalType === type;
                    return (
                      <Col xs={6} key={type}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => formik.setFieldValue("goalType", type)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") formik.setFieldValue("goalType", type);
                          }}
                          style={{
                            border: `2px solid ${isSelected ? "var(--bs-primary)" : "var(--color-border-tertiary)"}`,
                            borderRadius: "var(--border-radius-md)",
                            padding: "10px 12px",
                            cursor: "pointer",
                            background: isSelected ? "var(--bs-primary-bg-subtle, #e7f1ff)" : "var(--color-background-secondary)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <p style={{ fontWeight: 500, fontSize: 13, margin: "0 0 2px" }}>{type === "targeted" ? "Targeted" : "Open-ended"}</p>
                          <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
                            {type === "targeted" ? "Has a fixed target amount & deadline" : "No target — save as much as you want"}
                          </p>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </FormGroup>

              {/* ── Targeted-only fields ─────────────────────────────────── */}
              {isTargeted && (
                <>
                  <Row className="g-3">
                    <Col xs={12} md={6}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: 13, fontWeight: 500 }}>Target amount*</Label>
                        <Input
                          type="number"
                          name="targetAmount"
                          min={1}
                          step={1}
                          placeholder="0"
                          value={formik.values.targetAmount}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.targetAmount && formik.errors.targetAmount)}
                        />
                        <FormFeedback>{formik.errors.targetAmount}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={12} md={6}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: 13, fontWeight: 500 }}>Period *</Label>
                        <Input
                          type="select"
                          name="targetPeriod"
                          value={formik.values.targetPeriod}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.targetPeriod && formik.errors.targetPeriod)}
                        >
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                          <option value="custom">Custom deadline</option>
                        </Input>
                        <FormFeedback>{formik.errors.targetPeriod}</FormFeedback>
                      </FormGroup>
                    </Col>
                  </Row>

                  {isCustomPeriod && (
                    <FormGroup className="mt-3">
                      <Label style={{ fontSize: 13, fontWeight: 500 }}>Deadline *</Label>
                      <Input
                        type="date"
                        name="deadline"
                        value={formik.values.deadline}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        invalid={!!(formik.touched.deadline && formik.errors.deadline)}
                      />
                      <FormFeedback>{formik.errors.deadline}</FormFeedback>
                    </FormGroup>
                  )}
                </>
              )}

              <hr style={{ borderColor: "var(--color-border-tertiary)" }} />

              {/* ── Icon picker ──────────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>
                  Icon <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
                </Label>
                <div className="d-flex flex-wrap gap-1 mb-2">
                  {PRESET_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => handleIconSelect(icon)}
                      style={{
                        fontSize: 20,
                        border: `2px solid ${formik.values.icon === icon ? "var(--bs-primary)" : "var(--color-border-tertiary)"}`,
                        borderRadius: "var(--border-radius-md)",
                        padding: "4px 6px",
                        background: "transparent",
                        cursor: "pointer",
                        lineHeight: 1.2,
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <Input
                  type="text"
                  name="icon"
                  maxLength={4}
                  placeholder="Or type a custom icon / emoji"
                  value={formik.values.icon}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.icon && formik.errors.icon)}
                  style={{ maxWidth: 260 }}
                />
                <FormFeedback>{formik.errors.icon}</FormFeedback>
              </FormGroup>

              {/* ── Color picker ─────────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>
                  Color <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
                </Label>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleColorSelect(color)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: color,
                        border: `3px solid ${formik.values.color === color ? "var(--color-text-primary)" : "transparent"}`,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Input type="color" name="color" value={formik.values.color} onChange={formik.handleChange} style={{ width: 36, height: 28, padding: 2, cursor: "pointer" }} />
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Custom</span>
                  </div>
                </div>
              </FormGroup>

              {/* ── Notes ────────────────────────────────────────────────── */}
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Notes</Label>
                <Input
                  type="textarea"
                  name="notes"
                  rows={2}
                  placeholder="Any extra details about this goal..."
                  value={formik.values.notes}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.notes && formik.errors.notes)}
                />
                <FormFeedback>{formik.errors.notes}</FormFeedback>
                <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 300</FormText>
              </FormGroup>

              {/* ── Live preview ──────────────────────────────────────────── */}
              {formik.values.name && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "10px 14px",
                    borderRadius: "var(--border-radius-md)",
                    background: "var(--color-background-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 24, width: 36, textAlign: "center" }}>{formik.values.icon || "💰"}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500, margin: 0, fontSize: 14 }}>{formik.values.name}</p>
                    <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
                      {isTargeted ? "Targeted goal" : "Open-ended"}
                      {formik.values.targetAmount ? ` · $${Number(formik.values.targetAmount).toLocaleString()} target` : ""}
                    </p>
                  </div>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: formik.values.color ?? "#ccc", flexShrink: 0 }} />
                </div>
              )}
            </form>
          </ModalBody>

          <ModalFooter>
            <Button type="button" color="secondary" outline onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" color="primary" disabled={!formik.dirty} onClick={handleReview}>
              Review changes
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

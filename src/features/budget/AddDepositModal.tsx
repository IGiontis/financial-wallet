import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col, Alert } from "reactstrap";
import type { InvestmentGoalWithStats, CreateInvestmentContributionDTO } from "../../shared/types/IndexTypes";

// ─── Internal form values ─────────────────────────────────────────────────────

interface DepositFormValues {
  amount: number | "";
  date: string;
  notes: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddDepositModalProps {
  goal: InvestmentGoalWithStats;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateInvestmentContributionDTO) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];

export default function AddDepositModal({ goal, isOpen, onClose, onSubmit }: AddDepositModalProps) {
  const isDeadlineGoal = goal.goalType === "targeted" && goal.targetPeriod !== "monthly" && goal.targetPeriod !== "yearly";

  const remaining = goal.remaining ?? 0;
  const maxAmount = isDeadlineGoal && remaining > 0 ? remaining : 1_000_000;

  const validationSchema = useMemo(
    () =>
      Yup.object({
        amount: Yup.number()
          .typeError("Amount must be a number")
          .required("Amount is required")
          .positive("Amount must be greater than 0")
          .max(maxAmount, isDeadlineGoal ? `Cannot exceed remaining amount (${maxAmount.toFixed(2)})` : "Amount is too large"),
        date: Yup.string().required("Date is required"),
        notes: Yup.string().max(200, "Max 200 characters"),
      }),
    [maxAmount, isDeadlineGoal],
  );

  const formik = useFormik<DepositFormValues>({
    enableReinitialize: true,
    initialValues: { amount: "", date: today, notes: "" },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const dto: CreateInvestmentContributionDTO = {
          goalId: goal.id,
          amount: values.amount as number,
          contributionType: "deposit",
          date: new Date(values.date),
          notes: values.notes || undefined,
        };
        await onSubmit(dto);
        resetForm();
        onClose();
      } catch (err) {
        console.error("AddDepositModal submit error:", err);
      }
    },
  });

  const handleClose = () => {
    formik.resetForm();
    onClose();
  };

  const numericAmount = Number(formik.values.amount) || 0;
  const balanceAfter = remaining - numericAmount;

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="md">
      <ModalHeader toggle={handleClose}>
        {goal.icon ?? "💰"} Add deposit — {goal.name}
      </ModalHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          {/* Deadline goal info banner */}
          {isDeadlineGoal && remaining > 0 && (
            <Alert color="info" style={{ fontSize: 13, padding: "8px 12px", marginBottom: "1rem" }}>
              This is a deadline goal. You can deposit up to <strong>{maxAmount.toFixed(2)}</strong> remaining to reach your target.
            </Alert>
          )}

          {/* Goal already completed */}
          {isDeadlineGoal && remaining <= 0 && (
            <Alert color="success" style={{ fontSize: 13, padding: "8px 12px", marginBottom: "1rem" }}>
              This goal has been fully funded!
            </Alert>
          )}

          <Row className="g-2">
            <Col xs={12} md={6}>
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Amount *</Label>
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
                  disabled={isDeadlineGoal && remaining <= 0}
                />
                <FormFeedback>{formik.errors.amount}</FormFeedback>
                {isDeadlineGoal && remaining > 0 && (
                  <FormText style={{ fontSize: 11 }}>
                    Max deposit: <strong>{maxAmount.toFixed(2)}</strong>
                    {numericAmount > 0 && !formik.errors.amount && (
                      <>
                        {" "}
                        · Remaining after: <strong>{Math.max(balanceAfter, 0).toFixed(2)}</strong>
                      </>
                    )}
                  </FormText>
                )}
              </FormGroup>
            </Col>

            <Col xs={12} md={6}>
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Date *</Label>
                <Input
                  type="date"
                  name="date"
                  value={formik.values.date}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.date && formik.errors.date)}
                  disabled={isDeadlineGoal && remaining <= 0}
                />
                <FormFeedback>{formik.errors.date}</FormFeedback>
              </FormGroup>
            </Col>
          </Row>

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
              disabled={isDeadlineGoal && remaining <= 0}
            />
            <FormFeedback>{formik.errors.notes}</FormFeedback>
            <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 200</FormText>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" color="primary" disabled={formik.isSubmitting || !formik.dirty || (isDeadlineGoal && remaining <= 0)}>
            {formik.isSubmitting ? "Saving..." : "Add deposit"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

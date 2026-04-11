import React from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert } from "reactstrap";
import type { InvestmentGoalWithStats, CreateInvestmentContributionDTO } from "../../shared/types/IndexTypes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

// ─── Internal form values ─────────────────────────────────────────────────────

interface WithdrawFormValues {
  amount: number | "";
  date: string;
  notes: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WithdrawModalProps {
  goal: InvestmentGoalWithStats;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateInvestmentContributionDTO) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];

export default function WithdrawModal({ goal, isOpen, onClose, onSubmit }: WithdrawModalProps) {
  const validationSchema = React.useMemo(
    () =>
      Yup.object({
        amount: Yup.number()
          .typeError("Amount must be a number")
          .required("Amount is required")
          .positive("Amount must be greater than 0")
          .max(goal.totalSaved, `Cannot exceed current balance (${formatCurrency(goal.totalSaved)})`),
        date: Yup.string().required("Date is required"),
        notes: Yup.string().max(200, "Max 200 characters"),
      }),
    [goal.totalSaved],
  );

  const formik = useFormik<WithdrawFormValues>({
    enableReinitialize: true,
    initialValues: { amount: "", date: today, notes: "" },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const dto: CreateInvestmentContributionDTO = {
          goalId: goal.id,
          amount: values.amount as number,
          contributionType: "withdrawal",
          date: new Date(values.date),
          notes: values.notes || undefined,
        };
        await onSubmit(dto);
        resetForm();
        onClose();
      } catch (err) {
        console.error("WithdrawModal submit error:", err);
      }
    },
  });

  const handleClose = () => {
    formik.resetForm();
    onClose();
  };

  const numericAmount = Number(formik.values.amount) || 0;
  const balanceAfter = goal.totalSaved - numericAmount;

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="sm">
      <ModalHeader toggle={handleClose}>
        {goal.icon ?? "💰"} Withdraw — {goal.name}
      </ModalHeader>
      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          <Alert color="info" style={{ fontSize: 13, padding: "8px 12px", marginBottom: "1rem" }}>
            Current balance: <strong>{formatCurrency(goal.totalSaved)}</strong>
          </Alert>

          <FormGroup>
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Withdrawal amount *</Label>
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
            {numericAmount > 0 && !formik.errors.amount && (
              <FormText style={{ fontSize: 11 }}>
                Balance after: <strong>{formatCurrency(Math.max(balanceAfter, 0))}</strong>
              </FormText>
            )}
          </FormGroup>

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

          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Notes</Label>
            <Input
              type="textarea"
              name="notes"
              rows={2}
              placeholder="Reason for withdrawal..."
              value={formik.values.notes}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              invalid={!!(formik.touched.notes && formik.errors.notes)}
            />
            <FormFeedback>{formik.errors.notes}</FormFeedback>
            <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 200</FormText>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" color="danger" disabled={formik.isSubmitting || !formik.dirty}>
            {formik.isSubmitting ? "Saving..." : "Confirm withdrawal"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

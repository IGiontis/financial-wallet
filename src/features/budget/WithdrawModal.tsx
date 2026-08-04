import React from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert, Row, Col } from "reactstrap";
import type { InvestmentGoalWithStats, CreateInvestmentContributionDTO } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";

// ─── Internal form values ─────────────────────────────────────────────────────

interface WithdrawFormValues {
  amount: number | "";
  /** Profit on top of the capital — only used by the "withdraw everything" flow. */
  gain: number | "";
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
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  // Balances are stored in base currency; the user types in their display currency.
  const balanceInDisplay = convert(goal.totalSaved);

  // An investment can be worth more than what was paid in, so withdrawals are
  // NOT capped at the balance — taking out more simply means you made a profit.
  const validationSchema = React.useMemo(
    () =>
      Yup.object({
        amount: Yup.number()
          .typeError("Amount must be a number")
          .required("Amount is required")
          .positive("Amount must be greater than 0")
          .max(10_000_000, "Amount is too large"),
        gain: Yup.number().typeError("Must be a number").min(0, "Cannot be negative").max(10_000_000, "Amount is too large"),
        date: Yup.string().required("Date is required"),
        notes: Yup.string().max(40, "Max 40 characters"),
      }),
    [],
  );

  const formik = useFormik<WithdrawFormValues>({
    enableReinitialize: true,
    initialValues: { amount: "", gain: "", date: today, notes: "" },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        // The profit field tops up the amount actually taken out.
        const typed = (Number(values.amount) || 0) + (Number(values.gain) || 0);
        const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
        const dto: CreateInvestmentContributionDTO = {
          goalId: goal.id,
          amount: amountInBase,
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
  const numericGain = Number(formik.values.gain) || 0;
  const totalTyped = numericAmount + numericGain;
  const amountInBaseLive = baseCurrency === displayCurrency ? totalTyped : convertToBase(totalTyped);
  const balanceAfterBase = goal.totalSaved - amountInBaseLive;

  // "Cashing out" = taking the whole balance; that's when a profit top-up makes sense.
  const isFullWithdrawal = numericAmount > 0 && Math.abs(numericAmount - balanceInDisplay) < 0.01;
  const exceedsBalance = amountInBaseLive > goal.totalSaved + 0.001;
  const profitAmount = exceedsBalance ? amountInBaseLive - goal.totalSaved : 0;

  const withdrawAll = () => {
    formik.setFieldValue("amount", Number(balanceInDisplay.toFixed(2)));
    formik.setFieldTouched("amount", true, false);
  };

  return (
    <Modal isOpen={isOpen} toggle={handleClose} centered size="m">
      <ModalHeader toggle={handleClose}>
        {goal.icon ?? "💰"} Withdraw — {goal.name}
      </ModalHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          <div
            className="d-flex align-items-center justify-content-between gap-2 mb-3 px-3 py-2"
            style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}
          >
            <span style={{ fontSize: 13 }}>
              <span className="text-body-secondary">Current balance:</span> <strong>{format(goal.totalSaved)}</strong>
            </span>
            <Button type="button" size="sm" color="secondary" outline onClick={withdrawAll} disabled={goal.totalSaved <= 0}>
              Withdraw all
            </Button>
          </div>

          <Row className="g-2">
            <Col xs={12} md={6}>
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Withdrawal amount ({displayCurrency}) *</Label>
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

                {numericAmount > 0 && !formik.errors.amount && !exceedsBalance && (
                  <FormText style={{ fontSize: 11 }}>
                    Balance after: <strong>{format(Math.max(balanceAfterBase, 0))}</strong>
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
                />
                <FormFeedback>{formik.errors.date}</FormFeedback>
              </FormGroup>
            </Col>
          </Row>

          {/* Profit top-up — offered when cashing the whole position out, since
              an investment is often worth more than the capital paid in. */}
          {isFullWithdrawal && (
            <FormGroup>
              <Label style={{ fontSize: 13, fontWeight: 500 }}>
                Profit / extra earned ({displayCurrency}) <span className="text-body-secondary fw-normal">(optional)</span>
              </Label>
              <Input
                type="number"
                name="gain"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={formik.values.gain}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                invalid={!!(formik.touched.gain && formik.errors.gain)}
              />
              <FormFeedback>{formik.errors.gain}</FormFeedback>
              <FormText style={{ fontSize: 11 }}>Put in {format(goal.totalSaved)} and it grew? Add the gain here — it's withdrawn on top of your capital.</FormText>
            </FormGroup>
          )}

          {exceedsBalance && (
            <Alert color="success" style={{ fontSize: 13, padding: "8px 12px" }}>
              Withdrawing <strong>{format(amountInBaseLive)}</strong> — that's <strong>{format(profitAmount)}</strong> more than you put in, recorded as a gain.
            </Alert>
          )}

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
            <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 40</FormText>
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

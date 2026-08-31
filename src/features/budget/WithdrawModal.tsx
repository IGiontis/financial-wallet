import React from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert, Row, Col } from "reactstrap";
import type { InvestmentGoalWithStats, CreateInvestmentContributionDTO } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { DateField } from "../../shared/components/DateField";
import { validationMessage } from "../../shared/utils/validationMessage";

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
  const { t } = useTranslation();
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  // Balances are stored in base currency; the user types in their display currency.
  const balanceInDisplay = convert(goal.totalSaved);

  // An investment can be worth more than what was paid in, so withdrawals are
  // NOT capped at the balance — taking out more simply means you made a profit.
  const validationSchema = React.useMemo(
    () =>
      Yup.object({
        amount: Yup.number()
          .typeError("validation.amountNumber")
          .required("validation.amountRequired")
          .positive("validation.amountPositive")
          .max(10_000_000, "validation.amountTooLarge"),
        gain: Yup.number().typeError("validation.mustBeNumber").min(0, "validation.cannotBeNegative").max(10_000_000, "validation.amountTooLarge"),
        date: Yup.string().required("validation.dateRequired"),
        notes: Yup.string().max(40, "validation.maxChars|40"),
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
        {t("investments.withdrawTitle", { icon: goal.icon ?? "💰", name: goal.name })}
      </ModalHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          <div
            className="d-flex align-items-center justify-content-between gap-2 mb-3 px-3 py-2"
            style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}
          >
            <span style={{ fontSize: 13 }}>
              <span className="text-body-secondary">{t("goals.currentBalance")}</span> <strong>{format(goal.totalSaved)}</strong>
            </span>
            <Button type="button" size="sm" color="secondary" outline onClick={withdrawAll} disabled={goal.totalSaved <= 0}>
              {t("investments.withdrawAll")}
            </Button>
          </div>

          <Row className="g-2">
            <Col xs={12} md={6}>
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("investments.withdrawalAmountLabel", { currency: displayCurrency })} *</Label>
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
                <FormFeedback>{validationMessage(formik.errors.amount, t)}</FormFeedback>

                {numericAmount > 0 && !formik.errors.amount && !exceedsBalance && (
                  <FormText style={{ fontSize: 11 }}>
                    {t("investments.balanceAfter", { amount: format(Math.max(balanceAfterBase, 0)) })}
                  </FormText>
                )}
              </FormGroup>
            </Col>

            <Col xs={12} md={6}>
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("investments.dateLabel")} *</Label>
                <DateField
                  name="date"
                  value={formik.values.date}
                  onChange={(v) => formik.setFieldValue("date", v)}
                  onBlur={() => formik.setFieldTouched("date", true)}
                  invalid={!!(formik.touched.date && formik.errors.date)}
                />
                <FormFeedback>{validationMessage(formik.errors.date, t)}</FormFeedback>
              </FormGroup>
            </Col>
          </Row>

          {/* Profit top-up — offered when cashing the whole position out, since
              an investment is often worth more than the capital paid in. */}
          {isFullWithdrawal && (
            <FormGroup>
              <Label style={{ fontSize: 13, fontWeight: 500 }}>
                {t("investments.profitLabel", { currency: displayCurrency })} <span className="text-body-secondary fw-normal">(optional)</span>
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
              <FormFeedback>{validationMessage(formik.errors.gain, t)}</FormFeedback>
              <FormText style={{ fontSize: 11 }}>{t("investments.profitHint", { amount: format(goal.totalSaved) })}</FormText>
            </FormGroup>
          )}

          {exceedsBalance && (
            <Alert color="success" style={{ fontSize: 13, padding: "8px 12px" }}>
              Withdrawing <strong>{format(amountInBaseLive)}</strong> — that's <strong>{format(profitAmount)}</strong> more than you put in, recorded as a gain.
            </Alert>
          )}

          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("common.notes")}</Label>
            <Input
              type="textarea"
              name="notes"
              rows={2}
              placeholder={t("investments.reasonPlaceholder")}
              value={formik.values.notes}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              invalid={!!(formik.touched.notes && formik.errors.notes)}
            />
            <FormFeedback>{validationMessage(formik.errors.notes, t)}</FormFeedback>
            <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 40</FormText>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={handleClose}>
            {t("common.cancel")}
          </Button>

          <Button type="submit" color="danger" disabled={formik.isSubmitting || !formik.dirty}>
            {formik.isSubmitting ? t("common.saving") : t("investments.confirmWithdrawal")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

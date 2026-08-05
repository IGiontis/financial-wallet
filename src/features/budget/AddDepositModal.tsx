import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { validationMessage } from "../../shared/utils/validationMessage";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col, Alert } from "reactstrap";
import type { InvestmentGoalWithStats, CreateInvestmentContributionDTO } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";

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
  const { t } = useTranslation();
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  const isDeadlineGoal = goal.goalType === "targeted" && goal.targetPeriod !== "monthly" && goal.targetPeriod !== "yearly";

  // `remaining` is stored in base currency; the user types in their display currency.
  const remaining = goal.remaining ?? 0;
  const remainingInDisplay = convert(remaining);
  const maxAmount = isDeadlineGoal && remaining > 0 ? remainingInDisplay : 1_000_000;

  const validationSchema = useMemo(
    () =>
      Yup.object({
        amount: Yup.number()
          .typeError("validation.amountNumber")
          .required("validation.amountRequired")
          .positive("validation.amountPositive")
          .max(maxAmount, isDeadlineGoal ? t("investments.cannotExceedRemaining", { amount: format(remaining) }) : "validation.amountTooLarge"),
        date: Yup.string().required("validation.dateRequired"),
        notes: Yup.string().max(40, "validation.maxChars|40"),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxAmount, isDeadlineGoal, remaining],
  );

  const formik = useFormik<DepositFormValues>({
    enableReinitialize: true,
    initialValues: { amount: "", date: today, notes: "" },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const typed = values.amount as number;
        const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
        const dto: CreateInvestmentContributionDTO = {
          goalId: goal.id,
          amount: amountInBase,
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
  const amountInBaseLive = baseCurrency === displayCurrency ? numericAmount : convertToBase(numericAmount);
  const balanceAfterBase = remaining - amountInBaseLive;

  return (
    <Modal isOpen={isOpen} toggle={handleClose} centered size="md">
      <ModalHeader toggle={handleClose}>
        {t("investments.addDepositTitle", { icon: goal.icon ?? "💰", name: goal.name })}
      </ModalHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          {/* Deadline goal info banner */}
          {isDeadlineGoal && remaining > 0 && (
            <Alert color="info" style={{ fontSize: 13, padding: "8px 12px", marginBottom: "1rem" }}>
              {t("investments.deadlineGoalHint", { amount: format(remaining) })}
            </Alert>
          )}

          {/* Goal already completed */}
          {isDeadlineGoal && remaining <= 0 && (
            <Alert color="success" style={{ fontSize: 13, padding: "8px 12px", marginBottom: "1rem" }}>
              {t("investments.goalFullyFunded")}
            </Alert>
          )}

          <Row className="g-2">
            <Col xs={12} md={6}>
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("investments.amountLabel", { currency: displayCurrency })} *</Label>
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
                <FormFeedback>{validationMessage(formik.errors.amount, t)}</FormFeedback>
                {isDeadlineGoal && remaining > 0 && (
                  <FormText style={{ fontSize: 11 }}>
                    {t("investments.maxDepositHint", { amount: format(remaining) })}
                    {numericAmount > 0 && !formik.errors.amount && (
                      <>
                        {" "}
                        · {t("investments.remainingAfter", { amount: format(Math.max(balanceAfterBase, 0)) })}
                      </>
                    )}
                  </FormText>
                )}
              </FormGroup>
            </Col>

            <Col xs={12} md={6}>
              <FormGroup>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("investments.dateLabel")} *</Label>
                <Input
                  type="date"
                  name="date"
                  value={formik.values.date}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.date && formik.errors.date)}
                  disabled={isDeadlineGoal && remaining <= 0}
                />
                <FormFeedback>{validationMessage(formik.errors.date, t)}</FormFeedback>
              </FormGroup>
            </Col>
          </Row>

          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("common.notes")}</Label>
            <Input
              type="textarea"
              name="notes"
              rows={2}
              placeholder={t("common.optionalNote")}
              value={formik.values.notes}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              invalid={!!(formik.touched.notes && formik.errors.notes)}
              disabled={isDeadlineGoal && remaining <= 0}
            />
            <FormFeedback>{validationMessage(formik.errors.notes, t)}</FormFeedback>
            <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 40</FormText>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" color="primary" disabled={formik.isSubmitting || !formik.dirty || (isDeadlineGoal && remaining <= 0)}>
            {formik.isSubmitting ? t("common.saving") : t("investments.addDeposit")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

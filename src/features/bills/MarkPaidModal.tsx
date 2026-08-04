import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert, Row, Col } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";

interface MarkPaidModalProps {
  bill: BillWithStatus;
  isSaving: boolean;
  onClose: () => void;
  /** Amount is in base currency. */
  onConfirm: (amountInBase: number, paidDate: Date) => void;
}

const today = () => new Date().toISOString().split("T")[0];

/**
 * Confirms a bill payment, capturing WHAT was paid and WHEN.
 *
 * This is also how variable bills work: electricity might be €50 one month and
 * €120 the next, so the stored amount is only an estimate and the real figure
 * is entered here.
 */
export default function MarkPaidModal({ bill, isSaving, onClose, onConfirm }: MarkPaidModalProps) {
  const { t } = useTranslation();
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  const isVariable = !!bill.isVariableAmount;
  // Suggest the average of past payments for variable bills — it's a better
  // starting point than a stale estimate.
  const suggestedBase = isVariable ? (bill.averagePaidAmount ?? bill.amount) : bill.amount;
  const suggestedInDisplay = Number(convert(suggestedBase).toFixed(2));

  const validationSchema = useMemo(
    () =>
      Yup.object({
        amount: Yup.number()
          .typeError("validation.amountNumber")
          .required("validation.amountRequired")
          .positive("validation.amountPositive")
          .max(1_000_000, "validation.amountTooLarge"),
        date: Yup.string().required("validation.dateRequired"),
      }),
    [],
  );

  const formik = useFormik({
    initialValues: { amount: suggestedInDisplay, date: today() },
    validationSchema,
    onSubmit: (values) => {
      const typed = Number(values.amount);
      const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
      onConfirm(amountInBase, new Date(values.date));
    },
  });

  const typedAmount = Number(formik.values.amount) || 0;
  const differsFromEstimate = isVariable && Math.abs(typedAmount - suggestedInDisplay) > 0.01;

  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>{t("bills.confirmPayment")}</ModalHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          <p className="mb-3" style={{ fontSize: 14 }}>
            {t("bills.confirmPaymentBody", { name: bill.name })}
          </p>

          {isVariable && (
            <Alert color="info" className="py-2" style={{ fontSize: 12 }}>
              {bill.averagePaidAmount
                ? t("bills.variableHintWithAverage", { amount: format(bill.averagePaidAmount) })
                : t("bills.variableHint", { amount: format(bill.amount) })}
            </Alert>
          )}

          <Row className="g-2">
            <Col xs={12} sm={6}>
              <FormGroup className="mb-0">
                <Label className="small fw-medium">
                  {t("common.amount")} ({displayCurrency}) *
                </Label>
                <Input
                  type="number"
                  name="amount"
                  min={0.01}
                  step={0.01}
                  autoFocus={isVariable}
                  value={formik.values.amount}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.amount && formik.errors.amount)}
                />
                <FormFeedback>{formik.errors.amount && t(formik.errors.amount)}</FormFeedback>
                {differsFromEstimate && <FormText style={{ fontSize: 11 }}>{t("bills.differsFromEstimate")}</FormText>}
              </FormGroup>
            </Col>

            <Col xs={12} sm={6}>
              <FormGroup className="mb-0">
                <Label className="small fw-medium">{t("common.date")} *</Label>
                <Input type="date" name="date" value={formik.values.date} onChange={formik.handleChange} onBlur={formik.handleBlur} invalid={!!(formik.touched.date && formik.errors.date)} />
                <FormFeedback>{formik.errors.date && t(formik.errors.date)}</FormFeedback>
              </FormGroup>
            </Col>
          </Row>

          <p className="text-body-secondary mb-0 mt-3" style={{ fontSize: 11 }}>
            {t("bills.willLogExpense")}
          </p>
        </ModalBody>

        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={onClose} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" color="success" disabled={isSaving}>
            {isSaving ? t("common.saving") : t("bills.confirmPaid")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

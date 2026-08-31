import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert, Row, Col } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../shared/components/DateField";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { getPeriodOptions, type PeriodOption } from "./billsUtils";

interface MarkPaidModalProps {
  bill: BillWithStatus;
  isSaving: boolean;
  onClose: () => void;
  /** Amount is in base currency; `periodKey` names the period being covered. */
  onConfirm: (amountInBase: number, paidDate: Date, periodKey: string) => void;
}

const today = () => new Date().toISOString().split("T")[0];

/** How many periods forward the user may settle in one go. */
const PERIOD_CHOICES = 4;

/**
 * "September 2026", "2027", "Week of 14 Sep" — and a range when one period
 * spans several months, as it does for a bill that repeats every 2.
 */
function usePeriodLabel(bill: BillWithStatus) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  return (option: PeriodOption) => {
    if (bill.frequency === "yearly") {
      const years = option.start.getFullYear() === option.end.getFullYear() ? `${option.start.getFullYear()}` : `${option.start.getFullYear()}–${option.end.getFullYear()}`;
      return years;
    }

    const short = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
    if (bill.frequency === "weekly") return t("bills.weekOf", { date: short.format(option.start) });

    const month = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" });
    const sameMonth = option.start.getMonth() === option.end.getMonth() && option.start.getFullYear() === option.end.getFullYear();
    return sameMonth ? month.format(option.start) : `${new Intl.DateTimeFormat(lang, { month: "short" }).format(option.start)} – ${month.format(option.end)}`;
  };
}

/**
 * Confirms a bill payment, capturing WHAT was paid, WHEN, and WHICH period it
 * settles.
 *
 * That last one is why the period is a field rather than simply "today's":
 * money is often there well before a bill is, and paying October's rent in
 * September shouldn't have to wait for the calendar to turn over.
 *
 * This is also how variable bills work: electricity might be €50 one month and
 * €120 the next, so the stored amount is only an estimate and the real figure
 * is entered here.
 */
export default function MarkPaidModal({ bill, isSaving, onClose, onConfirm }: MarkPaidModalProps) {
  const { t } = useTranslation();
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const periodLabel = usePeriodLabel(bill);

  const periods = useMemo(() => getPeriodOptions(bill, bill.payments, new Date(), PERIOD_CHOICES), [bill]);
  // Land on the first period that still owes something — for a bill already
  // settled this month that is next month, which is the whole point of opening
  // this modal a second time.
  const defaultPeriodKey = (periods.find((p) => !p.isPaid) ?? periods[0]).key;

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
        periodKey: Yup.string().required("validation.periodRequired"),
      }),
    [],
  );

  const formik = useFormik({
    initialValues: { amount: suggestedInDisplay, date: today(), periodKey: defaultPeriodKey },
    validationSchema,
    onSubmit: (values) => {
      const typed = Number(values.amount);
      const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
      onConfirm(amountInBase, new Date(values.date), values.periodKey);
    },
  });

  const typedAmount = Number(formik.values.amount) || 0;
  const differsFromEstimate = isVariable && Math.abs(typedAmount - suggestedInDisplay) > 0.01;

  const selectedPeriod = periods.find((p) => p.key === formik.values.periodKey);
  const payingAhead = !!selectedPeriod && selectedPeriod.offset > 0;

  return (
    <Modal isOpen toggle={onClose} centered>
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
                <DateField
                  name="date"
                  value={formik.values.date}
                  onChange={(v) => formik.setFieldValue("date", v)}
                  onBlur={() => formik.setFieldTouched("date", true)}
                  invalid={!!(formik.touched.date && formik.errors.date)}
                />
                <FormFeedback>{formik.errors.date && t(formik.errors.date)}</FormFeedback>
              </FormGroup>
            </Col>
          </Row>

          {/* Which period the money settles — separate from the date it left
              the account, so an early payment lands on the right month. */}
          <FormGroup className="mb-0 mt-3">
            <Label className="small fw-medium">{t("bills.paymentPeriod")}</Label>
            <Input type="select" name="periodKey" value={formik.values.periodKey} onChange={formik.handleChange} onBlur={formik.handleBlur}>
              {periods.map((option) => (
                <option key={option.key} value={option.key} disabled={option.isPaid}>
                  {periodLabel(option)}
                  {option.offset === 0 ? ` — ${t("bills.periodCurrent")}` : ""}
                  {option.isPaid ? ` — ${t("bills.periodAlreadyPaid")}` : ""}
                </option>
              ))}
            </Input>
            <FormText style={{ fontSize: 11 }}>{t("bills.paymentPeriodHint")}</FormText>
          </FormGroup>

          {payingAhead && (
            <Alert color="info" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
              {t("bills.payingAheadHint", { period: periodLabel(selectedPeriod) })}
            </Alert>
          )}

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

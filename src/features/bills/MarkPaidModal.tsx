import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert, Row, Col } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../shared/components/DateField";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { parseISODay } from "../../shared/utils/dates";
import { getInstallmentCount, getPeriodOptions, installmentAmount, paidInstallments, type PeriodOption } from "./billsUtils";

interface MarkPaidModalProps {
  bill: BillWithStatus;
  isSaving: boolean;
  /**
   * A period already chosen from the year grid.
   *
   * Shown as a fact rather than a dropdown when set: the month was picked
   * deliberately a moment ago, and re-offering a list of four around today
   * would not even contain it for a payment being filed years back.
   */
  presetPeriodKey?: string;
  /** An instalment already chosen from the year grid. Otherwise the next one owed. */
  presetInstallmentIndex?: number;
  onClose: () => void;
  /** Amount is in base currency; `periodKey` names the period being covered. */
  onConfirm: (amountInBase: number, paidDate: Date, periodKey: string, installmentIndex?: number) => void;
}

const today = () => new Date().toISOString().split("T")[0];

/** How many periods forward the user may settle in one go. */
const PERIOD_CHOICES = 4;

/** How many periods back can still be filed against — for recording history. */
const PERIOD_LOOKBACK = 6;

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
export default function MarkPaidModal({ bill, isSaving, presetPeriodKey, presetInstallmentIndex, onClose, onConfirm }: MarkPaidModalProps) {
  const { t } = useTranslation();
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const periodLabel = usePeriodLabel(bill);

  const periods = useMemo(() => getPeriodOptions(bill, bill.payments, new Date(), PERIOD_CHOICES, PERIOD_LOOKBACK), [bill]);
  // Land on the first period that still owes something — for a bill already
  // settled this month that is next month, which is the whole point of opening
  // this modal a second time.
  // Only from the current period on: past ones are offered for back-filling,
  // never chosen for you, or an unpaid month from March would quietly become
  // the default in August.
  const defaultPeriodKey = presetPeriodKey ?? (periods.find((p) => p.offset >= 0 && !p.isPaid) ?? periods.find((p) => p.offset === 0) ?? periods[0]).key;

  const isVariable = !!bill.isVariableAmount;
  // Suggest the average of past payments for variable bills — it's a better
  // starting point than a stale estimate.
  const periodTotal = isVariable ? (bill.averagePaidAmount ?? bill.amount) : bill.amount;

  // Which part of the period this settles. Whatever the grid was pressed on,
  // or else the first one still owed — never simply "the first", which would
  // re-file a payment already made.
  const installmentTotal = getInstallmentCount(bill);
  const settledForPeriod = paidInstallments(bill.payments, defaultPeriodKey);
  const installmentIndex =
    presetInstallmentIndex ?? Array.from({ length: installmentTotal }, (_, i) => i).find((i) => !settledForPeriod.has(i)) ?? installmentTotal - 1;

  const suggestedBase = installmentAmount(bill, periodTotal, installmentIndex);
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
      onConfirm(amountInBase, new Date(values.date), values.periodKey, installmentTotal > 1 ? installmentIndex : undefined);
    },
  });

  const typedAmount = Number(formik.values.amount) || 0;
  const differsFromEstimate = isVariable && Math.abs(typedAmount - suggestedInDisplay) > 0.01;

  const selectedPeriod = periods.find((p) => p.key === formik.values.periodKey);
  const payingAhead = !!selectedPeriod && selectedPeriod.offset > 0;

  // A preset can name a period years outside the offered window, so its label
  // is built from the key itself rather than looked up.
  const presetLabel = presetPeriodKey ? (periods.find((p) => p.key === presetPeriodKey) ? periodLabel(periods.find((p) => p.key === presetPeriodKey)!) : presetPeriodKey) : "";

  // The trap this catches: a date from a past period filed against the current
  // one. Paying *ahead* also has a date outside its period, which is normal and
  // must not be flagged — so only a date landing in an earlier period counts.
  const chosenDate = parseISODay(formik.values.date);
  const periodForDate = chosenDate ? periods.find((p) => chosenDate >= p.start && chosenDate <= p.end) : undefined;
  const dateBelongsElsewhere = periodForDate && periodForDate.offset < 0 && periodForDate.key !== formik.values.periodKey ? periodForDate : undefined;

  return (
    <Modal isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>{t("bills.confirmPayment")}</ModalHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          <p className="mb-3" style={{ fontSize: 14 }}>
            {t("bills.confirmPaymentBody", { name: bill.name })}
          </p>

          {installmentTotal > 1 && (
            <Alert color="warning" className="py-2" style={{ fontSize: 12 }}>
              {t("bills.payingInstallment", {
                index: installmentIndex + 1,
                count: installmentTotal,
                amount: format(installmentAmount(bill, periodTotal, installmentIndex)),
                total: format(periodTotal),
              })}
            </Alert>
          )}

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
          {presetPeriodKey ? (
            <div className="mt-3 p-2" style={{ borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", fontSize: 13 }}>
              {t("bills.payForPeriod", { period: presetLabel })}
            </div>
          ) : (
          <FormGroup className="mb-0 mt-3">
            <Label className="small fw-medium">{t("bills.paymentPeriod")}</Label>
            <Input type="select" name="periodKey" value={formik.values.periodKey} onChange={formik.handleChange} onBlur={formik.handleBlur}>
              {periods.map((option) => (
                <option key={option.key} value={option.key} disabled={option.isPaid}>
                  {periodLabel(option)}
                  {option.offset === 0 ? ` — ${t("bills.periodCurrent")}` : ""}
                  {option.offset < 0 ? ` — ${t("bills.periodPast")}` : ""}
                  {option.isPaid ? ` — ${t("bills.periodAlreadyPaid")}` : ""}
                </option>
              ))}
            </Input>
            <FormText style={{ fontSize: 11 }}>{t("bills.paymentPeriodHint")}</FormText>
          </FormGroup>
          )}

          {dateBelongsElsewhere && (
            <Alert color="warning" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
              <div className="mb-2">{t("bills.periodDateMismatch", { period: periodLabel(dateBelongsElsewhere) })}</div>
              <Button
                type="button"
                color="warning"
                size="sm"
                disabled={dateBelongsElsewhere.isPaid}
                onClick={() => formik.setFieldValue("periodKey", dateBelongsElsewhere.key)}
              >
                {dateBelongsElsewhere.isPaid ? t("bills.periodAlreadyPaid") : t("bills.usePeriod", { period: periodLabel(dateBelongsElsewhere) })}
              </Button>
            </Alert>
          )}

          {payingAhead && !dateBelongsElsewhere && (
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

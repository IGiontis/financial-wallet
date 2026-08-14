import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { Bill, BillFrequency, CreateBillDTO, Category } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { firestoreToDate } from "../../shared/utils/dates";
import { categoryLabel } from "../../shared/utils/categories";

const FREQUENCIES: { value: BillFrequency; labelKey: string }[] = [
  { value: "weekly", labelKey: "bills.weekly" },
  { value: "monthly", labelKey: "bills.monthly" },
  { value: "yearly", labelKey: "bills.yearly" },
];

/** Weekday and month names in the active locale. */
function useDateNames(locale: string) {
  const weekdays = Array.from({ length: 7 }, (_, d) => new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + d)));
  const months = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2020, m, 1)));
  return { weekdays, months };
}

interface BillFormValues {
  name: string;
  amount: number | "";
  isVariableAmount: boolean;
  categoryId: string;
  frequency: BillFrequency;
  intervalCount: number | "";
  anchorMonth: string; // "YYYY-MM" — start of the first cycle
  dueDay: number | "";
  dueMonth: number | "";
  hasGrace: boolean;
  graceDays: number | "";
  notes: string;
}

const toMonthInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

interface AddBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  bill?: Bill | null; // present when editing
  onSubmit: (data: CreateBillDTO) => Promise<void>;
}

export default function AddBillModal({ isOpen, onClose, categories, bill, onSubmit }: AddBillModalProps) {
  const { t, i18n } = useTranslation();
  const { convertToBase, convert, baseCurrency, displayCurrency } = useCurrencyConverter();
  const isEdit = !!bill;
  const { weekdays, months } = useDateNames(i18n.resolvedLanguage ?? "en");

  // Messages are i18n keys; FormFeedback translates them at render time.
  const validationSchema = useMemo(
    () =>
      Yup.object({
        name: Yup.string().required("validation.nameRequired").max(40, "validation.maxChars"),
        amount: Yup.number()
          .typeError("validation.amountNumber")
          .required("validation.amountRequired")
          .positive("validation.amountPositive")
          .max(1_000_000, "validation.amountTooLarge"),
        categoryId: Yup.string().required("validation.categoryRequired"),
        frequency: Yup.mixed<BillFrequency>().oneOf(["weekly", "monthly", "yearly"]).required(),
        graceDays: Yup.number().when("hasGrace", {
          is: true,
          then: (schema) => schema.typeError("validation.amountNumber").min(1, "validation.graceMin").max(120, "validation.graceMax").required("validation.required"),
          otherwise: (schema) => schema.notRequired(),
        }),
        intervalCount: Yup.number().typeError("validation.amountNumber").min(1, "validation.intervalMin").max(24, "validation.intervalMax").required("validation.required"),
        notes: Yup.string().max(200, "validation.maxChars"),
      }),
    [],
  );

  const expenseCategories = categories.filter((c) => c.type === "expense");

  const formik = useFormik<BillFormValues>({
    enableReinitialize: true,
    initialValues: {
      name: bill?.name ?? "",
      // Show the stored (base-currency) amount in the user's display currency for editing.
      amount: bill ? Number(convert(bill.amount).toFixed(2)) : "",
      isVariableAmount: bill?.isVariableAmount ?? false,
      categoryId: bill?.categoryId ?? "",
      frequency: bill?.frequency ?? "monthly",
      intervalCount: bill?.intervalCount ?? 1,
      anchorMonth: toMonthInput(bill?.anchorDate ? firestoreToDate(bill.anchorDate) : bill?.createdAt ? firestoreToDate(bill.createdAt) : new Date()),
      dueDay: bill?.dueDay ?? "",
      dueMonth: bill?.dueMonth ?? "",
      hasGrace: (bill?.graceDays ?? 0) > 0,
      graceDays: bill?.graceDays ?? "",
      notes: bill?.notes ?? "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const typed = values.amount as number;
        const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
        const interval = Math.max(1, Number(values.intervalCount) || 1);

        // A cleared month input yields NaN, which would become an Invalid Date
        // and be rejected by Firestore — fall back to the current month.
        const [rawYear, rawMonth] = values.anchorMonth.split("-").map(Number);
        const now = new Date();
        const anchorYear = Number.isFinite(rawYear) ? rawYear : now.getFullYear();
        const anchorMonthIndex = Number.isFinite(rawMonth) ? Math.min(Math.max(rawMonth, 1), 12) - 1 : now.getMonth();

        const data: CreateBillDTO = {
          name: values.name.trim(),
          amount: amountInBase,
          isVariableAmount: values.isVariableAmount,
          categoryId: values.categoryId,
          frequency: values.frequency,
          intervalCount: interval,
          // Only meaningful for multi-period cycles, but stored either way so the
          // bucket maths stays stable if the user later raises the interval.
          anchorDate: new Date(anchorYear, anchorMonthIndex, 1),
          dueDay: values.dueDay === "" ? undefined : Number(values.dueDay),
          // 0 and "no grace" are the same thing to every consumer, so the flag
          // never has to be stored alongside the number.
          graceDays: values.hasGrace && values.graceDays !== "" ? Number(values.graceDays) : 0,
          dueMonth: values.frequency === "yearly" && values.dueMonth !== "" ? Number(values.dueMonth) : undefined,
          notes: values.notes.trim() || undefined,
        };
        await onSubmit(data);
        resetForm();
        onClose();
      } catch (err) {
        console.error("AddBillModal submit error:", err);
      }
    },
  });

  const handleClose = () => {
    formik.resetForm();
    onClose();
  };

  const { frequency } = formik.values;
  const intervalCount = Math.max(1, Number(formik.values.intervalCount) || 1);
  const intervalUnitKey = frequency === "weekly" ? "bills.intervalWeeks" : frequency === "yearly" ? "bills.intervalYears" : "bills.intervalMonths";

  return (
    <Modal isOpen={isOpen} toggle={handleClose} centered size="md">
      <ModalHeader toggle={handleClose}>{isEdit ? t("bills.editBill") : t("bills.newBill")}</ModalHeader>
      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          <Row className="g-3">
            <Col xs={12} sm={7}>
              <FormGroup className="mb-0">
                <Label className="small fw-medium">{t("common.name")} *</Label>
                <Input
                  name="name"
                  placeholder={t("bills.namePlaceholder")}
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.name && formik.errors.name)}
                />
                <FormFeedback>{formik.errors.name && t(formik.errors.name)}</FormFeedback>
              </FormGroup>
            </Col>
            <Col xs={12} sm={5}>
              <FormGroup className="mb-0">
                <Label className="small fw-medium">
                  {formik.values.isVariableAmount ? t("bills.estimatedAmount") : t("common.amount")} ({displayCurrency}) *
                </Label>
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
                <FormFeedback>{formik.errors.amount && t(formik.errors.amount)}</FormFeedback>
              </FormGroup>
            </Col>
          </Row>

          {/* Variable-amount switch — for electricity, water and friends */}
          <FormGroup switch className="mt-3 mb-0 d-flex align-items-start gap-2">
            <Input
              type="switch"
              role="switch"
              id="bill-variable-amount"
              name="isVariableAmount"
              checked={formik.values.isVariableAmount}
              onChange={formik.handleChange}
            />
            <div>
              <Label for="bill-variable-amount" className="small fw-medium mb-0" style={{ cursor: "pointer" }}>
                {t("bills.variableAmount")}
              </Label>
              <div className="text-body-secondary" style={{ fontSize: 11 }}>
                {t("bills.variableAmountHint")}
              </div>
            </div>
          </FormGroup>

          <FormGroup className="mt-3 mb-0">
            <Label className="small fw-medium">{t("common.category")} *</Label>
            <Input
              type="select"
              name="categoryId"
              value={formik.values.categoryId}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              invalid={!!(formik.touched.categoryId && formik.errors.categoryId)}
            >
              <option value="">{t("bills.selectCategory")}</option>
              {[...expenseCategories]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {categoryLabel(c.name, t)}
                  </option>
                ))}
            </Input>
            <FormFeedback>{formik.errors.categoryId && t(formik.errors.categoryId)}</FormFeedback>
          </FormGroup>

          {/* Frequency segmented control */}
          <FormGroup className="mt-3 mb-0">
            <Label className="small fw-medium d-block">{t("bills.repeats")} *</Label>
            <div className="btn-group w-100" role="group" aria-label="Frequency">
              {FREQUENCIES.map((f) => (
                <Button
                  key={f.value}
                  type="button"
                  color="primary"
                  outline={frequency !== f.value}
                  onClick={() => formik.setFieldValue("frequency", f.value)}
                >
                  {t(f.labelKey)}
                </Button>
              ))}
            </div>
          </FormGroup>

          {/* Interval — "every N months" for water/gym/Netflix style cycles */}
          <Row className="g-3 mt-0">
            <Col xs={12} sm={intervalCount > 1 ? 6 : 12}>
              <FormGroup className="mb-0">
                <Label className="small fw-medium">{t("bills.repeatEvery")}</Label>
                <div className="input-group">
                  <Input
                    type="number"
                    name="intervalCount"
                    min={1}
                    max={24}
                    step={1}
                    value={formik.values.intervalCount}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    invalid={!!(formik.touched.intervalCount && formik.errors.intervalCount)}
                  />
                  <span className="input-group-text">{t(intervalUnitKey)}</span>
                </div>
                <FormText className="small">{t("bills.intervalHint")}</FormText>
              </FormGroup>
            </Col>

            {/* Anchor only matters once a cycle spans more than one period */}
            {intervalCount > 1 && (
              <Col xs={12} sm={6}>
                <FormGroup className="mb-0">
                  <Label className="small fw-medium">{t("bills.startingFrom")}</Label>
                  <Input type="month" name="anchorMonth" value={formik.values.anchorMonth} onChange={formik.handleChange} />
                  <FormText className="small">{t("bills.startingFromHint")}</FormText>
                </FormGroup>
              </Col>
            )}
          </Row>

          {/* Due-date hint — depends on frequency */}
          <Row className="g-3 mt-0">
            {frequency === "weekly" && (
              <Col xs={12}>
                <FormGroup className="mb-0">
                  <Label className="small fw-medium">{t("bills.expectedWeekday")}</Label>
                  <Input type="select" name="dueDay" value={formik.values.dueDay} onChange={formik.handleChange}>
                    <option value="">—</option>
                    {weekdays.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
            )}

            {frequency === "monthly" && (
              <Col xs={12}>
                <FormGroup className="mb-0">
                  <Label className="small fw-medium">{t("bills.expectedDayOfMonth")}</Label>
                  <Input type="number" name="dueDay" min={1} max={31} placeholder="e.g. 1" value={formik.values.dueDay} onChange={formik.handleChange} />
                  <FormText className="small">{t("bills.monthlyHint")}</FormText>
                </FormGroup>
              </Col>
            )}

            {frequency === "yearly" && (
              <>
                <Col xs={7}>
                  <FormGroup className="mb-0">
                    <Label className="small fw-medium">{t("bills.expectedMonth")}</Label>
                    <Input type="select" name="dueMonth" value={formik.values.dueMonth} onChange={formik.handleChange}>
                      <option value="">—</option>
                      {months.map((m, i) => (
                        <option key={m} value={i}>
                          {m}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col xs={5}>
                  <FormGroup className="mb-0">
                    <Label className="small fw-medium">{t("bills.day")}</Label>
                    <Input type="number" name="dueDay" min={1} max={31} placeholder="1" value={formik.values.dueDay} onChange={formik.handleChange} />
                  </FormGroup>
                </Col>
              </>
            )}
          </Row>

          {/* Payment window — the difference between "the bill arrived" and
              "the money must be there". A subscription stops the day it fails;
              a utility bill usually gives you weeks. Nothing else on the screen
              can tell those two apart. */}
          <FormGroup switch className="mt-3 mb-0 d-flex align-items-start gap-2">
            <Input
              type="switch"
              role="switch"
              id="bill-has-grace"
              name="hasGrace"
              checked={formik.values.hasGrace}
              onChange={(e) => {
                formik.setFieldValue("hasGrace", e.target.checked);
                if (!e.target.checked) formik.setFieldValue("graceDays", "");
              }}
            />
            <div style={{ minWidth: 0 }}>
              <Label for="bill-has-grace" className="small fw-medium mb-0" style={{ cursor: "pointer" }}>
                {t("bills.hasGrace")}
              </Label>
              <FormText className="small d-block">{t("bills.hasGraceHint")}</FormText>
            </div>
          </FormGroup>

          {formik.values.hasGrace && (
            <FormGroup className="mt-2 mb-0">
              <Label className="small fw-medium">{t("bills.graceDays")}</Label>
              <div className="input-group">
                <Input
                  type="number"
                  name="graceDays"
                  min={1}
                  max={120}
                  step={1}
                  placeholder="25"
                  value={formik.values.graceDays}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.graceDays && formik.errors.graceDays)}
                />
                <span className="input-group-text">{t("bills.daysUnit")}</span>
                <FormFeedback>{formik.errors.graceDays && t(formik.errors.graceDays)}</FormFeedback>
              </div>
              <FormText className="small">{t("bills.graceDaysHint")}</FormText>
            </FormGroup>
          )}

          <FormGroup className="mt-3 mb-0">
            <Label className="small fw-medium">{t("common.notes")}</Label>
            <Input type="textarea" name="notes" rows={2} placeholder={t("common.optionalNote")} value={formik.values.notes} onChange={formik.handleChange} onBlur={formik.handleBlur} invalid={!!(formik.touched.notes && formik.errors.notes)} />
            <FormFeedback>{formik.errors.notes && t(formik.errors.notes)}</FormFeedback>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" color="primary" disabled={formik.isSubmitting || !formik.dirty}>
            {formik.isSubmitting ? t("common.saving") : isEdit ? t("bills.saveChanges") : t("bills.addBill")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { Bill, BillFrequency, CreateBillDTO, Category } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { firestoreToDate } from "../../shared/utils/dates";

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
  categoryId: string;
  frequency: BillFrequency;
  intervalCount: number | "";
  anchorMonth: string; // "YYYY-MM" — start of the first cycle
  dueDay: number | "";
  dueMonth: number | "";
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
      categoryId: bill?.categoryId ?? "",
      frequency: bill?.frequency ?? "monthly",
      intervalCount: bill?.intervalCount ?? 1,
      anchorMonth: toMonthInput(bill?.anchorDate ? firestoreToDate(bill.anchorDate) : bill?.createdAt ? firestoreToDate(bill.createdAt) : new Date()),
      dueDay: bill?.dueDay ?? "",
      dueMonth: bill?.dueMonth ?? "",
      notes: bill?.notes ?? "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const typed = values.amount as number;
        const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
        const interval = Math.max(1, Number(values.intervalCount) || 1);
        const [anchorYear, anchorMonthNum] = values.anchorMonth.split("-").map(Number);

        const data: CreateBillDTO = {
          name: values.name.trim(),
          amount: amountInBase,
          categoryId: values.categoryId,
          frequency: values.frequency,
          intervalCount: interval,
          // Only meaningful for multi-period cycles, but stored either way so the
          // bucket maths stays stable if the user later raises the interval.
          anchorDate: new Date(anchorYear, (anchorMonthNum || 1) - 1, 1),
          dueDay: values.dueDay === "" ? undefined : Number(values.dueDay),
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
    <Modal isOpen={isOpen} toggle={handleClose} size="md">
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
                <Label className="small fw-medium">{t("common.amount")} ({displayCurrency}) *</Label>
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
                    {c.icon} {c.name}
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

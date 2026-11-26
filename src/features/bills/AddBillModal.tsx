import { useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { Bill, BillFrequency, BillPause, CreateBillDTO, Category } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { firestoreToDate, dateFormat, formatMonthName } from "../../shared/utils/dates";
import { validationMessage } from "../../shared/utils/validationMessage";
import { categoryLabel } from "../../shared/utils/categories";
import { chargedShare, installmentIntervalOptions, monthlyEquivalent } from "./billsUtils";
import { DateField } from "../../shared/components/DateField";
import { parseISOMonth } from "../../shared/utils/dates";
import { FORM_MODAL, moneyToneHead } from "../../shared/components/formModal";
import { DialogFooter } from "../../shared/components/DialogFooter";
import { YesNoChoice } from "../../shared/components/YesNoChoice";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { EveryPicker } from "../../shared/components/EveryPicker";
import { DayPicker } from "../../shared/components/DayPicker";
import wiz from "../../shared/css/Wizard.module.css";
import { useAuth } from "../../shared/hooks/useAuth";
import { useCachedList } from "../../shared/hooks/useCachedList";
import { matchNameIn } from "../../shared/utils/nameMatch";
import { NameCheck } from "../../shared/components/NameCheck";
import { billKeys } from "./billCache";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { useFormChanged } from "../../shared/hooks/useFormChanged";
import { UnchangedHint } from "../../shared/components/UnchangedHint";
import { sameValues } from "../../shared/utils/sameValues";

const FREQUENCIES: { value: BillFrequency; labelKey: string }[] = [
  { value: "weekly", labelKey: "bills.weekly" },
  { value: "monthly", labelKey: "bills.monthly" },
  { value: "yearly", labelKey: "bills.yearly" },
];

/** What the bill is, what it costs, when it falls, its exceptions — then the check. */
const BILL_STEPS = ["what", "amount", "when", "extras", "review"] as const;
type Step = (typeof BILL_STEPS)[number];

/** Weekday and month names in the active locale. */
function useDateNames(locale: string) {
  const weekdays = Array.from({ length: 7 }, (_, d) => dateFormat("weekday", locale).format(new Date(2024, 0, 7 + d)));
  // A list of months names them; it does not date anything with them.
  const months = Array.from({ length: 12 }, (_, m) => formatMonthName(new Date(2020, m, 1), locale));
  return { weekdays, months };
}

interface BillFormValues {
  name: string;
  amount: number | "";
  /**
   * The four yes / no questions (variable amount, payment window, pause,
   * active): undefined until answered — a new bill starts on «Ναι» for all four
   * (owner, 2026-11-12: a yes / no starts on «Ναι»); an edit shows what is stored.
   */
  isVariableAmount: boolean | undefined;
  categoryId: string;
  frequency: BillFrequency;
  intervalCount: number | "";
  installmentCount: number | "";
  installmentIntervalMonths: number | "";
  anchorMonth: string; // "YYYY-MM" — start of the first cycle
  /** "YYYY-MM", or "" — the first month it is charged. See `Bill.startsOn`. */
  startsOn: string;
  dueDay: number | "";
  dueMonth: number | "";
  hasGrace: boolean | undefined;
  graceDays: number | "";
  /** The bill stops for a while — see `BillPause`. */
  hasPause: boolean | undefined;
  /** Comes back after a stretch, or does not come back. */
  pauseKind: "stretch" | "forever";
  pauseFrom: string; // "YYYY-MM"
  pauseTo: string; // "YYYY-MM"
  pauseYearly: boolean;
  notes: string;
  /** Off: kept in the list, counted nowhere. */
  isActive: boolean | undefined;
}

/** The fields each step asks, for stopping a jump at the first step with something wrong. */
const STEP_FIELDS: Record<Step, (keyof BillFormValues)[]> = {
  what: ["name", "isActive"],
  amount: ["amount", "categoryId", "isVariableAmount"],
  when: ["intervalCount", "installmentCount"],
  extras: ["hasGrace", "graceDays", "hasPause", "pauseFrom", "pauseTo", "notes"],
  review: [],
};

const toMonthInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * The pause the form currently describes, or undefined when it does not
 * describe a whole one yet. Built with no undefined keys, since Firestore
 * refuses those even inside a nested object.
 */
function pauseFromValues(values: Pick<BillFormValues, "hasPause" | "pauseKind" | "pauseFrom" | "pauseTo" | "pauseYearly">): BillPause | undefined {
  if (!values.hasPause || !parseISOMonth(values.pauseFrom)) return undefined;
  if (values.pauseKind === "forever") return { from: values.pauseFrom };
  if (!parseISOMonth(values.pauseTo)) return undefined;
  return values.pauseYearly ? { from: values.pauseFrom, to: values.pauseTo, yearly: true } : { from: values.pauseFrom, to: values.pauseTo };
}

/**
 * What an edit would save, for «No change, no Save» (`useFormChanged`): an
 * answer a «no» hides does not count (a pause typed and then switched off
 * again is no change), and a window of 0 days is no window.
 */
const billComparable = (v: BillFormValues) => ({
  name: v.name,
  amount: v.amount,
  isVariableAmount: v.isVariableAmount,
  categoryId: v.categoryId,
  frequency: v.frequency,
  intervalCount: v.intervalCount,
  installmentCount: v.installmentCount,
  installmentIntervalMonths: v.installmentIntervalMonths,
  anchorMonth: v.anchorMonth,
  startsOn: v.startsOn,
  dueDay: v.dueDay,
  dueMonth: v.frequency === "yearly" ? v.dueMonth : "",
  graceDays: v.hasGrace && v.graceDays !== "" ? Number(v.graceDays) : 0,
  pause: pauseFromValues(v) ?? null,
  notes: v.notes,
  isActive: v.isActive,
});

interface AddBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  bill?: Bill | null; // present when editing
  onSubmit: (data: CreateBillDTO) => Promise<void>;
  /** On an edit: delete, far left in the footer (opens the page's own confirm). */
  onDelete?: () => void;
  deleteLocked?: boolean;
  deleteReason?: string;
}

export default function AddBillModal({ isOpen, onClose, categories, bill, onSubmit, onDelete, deleteLocked, deleteReason }: AddBillModalProps) {
  const { t, i18n } = useTranslation();
  const { convertToBase, convert, baseCurrency, displayCurrency, format: formatCurrency } = useCurrencyConverter();
  const isEdit = !!bill;
  const { weekdays, months } = useDateNames(i18n.resolvedLanguage ?? "en");

  // Messages are i18n keys ("key|count" for counted ones); FormFeedback
  // translates them at render time through validationMessage.
  const validationSchema = useMemo(
    () =>
      Yup.object({
        name: Yup.string().required("validation.nameRequired").max(40, "validation.maxChars|40"),
        amount: Yup.number()
          .typeError("validation.amountNumber")
          .required("validation.amountRequired")
          .positive("validation.amountPositive")
          .max(1_000_000, "validation.amountTooLarge"),
        categoryId: Yup.string().required("validation.categoryRequired"),
        isVariableAmount: Yup.boolean().required("validation.answerYesNo"),
        hasGrace: Yup.boolean().required("validation.answerYesNo"),
        hasPause: Yup.boolean().required("validation.answerYesNo"),
        isActive: Yup.boolean().required("validation.answerYesNo"),
        frequency: Yup.mixed<BillFrequency>().oneOf(["weekly", "monthly", "yearly"]).required(),
        graceDays: Yup.number().when("hasGrace", {
          is: true,
          then: (schema) => schema.typeError("validation.mustBeNumber").min(1, "validation.graceMin").max(120, "validation.graceMax").required("validation.required"),
          otherwise: (schema) => schema.notRequired(),
        }),
        intervalCount: Yup.number().typeError("validation.mustBeNumber").min(1, "validation.intervalMin").max(24, "validation.intervalMax").required("validation.required"),
        installmentCount: Yup.number().typeError("validation.mustBeNumber").min(1, "validation.installmentMin").max(12, "validation.installmentMax").required("validation.required"),
        notes: Yup.string().max(200, "validation.maxChars|200"),
        pauseFrom: Yup.string().when("hasPause", {
          is: true,
          then: (schema) => schema.required("validation.required"),
        }),
        pauseTo: Yup.string().when(["hasPause", "pauseKind"], {
          is: (hasPause: boolean, kind: string) => hasPause && kind === "stretch",
          then: (schema) =>
            schema
              .required("validation.pauseToRequired")
              // A yearly pause wraps the new year — November to March — so only
              // a one-off stretch can end before it starts.
              .test("after-start", "validation.pauseEndBeforeStart", function (value) {
                const { pauseFrom, pauseYearly } = this.parent as BillFormValues;
                const from = parseISOMonth(pauseFrom ?? "");
                const to = parseISOMonth(value ?? "");
                return pauseYearly || !from || !to || to >= from;
              }),
        }),
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
      // A new bill's yes / no answers start on «Ναι» (owner, 2026-11-12); an edit shows what is stored.
      isVariableAmount: bill ? !!bill.isVariableAmount : true,
      categoryId: bill?.categoryId ?? "",
      frequency: bill?.frequency ?? "monthly",
      intervalCount: bill?.intervalCount ?? 1,
      installmentCount: bill?.installmentCount ?? 1,
      installmentIntervalMonths: bill?.installmentIntervalMonths ?? 1,
      anchorMonth: toMonthInput(bill?.anchorDate ? firestoreToDate(bill.anchorDate) : bill?.createdAt ? firestoreToDate(bill.createdAt) : new Date()),
      startsOn: bill?.startsOn ?? "",
      dueDay: bill?.dueDay ?? "",
      dueMonth: bill?.dueMonth ?? "",
      hasGrace: bill ? (bill.graceDays ?? 0) > 0 : true,
      graceDays: bill?.graceDays ?? "",
      hasPause: bill ? !!bill.pause : true,
      pauseKind: bill?.pause && !bill.pause.to ? "forever" : "stretch",
      // Next month by default: a pause is almost always decided ahead of the
      // month it starts in.
      pauseFrom: bill?.pause?.from ?? toMonthInput(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)),
      pauseTo: bill?.pause?.to ?? "",
      pauseYearly: bill?.pause?.yearly ?? false,
      notes: bill?.notes ?? "",
      isActive: bill ? bill.isActive !== false : true,
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      // An edit with nothing changed writes nothing (and says nothing).
      if (isEdit && sameValues(billComparable(formik.initialValues), billComparable(values))) return;
      try {
        const typed = values.amount as number;
        const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
        const interval = Math.max(1, Number(values.intervalCount) || 1);
        // A plain monthly bill has no room to spread instalments over, so the
        // field is hidden there and must not leak a stale value into the save.
        const installments = canSplit ? Math.max(1, Number(values.installmentCount) || 1) : 1;
        // Clamped to a spacing the period can actually hold: three instalments
        // every six months would put the last one inside the following year.
        const spacingChoices = installmentIntervalOptions({ frequency: values.frequency, intervalCount: interval, installmentCount: installments });
        const rawSpacing = Number(values.installmentIntervalMonths) || 1;
        const spacing = installments > 1 && spacingChoices.includes(rawSpacing) ? rawSpacing : 1;

        // A cleared month input yields NaN, which would become an Invalid Date
        // and be rejected by Firestore — fall back to the current month.
        const [rawYear, rawMonth] = values.anchorMonth.split("-").map(Number);
        const now = new Date();
        const anchorYear = Number.isFinite(rawYear) ? rawYear : now.getFullYear();
        const anchorMonthIndex = Number.isFinite(rawMonth) ? Math.min(Math.max(rawMonth, 1), 12) - 1 : now.getMonth();

        const data: CreateBillDTO = {
          name: values.name.trim(),
          amount: amountInBase,
          isVariableAmount: !!values.isVariableAmount,
          categoryId: values.categoryId,
          frequency: values.frequency,
          intervalCount: interval,
          installmentCount: installments,
          installmentIntervalMonths: spacing,
          // Only meaningful for multi-period cycles, but stored either way so the
          // bucket maths stays stable if the user later raises the interval.
          anchorDate: new Date(anchorYear, anchorMonthIndex, 1),
          dueDay: values.dueDay === "" ? undefined : Number(values.dueDay),
          // 0 and "no grace" are the same thing to every consumer, so the flag
          // never has to be stored alongside the number.
          graceDays: values.hasGrace && values.graceDays !== "" ? Number(values.graceDays) : 0,
          // On an edit, an empty optional field is said out loud as `null`, so the
          // stored value is taken off rather than kept (see `updateBill`).
          dueMonth: values.frequency === "yearly" && values.dueMonth !== "" ? Number(values.dueMonth) : isEdit ? null : undefined,
          notes: values.notes.trim() || (isEdit ? null : undefined),
          // Switched off on an edit means "remove it", which has to be said out
          // loud: an absent field would leave the old pause where it was.
          pause: pauseFromValues(values) ?? (isEdit ? null : undefined),
          // Cleared on an edit is "starts as before", said out loud like the pause.
          startsOn: parseISOMonth(values.startsOn) ? values.startsOn : isEdit ? null : undefined,
          isActive: values.isActive !== false,
        };
        await onSubmit(data);
        resetForm();
        onClose();
      } catch (err) {
        console.error("AddBillModal submit error:", err);
      }
    },
  });

  const { unchanged } = useFormChanged(isEdit ? formik.initialValues : undefined, formik.values, billComparable);

  const handleClose = () => {
    formik.resetForm();
    onClose();
  };

  // ── The steps ─────────────────────────────────────────────────────────────
  // One topic a step; forward only as far as what is filled in allows (an
  // edit's rail is open, but a jump still stops at a step with something
  // wrong on it); back is always free. Opened again, it starts at the first.
  const [step, setStep] = useState<Step>("what");
  useEffect(() => {
    if (isOpen) setStep("what");
  }, [isOpen]);
  const index = BILL_STEPS.indexOf(step);
  // Another bill's name is refused (two «ΔΕΗ» rows read as one paid twice);
  // a similar one is only pointed out. From the list the page holds: no read.
  const { currentUser } = useAuth();
  const otherBillNames = useCachedList<Bill>(billKeys.all(currentUser?.uid ?? ""))
    .filter((b) => b.id !== bill?.id)
    .map((b) => b.name);
  const nameMatch = matchNameIn(formik.values.name, otherBillNames);
  const goTo = async (target: Step) => {
    const to = BILL_STEPS.indexOf(target);
    if (to > 0 && nameMatch?.kind === "same") {
      void formik.setFieldTouched("name", true, false);
      setStep("what");
      return;
    }
    if (to > 0) {
      const errors = await formik.validateForm();
      for (const s of BILL_STEPS.slice(0, to)) {
        const bad = STEP_FIELDS[s].filter((field) => errors[field]);
        if (bad.length > 0) {
          void formik.setTouched({ ...formik.touched, ...Object.fromEntries(bad.map((field) => [field, true])) }, false);
          setStep(s);
          return;
        }
      }
    }
    setStep(target);
  };

  const { frequency } = formik.values;
  /** A yes / no question left unanswered: said only once Next was pressed on its step. */
  const yesNoError = (key: "isActive" | "isVariableAmount" | "hasGrace" | "hasPause") =>
    formik.touched[key] && formik.errors[key] ? <div className="invalid-feedback d-block">{validationMessage(formik.errors[key], t)}</div> : null;
  const intervalCount = Math.max(1, Number(formik.values.intervalCount) || 1);
  // Instalments only make sense when a period is long enough to spread them
  // across: a yearly bill, or a cycle of several months. Offering them on a
  // monthly bill would just be a second, worse way of saying "monthly".
  const canSplit = formik.values.frequency === "yearly" || (formik.values.frequency === "monthly" && intervalCount > 1);
  const installmentCount = Math.max(1, Number(formik.values.installmentCount) || 1);
  const spacingOptions = installmentIntervalOptions({ frequency: formik.values.frequency, intervalCount, installmentCount });
  const spacing = spacingOptions.includes(Number(formik.values.installmentIntervalMonths)) ? Number(formik.values.installmentIntervalMonths) : 1;
  const intervalUnitKey = frequency === "weekly" ? "bills.intervalWeeks" : frequency === "yearly" ? "bills.intervalYears" : "bills.intervalMonths";

  // What the pause will do, in words, before it is saved. Worked out with the
  // same functions the list uses afterwards, so the promise and the result are
  // one calculation rather than two that could drift.
  const draftPause = pauseFromValues(formik.values);
  const pausePreview = (() => {
    if (!draftPause) return undefined;
    if (!draftPause.to) return t("bills.pausePreviewForever");
    if (!draftPause.yearly) {
      const from = parseISOMonth(draftPause.from)!;
      const to = parseISOMonth(draftPause.to)!;
      const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
      return months > 0 ? t("bills.pausePreviewStretch", { count: months }) : undefined;
    }

    const typed = Number(formik.values.amount);
    if (!Number.isFinite(typed) || typed <= 0) return t("bills.pausePreviewYearlyNoAmount");
    const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
    const [year, month] = formik.values.anchorMonth.split("-").map(Number);
    const draft = {
      amount: amountInBase,
      frequency,
      intervalCount,
      dueDay: formik.values.dueDay === "" ? undefined : Number(formik.values.dueDay),
      dueMonth: formik.values.dueMonth === "" ? undefined : Number(formik.values.dueMonth),
      anchorDate: Number.isFinite(year) && Number.isFinite(month) ? new Date(year, month - 1, 1) : new Date(),
      createdAt: new Date(),
      pause: draftPause,
    } as Bill;
    const full = monthlyEquivalent(draft);
    return t("bills.pausePreviewYearly", { average: formatCurrency(full * chargedShare(draft)), full: formatCurrency(full) });
  })();

  // ── The check: every answer, each row a way back to its step ──────────────
  const lang = i18n.resolvedLanguage ?? "en";
  const monthFmt = dateFormat("monthYearShort", lang);
  const monthText = (value: string) => {
    const month = parseISOMonth(value);
    return month ? monthFmt.format(month) : "—";
  };
  const typedAmount = Number(formik.values.amount);
  const amountText = Number.isFinite(typedAmount) && typedAmount > 0 ? formatCurrency(baseCurrency === displayCurrency ? typedAmount : convertToBase(typedAmount)) : "—";
  const categoryName = (() => {
    const c = expenseCategories.find((x) => x.id === formik.values.categoryId);
    return c ? `${c.icon ?? ""} ${categoryLabel(c.name, t)}`.trim() : "—";
  })();
  const dueText = (() => {
    const { dueDay, dueMonth } = formik.values;
    if (dueDay === "") return "—";
    if (frequency === "weekly") return weekdays[Number(dueDay)] ?? "—";
    if (frequency === "yearly") return dueMonth === "" ? t("bills.wizard.dueDay", { day: dueDay }) : `${dueDay} ${months[Number(dueMonth)]}`;
    return t("bills.wizard.dueDay", { day: dueDay });
  })();
  const pauseText = (() => {
    if (!formik.values.hasPause) return t("common.no");
    if (formik.values.pauseKind === "forever") return t("bills.wizard.pauseForever", { from: monthText(formik.values.pauseFrom) });
    const range = `${monthText(formik.values.pauseFrom)} – ${monthText(formik.values.pauseTo)}`;
    return formik.values.pauseYearly ? `${range} · ${t("bills.wizard.everyYear")}` : range;
  })();
  const reviewRows: { step: Step; label: string; value: string }[] = [
    { step: "what", label: t("common.name"), value: formik.values.name.trim() || "—" },
    { step: "what", label: t("bills.activeSwitch"), value: t(formik.values.isActive ? "common.yes" : "common.no") },
    { step: "amount", label: t("common.amount"), value: `${formik.values.isVariableAmount ? "≈ " : ""}${amountText} · ${t(formik.values.isVariableAmount ? "bills.wizard.variable" : "bills.wizard.fixed")}` },
    { step: "amount", label: t("common.category"), value: categoryName },
    {
      step: "when",
      label: t("bills.repeats"),
      value: intervalCount > 1 ? `${t(FREQUENCIES.find((x) => x.value === frequency)!.labelKey)} · ${t("bills.wizard.every", { count: intervalCount, unit: t(intervalUnitKey, { count: intervalCount }) })}` : t(FREQUENCIES.find((x) => x.value === frequency)!.labelKey),
    },
    ...(intervalCount > 1 ? [{ step: "when" as Step, label: t("bills.startingFrom"), value: monthText(formik.values.anchorMonth) }] : []),
    { step: "when", label: t("bills.wizard.due"), value: dueText },
    { step: "when", label: t("bills.startsOn"), value: formik.values.startsOn ? monthText(formik.values.startsOn) : "—" },
    ...(canSplit
      ? [
          {
            step: "when" as Step,
            label: t("bills.installments"),
            value: installmentCount > 1 ? t("bills.wizard.installments", { count: installmentCount, months: spacing }) : t("bills.wizard.oneGo"),
          },
        ]
      : []),
    { step: "extras", label: t("bills.hasGrace"), value: formik.values.hasGrace && formik.values.graceDays !== "" ? t("bills.wizard.graceDays", { count: Number(formik.values.graceDays) }) : t("common.no") },
    { step: "extras", label: t("bills.hasPause"), value: pauseText },
    { step: "extras", label: t("common.notes"), value: formik.values.notes.trim() || "—" },
  ];

  return (
    <Modal {...FORM_MODAL} isOpen={isOpen} toggle={handleClose} centered scrollable>
      {/* A bill is money going out: the red tone rides on the HEADER (rule 15a),
          not over the body, where the figures are. */}
      <ModalHeader className={moneyToneHead("expense")} toggle={handleClose}>
        {isEdit ? t("bills.editBill") : t("bills.newBill")}
      </ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") void formik.submitForm();
          else void goTo(BILL_STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={BILL_STEPS} current={step} onGo={(target) => void goTo(target)} label={(s) => t(`bills.wizard.step_${s}`)} open={isEdit} large />
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }}>
            {t(`bills.wizard.title_${step}`)}
          </div>

          {step === "what" && (
            <>
              <FormGroup>
                <Label className="small fw-medium" for="bill-name">
                  {t("common.name")}
                  <RequiredMark />
                </Label>
                <Input
                  id="bill-name"
                  aria-required
                  name="name"
                  placeholder={t("bills.namePlaceholder")}
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.name && formik.errors.name)}
                />
                <FormFeedback>{validationMessage(formik.errors.name, t)}</FormFeedback>
                <NameCheck match={nameMatch?.kind === "same" && !formik.touched.name ? null : nameMatch} />
              </FormGroup>
              <YesNoChoice className="mb-0" required question={t("bills.qActive")} questionHint={t("bills.activeSwitchHint")} value={formik.values.isActive} onChange={(yes) => formik.setFieldValue("isActive", yes)} />
              {yesNoError("isActive")}
            </>
          )}

          {step === "amount" && (
            <>
              {/* The amount and its category on one row, half each: at 320px a
                  5/12 column broke «Εκτιμώμενο ποσό» onto two lines and left
                  the number beside its «€» cell too little room. */}
              <Row className="g-2 mb-3">
                <Col xs={6}>
                  <FormGroup className="mb-0">
                    <Label className="small fw-medium" for="bill-amount">
                      {formik.values.isVariableAmount ? t("bills.estimatedAmount") : t("common.amount")}
                      <RequiredMark />
                    </Label>
                    {/* Stored as Formik's handleChange stores a number box: "" or a number. */}
                    <MoneyInput
                      id="bill-amount"
                      required
                      name="amount"
                      value={formik.values.amount}
                      onChange={(v) => formik.setFieldValue("amount", v === "" ? "" : Number(v))}
                      onBlur={() => formik.setFieldTouched("amount", true)}
                      invalid={!!(formik.touched.amount && formik.errors.amount)}
                    >
                      <FormFeedback>{validationMessage(formik.errors.amount, t)}</FormFeedback>
                    </MoneyInput>
                  </FormGroup>
                </Col>
                <Col xs={6}>
                  <FormGroup className="mb-0">
                    <Label className="small fw-medium" for="bill-category">
                      {t("common.category")}
                      <RequiredMark />
                    </Label>
                    <Input
                      id="bill-category"
                      aria-required
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
                    <FormFeedback>{validationMessage(formik.errors.categoryId, t)}</FormFeedback>
                  </FormGroup>
                </Col>
              </Row>
              {/* A changing amount — for electricity, water and friends. «Ναι» needs
                  nothing more: the amount above becomes the estimate. */}
              <YesNoChoice
                className="mb-0"
                required
                question={t("bills.qVariable")}
                questionHint={t("bills.variableAmountHint")}
                value={formik.values.isVariableAmount}
                onChange={(yes) => formik.setFieldValue("isVariableAmount", yes)}
              />
              {yesNoError("isVariableAmount")}

            </>
          )}

          {step === "when" && (
            <>
              {/* «Κάθε πότε»: a number and a unit, both from lists, on one row. */}
              <FormGroup className="mb-0">
                <EveryPicker
                  id="bill-every"
                  required
                  label={t("bills.wizard.everyLabel")}
                  unitAria={t("bills.wizard.everyUnit")}
                  unit={frequency}
                  count={intervalCount}
                  unitText={(u, n) => t(u === "weekly" ? "bills.intervalWeeks" : u === "yearly" ? "bills.intervalYears" : "bills.intervalMonths", { count: n })}
                  onChange={(u, n) => {
                    void formik.setFieldValue("frequency", u);
                    void formik.setFieldValue("intervalCount", n);
                  }}
                  invalid={!!(formik.touched.intervalCount && formik.errors.intervalCount)}
                />
                <FormText className="small">{t("bills.intervalHint")}</FormText>
              </FormGroup>

              <Row className="g-3 mt-0">
                {/* Anchor only matters once a cycle spans more than one period */}
                {intervalCount > 1 && (
                  <Col xs={12}>
                    <FormGroup className="mb-0">
                      <Label className="small fw-medium" for="bill-anchor-month">
                        {t("bills.startingFrom")}
                      </Label>
                      {/* The app's own calendar in month mode, like every other date
                          field — not the browser's month picker, which looks and
                          opens differently on every phone. Same "YYYY-MM" value. */}
                      <DateField month id="bill-anchor-month" name="anchorMonth" value={formik.values.anchorMonth} onChange={(value) => formik.setFieldValue("anchorMonth", value)} />
                      <FormText className="small">{t("bills.startingFromHint")}</FormText>
                    </FormGroup>
                  </Col>
                )}
              </Row>

              {/* A bill that begins later — a tax from next year: nothing before it is owed. */}
              <FormGroup className="mt-3 mb-0">
                <Label className="small fw-medium" for="bill-starts-on">
                  {t("bills.startsOn")}
                </Label>
                <DateField month clearable id="bill-starts-on" name="startsOn" value={formik.values.startsOn} onChange={(value) => formik.setFieldValue("startsOn", value ?? "")} placeholder={t("bills.startsOnPlaceholder")} />
                <FormText className="small">{t("bills.startsOnHint")}</FormText>
              </FormGroup>

              {/* Instalments — a gym year of 360 taken as three monthly payments */}
              {canSplit && (
                <Row className="g-3 mt-0">
                  <Col xs={12} sm={installmentCount > 1 && spacingOptions.length > 1 ? 6 : 12}>
                    <FormGroup className="mb-0">
                      <Label className="small fw-medium">
                        {t("bills.installments")}
                        <RequiredMark />
                      </Label>
                      <div className="input-group">
                        <Input
                          type="number"
                          name="installmentCount"
                          aria-required
                          min={1}
                          max={12}
                          step={1}
                          value={formik.values.installmentCount}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.installmentCount && formik.errors.installmentCount)}
                        />
                        <span className="input-group-text">{t("bills.installmentsUnit")}</span>
                      </div>
                      <FormText className="small">
                        {installmentCount > 1 && Number(formik.values.amount) > 0
                          ? t(spacing > 1 ? "bills.installmentSplitEvery" : "bills.installmentSplit", {
                              count: installmentCount,
                              amount: formatCurrency(Number(formik.values.amount) / installmentCount),
                              months: spacing,
                            })
                          : t("bills.installmentsHint")}
                      </FormText>
                    </FormGroup>
                  </Col>

                  {/* Monthly is usual but not universal — insurance is routinely
                      taken quarterly. Only spacings the period can hold are offered. */}
                  {installmentCount > 1 && spacingOptions.length > 1 && (
                    <Col xs={12} sm={6}>
                      <FormGroup className="mb-0">
                        <Label className="small fw-medium">{t("bills.installmentEvery")}</Label>
                        <Input type="select" name="installmentIntervalMonths" value={spacing} onChange={formik.handleChange}>
                          {spacingOptions.map((option) => (
                            <option key={option} value={option}>
                              {t("bills.installmentEveryOption", { count: option })}
                            </option>
                          ))}
                        </Input>
                        <FormText className="small">{t("bills.installmentEveryHint")}</FormText>
                      </FormGroup>
                    </Col>
                  )}
                </Row>
              )}

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
                      <Label className="small fw-medium" id="bill-due-day-label">{t("bills.expectedDayOfMonth")}</Label>
                      <DayPicker id="bill-due-day" aria-labelledby="bill-due-day-label bill-due-day" clearable value={formik.values.dueDay} onChange={(v) => formik.setFieldValue("dueDay", v === "" ? "" : Number(v))} />
                      <FormText className="small">{t("bills.wizard.lastDayHint")}</FormText>
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
                        <Label className="small fw-medium" id="bill-due-yday-label">{t("bills.day")}</Label>
                        <DayPicker id="bill-due-yday" aria-labelledby="bill-due-yday-label bill-due-yday" clearable value={formik.values.dueDay} onChange={(v) => formik.setFieldValue("dueDay", v === "" ? "" : Number(v))} />
                      </FormGroup>
                    </Col>
                  </>
                )}
              </Row>

            </>
          )}

          {step === "extras" && (
            <>
              {/* Payment window — the difference between "the bill arrived" and
                  "the money must be there". A subscription stops the day it fails;
                  a utility bill usually gives you weeks. Nothing else on the screen
                  can tell those two apart. */}
              <YesNoChoice
                className="mb-0"
                required
                question={t("bills.qGrace")}
                questionHint={t("bills.hasGraceHint")}
                value={formik.values.hasGrace}
                onChange={(yes) => {
                  formik.setFieldValue("hasGrace", yes);
                  if (!yes) formik.setFieldValue("graceDays", "");
                }}
              >
                <FormGroup className="mb-0">
                  <Label className="small fw-medium">
                    {t("bills.graceDays")}
                    <RequiredMark />
                  </Label>
                  <div className="input-group">
                    <Input
                      type="number"
                      name="graceDays"
                      aria-required
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
                    <FormFeedback>{validationMessage(formik.errors.graceDays, t)}</FormFeedback>
                  </div>
                  <FormText className="small">{t("bills.graceDaysHint")}</FormText>
                </FormGroup>
              </YesNoChoice>
              {yesNoError("hasGrace")}

              {/* A stop — the holiday house over the winter, the flat that was
                  left. Same yes-and-reveal as the payment window above, so the
                  form keeps one way of saying "this bill has an exception". */}
              <YesNoChoice className="mt-3 mb-0" required question={t("bills.qPause")} questionHint={t("bills.hasPauseHint")} value={formik.values.hasPause} onChange={(yes) => formik.setFieldValue("hasPause", yes)}>
                <div>
                  {/* Chosen before the dates, because it decides which dates there are. */}
                  <FormGroup check className="mb-1">
                    <Input type="radio" id="pause-stretch" name="pauseKind" value="stretch" checked={formik.values.pauseKind === "stretch"} onChange={() => formik.setFieldValue("pauseKind", "stretch")} />
                    <Label check for="pause-stretch" className="small">
                      {t("bills.pauseStretch")}
                    </Label>
                  </FormGroup>
                  <FormGroup check className="mb-2">
                    <Input type="radio" id="pause-forever" name="pauseKind" value="forever" checked={formik.values.pauseKind === "forever"} onChange={() => formik.setFieldValue("pauseKind", "forever")} />
                    <Label check for="pause-forever" className="small">
                      {t("bills.pauseForever")}
                    </Label>
                  </FormGroup>

                  <Row className="g-2">
                    <Col xs={formik.values.pauseKind === "stretch" ? 6 : 12}>
                      <FormGroup className="mb-0">
                        <Label className="small fw-medium">
                          {t("bills.pauseFrom")}
                          <RequiredMark />
                        </Label>
                        <DateField
                          month
                          small
                          name="pauseFrom"
                          value={formik.values.pauseFrom}
                          onChange={(value) => formik.setFieldValue("pauseFrom", value)}
                          invalid={!!(formik.touched.pauseFrom && formik.errors.pauseFrom)}
                        />
                        {formik.touched.pauseFrom && formik.errors.pauseFrom && <div className="invalid-feedback d-block">{t(formik.errors.pauseFrom)}</div>}
                      </FormGroup>
                    </Col>
                    {formik.values.pauseKind === "stretch" && (
                      <Col xs={6}>
                        <FormGroup className="mb-0">
                          <Label className="small fw-medium">
                            {t("bills.pauseTo")}
                            <RequiredMark />
                          </Label>
                          <DateField
                            month
                            small
                            name="pauseTo"
                            value={formik.values.pauseTo}
                            onChange={(value) => {
                              formik.setFieldValue("pauseTo", value);
                              formik.setFieldTouched("pauseTo", true, false);
                            }}
                            invalid={!!(formik.touched.pauseTo && formik.errors.pauseTo)}
                          />
                          {formik.touched.pauseTo && formik.errors.pauseTo && <div className="invalid-feedback d-block">{t(formik.errors.pauseTo)}</div>}
                        </FormGroup>
                      </Col>
                    )}
                  </Row>

                  {formik.values.pauseKind === "stretch" && (
                    <FormGroup check className="mt-2 mb-0">
                      <Input type="checkbox" id="pause-yearly" name="pauseYearly" checked={formik.values.pauseYearly} onChange={(e) => formik.setFieldValue("pauseYearly", e.target.checked)} />
                      <Label check for="pause-yearly" className="small">
                        {t("bills.pauseYearly")}
                      </Label>
                    </FormGroup>
                  )}

                  {pausePreview && (
                    <p className="small text-body-secondary mb-0 mt-2 px-2 py-2 rounded" style={{ background: "var(--color-background-secondary)" }}>
                      {pausePreview}
                    </p>
                  )}
                </div>
              </YesNoChoice>
              {yesNoError("hasPause")}

              <FormGroup className="mt-3 mb-0">
                <Label className="small fw-medium">{t("common.notes")}</Label>
                <Input type="textarea" name="notes" rows={2} placeholder={t("common.optionalNote")} value={formik.values.notes} onChange={formik.handleChange} onBlur={formik.handleBlur} invalid={!!(formik.touched.notes && formik.errors.notes)} />
                <FormFeedback>{validationMessage(formik.errors.notes, t)}</FormFeedback>
              </FormGroup>
            </>
          )}

          {step === "review" && (
            <div className={wiz.wizCard}>
              {reviewRows.map((row) => (
                <button key={row.label} type="button" className={wiz.wizRow} onClick={() => void goTo(row.step)}>
                  <span className={wiz.wizLabel}>{row.label}</span>
                  <span className={wiz.wizValue}>{row.value}</span>
                </button>
              ))}
            </div>
          )}
        </ModalBody>

        {/* Delete far left, a rule, then Back / Cancel; Next / Save on the right (rule 15b, `DialogFooter`). */}
        <DialogFooter
          remove={isEdit && onDelete ? <DeleteButton opensConfirm iconOnly label={t("bills.deleteBill")} onClick={onDelete} disabled={deleteLocked} title={deleteReason} /> : undefined}
          back={
            step === "what" ? (
              <Button type="button" color="secondary" outline onClick={handleClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(BILL_STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )
          }
        >
          {step === "review" ? (
            <div className="d-flex align-items-center gap-2">
              <UnchangedHint show={unchanged} />
              <Button type="submit" color="primary" disabled={formik.isSubmitting || unchanged}>
                {formik.isSubmitting ? t("common.saving") : isEdit ? t("bills.saveChanges") : t("bills.addBill")}
              </Button>
            </div>
          ) : (
            <Button type="submit" color="primary">
              {t("common.next")} ›
            </Button>
          )}
        </DialogFooter>
      </form>
    </Modal>
  );
}

import { useMemo, useState, useEffect, type ReactNode } from "react";
import { celebrateSave } from "../../../shared/feedback/saveFeedback";
import { useFormik } from "formik";
import * as Yup from "yup";
import { dayToDate, happenedDayError, NOT_IN_FUTURE, toISODay, formatRecordDay } from "../../../shared/utils/dates";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import type { Transaction, UpdateTransactionDTO, Category, FuelMetadata, FuelType } from "../../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { DateField } from "../../../shared/components/DateField";
import { validationMessage } from "../../../shared/utils/validationMessage";
import { PayeeInput } from "./PayeeInput";
import AccountPicker from "../../accounts/AccountPicker";
import ReviewCard from "../../accounts/ReviewCard";
import { useAccountList, useMoneyAccounts } from "../../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount } from "../../accounts/accountsUtils";
import { SpendNote } from "../../accounts/SpendNote";
import { useSpendCheck } from "../../accounts/useSpendCheck";
import { useStepTried } from "../../../shared/hooks/useStepTried";
import { adjustCheckInsForEdit } from "../../accounts/accountsUtils";
import { usePayees } from "../hooks/usePayees";
import { useTransactions } from "../hooks/useTransactions";
import { frequentPayees, recentPayees } from "../payeeStore";
import { FuelDetailsPanel } from "../../categories/FuelDetailsPanel";
import { formatUnitPrice, fuelTypeLabelKey, getUnitLabel } from "../../categories/fuelTypes";
import { intlLocale } from "../../../i18n";
import CategoryPicker from "../../categories/CategoryPicker";
import { categoryLabel } from "../../../shared/utils/categories";
import { TransactionReviewBody, type FuelCell } from "./TransactionReviewBody";
import { EXPENSE_COLORS, INCOME_COLORS } from "./reviewPalettes";
import { TypeBadge, WizardSteps } from "./WizardSteps";
import styles from "./css/TransactionWizard.module.css";
import { FORM_MODAL, moneyToneHead } from "../../../shared/components/formModal";
import { DialogFooter } from "../../../shared/components/DialogFooter";
import { LockNote } from "./LockNote";
import type { LockState } from "../hooks/useRecordLocks";
import { RequiredMark } from "../../../shared/components/RequiredMark";
import { useFormChanged } from "../../../shared/hooks/useFormChanged";
import { sameValues } from "../../../shared/utils/sameValues";
import { UnchangedHint } from "../../../shared/components/UnchangedHint";

// ─── Form shape ───────────────────────────────────────────────────────────────

interface EditTransactionFormValues {
  amount: number | "";
  type: "income" | "expense";
  categoryId: string;
  date: string;
  description: string;
  notes: string;
  showFuelDetails: boolean;
  fuelType: FuelType | "";
  pricePerUnit: number | "";
  quantity: number | "";
  odometer: number | "";
  place: string;
  accountId: string;
}

// The stored date as the LOCAL calendar day it falls on — the day the list
// shows. (`toISOString()` read it in UTC: a record at local midnight in Greece
// opened on the day before.)
const toDateInputValue = (value: unknown): string => (value ? toISODay(value) : "");

// ─── Steps ────────────────────────────────────────────────────────────────────

// The same wizard as adding, one step shorter. There is no "which way does the
// money go" screen here because there is no answer to give: an expense cannot
// become an income by editing, so a first step would be a question with a
// single legal answer. The type rides along as a badge instead.
const STEPS = ["category", "account", "details", "review"] as const;
type Step = (typeof STEPS)[number];

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * `storedDate` is the record's own day: kept as it is, it is never refused —
 * even when it is in the future (written before the rule); only a day picked
 * here must be today or earlier (owner, 2026-11-14).
 */
const validationSchemaFor = (storedDate: string) => Yup.object({
  amount: Yup.number().typeError("validation.amountNumber").required("validation.amountRequired").positive("validation.mustBeGreaterThanZero").max(10_000_000, "validation.amountTooLarge"),
  type: Yup.mixed<"income" | "expense">().oneOf(["income", "expense"]).required(),
  categoryId: Yup.string().required("validation.categoryRequired"),
  date: Yup.string()
    .required("validation.dateRequired")
    .test("not-future", NOT_IN_FUTURE, (v) => !v || !happenedDayError(v, new Date(), storedDate)),
  description: Yup.string().required("validation.payeeRequired").max(30, "validation.maxChars|30"),
  notes: Yup.string().max(300, "validation.maxChars|300"),
  showFuelDetails: Yup.boolean(),
  fuelType: Yup.string().when("showFuelDetails", {
    is: true,
    then: (s) => s.required("validation.fuelTypeRequired"),
    otherwise: (s) => s.optional(),
  }),
  pricePerUnit: Yup.number().when("showFuelDetails", {
    is: true,
    then: (s) => s.typeError("validation.mustBeNumber").required("validation.priceRequired").positive("validation.mustBeGreaterThanZero"),
    otherwise: (s) => s.optional(),
  }),
  quantity: Yup.number().when("showFuelDetails", {
    is: true,
    then: (s) => s.typeError("validation.mustBeNumber").required("validation.quantityRequired").positive("validation.mustBeGreaterThanZero"),
    otherwise: (s) => s.optional(),
  }),
  odometer: Yup.number().typeError("validation.mustBeNumber").min(0, "validation.mustBePositive").optional(),
  place: Yup.string().max(20, "validation.maxChars|20").optional(),
});

// ─── Review ───────────────────────────────────────────────────────────────────

function ReviewStep({ values, categories, formatAmount, currency, lead }: { values: EditTransactionFormValues; categories: Category[]; formatAmount: (n: number) => string; currency: string; lead?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const category = categories.find((c) => c.id === values.categoryId);
  const isIncome = values.type === "income";
  const colors = isIncome ? INCOME_COLORS : EXPENSE_COLORS;
  const unit = getUnitLabel(values.fuelType);
  const hasFuel = values.showFuelDetails && values.fuelType && values.pricePerUnit !== "" && values.quantity !== "";

  const fuelCells: FuelCell[] = hasFuel
    ? [
        { label: t("transactions.fuelType"),       value: values.fuelType ? t(fuelTypeLabelKey(values.fuelType)) : "—" },
        { label: t("transactions.pricePerUnitLabel", { unit }), value: values.pricePerUnit !== "" ? formatUnitPrice(Number(values.pricePerUnit), currency, intlLocale(i18n.resolvedLanguage)) : "—" },
        { label: t("transactions.quantity"),        value: values.quantity !== "" ? `${values.quantity} ${unit}` : "—" },
        ...(values.odometer !== "" ? [{ label: t("transactions.odometer"), value: `${values.odometer} km` }] : []),
        ...(values.place ? [{ label: t("transactions.place"), value: values.place }] : []),
      ]
    : [];

  return (
    <TransactionReviewBody
      subtitle={t("goals.reviewBeforeSaving")}
      description={values.description}
      categoryIcon={category?.icon ?? ""}
      categoryName={categoryLabel(category?.name, t) || "—"}
      primaryBadge={isIncome ? t("transactions.income") : t("transactions.expense")}
      colors={colors}
      amount={Number(values.amount)}
      formatAmount={formatAmount}
      dateFormatted={formatRecordDay(dayToDate(values.date), i18n.resolvedLanguage ?? "en")}
      notes={values.notes || undefined}
      fuelCells={fuelCells}
      lead={lead}
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditTransactionModalProps {
  transaction: Transaction;
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (transactionId: string, data: UpdateTransactionDTO) => Promise<void>;
  /**
   * Half of a linked set — see `useRecordLocks`. The expense of a goal a friend
   * paid keeps its amount, date, card and type from the debt: only the payee
   * (when the debt names the expense), the category and the notes change here.
   */
  lock?: LockState;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditTransactionModal({ transaction, isOpen, onClose, categories, onSubmit, lock }: EditTransactionModalProps) {
  const [step, setStep] = useState<Step>("category");
  const { t } = useTranslation();
  const { payees } = usePayees();
  // Already in the cache from the page behind the form — no extra read.
  const { data: history = [] } = useTransactions();
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  // An edit is read as a correction of the money too: 100 made 80 gives the
  // card 20 back, even past a bank reading — see `adjustCheckInsForEdit`.
  const { accounts: moneyAccounts, checkIns, setCheckIns } = useMoneyAccounts();
  const [adjustReading, setAdjustReading] = useState(true);
  // The card step is there only when there are cards on the Banks & cash page.
  const accounts = useAccountList();
  const covered = lock?.lock?.kind === "covered" ? lock.lock : undefined;
  // Not known yet whether the debts hold this one: nothing is saved until it is.
  const checking = !!lock?.pending;
  const withCards = accounts.length > 0 && !covered;
  const steps: readonly Step[] = useMemo(() => (withCards ? STEPS : STEPS.filter((s) => s !== "account")), [withCards]);
  const afterCategory: Step = withCards ? "account" : "details";
  // The card is required (item 97a): an older record that names none is asked
  // for one here, and the error shows only once Next was pressed without it.
  const { tried, mark: markTried, reset: resetTried } = useStepTried<Step>();
  const cardMissing = (value: string) => withCards && accountMissing(accounts, value);

  const initialIsFuelCategory = categories.find((c) => c.id === transaction.categoryId)?.name === "Fuel";
  const [isFuelCategory, setIsFuelCategory] = useState(initialIsFuelCategory);

  const displayAmount = baseCurrency === displayCurrency ? transaction.amount : Math.round(convert(transaction.amount) * 100) / 100;
  const editableType = (transaction.type === "investment" ? "expense" : transaction.type) as "income" | "expense";

  const storedDate = toDateInputValue(transaction.date);
  const validationSchema = useMemo(() => validationSchemaFor(storedDate), [storedDate]);

  const formik = useFormik<EditTransactionFormValues>({
    enableReinitialize: true,
    initialValues: {
      amount: displayAmount, type: editableType, categoryId: transaction.categoryId,
      date: toDateInputValue(transaction.date), description: transaction.description,
      notes: transaction.notes ?? "",
      showFuelDetails: initialIsFuelCategory && !!transaction.metadata,
      fuelType: transaction.metadata?.fuelType ?? "",
      pricePerUnit: transaction.metadata?.pricePerUnit ?? "",
      quantity: transaction.metadata?.quantity ?? "",
      odometer: transaction.metadata?.odometer ?? "",
      place: transaction.metadata?.place ?? "",
      accountId: transaction.accountId ?? "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      // Nothing changed, nothing written (and no toast saying it was).
      if (unchangedNow(values)) return;
      if (cardMissing(values.accountId)) {
        markTried("account");
        setStep("account");
        return;
      }
      // The card as it will be written: chosen, or the only place there is.
      const accountId = withCards ? chosenAccount(accounts, values.accountId) : values.accountId;
      try {
        const amountInBase = baseCurrency === displayCurrency ? (values.amount as number) : convertToBase(values.amount as number);
        const metadata: FuelMetadata | undefined = values.showFuelDetails
          ? {
              fuelType: values.fuelType as FuelType,
              pricePerUnit: Number(values.pricePerUnit),
              quantity: Number(values.quantity),
              totalCost: amountInBase,
              ...(values.odometer !== "" ? { odometer: Number(values.odometer) } : {}),
              ...(values.place ? { place: values.place } : {}),
            }
          : undefined;

        const data: UpdateTransactionDTO = covered
          ? {
              // The money is the debt's: written back exactly as stored, never
              // through the display currency, so not a cent can drift.
              amount: transaction.amount, type: transaction.type, categoryId: values.categoryId,
              // Kept as stored: an unchanged day is not sent again.
              date: undefined,
              description: covered.payeeLocked ? transaction.description : values.description,
              notes: values.notes.trim() ? values.notes : null, metadata: transaction.metadata,
              accountId: transaction.accountId ?? null,
            }
          : {
              amount: amountInBase, type: values.type, categoryId: values.categoryId,
              // Sent only when changed: a day kept as it is stays exactly as
              // stored, and a record dated in the future before the rule can
              // still be corrected in its other fields.
              date: values.date === storedDate ? undefined : dayToDate(values.date), description: values.description,
              notes: values.notes.trim() ? values.notes : null, metadata,
              accountId: accountId || null,
            };

        await onSubmit(transaction.id, data);
        // Once the record is saved: the readings that already counted it,
        // corrected with it — unless switched off on the check step. A
        // covered expense's money didn't move, so there is nothing to correct.
        if (adjustReading && !covered) {
          const amount = baseCurrency === displayCurrency ? Number(values.amount) : convertToBase(Number(values.amount));
          const changed = { ...transaction, amount, date: dayToDate(values.date), accountId: accountId || undefined };
          const corrected = adjustCheckInsForEdit(checkIns, moneyAccounts, transaction, changed);
          if (corrected !== checkIns) setCheckIns(corrected);
        }
        toast.success(t("transactions.updatedSuccess", { name: values.description }));
        celebrateSave({ collection: "transactions", id: transaction.id });
        resetForm();
        resetTried();
        setStep("category");
        onClose();
      } catch (err) {
        toast.error(t("transactions.updateFailed"));
        console.error("EditTransactionModal submit error:", err);
      }
    },
  });

  // Can the card carry the CHANGE? What this expense already takes from the
  // card it is still on is given back before the new amount is weighed; moved
  // to another card, the whole amount leaves that one (rule 22).
  const onSameAccount = (transaction.accountId ?? "") === chosenAccount(accounts, formik.values.accountId);
  const spend = useSpendCheck(
    formik.values.type === "expense" ? chosenAccount(accounts, formik.values.accountId) : undefined,
    Number(formik.values.amount),
    transaction.type === "expense" && onSameAccount ? displayAmount : 0,
  );


  // «No change, no Save»: compared with what the form opened with. With fuel
  // details on, the amount is price × quantity (recomputed as the form opens),
  // so those two are what count, not the rounded total.
  const comparable = (v: EditTransactionFormValues) => (v.showFuelDetails ? { ...v, amount: undefined } : v);
  const { unchanged } = useFormChanged(formik.initialValues, formik.values, comparable);
  const unchangedNow = (values: EditTransactionFormValues) => sameValues(comparable(formik.initialValues), comparable(values));

  useEffect(() => {
    if (formik.values.showFuelDetails && formik.values.pricePerUnit !== "" && formik.values.quantity !== "") {
      const total = Math.round(Number(formik.values.pricePerUnit) * Number(formik.values.quantity) * 100) / 100;
      formik.setFieldValue("amount", total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.pricePerUnit, formik.values.quantity, formik.values.showFuelDetails]);

  /** A new category: Fuel opens its extra fields, any other closes them. Nothing else is filled in. */
  const handleCategorySelect = (categoryId: string, category: Category) => {
    formik.setFieldValue("categoryId", categoryId);
    const isF = category.name === "Fuel";
    setIsFuelCategory(isF);
    if (!isF) {
      formik.setFieldValue("showFuelDetails", false);
      formik.setFieldValue("fuelType", "");
      formik.setFieldValue("pricePerUnit", "");
      formik.setFieldValue("quantity", "");
      formik.setFieldValue("odometer", "");
      formik.setFieldValue("place", "");
    }
    setStep(afterCategory);
  };

  const goBack = () => setStep(steps[Math.max(0, steps.indexOf(step) - 1)]);


  const handleClose = () => {
    formik.resetForm();
    resetTried();
    setStep("category");
    onClose();
  };

  /** Past the card step only with a card or cash chosen. */
  const leaveAccount = () => {
    if (cardMissing(formik.values.accountId)) return markTried("account");
    setStep("details");
  };

  const handleReview = async () => {
    if (cardMissing(formik.values.accountId)) {
      markTried("account");
      return setStep("account");
    }
    const errors = await formik.validateForm();
    if (Object.keys(errors).length === 0) {
      setStep("review");
    } else {
      formik.setTouched(Object.keys(formik.values).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
    }
  };


  // The amount as typed, already in the display currency: shown, not converted again.
  const formatAmount = (n: number) => format(n, displayCurrency);

  // The few payees this category is usually paid to, so most entries are one tap.
  const suggestedPayees = useMemo(() => frequentPayees(history, formik.values.categoryId || undefined), [history, formik.values.categoryId]);
  const recentPayeeNames = useMemo(() => recentPayees(history), [history]);

  return (
    <Modal {...FORM_MODAL} isOpen={isOpen} toggle={handleClose} centered size="md">
      {/* Which way the money goes, on the HEADER (rule 15a): it used to wash
          the whole body, which is where the red and green figures are. */}
      <ModalHeader className={moneyToneHead(formik.values.type === "income" ? "income" : "expense")} toggle={handleClose}>
        {t("transactions.editTransaction")}
      </ModalHeader>

      <ModalBody>
        <WizardSteps steps={steps} current={step} onGo={setStep} />

        {/* ── 1. Which category ── */}
        {step === "category" && (
          <>
            {/* The type is not a step here and not a control anywhere: the
                badge states it, and the line below says why it cannot move. */}
            <p className={`${styles.prompt} d-flex align-items-center gap-2`}>
              <span>
                {t("transactions.wizard.pickCategory")}
                <RequiredMark />
              </span>
              <TypeBadge type={formik.values.type} />
            </p>
            <CategoryPicker
              manage="link"
              categories={categories}
              value={formik.values.categoryId}
              type={formik.values.type}
              onChange={handleCategorySelect}
              invalid={!!(formik.touched.categoryId && formik.errors.categoryId)}
            />
            {formik.touched.categoryId && formik.errors.categoryId && <FormFeedback className="d-block">{validationMessage(formik.errors.categoryId, t)}</FormFeedback>}
            <p style={{ fontSize: "var(--fs-caption)", color: "var(--color-text-secondary)", marginTop: 5, marginBottom: 0 }}>
              {t("transactions.typeLockedOnEdit")}
            </p>
          </>
        )}

        {/* ── 2. The figures ── */}
        {/* ── Which card ── only when there are cards to choose from. */}
        {step === "account" && (
          <>
            <p className={`${styles.prompt} d-flex align-items-center gap-2`}>
              <span>
                {t(formik.values.type === "income" ? "transactions.wizard.pickAccountIn" : "transactions.wizard.pickAccount")}
                <RequiredMark />
              </span>
              <TypeBadge type={formik.values.type} />
            </p>
            <AccountPicker
              value={formik.values.accountId}
              income={formik.values.type === "income"}
              invalid={tried("account")}
              onChoose={(id) => {
                formik.setFieldValue("accountId", id);
                setStep("details");
              }}
            />
          </>
        )}

        {step === "details" && (
          <form id="edit-transaction-form" onSubmit={formik.handleSubmit} noValidate>
            <p className={`${styles.prompt} d-flex align-items-center gap-2`}>
              {t("transactions.wizard.fillDetails")}
              <TypeBadge type={formik.values.type} />
            </p>
            {(covered || checking) && (
              <div className="mb-3">
                <LockNote state={lock} onLeave={handleClose} />
              </div>
            )}

            {/* ── Amount + Date ── */}
            <Row className="g-3">
              <Col xs={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                    {t("common.amount")} ({displayCurrency})
                    <RequiredMark />
                    {formik.values.showFuelDetails && <span style={{ fontSize: "var(--fs-caption)", color: "var(--bs-primary)", marginLeft: 6 }}>{t("transactions.autoCalculated")}</span>}
                  </Label>
                  <Input
                    type="number" name="amount" min={0.01} step={0.01} placeholder="0.00" aria-required
                    value={formik.values.amount} onChange={formik.handleChange} onBlur={formik.handleBlur}
                    readOnly={formik.values.showFuelDetails}
                    disabled={!!covered}
                    style={formik.values.showFuelDetails ? { background: "var(--color-background-secondary)", cursor: "not-allowed" } : {}}
                    invalid={!!(formik.touched.amount && formik.errors.amount) || spend.blocked}
                  />
                  <FormFeedback>{validationMessage(formik.errors.amount, t)}</FormFeedback>
                  {/* The card must carry the CHANGE, not the whole amount over
                      again: what this record already takes from it is given
                      back first (rule 22, `already`). */}
                  <SpendNote check={spend} />
                </FormGroup>
              </Col>
              <Col xs={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>{t("common.date")}
                    <RequiredMark />
                  </Label>
                  <DateField
                    happened
                    name="date"
                    value={formik.values.date}
                    onChange={(v) => formik.setFieldValue("date", v)}
                    onBlur={() => formik.setFieldTouched("date", true)}
                    invalid={!!(formik.touched.date && formik.errors.date)}
                    disabled={!!covered}
                  />
                  {formik.touched.date && formik.errors.date && <FormFeedback className="d-block">{validationMessage(formik.errors.date, t)}</FormFeedback>}
                </FormGroup>
              </Col>
            </Row>

            {/* ── Payee ── */}
            <Row className="g-3 mt-1">
              <Col xs={12}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>{t("transactions.payee")}
                    <RequiredMark />
                  </Label>
                  <PayeeInput
                    value={formik.values.description}
                    payees={payees}
                    suggested={suggestedPayees}
                    recent={recentPayeeNames}
                    required
                    placeholder={t("transactions.payeePlaceholder")}
                    disabled={!!covered?.payeeLocked}
                    invalid={!!(formik.touched.description && formik.errors.description)}
                    onChange={(v) => formik.setFieldValue("description", v)}
                    onBlur={() => formik.setFieldTouched("description", true)}
                  />
                  <FormFeedback>{validationMessage(formik.errors.description, t)}</FormFeedback>
                </FormGroup>
              </Col>
            </Row>

            {/* ── Fuel toggle ── not on a covered expense: it would set the amount. */}
            {isFuelCategory && !covered && (
              <div
                style={{ marginTop: 12, padding: "10px 14px", background: "color-mix(in srgb, var(--bs-primary) 6%, var(--color-surface))", borderRadius: "var(--border-radius-md)", border: "1px solid color-mix(in srgb, var(--bs-primary) 25%, transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
                onClick={() => {
                  const next = !formik.values.showFuelDetails;
                  formik.setFieldValue("showFuelDetails", next);
                  if (!next) {
                    formik.setFieldValue("fuelType", "");
                    formik.setFieldValue("pricePerUnit", "");
                    formik.setFieldValue("quantity", "");
                    formik.setFieldValue("odometer", "");
                    formik.setFieldValue("place", "");
                    formik.setFieldValue("amount", "");
                  }
                }}
              >
                <div>
                  <p style={{ fontSize: "var(--fs-text)", fontWeight: 600, color: "var(--bs-primary)", margin: 0 }}>⛽ {t("transactions.fuelDetails")}</p>
                  <p style={{ fontSize: "var(--fs-caption)", color: "var(--color-text-secondary)", margin: 0 }}>
                    {formik.values.showFuelDetails ? t("transactions.fuelHint") : t("transactions.fuelHintOff")}
                  </p>
                </div>
                <div style={{ width: 40, height: 22, borderRadius: 11, background: formik.values.showFuelDetails ? "var(--bs-primary)" : "var(--color-border-primary)", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                  <div style={{ position: "absolute", top: 3, left: formik.values.showFuelDetails ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "var(--color-surface)", transition: "left 0.2s", boxShadow: "var(--shadow-sm)" }} />
                </div>
              </div>
            )}

            {/* ── Fuel details panel ── */}
            {isFuelCategory && !covered && formik.values.showFuelDetails && (
              <FuelDetailsPanel
                fuelType={formik.values.fuelType} pricePerUnit={formik.values.pricePerUnit}
                quantity={formik.values.quantity} odometer={formik.values.odometer} place={formik.values.place}
                errors={{ fuelType: formik.errors.fuelType, pricePerUnit: formik.errors.pricePerUnit as string | undefined, quantity: formik.errors.quantity as string | undefined, odometer: formik.errors.odometer as string | undefined, place: formik.errors.place }}
                touched={{ fuelType: formik.touched.fuelType, pricePerUnit: formik.touched.pricePerUnit, quantity: formik.touched.quantity, odometer: formik.touched.odometer, place: formik.touched.place }}
                setFieldValue={formik.setFieldValue} setFieldTouched={formik.setFieldTouched} displayCurrency={displayCurrency}
              />
            )}

            {/* ── Notes ── */}
            <FormGroup className="mb-0 mt-3">
              <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>{t("common.notes")}</Label>
              <Input
                type="textarea" name="notes" rows={3} placeholder={t("common.optionalNote")}
                value={formik.values.notes} onChange={formik.handleChange} onBlur={formik.handleBlur}
                invalid={!!(formik.touched.notes && formik.errors.notes)}
              />
              <FormFeedback>{validationMessage(formik.errors.notes, t)}</FormFeedback>
              <FormText style={{ fontSize: "var(--fs-caption)" }}>{formik.values.notes.length} / 300</FormText>
            </FormGroup>
          </form>
        )}

        {/* ── 3. Read it back before it is written ── */}
        {/* The card first, then the amount — as the steps asked them. */}
        {step === "review" && (
          <ReviewStep
            values={formik.values}
            categories={categories}
            formatAmount={formatAmount}
            currency={displayCurrency}
            lead={
              !covered && (
                <ReviewCard
                  accountId={formik.values.accountId}
                  income={formik.values.type === "income"}
                  adjust={{ on: adjustReading, onChange: setAdjustReading }}
                  // The record as it will be: what the card holds after the change.
                  editing={
                    formik.values.amount === ""
                      ? undefined
                      : {
                          original: transaction,
                          changed: {
                            ...transaction,
                            amount: baseCurrency === displayCurrency ? Number(formik.values.amount) : convertToBase(Number(formik.values.amount)),
                            date: dayToDate(formik.values.date),
                            accountId: chosenAccount(accounts, formik.values.accountId) || undefined,
                          },
                        }
                  }
                />
              )
            }
          />
        )}
      </ModalBody>

      {/* Back / Cancel on the left, the way forward on the right (rule 15b, `DialogFooter`). */}
      <DialogFooter
        back={
          step === "category" ? (
            <Button color="secondary" outline onClick={handleClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button color="secondary" outline onClick={goBack} disabled={formik.isSubmitting}>
              {t("common.back")}
            </Button>
          )
        }
      >
        {step === "category" && (
          <Button color="primary" disabled={!formik.values.categoryId} onClick={() => setStep(afterCategory)}>{t("common.next")}</Button>
        )}
        {step === "account" && <Button color="primary" onClick={leaveAccount}>{t("common.next")}</Button>}
        {/* «No change, no Save»: opening a record and closing it again never
            offers to save it back unchanged — on the details step or the review. */}
        {(step === "details" || step === "review") && (
          <div className="d-flex align-items-center gap-2">
            <UnchangedHint show={unchanged} />
            {step === "details" && <Button color="primary" disabled={unchanged || checking || spend.blocked} onClick={handleReview}>{t("transactions.reviewChanges")}</Button>}
            {step === "review" && (
              <Button color="primary" onClick={() => formik.submitForm()} disabled={formik.isSubmitting || checking || unchanged || spend.blocked}>
                {formik.isSubmitting ? t("common.saving") : t("transactions.confirmAndSave")}
              </Button>
            )}
          </div>
        )}
      </DialogFooter>
    </Modal>
  );
}

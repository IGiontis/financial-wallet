import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, Button, FormGroup, Label, Input, FormFeedback, FormText, Row, Col } from "reactstrap";
import { FiArrowDownLeft, FiArrowUpRight, FiRepeat } from "react-icons/fi";
import { SavedCheck } from "./SavedCheck";
import { celebrateSave } from "../../../shared/feedback/saveFeedback";
import type { CreateTransactionDTO, Category, FuelMetadata, FuelType } from "../../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { DateField } from "../../../shared/components/DateField";
import { validationMessage } from "../../../shared/utils/validationMessage";
import { PayeeInput } from "./PayeeInput";
import AccountPicker from "../../accounts/AccountPicker";
import ReviewCard from "../../accounts/ReviewCard";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount } from "../../accounts/accountsUtils";
import { SpendNote } from "../../accounts/SpendNote";
import { useSpendCheck } from "../../accounts/useSpendCheck";
import { useStepTried } from "../../../shared/hooks/useStepTried";
import { usePayees } from "../hooks/usePayees";
import { useTransactions } from "../hooks/useTransactions";
import { frequentPayees, recentPayees } from "../payeeStore";
import CategoryPicker from "../../categories/CategoryPicker";
import { categoryLabel } from "../../../shared/utils/categories";
import { FuelDetailsPanel } from "../../categories/FuelDetailsPanel";
import { formatUnitPrice, fuelTypeLabelKey, getUnitLabel } from "../../categories/fuelTypes";
import { intlLocale } from "../../../i18n";
import { TransactionReviewBody, type FuelCell } from "./TransactionReviewBody";
import { EXPENSE_COLORS, INCOME_COLORS } from "./reviewPalettes";
import { TypeBadge, WizardSteps } from "./WizardSteps";
import styles from "./css/TransactionWizard.module.css";
import { FORM_MODAL, moneyToneHead, type MoneyTone } from "../../../shared/components/formModal";
import { DialogFooter } from "../../../shared/components/DialogFooter";
import { RequiredMark } from "../../../shared/components/RequiredMark";
import { dayToDate, toISODay, isFutureDay, NOT_IN_FUTURE, formatRecordDay } from "../../../shared/utils/dates";

// ─── Form shape ───────────────────────────────────────────────────────────────

interface TransactionFormValues {
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

// ─── Steps ────────────────────────────────────────────────────────────────────

// One question per screen. The old single-page form asked all of them at once,
// which on a phone meant a scroll with the category grid in the middle of it —
// and the type, the one answer that silently poisons every chart if it is
// wrong, was a consequence of a tab somewhere in the middle rather than a
// decision anyone made.
//
// Editing runs the same three that follow, minus this first one: an expense
// cannot become an income by editing.
const STEPS = ["type", "category", "account", "details", "review"] as const;
type Step = (typeof STEPS)[number];

// ─── Validation ───────────────────────────────────────────────────────────────

const validationSchema = Yup.object({
  amount: Yup.number().typeError("validation.amountNumber").required("validation.amountRequired").positive("validation.mustBeGreaterThanZero").max(10_000_000, "validation.amountTooLarge"),
  type: Yup.mixed<"income" | "expense">().oneOf(["income", "expense"]).required(),
  categoryId: Yup.string().required("validation.categoryRequired"),
  // Something that happened: today or earlier (owner, 2026-11-14). Checked
  // against the clock at the moment of checking, so a form left open past
  // midnight still accepts the new day.
  date: Yup.string().required("validation.dateRequired").test("not-future", NOT_IN_FUTURE, (v) => !v || !isFutureDay(v)),
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

function ReviewStep({ values, categories, formatAmount, currency, subtitle, lead }: { values: TransactionFormValues; categories: Category[]; formatAmount: (n: number) => string; currency: string; subtitle?: string; lead?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const category = categories.find((c) => c.id === values.categoryId);
  const isIncome = values.type === "income";
  const colors = isIncome ? INCOME_COLORS : EXPENSE_COLORS;
  const unit = getUnitLabel(values.fuelType);
  const hasFuel = values.showFuelDetails && values.fuelType && values.pricePerUnit !== "" && values.quantity !== "";

  const fuelCells: FuelCell[] = hasFuel
    ? [
        { label: t("transactions.fuelType"),    value: values.fuelType ? t(fuelTypeLabelKey(values.fuelType)) : "—" },
        { label: t("transactions.pricePerUnitLabel", { unit }), value: values.pricePerUnit !== "" ? formatUnitPrice(Number(values.pricePerUnit), currency, intlLocale(i18n.resolvedLanguage)) : "—" },
        { label: t("transactions.quantity"),     value: values.quantity !== "" ? `${values.quantity} ${unit}` : "—" },
        ...(values.odometer !== "" ? [{ label: t("transactions.odometer"), value: `${values.odometer} km` }] : []),
        ...(values.place ? [{ label: t("transactions.place"), value: values.place }] : []),
      ]
    : [];

  return (
    <TransactionReviewBody
      subtitle={subtitle ?? t("transactions.reviewBeforeSaving")}
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

// ─── Frame ────────────────────────────────────────────────────────────────────
// The same wizard in two frames: a dialog over the list, or the whole of a
// page of its own (`/transactions/new`, from the menu). Only the frame
// differs; the steps, the check and the save are one piece of code.

function Frame({ asPage, isOpen, onClose, children }: { asPage: boolean; isOpen: boolean; onClose: () => void; children: ReactNode }) {
  return asPage ? (
    <div className={styles.page}>{children}</div>
  ) : (
    <Modal {...FORM_MODAL} isOpen={isOpen} toggle={onClose} centered size="md">
      {children}
    </Modal>
  );
}

/**
 * The dialog's title bar. A page has its own heading above it, so none here.
 * `tone` paints the band red or green once the reader has said which way the
 * money goes (rule 15a): on the HEADER, so the figures in the body stay
 * readable. A page has no band to paint.
 */
function FrameHeader({ asPage, onClose, tone, children }: { asPage: boolean; onClose: () => void; tone?: MoneyTone; children: ReactNode }) {
  return asPage ? null : (
    <ModalHeader className={moneyToneHead(tone)} toggle={onClose}>
      {children}
    </ModalHeader>
  );
}

function FrameBody({ asPage, children }: { asPage: boolean; children: ReactNode }) {
  return asPage ? <div className={styles.pageBody}>{children}</div> : <ModalBody>{children}</ModalBody>;
}

function FrameFooter({ asPage, back, children }: { asPage: boolean; back?: ReactNode; children: ReactNode }) {
  // Back / Cancel on the left, the way forward on the right; a delete would go
  // first on the left with the rule between them (rule 15b, `DialogFooter`).
  // This wizard has none.
  return (
    <DialogFooter bare={asPage} className={asPage ? styles.pageFooter : undefined} back={back}>
      {children}
    </DialogFooter>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (data: CreateTransactionDTO) => Promise<void>;
  /** The whole of a page rather than a dialog. `onClose` is then "All transactions" on the saved panel. */
  asPage?: boolean;
  /** Offers «Μεταφορά» as a third kind on the first step; the caller opens the transfer wizard. */
  onPickTransfer?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddTransactionModal({ isOpen, onClose, categories, onSubmit, asPage = false, onPickTransfer }: AddTransactionModalProps) {
  const [step, setStep] = useState<Step>("type");
  // On the page, what was just saved: shown as a confirmation, with its
  // details, until "New transaction" clears it. The dialog has no such panel —
  // it closes, and the toast says it went in.
  const [saved, setSaved] = useState<TransactionFormValues | null>(null);
  const [isFuelCategory, setIsFuelCategory] = useState(false);
  /** The kind tile has really been pressed — `type` has a default of its own (rule 15a). */
  const [typeChosen, setTypeChosen] = useState(false);
  const { t } = useTranslation();
  const { payees } = usePayees();
  // Already in the cache from the page behind the form — no extra read.
  const { data: history = [] } = useTransactions();
  const { format, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  // The card step is there only when there are cards on the Banks & cash page.
  const accounts = useAccountList();
  const steps: readonly Step[] = useMemo(() => (accounts.length > 0 ? STEPS : STEPS.filter((s) => s !== "account")), [accounts.length]);
  const afterCategory: Step = accounts.length > 0 ? "account" : "details";
  // The card is required (item 97a); its error shows only once Next was pressed without one.
  const { tried, mark: markTried, reset: resetTried } = useStepTried<Step>();

  // Today on this device, read when the form opens (and after each save on the
  // page) — not once when the app loaded, and not in UTC, which before 02:00
  // Greek time was still yesterday. Not `useToday`: with `enableReinitialize`
  // a day moving at midnight would wipe a half-filled form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => toISODay(new Date()), [isOpen, saved]);

  const formik = useFormik<TransactionFormValues>({
    enableReinitialize: true,
    initialValues: {
      amount: "", type: "expense", categoryId: "", date: today,
      description: "", notes: "", showFuelDetails: false,
      fuelType: "", pricePerUnit: "", quantity: "", odometer: "", place: "", accountId: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      // Never saved without its card: the review is reachable only past that step, but a save must not depend on it.
      if (accountMissing(accounts, values.accountId)) {
        markTried("account");
        setStep("account");
        return;
      }
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

        const dto: CreateTransactionDTO = {
          amount: amountInBase, type: values.type, categoryId: values.categoryId,
          date: dayToDate(values.date), description: values.description,
          notes: values.notes || undefined, metadata,
          accountId: chosenAccount(accounts, values.accountId) || undefined,
        };

        await onSubmit(dto);
        // The shared «it saved» answer: the dialog pulses, the new row lights
        // up on the list (useSavedFlash("transactions", …)) — CLAUDE.md.
        celebrateSave({ collection: "transactions" });
        // A toast either way (every new record says so); the page also keeps its panel.
        toast.success(t("transactions.addedSuccess", { name: values.description }));
        if (asPage) setSaved(values);
        resetForm();
        resetTried();
        setStep("type");
        setTypeChosen(false);
        setIsFuelCategory(false);
        if (!asPage) onClose();
      } catch {
        toast.error(t("transactions.saveFailed"));
      }
    },
  });

  useEffect(() => {
    if (formik.values.showFuelDetails && formik.values.pricePerUnit !== "" && formik.values.quantity !== "") {
      const total = Math.round(Number(formik.values.pricePerUnit) * Number(formik.values.quantity) * 100) / 100;
      formik.setFieldValue("amount", total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.pricePerUnit, formik.values.quantity, formik.values.showFuelDetails]);

  const handleTypeChange = (next: "income" | "expense") => {
    formik.setFieldValue("type", next);
    // The chosen category belongs to the old tab, so it cannot survive the switch.
    formik.setFieldValue("categoryId", "");
    formik.setFieldValue("showFuelDetails", false);
    formik.setFieldValue("fuelType", "");
    formik.setFieldValue("pricePerUnit", "");
    formik.setFieldValue("quantity", "");
    formik.setFieldValue("odometer", "");
    formik.setFieldValue("place", "");
    setIsFuelCategory(false);
  };

  const handleCategorySelect = (categoryId: string, category: Category) => {
    formik.setFieldValue("categoryId", categoryId);
    // Fuel is the one built-in category that opens extra fields; it keys off the name.
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
  };

  // Choosing is also moving on: on both of the first two steps the answer is a
  // single tap, and asking for a second one on Next would double the taps for
  // no decision. Back is one tap away, and the step bar goes back further.
  const chooseType = (next: "income" | "expense") => {
    if (next !== formik.values.type) handleTypeChange(next);
    setTypeChosen(true);
    setStep("category");
  };

  const chooseCategory = (categoryId: string, category: Category) => {
    handleCategorySelect(categoryId, category);
    setStep(afterCategory);
  };

  /**
   * Going back to step 1 asks the question again, so it is unanswered again
   * (owner, 2026-11-24): the band loses its colour and no tile is marked until
   * one is tapped. The VALUE is kept, so tapping the same kind again changes
   * nothing and loses no category — only the answer's "said out loud" mark is
   * cleared. Every step change goes through here for that reason.
   */
  const goToStep = (next: Step) => {
    if (next === "type") setTypeChosen(false);
    setStep(next);
  };

  const handleClose = () => {
    formik.resetForm();
    resetTried();
    setStep("type");
    setTypeChosen(false);
    setIsFuelCategory(false);
    onClose();
  };

  const goBack = () => goToStep(steps[Math.max(0, steps.indexOf(step) - 1)]);

  /** Past the card step only with a card or cash chosen. */
  const leaveAccount = () => {
    if (accountMissing(accounts, formik.values.accountId)) return markTried("account");
    setStep("details");
  };

  const handleReview = async () => {
    if (accountMissing(accounts, formik.values.accountId)) {
      markTried("account");
      return setStep("account");
    }
    // Cash that is not there never reaches the review (rule 22): the note is
    // already under the amount, so there is nothing more to say here.
    if (spend.blocked) return;
    const errors = await formik.validateForm();
    if (Object.keys(errors).length === 0) {
      setStep("review");
    } else {
      formik.setTouched(Object.keys(formik.values).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
    }
  };

  // Can this come off the card that was chosen a step back? Money OUT only —
  // an income lands ON a card and takes nothing from it (rule 22).
  const spend = useSpendCheck(formik.values.type === "expense" ? formik.values.accountId : undefined, Number(formik.values.amount));

  // The amount as typed, already in the display currency: shown, not converted again.
  const formatAmount = (n: number) => format(n, displayCurrency);

  // The few payees this category is usually paid to, so most entries are one tap.
  const suggestedPayees = useMemo(() => frequentPayees(history, formik.values.categoryId || undefined), [history, formik.values.categoryId]);
  const recentPayeeNames = useMemo(() => recentPayees(history), [history]);

  return (
    <Frame asPage={asPage} isOpen={isOpen} onClose={handleClose}>
      {/* The header takes the colour of the answer to the one question that
          changes everything else on this form (rule 15a — it used to be a wash
          over the whole body, and the body is where the red and green figures
          are). It turns THE MOMENT the kind tile is pressed (the owner:
          «πρέπει να πάω στο επόμενο στάδιο για να αλλάξει το header»), which
          is what `typeChosen` records: `type` starts as "expense" on its own,
          so the dialog would otherwise open red before the reader had said
          anything. The flag — not the step — also keeps the colour on while
          the category is being picked and when step 1 is revisited, where the
          tile is still the chosen one. It is cleared with the form. */}
      <FrameHeader asPage={asPage} onClose={handleClose} tone={!saved && typeChosen ? (formik.values.type === "income" ? "income" : "expense") : undefined}>
        {t("transactions.addTransaction")}
      </FrameHeader>

      <FrameBody asPage={asPage}>
        {saved && (
          <div className={styles.savedPanel} role="status">
            <SavedCheck />
            <h2 className={styles.savedTitle}>{t("transactions.savedTitle")}</h2>
            <p className={styles.savedSub}>{t("transactions.savedSub")}</p>
            <div className={styles.savedDetails}>
              <ReviewStep values={saved} categories={categories} formatAmount={formatAmount} currency={displayCurrency} subtitle={t("transactions.savedDetails")} />
            </div>
          </div>
        )}
        {!saved && <WizardSteps steps={steps} current={step} onGo={goToStep} />}

        {/* ── 1. Money in or money out ── */}
        {!saved && step === "type" && (
          <>
            <p className={styles.prompt}>
              {t("transactions.wizard.pickType")}
              <RequiredMark />
            </p>
            <div className={styles.typeGrid}>
              {(["expense", "income"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`${styles.typeCard} ${kind === "expense" ? styles.typeExpense : styles.typeIncome} ${typeChosen && formik.values.type === kind ? styles.typeSelected : ""}`}
                  onClick={() => chooseType(kind)}
                >
                  <span className={styles.typeIcon} aria-hidden>
                    {kind === "expense" ? <FiArrowUpRight size={26} /> : <FiArrowDownLeft size={26} />}
                  </span>
                  <span className={styles.typeName}>{t(kind === "expense" ? "transactions.expense" : "transactions.income")}</span>
                  <span className={styles.typeHint}>{t(kind === "expense" ? "transactions.wizard.expenseHint" : "transactions.wizard.incomeHint")}</span>
                </button>
              ))}
              {/* Neither: money moving between two of your own accounts. */}
              {onPickTransfer && (
                <button type="button" className={`${styles.typeCard} ${styles.typeTransfer}`} onClick={onPickTransfer}>
                  <span className={styles.typeIcon} aria-hidden>
                    <FiRepeat size={22} />
                  </span>
                  <span className={styles.typeName}>{t("transactions.transfer.title")}</span>
                  <span className={styles.typeHint}>{t("transactions.transfer.kindHint")}</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* ── 2. Which category ── */}
        {!saved && step === "category" && (
          <div>
            {/* Step 1 settled the type and step 1 is where it gets changed, so
                from here on the badge carries it rather than a control. */}
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
              onChange={chooseCategory}
              invalid={!!(formik.touched.categoryId && formik.errors.categoryId)}
              onPage={asPage}
            />
            {/* Gated on `touched` like the picker's own invalid state. Ungated,
                clearing the category — which is exactly what going back a step
                and switching type does — printed the error before the reader
                had done anything wrong. */}
            {formik.touched.categoryId && formik.errors.categoryId && <FormFeedback className="d-block">{validationMessage(formik.errors.categoryId, t)}</FormFeedback>}
          </div>
        )}

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

        {/* ── 3. The figures ── */}
        {step === "details" && (
          <form id="add-transaction-form" onSubmit={formik.handleSubmit} noValidate>
            <p className={`${styles.prompt} d-flex align-items-center gap-2`}>
              {t("transactions.wizard.fillDetails")}
              <TypeBadge type={formik.values.type} />
            </p>

            {/* ── Amount + Date ── */}
            <Row className="g-3">
              <Col xs={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>{t("common.amount")} ({displayCurrency})
                    <RequiredMark />
                  </Label>
                  <Input
                    type="number" name="amount" min={0.01} step={0.01} placeholder="0.00" aria-required
                    value={formik.values.amount} onChange={formik.handleChange} onBlur={formik.handleBlur}
                    readOnly={formik.values.showFuelDetails}
                    style={formik.values.showFuelDetails ? { background: "var(--color-background-secondary)", cursor: "not-allowed" } : {}}
                    invalid={!!(formik.touched.amount && formik.errors.amount) || spend.blocked}
                  />
                  <FormFeedback>{validationMessage(formik.errors.amount, t)}</FormFeedback>
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
                  />
                  {formik.touched.date && formik.errors.date && <FormFeedback className="d-block">{validationMessage(formik.errors.date, t)}</FormFeedback>}
                </FormGroup>
              </Col>
            </Row>

            {/* Can it come off the card at all? The card was chosen a step back
                («WHERE before HOW MUCH»), so this is where the two meet —
                rule 22: cash that is not there is refused, a bank card warned. */}
            <SpendNote check={spend} className="mt-1" />

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
                    invalid={!!(formik.touched.description && formik.errors.description)}
                    onChange={(v) => formik.setFieldValue("description", v)}
                    onBlur={() => formik.setFieldTouched("description", true)}
                  />
                  <FormFeedback>{validationMessage(formik.errors.description, t)}</FormFeedback>
                </FormGroup>
              </Col>
            </Row>

            {/* ── Fuel toggle ── */}
            {isFuelCategory && (
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
                  <p style={{ fontSize: "var(--fs-text)", fontWeight: 600, color: "var(--bs-primary)", margin: 0 }}>⛽ {t("transactions.addFuelDetails")}</p>
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
            {isFuelCategory && formik.values.showFuelDetails && (
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

        {/* ── 4. Read it back before it is written ── */}
        {/* The card first, then the amount — as the steps asked them. */}
        {step === "review" && (
          <ReviewStep
            values={formik.values}
            categories={categories}
            formatAmount={formatAmount}
            currency={displayCurrency}
            lead={
              <ReviewCard
                accountId={formik.values.accountId}
                income={formik.values.type === "income"}
                delta={
                  formik.values.amount === ""
                    ? undefined
                    : (formik.values.type === "income" ? 1 : -1) * (baseCurrency === displayCurrency ? Number(formik.values.amount) : convertToBase(Number(formik.values.amount)))
                }
              />
            }
          />
        )}
      </FrameBody>

      {/* On the page, step 1 has no buttons at all: choosing a type is the
          step, and there is no dialog to cancel out of. The dialog keeps its
          Cancel. */}
      {!(asPage && !saved && step === "type") && (
      <FrameFooter
        asPage={asPage}
        back={
          saved ? (
            <Button color="secondary" outline onClick={onClose}>
              {t("nav.allTransactions")}
            </Button>
          ) : step === "type" ? (
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
        {saved && (
          <Button color="primary" onClick={() => setSaved(null)}>
            + {t("nav.newTransaction")}
          </Button>
        )}
        {step === "category" && (
          <Button color="primary" disabled={!formik.values.categoryId} onClick={() => setStep(afterCategory)}>{t("common.next")}</Button>
        )}
        {step === "account" && <Button color="primary" onClick={leaveAccount}>{t("common.next")}</Button>}
        {step === "details" && <Button color="primary" onClick={handleReview}>{t("transactions.reviewBtn")}</Button>}
        {!saved && step === "review" && (
          <Button color="primary" onClick={() => formik.submitForm()} disabled={formik.isSubmitting}>
            {formik.isSubmitting ? t("common.saving") : t("transactions.confirmAndSave")}
          </Button>
        )}
      </FrameFooter>
      )}
    </Frame>
  );
}

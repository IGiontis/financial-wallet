// features/budget/AddNewGoalModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Create a new investment goal or savings goal.
//
// File location: src/features/budget/AddNewGoalModal.tsx
//
// defaultGoalType="targeted"  (GoalsPage):
//   - Hides the type selector — always creates a targeted goal
//   - Shows target amount + deadline picker only
//   - Modal title: "New goal"
//
// defaultGoalType="recurring"  (InvestmentsPage):
//   - Shows type selector: "Tracking" | "Recurring Goal"
//   - If recurring: shows target amount + Monthly/Yearly period (no deadline)
//   - Modal title: "New investment"
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { Trans, useTranslation } from "react-i18next";
import { validationMessage } from "../../shared/utils/validationMessage";
import { Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import type { CreateInvestmentGoalDTO, InvestmentGoalType, TargetPeriod } from "../../shared/types/IndexTypes";
import { useGoalPartsField } from "./components/useGoalPartsField";
import { addMonths, format } from "date-fns";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { FORM_MODAL } from "../../shared/components/formModal";
import { YesNoChoice } from "../../shared/components/YesNoChoice";
import { WizardSteps } from "../transactions/components/WizardSteps";
import segmented from "../../shared/css/Segmented.module.css";
import { GoalLookStep, GoalReview, GoalTargetStep } from "./components/GoalWizard";
import { GOAL_STEP_FIELDS, GOAL_STEP_LABEL, goalReviewRows, type GoalStep } from "./components/goalWizardSteps";
import { iconProblem } from "../../shared/utils/iconText";
import { typedBlur } from "../../shared/utils/typedBlur";
import { useAuth } from "../../shared/hooks/useAuth";
import { useCachedList } from "../../shared/hooks/useCachedList";
import { matchNameIn } from "../../shared/utils/nameMatch";
import { NameCheck } from "../../shared/components/NameCheck";
import { investmentKeys } from "./useInvestments";
import type { InvestmentGoal } from "../../shared/types/IndexTypes";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { dayToDate } from "../../shared/utils/dates";

// ─── Constants ────────────────────────────────────────────────────────────────

const defaultDeadline = format(addMonths(new Date(), 1), "yyyy-MM-dd");

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalFormValues {
  name: string;
  icon: string;
  color: string;
  notes: string;
  goalType: InvestmentGoalType;
  targetAmount: number | "";
  targetPeriod: TargetPeriod;
  deadline: string;
  /** "YYYY-MM-DD", or "" — see `InvestmentGoal.planFrom`. */
  planFrom: string;
  /** «Start it active?» — undefined until answered: neither tile starts chosen (no prefill, tiles included). */
  isActive: boolean | undefined;
}

interface AddNewGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateInvestmentGoalDTO, isActive: boolean) => Promise<void>;
  // "targeted"  → GoalsPage  : locks form to targeted + custom deadline
  // "recurring" → InvestmentsPage: shows Tracking vs Recurring Goal selector
  defaultGoalType?: "targeted" | "recurring";
}

// ─── Validation ───────────────────────────────────────────────────────────────

const validationSchema = Yup.object({
  name: Yup.string().required("validation.goalNameRequired").max(60, "validation.maxChars|60"),
  icon: Yup.string().test("one-icon", "validation.iconOnlyOne", (v) => !iconProblem(v ?? "")),
  color: Yup.string(),
  goalType: Yup.mixed<InvestmentGoalType>().oneOf(["targeted", "open_ended"]).required(),
  targetAmount: Yup.number()
    .typeError("validation.targetAmountNumber")
    .when("goalType", {
      is: "targeted",
      then: (s) => s.required("validation.targetAmountRequired").positive("validation.mustBeGreaterThanZero").max(10_000_000, "validation.amountTooLarge"),
      otherwise: (s) => s.optional().nullable(),
    }),
  targetPeriod: Yup.mixed<TargetPeriod>()
    .oneOf(["monthly", "yearly", "custom"])
    .when("goalType", {
      is: "targeted",
      then: (s) => s.required("validation.periodRequired"),
      otherwise: (s) => s.optional().nullable(),
    }),
  deadline: Yup.string().when("targetPeriod", {
    is: "custom",
    then: (s) => s.required("validation.deadlineRequired"),
    otherwise: (s) => s.optional(),
  }),
  // Optional; when given, it has to come before the goal's own deadline.
  planFrom: Yup.string().test("before-deadline", "validation.planFromAfterDeadline", function (value) {
    const { deadline } = this.parent as { deadline?: string };
    return !value || !deadline || value <= deadline;
  }),
  notes: Yup.string().max(300, "validation.maxChars|300"),
  isActive: Yup.boolean().required("validation.answerYesNo"),
});

// ─── Component ────────────────────────────────────────────────────────────────
// A wizard like every other add form: «Τι» (name, and on Investments the kind)
// → «Στόχος» (a targeted one only) → «Εμφάνιση» (icon, colour, notes, active?)
// → «Έλεγχος», whose rows jump back to their step. Save only on the review;
// what it writes is the same DTO the one-page form wrote.

export default function AddNewGoalModal({ isOpen, onClose, onSubmit, defaultGoalType }: AddNewGoalModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<GoalStep>("what");
  const { format: formatCurrency } = useCurrencyConverter();
  const { currentUser } = useAuth();
  // Goals and investments already on screen: a new one may not take a name in use.
  const existingNames = useCachedList<InvestmentGoal>(investmentKeys.goals(currentUser?.uid ?? "")).map((g) => g.name);

  // GoalsPage passes "targeted" → lock to targeted + custom deadline
  // InvestmentsPage passes "recurring" → show type selector
  const isGoalsPage = defaultGoalType === "targeted";
  const modalTitle = isGoalsPage ? t("goals.newGoal") : t("investments.newInvestment");

  // ── Initial values depend on which page opened the modal ─────────────────
  // useMemo keeps the reference stable so enableReinitialize doesn't loop
  const computedInitialValues = useMemo<GoalFormValues>(
    () => ({
      name: "",
      icon: "",
      color: "#3B82F6",
      notes: "",
      goalType: "targeted",
      targetAmount: "",
      // GoalsPage  → always custom (deadline picker shown)
      // InvestmentsPage → monthly as sensible default for recurring
      targetPeriod: isGoalsPage ? "custom" : "monthly",
      deadline: defaultDeadline,
      planFrom: "",
      isActive: undefined,
    }),
    [isGoalsPage],
  );

  const formik = useFormik<GoalFormValues>({
    enableReinitialize: true,
    initialValues: computedInitialValues,
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const dto: CreateInvestmentGoalDTO = {
          name: values.name,
          icon: values.icon || undefined,
          color: values.color || undefined,
          notes: values.notes || undefined,
          goalType: values.goalType,
          targetAmount: values.goalType === "targeted" ? (values.targetAmount as number) : undefined,
          targetPeriod: values.goalType === "targeted" ? values.targetPeriod : undefined,
          deadline: values.goalType === "targeted" && values.targetPeriod === "custom" && values.deadline ? dayToDate(values.deadline) : undefined,
          planFrom: isGoalsPage && values.goalType === "targeted" && values.planFrom ? values.planFrom : undefined,
          parts: isGoalsPage && values.goalType === "targeted" && partsField.usingParts ? partsField.parts : undefined,
        };
        await onSubmit(dto, values.isActive !== false);
        toast.success(t("goals.createdSuccess", { name: values.name }));
        // Its card lights once this dialog has gone (the id is not known here:
        // the card that appears is the one lit). A new goal starts at 0, so its
        // tanks have nothing to pour until the first deposit.
        celebrateSave({ collection: "investmentGoals" });
        resetForm({ values: computedInitialValues });
        // The modal stays mounted: the next new goal must not start with these parts.
        partsField.reset();
        setStep("what");
        onClose();
      } catch (err) {
        toast.error(t("goals.createFailed"));
        console.error("AddNewGoalModal submit error:", err);
      }
    },
  });

  const handleClose = () => {
    formik.resetForm({ values: computedInitialValues });
    partsField.reset();
    setStep("what");
    onClose();
  };

  const isTargeted = formik.values.goalType === "targeted";
  // A trip's target written as its parts — see `goalParts`. The amount follows their «έως» total.
  const partsField = useGoalPartsField(undefined, (amount) => formik.setFieldValue("targetAmount", amount));

  const nameMatch = matchNameIn(formik.values.name, existingNames);

  // A tracking investment has no target, so no step for one.
  const steps: GoalStep[] = isTargeted ? ["what", "target", "look", "review"] : ["what", "look", "review"];
  const index = Math.max(steps.indexOf(step), 0);
  // Forward only past steps that are valid; back is always free.
  const goTo = async (target: GoalStep) => {
    const to = steps.indexOf(target);
    // A name already used by another goal: refused, on its own step (`matchName`).
    if (to > steps.indexOf("what") && nameMatch?.kind === "same") {
      void formik.setFieldTouched("name", true, false);
      setStep("what");
      return;
    }
    const errors = await formik.validateForm();
    for (const s of steps.slice(0, to)) {
      const bad = GOAL_STEP_FIELDS[s].filter((f) => f in errors);
      const partsBad = s === "target" && !partsField.check();
      if (bad.length > 0 || partsBad) {
        void formik.setTouched({ ...formik.touched, ...Object.fromEntries(bad.map((f) => [f, true])) }, false);
        setStep(s);
        return;
      }
    }
    setStep(target);
  };

  const kindLabel = t(isTargeted ? (isGoalsPage ? "goals.kindTargeted" : "goals.kindRecurring") : "goals.kindTracking");
  const rows = goalReviewRows({
    values: formik.values,
    kindLabel,
    isTargeted,
    withDeadline: isGoalsPage,
    parts: partsField.usingParts ? partsField.parts : undefined,
    formatCurrency,
    t,
    extra: [{ step: "look", label: t("goals.statusLabel"), value: formik.values.isActive ? t("goals.statusActive") : t("common.paused") }],
  });
  const kinds = [
    { value: "targeted" as InvestmentGoalType, title: t("investments.typeRecurringTitle"), desc: t("investments.typeRecurringDesc") },
    { value: "open_ended" as InvestmentGoalType, title: t("investments.tracking"), desc: t("investments.typeTrackingDesc") },
  ];

  return (
    <Modal {...FORM_MODAL} isOpen={isOpen} toggle={handleClose} centered size="m" scrollable>
      <ModalHeader toggle={handleClose}>{modalTitle}</ModalHeader>
      <form
        id="new-goal-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") void formik.submitForm();
          else void goTo(steps[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={steps} current={step} onGo={(s) => void goTo(s)} label={(s) => t(GOAL_STEP_LABEL[s])} large />
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }}>
            {t(`goals.wizard.title_${step}`)}
          </div>

          {step === "what" && (
            <>
              <FormGroup className={isGoalsPage ? "mb-0" : undefined}>
                <Label for="goal-name" className="small fw-medium">
                  {isGoalsPage ? t("goals.goalNameLabel") : t("investments.nameLabel")}
                  <RequiredMark />
                </Label>
                <Input
                  id="goal-name"
                  aria-required
                  type="text"
                  name="name"
                  autoFocus
                  placeholder={isGoalsPage ? t("goals.namePlaceholder") : t("investments.namePlaceholder")}
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={typedBlur(formik.handleBlur)}
                  invalid={!!(formik.touched.name && formik.errors.name)}
                />
                <FormFeedback>{validationMessage(formik.errors.name, t)}</FormFeedback>
                <NameCheck match={nameMatch?.kind === "same" && !formik.touched.name ? null : nameMatch} />
              </FormGroup>

              {/* The kind — only on Investments: a goal that repeats, or one only tracked. */}
              {!isGoalsPage && (
                <FormGroup className="mb-0">
                  <div id="goal-kind" className="small fw-medium mb-2">
                    {t("goals.typeLabel")}
                    <RequiredMark />
                  </div>
                  <div className={`${segmented.group} ${segmented.even}`} role="radiogroup" aria-labelledby="goal-kind" aria-required>
                    {kinds.map(({ value, title }) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={formik.values.goalType === value}
                        className={`${segmented.item} ${formik.values.goalType === value ? segmented.active : ""}`}
                        onClick={() => formik.setFieldValue("goalType", value)}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                  <div className="form-text">{kinds.find((k) => k.value === formik.values.goalType)?.desc}</div>
                </FormGroup>
              )}
            </>
          )}

          {step === "target" && <GoalTargetStep form={formik} partsField={partsField} withDeadline={isGoalsPage} formatCurrency={formatCurrency} />}

          {step === "look" && (
            <GoalLookStep form={formik} notesPlaceholder={t("goals.notesPlaceholder")}>
              {/* Asked, not a checkbox: does it start running, or paused? */}
              <YesNoChoice
                required
                question={t("goals.wizard.startActive")}
                value={formik.values.isActive}
                onChange={(yes) => formik.setFieldValue("isActive", yes)}
                yesLabel={t("goals.statusActive")}
                noLabel={t("common.paused")}
                noHint={t("goals.wizard.startPausedHint")}
                className="mb-0"
              />
              {formik.touched.isActive && formik.errors.isActive && <div className="invalid-feedback d-block">{validationMessage(formik.errors.isActive, t)}</div>}
            </GoalLookStep>
          )}

          {step === "review" && (
            <GoalReview values={formik.values} kindLabel={kindLabel} rows={rows} onGo={(s) => void goTo(s)}>
              {formik.values.isActive === false && (
                <div className="small mt-3 p-2" style={{ background: "var(--bs-warning-bg-subtle)", border: "1px solid var(--bs-warning-border-subtle)", borderRadius: "var(--border-radius-md)" }}>
                  <Trans i18nKey="goals.createdPausedNote" components={{ strong: <strong /> }} />
                </div>
              )}
            </GoalReview>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {step === "what" ? (
            <Button type="button" color="secondary" outline onClick={handleClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => setStep(steps[index - 1])} disabled={formik.isSubmitting}>
              ‹ {t("common.back")}
            </Button>
          )}
          {step === "review" ? (
            <Button type="submit" color="primary" disabled={formik.isSubmitting}>
              {formik.isSubmitting ? t("goals.creating") : t("goals.confirmAndCreate")}
            </Button>
          ) : (
            <Button type="submit" color="primary">
              {t("common.next")} ›
            </Button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}
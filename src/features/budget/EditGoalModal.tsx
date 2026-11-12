import { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { firestoreToDate } from "../../shared/utils/dates";
import { toast } from "react-toastify";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { useTranslation } from "react-i18next";
import { validationMessage } from "../../shared/utils/validationMessage";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback } from "reactstrap";
import type { InvestmentGoalWithStats, UpdateInvestmentGoalDTO, InvestmentGoalType, TargetPeriod } from "../../shared/types/IndexTypes";
import { useGoalPartsField } from "./components/useGoalPartsField";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { FORM_MODAL } from "../../shared/components/formModal";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { GoalLookStep, GoalReview, GoalTargetStep } from "./components/GoalWizard";
import { GOAL_STEP_FIELDS, GOAL_STEP_LABEL, goalReviewRows, type GoalStep } from "./components/goalWizardSteps";
import { iconProblem } from "../../shared/utils/iconText";
import { useAuth } from "../../shared/hooks/useAuth";
import { useCachedList } from "../../shared/hooks/useCachedList";
import { matchNameIn } from "../../shared/utils/nameMatch";
import { NameCheck } from "../../shared/components/NameCheck";
import { investmentKeys } from "./useInvestments";
import type { InvestmentGoal } from "../../shared/types/IndexTypes";

interface EditGoalFormValues {
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
}

const toDateInputValue = (value: unknown): string => {
  if (!value) return "";
  return firestoreToDate(value).toISOString().split("T")[0];
};

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
    then: (s) => s.required("validation.deadlineRequiredCustom"),
    otherwise: (s) => s.optional(),
  }),
  // Optional; when given, it has to come before the goal's own deadline.
  planFrom: Yup.string().test("before-deadline", "validation.planFromAfterDeadline", function (value) {
    const { deadline } = this.parent as { deadline?: string };
    return !value || !deadline || value <= deadline;
  }),
  notes: Yup.string().max(300, "validation.maxChars|300"),
});

interface EditGoalModalProps {
  goal: InvestmentGoalWithStats;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (goalId: string, data: UpdateInvestmentGoalDTO) => Promise<void>;
  /** Hands over to the page's own delete question (which says what goes with it). */
  onDelete?: () => void;
}

/**
 * Correcting a goal or an investment, as the same wizard a new one is written
 * in: «Τι» → «Στόχος» (a targeted one) → «Εμφάνιση» → «Έλεγχος». Every step is
 * already answered, so the rail jumps anywhere at once. The kind is fixed once
 * saved. What is written is the same update the one-page form wrote.
 */
export default function EditGoalModal({ goal, isOpen, onClose, onSubmit, onDelete }: EditGoalModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<GoalStep>("what");
  const { format: formatCurrency } = useCurrencyConverter();

  const isTargeted = goal.goalType === "targeted";
  // Determined once from the saved goal — never changes during editing
  const isGoalsPageGoal = goal.targetPeriod === "custom";

  const formik = useFormik<EditGoalFormValues>({
    enableReinitialize: true,
    initialValues: {
      name: goal.name,
      icon: goal.icon ?? "",
      color: goal.color ?? "#3B82F6",
      notes: goal.notes ?? "",
      goalType: goal.goalType,
      targetAmount: goal.targetAmount ?? "",
      targetPeriod: goal.targetPeriod ?? "monthly",
      deadline: toDateInputValue(goal.deadline),
      planFrom: goal.planFrom ?? "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const data: UpdateInvestmentGoalDTO = {
          name: values.name,
          icon: values.icon || undefined,
          color: values.color || undefined,
          notes: values.notes || undefined,
          targetAmount: isTargeted ? (values.targetAmount as number) : undefined,
          targetPeriod: isTargeted ? values.targetPeriod : undefined,
          deadline: isTargeted && isGoalsPageGoal && values.deadline ? new Date(values.deadline) : undefined,
          // Cleared: `null`, so the date already saved is taken off rather than kept.
          planFrom: isTargeted && isGoalsPageGoal ? values.planFrom || (goal.planFrom ? null : undefined) : undefined,
          // Back to one figure: `null`, so the parts already saved are taken off.
          parts: isTargeted && isGoalsPageGoal ? (partsField.usingParts ? partsField.parts : goal.parts?.length ? null : undefined) : undefined,
        };
        await onSubmit(goal.id, data);
        toast.success(t("goals.updatedSuccess", { name: values.name }));
        celebrateSave({ collection: "investmentGoals", id: goal.id });
        resetForm();
        setStep("what");
        onClose();
      } catch (err) {
        toast.error(t("goals.updateFailed"));
        console.error("EditGoalModal submit error:", err);
      }
    },
  });

  // A trip's target written as its parts — see `goalParts`. The amount follows their «έως» total.
  const partsField = useGoalPartsField(goal.parts, (amount) => formik.setFieldValue("targetAmount", amount));

  const handleClose = () => {
    formik.resetForm();
    setStep("what");
    onClose();
  };

  const changed = formik.dirty || partsField.dirty;
  // Another goal's name is refused; its own is not a clash (`matchName`).
  const { currentUser } = useAuth();
  const otherNames = useCachedList<InvestmentGoal>(investmentKeys.goals(currentUser?.uid ?? ""))
    .filter((g) => g.id !== goal.id)
    .map((g) => g.name);
  const nameMatch = matchNameIn(formik.values.name, otherNames);

  const steps: GoalStep[] = isTargeted ? ["what", "target", "look", "review"] : ["what", "look", "review"];
  const index = Math.max(steps.indexOf(step), 0);
  // Any step can be reached, but not past one that is no longer valid.
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

  const kindLabel = isTargeted ? t("goals.kindTargeted") : t("goals.kindOpenEndedGoal");
  const rows = goalReviewRows({
    values: formik.values,
    kindLabel,
    isTargeted,
    withDeadline: isGoalsPageGoal,
    parts: partsField.usingParts ? partsField.parts : undefined,
    formatCurrency,
    t,
  });

  return (
    <Modal {...FORM_MODAL} isOpen={isOpen} toggle={handleClose} centered size="lg" scrollable>
      <ModalHeader toggle={handleClose}>{t("goals.editTitle", { icon: goal.icon ?? "💰", name: goal.name })}</ModalHeader>
      <form
        id="edit-goal-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") {
            if (changed) void formik.submitForm();
          }
          else void goTo(steps[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={steps} current={step} onGo={(s) => void goTo(s)} label={(s) => t(GOAL_STEP_LABEL[s])} open large />
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }}>
            {t(`goals.wizard.title_${step}`)}
          </div>

          {step === "what" && (
            <FormGroup className="mb-0">
              <Label for="goal-name" className="small fw-medium">
                {t("goals.goalNameLabel")} *
              </Label>
              <Input id="goal-name" type="text" name="name" value={formik.values.name} onChange={formik.handleChange} onBlur={formik.handleBlur} invalid={!!(formik.touched.name && formik.errors.name)} />
              <FormFeedback>{validationMessage(formik.errors.name, t)}</FormFeedback>
              <NameCheck match={nameMatch?.kind === "same" && !formik.touched.name ? null : nameMatch} />
              {/* The kind is what it was saved as. */}
              <div className="form-text">
                {t("goals.typeLabel")}: {kindLabel}
              </div>
            </FormGroup>
          )}

          {step === "target" && <GoalTargetStep form={formik} partsField={partsField} withDeadline={isGoalsPageGoal} formatCurrency={formatCurrency} />}

          {step === "look" && <GoalLookStep form={formik} notesPlaceholder={t("goals.notesPlaceholderEdit")} />}

          {step === "review" && <GoalReview values={formik.values} kindLabel={kindLabel} rows={rows} onGo={(s) => void goTo(s)} />}
        </ModalBody>

        {/* Delete far left, then Back / Cancel; Next or Save on the right. */}
        <ModalFooter className="justify-content-between">
          <div className="d-flex gap-2">
            {onDelete && <DeleteButton opensConfirm iconOnly label={t("common.delete")} onClick={onDelete} disabled={formik.isSubmitting} />}
            {step === "what" ? (
              <Button type="button" color="secondary" outline onClick={handleClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(steps[index - 1])} disabled={formik.isSubmitting}>
                ‹ {t("common.back")}
              </Button>
            )}
          </div>
          {step === "review" ? (
            // Nothing changed, nothing written: an unchanged save would still bump
            // `updatedAt` and spread to every device by the delta sync.
            <Button type="submit" color="success" disabled={formik.isSubmitting || !changed}>
              {formik.isSubmitting ? t("common.saving") : t("goals.confirmAndSave")}
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

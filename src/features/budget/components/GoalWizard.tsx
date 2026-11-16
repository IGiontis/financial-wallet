import type { ChangeEvent, FocusEvent, ReactNode } from "react";
import { Col, FormFeedback, FormGroup, FormText, Input, Label, Row } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../../shared/components/DateField";
import { ViewSwitch } from "../../../shared/components/ViewSwitch";
import { validationMessage } from "../../../shared/utils/validationMessage";
import { PRESET_COLORS, PRESET_ICONS, type GoalFieldValues, type GoalReviewRow, type GoalStep } from "./goalWizardSteps";
import { GoalPartsEditor } from "./GoalPartsEditor";
import { PlanFromField } from "./PlanFromField";
import type { useGoalPartsField } from "./useGoalPartsField";
import wiz from "../../../shared/css/Wizard.module.css";
import { RequiredMark } from "../../../shared/components/RequiredMark";
import { parseISODay } from "../../../shared/utils/dates";

// The goal and investment forms (new and edit) as one wizard, in the shape of
// every other add / edit form: numbered steps — what it is, its target, how it
// looks — then a review whose rows jump back to their step; Save only there.
// Each modal keeps its own Formik form and its own save, so what is written
// stays exactly what the one-page forms wrote; this file is only the steps.

/** The slice of a Formik form the steps use — both modals' forms fit it. */
export interface GoalFormApi {
  values: GoalFieldValues;
  errors: Partial<Record<keyof GoalFieldValues, unknown>>;
  touched: Partial<Record<keyof GoalFieldValues, unknown>>;
  handleChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (e: FocusEvent<HTMLInputElement>) => void;
  setFieldValue: (field: string, value: unknown) => unknown;
  setFieldTouched: (field: string, touched?: boolean) => unknown;
}

type PartsField = ReturnType<typeof useGoalPartsField>;
const msg = validationMessage;
const invalid = (form: GoalFormApi, k: keyof GoalFieldValues) => !!(form.touched[k] && form.errors[k]);

/**
 * Step «Στόχος»: the amount — one figure or its parts — and either the
 * deadline with its «plan from» (a Goals-page goal) or the period (an
 * investment that repeats).
 */
export function GoalTargetStep({ form, partsField, withDeadline, formatCurrency }: { form: GoalFormApi; partsField: PartsField; withDeadline: boolean; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const { values } = form;
  return (
    <>
      {withDeadline && (
        <FormGroup>
          <ViewSwitch
            block
            className="mb-2"
            label={t("goals.amountHow")}
            value={partsField.usingParts ? "parts" : "one"}
            onChange={(v) => partsField.choose(v === "parts")}
            options={[
              { id: "one", label: t("goals.amountOne") },
              { id: "parts", label: t("goals.amountParts") },
            ]}
          />
          {partsField.usingParts && <GoalPartsEditor drafts={partsField.drafts} onChange={partsField.setDrafts} formatCurrency={formatCurrency} showErrors={partsField.showErrors} />}
        </FormGroup>
      )}
      <Row className="g-3">
        {/* Given in parts, the parts above are the amount. */}
        {!(withDeadline && partsField.usingParts) && (
          <Col xs={6}>
            <FormGroup className="mb-0">
              <Label for="goal-target" className="small fw-medium">
                {t("goals.targetAmount")}
                <RequiredMark />
              </Label>
              <Input id="goal-target" aria-required type="number" name="targetAmount" min={1} step={1} placeholder="0" value={values.targetAmount} onChange={form.handleChange} onBlur={form.handleBlur} invalid={invalid(form, "targetAmount")} />
              <FormFeedback>{msg(form.errors.targetAmount, t)}</FormFeedback>
            </FormGroup>
          </Col>
        )}
        <Col xs={6}>
          {withDeadline ? (
            <FormGroup className="mb-0">
              <Label for="goal-deadline" className="small fw-medium">
                {t("goals.deadline")}
                <RequiredMark />
              </Label>
              <DateField
                id="goal-deadline"
                name="deadline"
                value={values.deadline}
                onChange={(v) => form.setFieldValue("deadline", v)}
                onBlur={() => form.setFieldTouched("deadline", true)}
                invalid={invalid(form, "deadline")}
              />
              <FormFeedback>{msg(form.errors.deadline, t)}</FormFeedback>
            </FormGroup>
          ) : (
            <FormGroup className="mb-0">
              <Label for="goal-period" className="small fw-medium">
                {t("goals.periodLabel")}
                <RequiredMark />
              </Label>
              <Input id="goal-period" aria-required type="select" name="targetPeriod" value={values.targetPeriod} onChange={form.handleChange} onBlur={form.handleBlur} invalid={invalid(form, "targetPeriod")}>
                <option value="monthly">{t("goals.periodMonthly")}</option>
                <option value="yearly">{t("goals.periodYearly")}</option>
              </Input>
              <FormFeedback>{msg(form.errors.targetPeriod, t)}</FormFeedback>
            </FormGroup>
          )}
        </Col>
      </Row>
      {withDeadline && (
        <PlanFromField
          value={values.planFrom}
          onChange={(v) => {
            form.setFieldValue("planFrom", v);
            form.setFieldTouched("planFrom", true);
          }}
          maxDate={values.deadline ? (parseISODay(values.deadline) ?? undefined) : undefined}
          // Only once it was touched or Next pressed (item 97b): a stored day that a
          // new deadline overtook is not wrong before anyone looks at this field.
          error={invalid(form, "planFrom") ? msg(form.errors.planFrom, t) : undefined}
        />
      )}
    </>
  );
}

/** Step «Εμφάνιση»: icon, colour and notes — plus whatever the modal adds (a new one's «active?»). */
export function GoalLookStep({ form, notesPlaceholder, children }: { form: GoalFormApi; notesPlaceholder: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const { values } = form;
  const optional = <span className="fw-normal text-body-secondary">({t("common.optional")})</span>;
  return (
    <>
      <FormGroup>
        <Label for="goal-icon" className="small fw-medium">
          {t("goals.icon")} {optional}
        </Label>
        <div className="d-flex flex-wrap gap-1 mb-2">
          {PRESET_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-pressed={values.icon === icon}
              onClick={() => form.setFieldValue("icon", values.icon === icon ? "" : icon)}
              style={{
                fontSize: 20,
                border: `2px solid ${values.icon === icon ? "var(--bs-primary)" : "var(--color-border-tertiary)"}`,
                borderRadius: "var(--border-radius-md)",
                padding: "var(--space-1) 6px",
                background: "transparent",
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              {icon}
            </button>
          ))}
        </div>
        <Input id="goal-icon" type="text" name="icon" placeholder={t("goals.iconPlaceholder")} value={values.icon} onChange={form.handleChange} onBlur={form.handleBlur} invalid={invalid(form, "icon")} style={{ maxWidth: 260 }} />
        <FormFeedback>{msg(form.errors.icon, t)}</FormFeedback>
      </FormGroup>

      <FormGroup>
        <Label className="small fw-medium">
          {t("goals.color")} {optional}
        </Label>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={values.color === color}
              onClick={() => form.setFieldValue("color", color)}
              style={{ width: 28, height: 28, borderRadius: "var(--radius-round)", background: color, border: `3px solid ${values.color === color ? "var(--color-text-primary)" : "transparent"}`, cursor: "pointer", flexShrink: 0 }}
            />
          ))}
          <div className="d-flex align-items-center gap-2">
            <Input type="color" name="color" aria-label={t("goals.customColor")} value={values.color} onChange={form.handleChange} style={{ width: 36, height: 28, padding: 2, cursor: "pointer" }} />
            <span className="small text-body-secondary">{t("goals.customColor")}</span>
          </div>
        </div>
      </FormGroup>

      <FormGroup className={children ? undefined : "mb-0"}>
        <Label for="goal-notes" className="small fw-medium">
          {t("common.notes")}
        </Label>
        <Input id="goal-notes" type="textarea" name="notes" rows={2} placeholder={notesPlaceholder} value={values.notes} onChange={form.handleChange} onBlur={form.handleBlur} invalid={invalid(form, "notes")} />
        <FormFeedback>{msg(form.errors.notes, t)}</FormFeedback>
        <FormText style={{ fontSize: "var(--fs-caption)" }}>{values.notes.length} / 300</FormText>
      </FormGroup>
      {children}
    </>
  );
}

/** The review: the goal as a small card, then every answer — each row back to its step. */
export function GoalReview({ values, kindLabel, rows, onGo, children }: { values: GoalFieldValues; kindLabel: string; rows: GoalReviewRow[]; onGo: (step: GoalStep) => void; children?: ReactNode }) {
  return (
    <>
      <div className="d-flex align-items-center gap-3 mb-3 p-3" style={{ border: `2px solid ${values.color || PRESET_COLORS[0]}`, borderRadius: "var(--border-radius-lg)" }}>
        <span style={{ fontSize: 32 }} aria-hidden>
          {values.icon || "💰"}
        </span>
        <div className="flex-fill" style={{ minWidth: 0 }}>
          <p className="fw-semibold mb-0" style={{ overflowWrap: "anywhere" }}>
            {values.name}
          </p>
          <p className="small text-body-secondary mb-0">{kindLabel}</p>
        </div>
      </div>
      <div className={wiz.wizCard}>
        {rows.map((row) => (
          <button key={row.label} type="button" className={wiz.wizRow} onClick={() => onGo(row.step)}>
            <span className={wiz.wizLabel}>{row.label}</span>
            <span className={wiz.wizValue}>{row.value}</span>
          </button>
        ))}
      </div>
      {children}
    </>
  );
}

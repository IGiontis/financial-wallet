import { format } from "date-fns";
import type { GoalPart, TargetPeriod } from "../../../shared/types/IndexTypes";
import { dayToDate } from "../../../shared/utils/dates";

// The goal wizards' steps and review rows — the data half of GoalWizard.tsx.

export const PRESET_ICONS = ["💰", "🚗", "🏠", "✈️", "🎓", "💻", "🛡️", "🏖️", "🏋️", "💍", "🎸", "📱", "🌍", "🚀", "🐾", "🎉"];
// Stored on the goal as data (its own colour), not a theme colour.
export const PRESET_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

export type GoalStep = "what" | "target" | "look" | "review";
export const GOAL_STEP_LABEL: Record<GoalStep, string> = {
  what: "goals.wizard.stepWhat",
  target: "goals.wizard.stepTarget",
  look: "goals.wizard.stepLook",
  review: "goals.wizard.stepReview",
};
/** Which fields each step answers — what has to be valid before leaving it. */
export const GOAL_STEP_FIELDS: Record<GoalStep, string[]> = {
  what: ["name", "goalType"],
  target: ["targetAmount", "targetPeriod", "deadline", "planFrom"],
  look: ["icon", "color", "notes", "isActive"],
  review: [],
};

export interface GoalFieldValues {
  name: string;
  icon: string;
  color: string;
  notes: string;
  targetAmount: number | "";
  targetPeriod: TargetPeriod;
  deadline: string;
  planFrom: string;
}

export interface GoalReviewRow {
  step: GoalStep;
  label: string;
  value: string;
}

/** The review rows every goal form shows, in step order. */
export function goalReviewRows({
  values,
  kindLabel,
  isTargeted,
  withDeadline,
  parts,
  formatCurrency,
  t,
  extra = [],
}: {
  values: GoalFieldValues;
  kindLabel: string;
  isTargeted: boolean;
  withDeadline: boolean;
  parts?: GoalPart[];
  formatCurrency: (n: number) => string;
  t: (key: string) => string;
  extra?: GoalReviewRow[];
}): GoalReviewRow[] {
  const day = (iso: string) => format(dayToDate(iso), "dd/MM/yyyy");
  return [
    { step: "what", label: t("goals.wizard.nameLabel"), value: values.name },
    { step: "what", label: t("goals.typeLabel"), value: kindLabel },
    ...(isTargeted && values.targetAmount ? [{ step: "target" as GoalStep, label: t("goals.targetLabel"), value: formatCurrency(Number(values.targetAmount)) }] : []),
    ...(parts && parts.length > 0 ? [{ step: "target" as GoalStep, label: t("goals.partsTitle"), value: parts.map((p) => `${p.label} ${p.min === p.max ? formatCurrency(p.max) : `${formatCurrency(p.min)}–${formatCurrency(p.max)}`}`).join(" · ") }] : []),
    ...(isTargeted && !withDeadline ? [{ step: "target" as GoalStep, label: t("goals.periodLabel"), value: values.targetPeriod === "yearly" ? t("goals.periodYearly") : t("goals.periodMonthly") }] : []),
    ...(isTargeted && withDeadline && values.deadline ? [{ step: "target" as GoalStep, label: t("goals.deadline"), value: day(values.deadline) }] : []),
    ...(isTargeted && withDeadline && values.planFrom ? [{ step: "target" as GoalStep, label: t("goals.planFromShort"), value: day(values.planFrom) }] : []),
    { step: "look", label: t("goals.icon"), value: values.icon || "💰" },
    { step: "look", label: t("common.notes"), value: values.notes || "—" },
    ...extra,
  ];
}

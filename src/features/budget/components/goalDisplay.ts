// Presentation helpers shared by InvestmentsPage and GoalsPage. Kept out of the
// component file so React Fast Refresh keeps working during development.

import type { InvestmentGoalWithStats, InvestmentGoalStatus } from "../../../shared/types/IndexTypes";
import { firestoreToDateOrUndefined } from "../../../shared/utils/dates";
import i18n from "../../../i18n";

export const toDate = firestoreToDateOrUndefined;

// Not a component, so it reads the app language straight off the shared i18n
// instance rather than the useTranslation() hook — was hardcoded to en-US
// before, which is why dates here stayed English regardless of app language.
export const formatDate = (date?: Date) => (date ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short", day: "numeric", year: "numeric" }).format(date) : "—");

// Colours are static, labels are not — resolving the label lazily means a
// language switch is picked up instead of being frozen at module-load time.
const STATUS_COLOR: Record<InvestmentGoalStatus, string> = {
  on_track: "success",
  behind: "danger",
  ahead: "info",
  completed: "secondary",
};

const STATUS_LABEL_KEY: Record<InvestmentGoalStatus, string> = {
  on_track: "goals.onTrack",
  behind: "goals.behind",
  ahead: "goals.ahead",
  completed: "common.completed",
};

export function getStatusConfig(status: InvestmentGoalStatus): { label: string; color: string } {
  return { label: i18n.t(STATUS_LABEL_KEY[status]), color: STATUS_COLOR[status] };
}

export function getGoalTypeLabel(goal: InvestmentGoalWithStats): string {
  if (goal.targetPeriod === "monthly") return i18n.t("investments.recurringMonthly");
  if (goal.targetPeriod === "yearly") return i18n.t("investments.recurringYearly");
  if (goal.goalType === "targeted") return i18n.t("categories.goal");
  return i18n.t("investments.tracking");
}

export function getGoalTypeBadgeColor(goal: InvestmentGoalWithStats): string {
  if (goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly") return "primary";
  if (goal.goalType === "targeted") return "warning";
  return "secondary";
}

import { useCallback } from "react";
import { useSavedFlash } from "../../../shared/feedback/saveFeedback";

/**
 * Which goal just saved, for its card or its row to light (`celebrateSave`):
 * the goal itself made or edited («investmentGoals»), or money moved into or
 * out of it («investmentContributions», announced with the goal's id). A new
 * goal's id is not known to its form — the card that appears is the one lit.
 */
export function useGoalFlash(ids: readonly string[]): (id: string) => boolean {
  // The flash alone: a goal's pending mark is the card's own (`usePendingRecords`).
  const goal = useSavedFlash("investmentGoals", ids, "row", { withPending: false });
  const money = useSavedFlash("investmentContributions", ids, "row", { withPending: false });
  return useCallback((id: string) => !!(goal(id) || money(id)), [goal, money]);
}

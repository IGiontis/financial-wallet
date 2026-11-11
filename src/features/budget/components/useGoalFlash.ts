import { useCallback } from "react";
import { useSavedFlash } from "../../../shared/feedback/saveFeedback";

/**
 * Which goal just saved, for its card or its row to light (`celebrateSave`):
 * the goal itself made or edited («investmentGoals»), or money moved into or
 * out of it («investmentContributions», announced with the goal's id). A new
 * goal's id is not known to its form — the card that appears is the one lit.
 */
export function useGoalFlash(ids: readonly string[]): (id: string) => boolean {
  const goal = useSavedFlash("investmentGoals", ids);
  const money = useSavedFlash("investmentContributions", ids);
  return useCallback((id: string) => !!(goal(id) || money(id)), [goal, money]);
}

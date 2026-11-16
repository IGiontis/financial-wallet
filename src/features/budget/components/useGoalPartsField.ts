import { useState } from "react";
import { draftProblem, partDraftsOf, partsFromDrafts, partsTotals, type GoalPartDraft } from "../goalParts";
import type { GoalPart } from "../../../shared/types/IndexTypes";
import { sameValues } from "../../../shared/utils/sameValues";

/** A part as it reads — its id is only a handle for the rows being typed. */
const partContent = (p: GoalPart) => ({ label: p.label, min: p.min, max: p.max });

/**
 * The «Ένα ποσό | Κομμάτια» choice of a goal form, and the parts being typed.
 * The target follows the parts' «έως» total through `onTarget`, so the form's
 * own amount — and its validation — keep working whichever way it was given.
 */
export function useGoalPartsField(initial: GoalPart[] | undefined, onTarget: (amount: number | "") => void) {
  const [usingParts, setUsingParts] = useState(!!initial?.length);
  const [drafts, setDraftsState] = useState<GoalPartDraft[]>(() => partDraftsOf(initial));
  const [showErrors, setShowErrors] = useState(false);
  const parts = partsFromDrafts(drafts);

  const setDrafts = (next: GoalPartDraft[]) => {
    setDraftsState(next);
    onTarget(partsTotals(partsFromDrafts(next)).max || "");
  };
  const choose = (parts: boolean) => {
    setUsingParts(parts);
    if (parts) onTarget(partsTotals(partsFromDrafts(drafts)).max || "");
  };
  /** Whether the parts can be saved — and if not, their faults shown. */
  const check = () => {
    const ok = !usingParts || (parts.length > 0 && !drafts.some((d) => draftProblem(d)));
    if (!ok) setShowErrors(true);
    return ok;
  };
  /** Back to what the form opened with — for a modal that stays mounted between uses. */
  const reset = () => {
    setUsingParts(!!initial?.length);
    setDraftsState(partDraftsOf(initial));
    setShowErrors(false);
  };

  // Changed from what the form opened with: the choice, or the parts it would
  // save — by what they say, in order (deposits fill them in order), through
  // the app's one comparison (`sameValues`: trimmed names, figures as numbers).
  const sameParts = (a: GoalPart[], b: GoalPart[]) => sameValues(a.map(partContent), b.map(partContent));
  const dirty = usingParts !== !!initial?.length || (usingParts && !sameParts(parts, initial ?? []));

  return { usingParts, choose, drafts, setDrafts, parts, showErrors, check, reset, dirty };
}

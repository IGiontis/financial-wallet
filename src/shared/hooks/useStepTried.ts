import { useCallback, useState } from "react";

/**
 * Which steps of a wizard the user has already tried to leave.
 *
 * A form must not open with red already on it: a field's problem is shown
 * only after the user pressed Next (or Save) and was sent back to that step.
 * One flag for the whole wizard was not enough — tried once on step 1, every
 * later step then opened red before anything was typed. So the flag is kept
 * per step: `tried(step)` is true only for the steps that blocked a move.
 */
export function useStepTried<S extends string>() {
  const [steps, setSteps] = useState<ReadonlySet<S>>(() => new Set());
  const mark = useCallback((step: S) => setSteps((prev) => (prev.has(step) ? prev : new Set(prev).add(step))), []);
  const reset = useCallback(() => setSteps((prev) => (prev.size === 0 ? prev : new Set())), []);
  const tried = useCallback((step: S) => steps.has(step), [steps]);
  return { tried, mark, reset };
}

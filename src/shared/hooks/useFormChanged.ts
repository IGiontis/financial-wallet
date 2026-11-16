import { sameValues } from "../utils/sameValues";

/**
 * «No change, no Save» (`.claude/rules/ui.md`) — THE check every edit form
 * makes before it lets Save be pressed.
 *
 *   const { unchanged } = useFormChanged(isEdit ? formik.initialValues : undefined, formik.values);
 *   <UnchangedHint show={unchanged} />
 *   <Button color="primary" disabled={… || unchanged}>Save</Button>
 *   // and in the save handler: if (unchanged) return;
 *
 * `stored` is what the form opened with (the record as the form shows it) —
 * `undefined` for a new record, which is never «unchanged» (it is gated on its
 * required answers instead). `current` is what the form holds now. They are
 * compared by meaning (`sameValues`): trimmed text, numbers as numbers, dates as
 * days, empty = absent, lists by content. Changing a value and changing it back
 * makes the form unchanged again.
 *
 * `normalize`, when given, maps both sides before the comparison: pick the
 * fields that are saved, turn a text-typed figure into a number (`asNumber`),
 * sort a list whose order means nothing (`asSet`).
 *
 * Cheap enough to run on every render (a walk over a form's few fields), so it
 * keeps no memo: forms built from `useState` hand it a new object each time.
 */
export function useFormChanged<T>(stored: T | null | undefined, current: T, normalize?: (value: T) => unknown): { unchanged: boolean; changed: boolean } {
  const unchanged = stored !== undefined && stored !== null && (normalize ? sameValues(normalize(stored), normalize(current)) : sameValues(stored, current));
  return { unchanged, changed: !unchanged };
}

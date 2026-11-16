import { useTranslation } from "react-i18next";

/**
 * «Δεν άλλαξε τίποτα» / "Nothing has changed" — said beside an edit form's
 * Save while `useFormChanged` finds nothing to save (Save is disabled then).
 * Put it straight before the Save button in the footer; it takes no room when
 * hidden. `unchanged-hint` is a hook for tests.
 */
export function UnchangedHint({ show, className = "" }: { show: boolean; className?: string }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <span className={`unchanged-hint small text-body-secondary ${className}`} role="status">
      {t("common.nothingChanged")}
    </span>
  );
}

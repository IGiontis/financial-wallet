import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";

/**
 * Said when a debt that paid part of a goal cannot be changed because its goal
 * or its expense could not be read — with a way to read them again. Without it
 * the Save or Delete just stayed greyed out, and nothing said why.
 */
export function CoveredLoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="alert alert-warning d-flex align-items-center justify-content-between gap-2 small py-2 mt-2" role="alert">
      <span>{t("debts.coveredLoadFailed")}</span>
      <Button color="secondary" outline size="sm" className="text-nowrap" onClick={onRetry}>
        {t("debts.coveredRetry")}
      </Button>
    </div>
  );
}

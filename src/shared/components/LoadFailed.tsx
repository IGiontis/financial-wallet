import { Alert, Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiRefreshCw } from "react-icons/fi";

/**
 * What a page shows when its data did not load — instead of an empty page
 * that reads as "you have nothing here". It says it is trying again on its
 * own (see `installQueryAutoRetry`) and offers to try now.
 */
export function LoadFailed({ onRetry, retrying = false, message }: { onRetry: () => void; retrying?: boolean; message?: string }) {
  const { t } = useTranslation();
  return (
    <Alert color="warning" className="d-flex flex-wrap align-items-center justify-content-between gap-2 small" role="alert">
      <span>{message ?? t("common.loadFailedRetrying")}</span>
      <Button color="warning" size="sm" outline onClick={onRetry} disabled={retrying} className="d-inline-flex align-items-center gap-1">
        <FiRefreshCw aria-hidden className={retrying ? "spin" : undefined} />
        {retrying ? t("common.retrying") : t("common.retryNow")}
      </Button>
    </Alert>
  );
}

import { useTranslation } from "react-i18next";

/**
 * What a page shows where its content goes when its data has still not come
 * after `SKELETON_MAX_MS` (`usePageLoad` → `"waiting"`): one quiet line, under the
 * page's own header and add. Not an error and not an empty state — it claims
 * neither that something failed nor that there is nothing; retries go on
 * silently and the page replaces it the moment the data arrives.
 */
export function PageWaiting({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p role="status" data-page-waiting className={`text-center text-body-secondary mb-0 py-5 ${className}`} style={{ fontSize: "var(--fs-text)" }}>
      {t("common.pageWaiting")}
    </p>
  );
}

export default PageWaiting;

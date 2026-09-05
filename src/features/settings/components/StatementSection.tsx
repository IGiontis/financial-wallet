import { lazy, Suspense, useState } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiFileText } from "react-icons/fi";

// Nothing about a statement is needed until it is asked for, and it pulls in a
// stylesheet and two tables' worth of markup to do its job.
const StatementModal = lazy(() => import("../../statement/StatementModal"));

/**
 * The printable record of a period.
 *
 * Worth being plain about what this is not: a statement is a document to read,
 * hand over or file, and there is no way to load one back in. It is not a
 * backup, and the line below says so rather than letting the presence of an
 * export button imply a safety net that isn't there.
 */
export default function StatementSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button color="secondary" outline onClick={() => setOpen(true)}>
        <FiFileText size={16} className="me-2" />
        {t("statement.open")}
      </Button>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0.75rem 0 0" }}>{t("statement.notABackup")}</p>

      {open && (
        <Suspense fallback={null}>
          <StatementModal onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

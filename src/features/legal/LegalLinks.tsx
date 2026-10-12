import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * «Όροι Χρήσης · Πολιτική Απορρήτου», and the one-line promise under them.
 *
 * The same small line wherever it appears — the app's footer, the sign-in and
 * sign-up pages, the legal pages themselves — so the two pages are always one
 * tap away, signed in or not.
 */
export function LegalLinks({ promise = true }: { promise?: boolean }) {
  const { t } = useTranslation();
  const link = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 } as const;

  return (
    <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
      <Link to="/terms" style={link}>
        {t("legal.terms")}
      </Link>
      {" · "}
      <Link to="/privacy" style={link}>
        {t("legal.privacy")}
      </Link>
      {promise && (
        <>
          {" · "}
          {t("legal.noTracking")}
        </>
      )}
    </span>
  );
}

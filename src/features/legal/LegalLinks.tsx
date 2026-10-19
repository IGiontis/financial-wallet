import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { analyticsConfigured, reopenConsent } from "../../lib/analytics";
import { RecaptchaNotice } from "./RecaptchaNotice";

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
      {/* Where the cookie question is asked again, once it has been answered. */}
      {analyticsConfigured && (
        <>
          {" · "}
          <button type="button" onClick={reopenConsent} className="btn btn-link p-0 align-baseline" style={{ ...link, fontSize: "inherit" }}>
            {t("legal.cookies.settings")}
          </button>
        </>
      )}
      {promise && (
        <>
          {" · "}
          {t("legal.noTracking")}
        </>
      )}
      <RecaptchaNotice className="mt-1" />
    </span>
  );
}

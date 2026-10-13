import { useEffect, useState } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { analyticsConfigured, applyConsent, onConsentChange, readConsent, setConsent } from "../../lib/analytics";

/**
 * The one question about cookies: may Google Analytics count this visit?
 * Asked once, at the foot of the screen, until it is answered; "no" on the
 * left and "yes" on the right, equally easy, as the rules ask.
 */
export function CookieBanner() {
  const { t } = useTranslation();
  const [answered, setAnswered] = useState(() => !!readConsent());

  useEffect(() => {
    // A yes from an earlier visit starts it straight away.
    void applyConsent();
    return onConsentChange(() => setAnswered(!!readConsent()));
  }, []);

  if (!analyticsConfigured || answered) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("legal.cookies.title")}
      className="position-fixed start-0 end-0 bottom-0 p-3"
      style={{ zIndex: 1080, paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div
        className="mx-auto d-flex flex-column flex-sm-row align-items-sm-center gap-3 p-3 rounded-3"
        style={{ maxWidth: 720, background: "var(--color-surface)", border: "1px solid var(--color-border-tertiary)", boxShadow: "var(--shadow-lg)" }}
      >
        <p className="mb-0 small flex-grow-1" style={{ color: "var(--color-text-primary)" }}>
          {t("legal.cookies.text")}{" "}
          {/* A plain link: the banner sits outside the router, over every page. */}
          <a href="/privacy" style={{ color: "inherit", textDecoration: "underline" }}>
            {t("legal.cookies.more")}
          </a>
        </p>
        <div className="d-flex justify-content-between gap-2 flex-shrink-0">
          <Button color="secondary" outline size="sm" onClick={() => setConsent("denied")}>
            {t("legal.cookies.decline")}
          </Button>
          <Button color="primary" size="sm" onClick={() => setConsent("granted")}>
            {t("legal.cookies.accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}

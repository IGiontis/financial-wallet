import { useTranslation } from "react-i18next";
import { appCheckEnabled } from "../../firebase/config";

/**
 * «Προστατεύεται από reCAPTCHA…» — the line Google asks for in place of its
 * badge, which is hidden (index.css): the badge sat in the bottom-right corner,
 * over the page's own buttons. Nothing when App Check is off.
 */
export function RecaptchaNotice({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  if (!appCheckEnabled) return null;
  const link = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 } as const;

  return (
    <span className={className} style={{ display: "block", fontSize: 11, color: "var(--color-text-secondary)" }}>
      {t("legal.recaptchaPrefix")}{" "}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={link}>
        {t("legal.recaptchaPrivacy")}
      </a>{" "}
      {t("legal.recaptchaAnd")}{" "}
      <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" style={link}>
        {t("legal.recaptchaTerms")}
      </a>
      {/* Greek ends on the link ("…της Google."), English after it ("… apply."). */}
      {t("legal.recaptchaSuffix") ? ` ${t("legal.recaptchaSuffix")}` : "."}
    </span>
  );
}

export default RecaptchaNotice;

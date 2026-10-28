import { useTranslation } from "react-i18next";
import { ViewSwitch } from "../../shared/components/ViewSwitch";

/**
 * «Ελληνικά | English» above the sign-in and sign-up forms: before signing in
 * there is no top bar and no flag, and someone who cannot read the page has no
 * way to change it. Each name in its own language, so either reader finds theirs.
 *
 * The language picked here is the one a new account is made with (RegisterPage
 * and Google sign-up save `i18n.resolvedLanguage`); the browser keeps it until then.
 */
export function AuthLanguagePicker() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === "el" ? "el" : "en";
  return (
    <div className="d-flex justify-content-center mb-3">
      <ViewSwitch
        label={t("nav.language")}
        value={language}
        onChange={(next) => void i18n.changeLanguage(next)}
        options={[
          { id: "el", label: "Ελληνικά" },
          { id: "en", label: "English" },
        ]}
      />
    </div>
  );
}

export default AuthLanguagePicker;

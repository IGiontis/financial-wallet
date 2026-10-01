import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "../../i18n";
import { useQuickLanguage } from "./useQuickLanguage";
import segmented from "../../shared/css/Segmented.module.css";
import choice from "../../shared/css/ChoiceSwitch.module.css";

/** Written the way each language writes itself, as the switch shows it. */
const SHORT: Record<LanguageCode, string> = { el: "ΕΛ", en: "EN" };

/** Greek first: it is the app's first language, whatever order the i18n list keeps. */
const ORDER = [...SUPPORTED_LANGUAGES].sort((a, b) => Number(b.code === "el") - Number(a.code === "el"));

/** ΕΛ · EN, beside the theme in the menu and at the foot of the sidebar. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { language, change } = useQuickLanguage();

  return (
    <div role="group" aria-label={t("settings.language")} className={`${segmented.group} ${segmented.even} ${choice.switch} ${className}`}>
      {ORDER.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={language === code}
          // The full name for a screen reader, in its own language: "ΕΛ" read
          // out letter by letter says nothing.
          aria-label={label}
          title={label}
          className={`${segmented.item} ${language === code ? segmented.active : ""} ${choice.option}`}
          onClick={() => change(code)}
        >
          {SHORT[code]}
        </button>
      ))}
    </div>
  );
}

/** One button that flips to the other language, for the collapsed rail. */
export function LanguageToggleButton({ className = "" }: { className?: string }) {
  const { language, change } = useQuickLanguage();
  const other = SUPPORTED_LANGUAGES.find((l) => l.code !== language) ?? SUPPORTED_LANGUAGES[0];

  return (
    <button type="button" className={className} lang={other.code} onClick={() => change(other.code)} aria-label={other.label} title={other.label}>
      {SHORT[other.code]}
    </button>
  );
}

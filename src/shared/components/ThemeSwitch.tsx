import { useTranslation } from "react-i18next";
import { FiMoon, FiSun } from "react-icons/fi";
import { MdBrightnessAuto } from "react-icons/md";
import type { IconType } from "react-icons";
import { nextThemePreference, THEME_PREFERENCES, useTheme, type ThemePreference } from "../hooks/useTheme";
import segmented from "../css/Segmented.module.css";
import styles from "../css/ChoiceSwitch.module.css";

const ICON: Record<ThemePreference, IconType> = { light: FiSun, dark: FiMoon, system: MdBrightnessAuto };
const LABEL: Record<ThemePreference, string> = { light: "nav.themeLight", dark: "nav.themeDark", system: "nav.themeAuto" };

/**
 * Light · Dark · Auto, as the app's own segmented control.
 *
 * Toggle buttons (`aria-pressed`) rather than a radio group: three buttons you
 * can Tab through and press is what this looks like, and a radio group would
 * promise arrow-key behaviour that a row of buttons does not have.
 *
 * `iconsOnly` is for the sidebar's foot, where three words do not fit beside
 * the language; the name is still there for a screen reader and a tooltip.
 */
export function ThemeSwitch({ iconsOnly = false, className = "" }: { iconsOnly?: boolean; className?: string }) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <div role="group" aria-label={t("nav.theme")} className={`${segmented.group} ${segmented.even} ${styles.switch} ${className}`}>
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICON[option];
        const label = t(LABEL[option]);
        const on = preference === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            aria-label={iconsOnly ? label : undefined}
            title={iconsOnly ? label : undefined}
            className={`${segmented.item} ${on ? segmented.active : ""} ${styles.option}`}
            onClick={() => setPreference(option)}
          >
            <Icon size={15} aria-hidden className="flex-shrink-0" />
            {!iconsOnly && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One button that steps Light → Dark → Auto, for a rail too narrow for three.
 * It shows the theme you are on and says which one a press moves to.
 */
export function ThemeCycleButton({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference] ?? FiSun;
  const next = nextThemePreference(preference);
  const label = t("nav.themeNow", { theme: t(LABEL[preference] ?? LABEL.light), next: t(LABEL[next]) });

  return (
    <button type="button" className={className} onClick={() => setPreference(next)} aria-label={label} title={label}>
      <Icon size={18} aria-hidden />
    </button>
  );
}

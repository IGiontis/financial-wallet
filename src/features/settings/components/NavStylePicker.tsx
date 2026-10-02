import { useTranslation } from "react-i18next";
import { NAV_STYLES, useTheme, type NavStyle } from "../../../shared/hooks/useTheme";
// The three styles' sidebar colours, which the previews borrow so each shows
// its own bar whichever one the shell is wearing.
import "../../layout/css/navStyles.css";
import styles from "../css/NavStylePicker.module.css";

const NAME: Record<NavStyle, string> = { a: "settings.navStyleA", b: "settings.navStyleB", c: "settings.navStyleC" };
const LETTER: Record<NavStyle, string> = { a: "settings.navStyleLetterA", b: "settings.navStyleLetterB", c: "settings.navStyleLetterC" };

/** A thumbnail of the shell in one style: the sidebar with its current row, the top bar, a card. */
function Preview({ style }: { style: NavStyle }) {
  return (
    <span className={`${styles.preview} ${styles[style]} nav-style-${style}`} aria-hidden>
      <span className={styles.bar}>
        <span className={styles.logo} />
        <span className={`${styles.row} ${styles.current}`} />
        <span className={styles.row} />
        <span className={styles.row} />
        <span className={styles.row} />
        <span className={styles.foot} />
      </span>
      <span className={styles.page}>
        <span className={styles.top}>
          <span className={styles.avatar} />
        </span>
        <span className={styles.card} />
        <span className={styles.card} />
      </span>
    </span>
  );
}

/**
 * Α · Β · Γ, each with a small picture of itself, applied the moment it is
 * pressed. Toggle buttons (`aria-pressed`), like the theme switch beside it:
 * three things you Tab through and press, not a radio group promising arrow
 * keys.
 */
export function NavStylePicker() {
  const { t } = useTranslation();
  const { navStyle, setNavStyle } = useTheme();

  return (
    <div role="group" aria-label={t("settings.navStyle")} className={styles.choices}>
      {NAV_STYLES.map((option) => {
        const on = navStyle === option;
        return (
          <button key={option} type="button" aria-pressed={on} className={`${styles.choice} ${on ? styles.on : ""}`} onClick={() => setNavStyle(option)}>
            <Preview style={option} />
            <span className={styles.caption}>
              <span className={styles.letter}>{t(LETTER[option])}</span> {t(NAME[option])}
            </span>
          </button>
        );
      })}
    </div>
  );
}

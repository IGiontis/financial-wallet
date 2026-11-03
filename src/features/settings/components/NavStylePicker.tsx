import { useTranslation } from "react-i18next";
import { NAV_STYLES, useTheme, type NavStyle } from "../../../shared/hooks/useTheme";
import styles from "../css/NavStylePicker.module.css";

const NAME: Record<NavStyle, string> = { blue: "settings.colourwayBlue", gold: "settings.colourwayGold" };

/**
 * A thumbnail of the app in one colourway: the shell's frame (sidebar, top bar,
 * footer) in its gradient with the current row lit, and the page with a card
 * and a button on it. Drawn inside `.nav-style-<name>`, which carries that
 * colourway's tokens (styles/tokens.css), so each shows its own colours
 * whichever one the app is wearing, in the light or dark mode on screen.
 */
function Preview({ colourway }: { colourway: NavStyle }) {
  return (
    <span className={`${styles.preview} nav-style-${colourway}`} aria-hidden>
      <span className={styles.bar}>
        <span className={styles.logo} />
        <span className={`${styles.row} ${styles.current}`} />
        <span className={styles.row} />
        <span className={styles.row} />
        <span className={styles.row} />
      </span>
      <span className={styles.main}>
        <span className={styles.top}>
          <span className={styles.avatar} />
        </span>
        <span className={styles.ground}>
          <span className={styles.card}>
            <span className={styles.line} />
            <span className={styles.button} />
          </span>
          <span className={styles.card}>
            <span className={styles.line} />
          </span>
        </span>
        <span className={styles.foot} />
      </span>
    </span>
  );
}

/**
 * «Μπλε εμπιστοσύνης» · «Μαύρο & χρυσό», each with a small picture of
 * itself, applied the moment it is pressed. The colours change and nothing
 * else: the layout, the buttons and the spacing are the same in all three.
 * Toggle buttons (`aria-pressed`), like the theme switch beside it: three
 * things you Tab through and press, not a radio group promising arrow keys.
 */
export function NavStylePicker() {
  const { t } = useTranslation();
  const { navStyle, setNavStyle } = useTheme();

  return (
    <div role="group" aria-label={t("settings.colourway")} className={styles.choices}>
      {NAV_STYLES.map((option) => {
        const on = navStyle === option;
        return (
          <button key={option} type="button" aria-pressed={on} className={`${styles.choice} ${on ? styles.on : ""}`} onClick={() => setNavStyle(option)}>
            <Preview colourway={option} />
            <span className={styles.caption}>{t(NAME[option])}</span>
          </button>
        );
      })}
    </div>
  );
}

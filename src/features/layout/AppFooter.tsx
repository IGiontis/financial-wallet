import { useTranslation } from "react-i18next";
import { LegalLinks } from "../legal/LegalLinks";
import styles from "./css/AppFooter.module.css";

/**
 * The foot of every page: who made it and where the terms are.
 *
 * A strip in the shell's own gradient, the third piece of the frame the
 * sidebar and the top bar make, with a rule above it and room around what is
 * in it — rather than two grey lines hanging at the bottom of the content. On a wide screen the name is at the left and the links
 * at the right; on a phone they stack, centred, so neither is squeezed.
 */
export function AppFooter() {
  const { t } = useTranslation();

  return (
    // `app-shell`: the same frame as the sidebar and the top bar (styles/theme.css).
    <footer className={`app-shell ${styles.footer}`}>
      <div className={styles.who}>
        <span>
          © {new Date().getFullYear()}{" "}
          <a href="https://igiontisportfolio.netlify.app/#home" target="_blank" rel="noopener noreferrer" className={styles.link}>
            Ilias Giontis
          </a>{" "}
          · MyFiWallet
        </span>
        <span className={styles.rights}>{t("common.allRightsReserved")}</span>
      </div>
      <div className={styles.links}>
        <LegalLinks />
      </div>
    </footer>
  );
}

export default AppFooter;

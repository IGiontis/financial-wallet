import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LegalLinks } from "../legal/LegalLinks";
import styles from "./css/AppFooter.module.css";

/**
 * The foot of every page: the app's icon and name, who made it, and the legal
 * lines — «Όροι Χρήσης · Πολιτική Απορρήτου · Χωρίς διαφημίσεις» and, where
 * App Check is on, the reCAPTCHA notice (LegalLinks).
 *
 * Kept low on purpose (the owner, 2026-11-09): one row on a wide screen, a few
 * short lines on a phone, no list of pages — the sidebar is the way around.
 * Painted with the shell's gradient, the third piece of the frame the sidebar
 * and the top bar make (`.app-shell` turns the text roles into the shell's).
 * Its right end stays free for the floating «+» (AddFab), which would
 * otherwise sit on its last line when the page is scrolled to the end.
 */
export function AppFooter() {
  const { t } = useTranslation();

  return (
    // `app-shell`: the same frame as the sidebar and the top bar (styles/theme.css).
    <footer className={`app-shell ${styles.footer}`}>
      <Link to="/" className={styles.brand} aria-label={t("nav.goHome")}>
        <img src="/icon-192.png" alt="" width={28} height={28} className={styles.logo} />
        <span className={styles.name}>MyFiWallet</span>
      </Link>
      <p className={styles.copyright}>
        © {new Date().getFullYear()}{" "}
        <a href="https://igiontisportfolio.netlify.app/#home" target="_blank" rel="noopener noreferrer" className={styles.link}>
          Ilias Giontis
        </a>{" "}
        · MyFiWallet. {t("common.allRightsReserved")}
      </p>
      <div className={styles.legal}>
        <LegalLinks />
      </div>
    </footer>
  );
}

export default AppFooter;

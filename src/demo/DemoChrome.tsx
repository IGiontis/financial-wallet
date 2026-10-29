import { useTranslation } from "react-i18next";
import { Button } from "reactstrap";
import { FiArrowLeft, FiLogIn, FiUserPlus } from "react-icons/fi";
import { leaveDemo } from "./demoMode";
import { isKnownDevice } from "../lib/sessionHint";
import styles from "./css/DemoChrome.module.css";

// ─── The demo's marks on the shell ───────────────────────────────────────────
//
// What tells a visitor this is the demo, and the ways out of it to a real
// account. Each is drawn only where the demo is on (the caller checks
// `isDemo()`); none of them reads or writes anything. Leaving is always
// `leaveDemo` — a full page load — and never an in-app link: inside the demo
// its stand-in user counts as signed in, so /login would only bounce back.

/**
 * «DEMO», at the start of the top bar. Upper case on purpose — it is a badge,
 * not a word in a sentence. What it means is in its hover title, and read out
 * with it for a screen reader, which never sees a title.
 */
export function DemoBadge() {
  const { t } = useTranslation();
  const meaning = t("demoMode.badgeTitle");
  return (
    <span className={styles.chip} title={meaning} data-demo="badge">
      DEMO
      <span className="visually-hidden"> — {meaning}</span>
    </span>
  );
}

/**
 * «Σύνδεση» and «Δημιουργία λογαριασμού» where the account menu would be: the
 * demo's user is no one, so there is nothing of theirs to open — only the way
 * to an account of your own. The words shorten on a phone (see the CSS module);
 * each button keeps its name for a screen reader at every width.
 */
export function DemoAccountActions() {
  const { t } = useTranslation();
  return (
    <div className={styles.actions} data-demo="account-actions">
      <Button color="primary" outline className={`${styles.action} ${styles.signIn}`} onClick={() => leaveDemo("/login")} title={t("demoMode.signIn")}>
        <FiLogIn className={styles.icon} aria-hidden />
        <span className={styles.label}>{t("demoMode.signIn")}</span>
      </Button>
      <Button color="primary" className={styles.action} onClick={() => leaveDemo("/register")} title={t("demoMode.createAccount")}>
        <FiUserPlus className={styles.icon} aria-hidden />
        <span className={styles.label}>
          <span className={styles.longLabel}>{t("demoMode.createAccount")}</span>
          <span className={styles.shortLabel}>{t("demoMode.createAccountShort")}</span>
        </span>
      </Button>
    </div>
  );
}

/**
 * In Settings, in place of what only a real account has — its email, its
 * password, signing out and deleting it. One card saying why they are not
 * here, and the way to an account that has them.
 */
export function DemoAccountNote() {
  const { t } = useTranslation();
  return (
    <section className={styles.note} aria-labelledby="demo-account-note" data-demo="account-note">
      <h2 id="demo-account-note" className={styles.noteTitle}>
        {t("demoMode.noteTitle")}
      </h2>
      <p className={styles.noteBody}>{t("demoMode.noteBody")}</p>
      <Button color="primary" className="d-inline-flex align-items-center gap-2" onClick={() => leaveDemo("/register")}>
        <FiUserPlus aria-hidden />
        {t("demoMode.createAccount")}
      </Button>
    </section>
  );
}

/**
 * «← Πίσω στο demo» under the sign-in and sign-up forms, for someone who came
 * from it: a device no one has signed in on yet opens on the demo, so that is
 * where "/" takes them. A device someone has signed in on never sees the demo,
 * and never sees this. A full page load, like leaving: the demo is decided as a
 * page opens (see `demoMode`).
 */
export function BackToDemoLink() {
  const { t } = useTranslation();
  if (isKnownDevice()) return null;
  return (
    <div className="text-center mt-3">
      <a
        href="/"
        className={styles.backLink}
        data-demo="back-link"
        onClick={(event) => {
          event.preventDefault();
          window.location.assign("/");
        }}
      >
        <FiArrowLeft aria-hidden />
        {t("demoMode.backToDemo")}
      </a>
    </div>
  );
}

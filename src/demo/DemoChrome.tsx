import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "reactstrap";
import { FiArrowLeft, FiChevronDown, FiLogIn, FiPlay, FiUserPlus } from "react-icons/fi";
import { isKnownDevice } from "../lib/sessionHint";
import { useNarrowScreen } from "../shared/hooks/useNarrowScreen";
import { MENU_DIVIDER, RowMenu } from "../shared/components/RowMenu";
import { useGuidedTour } from "./guidedTour/useGuidedTour";
import { openAuthDialog, useAuthDialogMode } from "./authDialog";
import styles from "./css/DemoChrome.module.css";

// ─── The demo's marks on the shell ───────────────────────────────────────────
//
// What tells a visitor this is the demo, and the ways out of it to a real
// account. Each is drawn only where the demo is on (the caller checks
// `isDemo()`); none of them reads or writes anything. The way to an account is
// a dialog over the demo with the real forms (`DemoAuthDialog`); once in, the
// page loads again as the real app, so nothing of the demo goes with them.
//
// On a phone the top bar has no room for a chip, the tour's button and two
// account buttons beside ☰, light/dark and the flag. There the chip opens a
// menu — the tour, signing in, creating an account, and what the demo is —
// and the end of the bar keeps one button: «Εγγραφή», the one it is asking for.

const DemoAuthDialog = lazy(() => import("./DemoAuthDialog"));

/**
 * «DEMO», at the start of the top bar. Upper case on purpose — it is a badge,
 * not a word in a sentence. What it means is in its hover title, and read out
 * with it for a screen reader, which never sees a title. On a phone it is the
 * menu described above.
 */
export function DemoBadge() {
  const { t } = useTranslation();
  const narrow = useNarrowScreen();
  const meaning = t("demoMode.badgeTitle");
  if (narrow) return <DemoMenu />;
  return (
    <span className={styles.chip} title={meaning} data-demo="badge">
      DEMO
      <span className="visually-hidden"> — {meaning}</span>
    </span>
  );
}

/** The phone's «DEMO ▾»: everything the demo offers, in one place. */
function DemoMenu() {
  const { t } = useTranslation();
  const { start, running, hint } = useGuidedTour(true);
  const meaning = t("demoMode.badgeTitle");
  return (
    <RowMenu
      label={`DEMO — ${t("demoMode.menuLabel")}`}
      className={`${styles.chip} ${styles.chipMenu} ${hint ? styles.hint : ""}`}
      menuClassName={styles.menu}
      header={<p className={styles.menuNote}>{meaning}</p>}
      entries={[
        { label: t("guidedTour.button"), onSelect: () => void start(), disabled: running, icon: <FiPlay size={16} aria-hidden /> },
        MENU_DIVIDER,
        { label: t("demoMode.signIn"), onSelect: () => openAuthDialog("login"), icon: <FiLogIn size={16} aria-hidden /> },
        { label: t("demoMode.createAccount"), onSelect: () => openAuthDialog("register"), icon: <FiUserPlus size={16} aria-hidden /> },
      ]}
    >
      <span data-demo="badge">DEMO</span>
      <FiChevronDown className={styles.chevron} aria-hidden />
    </RowMenu>
  );
}

/**
 * The sign-in dialog's one host: drawn with the account buttons, which the
 * demo's top bar always has. Fetched the first time it opens.
 */
function DemoAuthDialogHost() {
  const mode = useAuthDialogMode();
  if (!mode) return null;
  return (
    <Suspense fallback={null}>
      <DemoAuthDialog mode={mode} />
    </Suspense>
  );
}

/**
 * «Σύνδεση» and «Δημιουργία λογαριασμού» where the account menu would be: the
 * demo's user is no one, so there is nothing of theirs to open — only the way
 * to an account of your own. The long word shortens below 768px; on a phone
 * only «Εγγραφή» stays (signing in is in the chip's menu). Each button keeps
 * its name for a screen reader at every width.
 */
export function DemoAccountActions() {
  const { t } = useTranslation();
  const narrow = useNarrowScreen();
  return (
    <div className={styles.actions} data-demo="account-actions">
      {!narrow && (
        <Button color="primary" outline className={styles.action} onClick={() => openAuthDialog("login")} title={t("demoMode.signIn")}>
          <FiLogIn className={styles.icon} aria-hidden />
          <span>{t("demoMode.signIn")}</span>
        </Button>
      )}
      <Button color="primary" className={styles.action} onClick={() => openAuthDialog("register")} title={t("demoMode.createAccount")}>
        <FiUserPlus className={styles.icon} aria-hidden />
        <span className={styles.longLabel}>{t("demoMode.createAccount")}</span>
        <span className={styles.shortLabel} aria-hidden>
          {t("demoMode.createAccountShort")}
        </span>
      </Button>
      <DemoAuthDialogHost />
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
      <Button color="primary" className="d-inline-flex align-items-center gap-2" onClick={() => openAuthDialog("register")}>
        <FiUserPlus aria-hidden />
        {t("demoMode.createAccount")}
      </Button>
    </section>
  );
}

/**
 * «← Πίσω στο demo» under the sign-in and sign-up pages, for someone who came
 * to them from a link: a device no one has signed in on yet opens on the demo,
 * so that is where "/" takes them — as does one whose last user signed out on
 * purpose. A device still known (someone signed in, or a session that ended
 * by itself) never sees the demo, and never sees this. A full page load: the demo is decided as
 * a page opens (see `demoMode`).
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

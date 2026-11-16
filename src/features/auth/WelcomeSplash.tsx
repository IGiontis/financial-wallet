import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { previousOpen, welcomeName } from "../../lib/sessionHint";
import { greekVocative, lastOpenWords } from "./welcomeWords";
import styles from "./css/WelcomeSplash.module.css";
import { dateFormat } from "../../shared/utils/dates";

/**
 * Long enough to be read: its lines fade in one by one, 0.7s apart, the last
 * at about 3.3s — and that one stays readable for a second more. So
 * it stays at least this long even when the app is ready sooner.
 */
export const WELCOME_MIN_MS = 4300;
/** And never longer than this, ready or not: past it, the app's frame shows what is still loading. */
export const WELCOME_MAX_MS = 4700;
/** The fade out. */
const FADE_MS = 300;

/**
 * The first screen of an app open, for someone signed in here: the whole
 * screen, «Καλώς ήρθες πίσω,» and their name in large type, today's date and
 * when they were last here, and a thin bar that says the app is on its way —
 * each coming in after the one before, so there is time to read it. Without a
 * name kept on this device, the greeting alone.
 *
 * It lies over the app rather than holding it back: the shell and the first
 * page draw underneath from the first frame. It goes once the app is `ready`
 * and `WELCOME_MIN_MS` have passed, and at `WELCOME_MAX_MS` whatever happens;
 * a tap or click anywhere, Esc or Enter, closes it at once. With reduced
 * motion the lines still fade in one by one, in place, without rising.
 */
export function WelcomeSplash({ ready }: { ready: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const [now] = useState(() => new Date());
  const [previous] = useState(() => previousOpen(now));
  const [name] = useState(welcomeName);
  const [minPassed, setMinPassed] = useState(false);
  const [maxPassed, setMaxPassed] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const min = window.setTimeout(() => setMinPassed(true), WELCOME_MIN_MS);
    const max = window.setTimeout(() => setMaxPassed(true), WELCOME_MAX_MS);
    return () => {
      window.clearTimeout(min);
      window.clearTimeout(max);
    };
  }, []);

  const leaving = maxPassed || (ready && minPassed);

  useEffect(() => {
    if (!leaving) return;
    // It fades out under reduced motion too: opacity, not movement.
    const timer = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  // Esc or Enter, from anywhere: the welcome is not something to wait out.
  useEffect(() => {
    if (gone) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") setGone(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gone]);

  const today = useMemo(() => dateFormat("dayMonthWeekday", lang).format(now), [lang, now]);

  if (gone) return null;

  return (
    // A tap anywhere closes it — the whole screen is the target, and the keys
    // above do the same for a keyboard.
    <div
      className={`${styles.splash} ${leaving ? styles.leaving : ""}`}
      role="status"
      aria-live="polite"
      aria-busy={!ready}
      data-testid="welcome-splash"
      onClick={() => setGone(true)}
    >
      <div className={styles.inner}>
        <div className={`${styles.badge} ${styles.step1}`} aria-hidden>
          💳
        </div>
        <h1 className={styles.greeting}>
          <span className={`${styles.lead} ${styles.step2}`}>{name ? t("auth.splash.backLead") : t("auth.splash.back")}</span>{" "}
          {name && <span className={`${styles.name} ${styles.step3}`}>{lang === "el" ? greekVocative(name) : name}</span>}
        </h1>
        <p className={`${styles.date} ${styles.step4}`}>
          {today}
          {previous && (
            <>
              <span className={styles.dot} aria-hidden>
                ·
              </span>
              {t("auth.splash.lastOpen", { when: lastOpenWords(previous, now, lang) })}
            </>
          )}
        </p>
        <div className={`${styles.track} ${styles.step5}`} aria-hidden>
          <div className={styles.bar} />
        </div>
        <p className={`${styles.skip} ${styles.step5}`}>{t("auth.splash.tapToSkip")}</p>
      </div>
    </div>
  );
}

export default WelcomeSplash;

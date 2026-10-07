import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { updateUser } from "../../firebase/firestore";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";
import type { User } from "../../shared/types/IndexTypes";
import styles from "./css/Topbar.module.css";

/** Greece: nine stripes and the cross, cut to a circle. */
function GreekFlag() {
  return (
    <svg viewBox="0 0 18 18" width="22" height="22" aria-hidden>
      <defs>
        <clipPath id="flag-circle-gr">
          <circle cx="9" cy="9" r="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-circle-gr)">
        <rect width="18" height="18" fill="#0D5EAF" />
        {[1, 3, 5, 7].map((i) => (
          <rect key={i} y={i * 2} width="18" height="2" fill="#fff" />
        ))}
        <rect width="10" height="10" fill="#0D5EAF" />
        <rect x="4" width="2" height="10" fill="#fff" />
        <rect y="4" width="10" height="2" fill="#fff" />
      </g>
      <circle cx="9" cy="9" r="8.5" fill="none" stroke="rgba(0,0,0,0.15)" />
    </svg>
  );
}

/** The United Kingdom: the union flag, cut to a circle. */
function BritishFlag() {
  return (
    <svg viewBox="0 0 18 18" width="22" height="22" aria-hidden>
      <defs>
        <clipPath id="flag-circle-uk">
          <circle cx="9" cy="9" r="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-circle-uk)">
        <rect width="18" height="18" fill="#012169" />
        <path d="M0 0 18 18M18 0 0 18" stroke="#fff" strokeWidth="3.6" />
        <path d="M0 0 18 18M18 0 0 18" stroke="#C8102E" strokeWidth="1.4" />
        <path d="M9 0v18M0 9h18" stroke="#fff" strokeWidth="5" />
        <path d="M9 0v18M0 9h18" stroke="#C8102E" strokeWidth="3" />
      </g>
      <circle cx="9" cy="9" r="8.5" fill="none" stroke="rgba(0,0,0,0.15)" />
    </svg>
  );
}

/**
 * Ελληνικά ↔ English, from the top bar: the flag of the language on screen,
 * and a tap for the other one.
 *
 * Saved where Settings saves it — the account's own `locale` — as well as
 * applied: the app sets the language from the account on every load, so a
 * change made only on screen would be undone by the next one.
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const greek = (i18n.resolvedLanguage ?? "en") === "el";
  const next = greek ? "en" : "el";

  const toggle = async () => {
    await i18n.changeLanguage(next);
    if (!currentUser) return;
    queryClient.setQueryData(exchangeRateKeys.user(currentUser.uid), (old: User | null) => ({ ...(old ?? {}), locale: next }) as User);
    // The screen has already changed; a failed save only means the next load
    // opens in the language the account still holds.
    updateUser(currentUser.uid, { locale: next }).catch(() => undefined);
  };

  const label = greek ? t("nav.switchToEnglish") : t("nav.switchToGreek");
  return (
    <Button color="link" className={`${styles.iconButton} ${styles.languageToggle}`} onClick={toggle} aria-label={label} title={label}>
      {greek ? <GreekFlag /> : <BritishFlag />}
    </Button>
  );
}

export default LanguageToggle;

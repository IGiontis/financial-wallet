import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { updateUser } from "../../firebase/firestore";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";
import type { User } from "../../shared/types/IndexTypes";
import { BritishFlag, GreekFlag } from "../../shared/components/Flags";
import styles from "./css/Topbar.module.css";

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

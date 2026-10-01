import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { updateUser } from "../../firebase/firestore";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "../../i18n";
import { useAuth } from "../../shared/hooks/useAuth";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";
import type { User } from "../../shared/types/IndexTypes";

/**
 * The language, switched in one press and kept on the account.
 *
 * The same three steps the Settings page takes when its preferences are saved —
 * the language on the user document, `i18n.changeLanguage`, and the cached copy
 * of the document — in the other order: here the reader sees the new language
 * at once and the write follows. On a phone with no signal the write waits in
 * Firestore's queue while the app is already in the language they picked, which
 * is the whole point of a quick switch. The language is not one of the settings
 * `offlinePolicy` holds back: unlike the currency it changes no figure.
 *
 * The cache goes first because `LanguageSync` puts the language back to
 * whatever the cached document says; left stale, it would undo the switch on
 * the next render. If the write is refused, both go back to how they were.
 */
export function useQuickLanguage() {
  const { i18n, t } = useTranslation();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const language: LanguageCode = SUPPORTED_LANGUAGES.find((l) => i18n.resolvedLanguage?.startsWith(l.code))?.code ?? "en";

  const change = (code: LanguageCode) => {
    if (code === language) return;
    const previous = language;
    const uid = currentUser?.uid;
    const key = exchangeRateKeys.user(uid ?? "");
    const setCachedLocale = (locale: string) => queryClient.setQueryData(key, (old: User | null | undefined) => (old ? ({ ...old, locale } as User) : old));

    if (uid) setCachedLocale(code);
    void i18n.changeLanguage(code);
    if (!uid) return;

    updateUser(uid, { locale: code }).catch(() => {
      setCachedLocale(previous);
      void i18n.changeLanguage(previous);
      toast.error(t("settings.preferencesFailed"));
    });
  };

  return { language, change };
}

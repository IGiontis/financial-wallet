import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import el from "./locales/el.json";

// ─── Supported languages ──────────────────────────────────────────────────────
// Add a locale here and drop a matching JSON file in ./locales to support it.

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANGUAGE_STORAGE_KEY = "app-language";

// Locale used for number/date formatting per language
export const INTL_LOCALES: Record<LanguageCode, string> = {
  en: "en-US",
  el: "el-GR",
};

/** The Intl locale for an i18next language code — "el" → "el-GR", anything unknown → English. */
export function intlLocale(language: string | undefined): string {
  const code = SUPPORTED_LANGUAGES.find((l) => language?.startsWith(l.code))?.code ?? "en";
  return INTL_LOCALES[code];
}

// ─── <html lang> ──────────────────────────────────────────────────────────────
// index.html ships with one fixed `lang`. Screen readers pick their voice from
// it, and CSS `text-transform: uppercase` only drops Greek accents when the
// document says it is Greek — so it follows the UI language from the first
// render on. Registered before `init` so the initial language counts too.

const syncDocumentLanguage = () => {
  if (typeof document !== "undefined" && i18n.resolvedLanguage) document.documentElement.lang = i18n.resolvedLanguage;
};
i18n.on("languageChanged", syncDocumentLanguage);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      el: { translation: el },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    // "el-GR" and "el" should both resolve to our "el" bundle
    load: "languageOnly",
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

syncDocumentLanguage();

export default i18n;

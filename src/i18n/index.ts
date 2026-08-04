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

export default i18n;

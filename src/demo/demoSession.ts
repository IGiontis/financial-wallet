import type { QueryClient } from "@tanstack/react-query";
import type { i18n as I18n } from "i18next";
import { demoCollections, demoData, type DemoLanguage } from "./fixtures";
import { doc, memoryCollection, memoryTouched, resetMemoryFirestore, updateDoc } from "./memoryFirestore";
import { notifyDemoReseed, watchForSignIn } from "./demoMode";
import { DEMO_UID } from "./demoUser";

// ─── Starting the demo ───────────────────────────────────────────────────────
//
// Fills the in-memory store with the made-up account, in the language the app
// is showing, before the first screen asks for anything.
//
// When the language changes, an account nobody has touched yet is made again
// in the new one — its bills, its shops, its goals are words — and every query
// is reset to read it. One the visitor has already written to is kept as it
// is: a coffee added a minute ago, or the currency chosen in the same Settings
// save that changed the language, matters more than the words its bills are
// named in. Only the language it is said to be in follows.

export const demoLanguage = (language: string | undefined): DemoLanguage => (language?.startsWith("el") ? "el" : "en");

let seededIn: DemoLanguage | undefined;

/**
 * Puts a fresh copy of the account in the store, and has every other copy of
 * the old one dropped. The display currency the visitor chose carries over;
 * the language is the one asked for. Returns that language.
 */
export function seedDemo(language: string | undefined, now: Date = new Date()): DemoLanguage {
  const lang = demoLanguage(language);
  const previous = memoryCollection("users")[DEMO_UID];
  const data = demoData(lang, now);
  if (previous?.currency === "EUR" || previous?.currency === "USD" || previous?.currency === "GBP") data.user.currency = previous.currency;
  resetMemoryFirestore(demoCollections(data));
  notifyDemoReseed();
  seededIn = lang;
  return lang;
}

/**
 * Seeds the store, keeps it in the app's language, and leaves the demo for the
 * real app once someone signs in. Called once, as the page loads, when the
 * page is the demo. Returns the unsubscribe, for tests.
 */
export function startDemo(i18n: I18n, queryClient: QueryClient): () => void {
  seedDemo(i18n.resolvedLanguage ?? i18n.language);
  const onLanguage = (language: string) => {
    const lang = demoLanguage(language);
    if (lang === seededIn) return;
    if (memoryTouched()) {
      // The visitor's account stays; only what it says its language is
      // changes, so the next read of the user does not turn the app back.
      seededIn = lang;
      void updateDoc(doc(null, "users", DEMO_UID), { locale: lang }).catch(() => {});
      return;
    }
    seedDemo(language);
    void queryClient.resetQueries();
  };
  i18n.on("languageChanged", onLanguage);
  const stopWatching = watchForSignIn();
  return () => {
    i18n.off("languageChanged", onLanguage);
    stopWatching();
  };
}

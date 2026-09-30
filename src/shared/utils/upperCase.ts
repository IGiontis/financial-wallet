/**
 * Upper-cases UI text the way the given language writes capitals.
 *
 * Greek drops the accent in capitals — «Ημερομηνία» is «ΗΜΕΡΟΜΗΝΙΑ», never
 * «ΗΜΕΡΟΜΗΝΊΑ». `toUpperCase()` keeps the tonos, and whether
 * `toLocaleUpperCase("el")` removes it depends on the browser, so it is taken
 * off here first. Dropping it from a vowel in front of ι or υ would turn the
 * pair into a diphthong (Μάιος → ΜΑΙΟΣ), so that ι/υ takes a dialytika
 * instead (ΜΑΪΟΣ), as Greek typesetting does.
 *
 * Every other language goes through `toLocaleUpperCase` unchanged.
 */
export function localeUpperCase(text: string, language: string | undefined): string {
  if (!language?.startsWith("el")) return text.toLocaleUpperCase(language);
  return text
    .normalize("NFD")
    .replace(/([αεουΑΕΟΥ])́([ιΙ])(?![́̈])/g, "$1$2̈")
    .replace(/([αεηοΑΕΗΟ])́([υΥ])(?![́̈])/g, "$1$2̈")
    .replace(/́/g, "")
    .normalize("NFC")
    // Plain upper-casing from here: the accents are already gone, and this
    // way the result does not depend on the engine's Greek rules.
    .toUpperCase();
}

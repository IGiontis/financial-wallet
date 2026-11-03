// ─── The words of the welcome ────────────────────────────────────────────────
//
// «Καλώς ήρθες πίσω, Ηλία» — in Greek a name said to someone takes the
// vocative, and «…πίσω, Ηλίας» reads as a form letter. Only the common
// masculine endings change, and only where the rule is regular:
//
//   -ας → -α     Ηλίας → Ηλία, Λουκάς → Λουκά
//   -ης → -η     Γιάννης → Γιάννη, Θανάσης → Θανάση
//   -ος → -ο     stressed on the last but one: Νίκος → Νίκο, Γιώργος → Γιώργο
//   -ος → -ε     stressed earlier: Αλέξανδρος → Αλέξανδρε, Θεόδωρος → Θεόδωρε
//
// Everything else — women's names, names in Latin letters, an -ος whose stress
// cannot be read — is said as it was typed, which is never wrong-looking.

const VOWELS = "αεηιουωάέήίόύώϊϋΐΰ";
const STRESSED = "άέήίόύώΐΰ";

/** Syllable nuclei, counting a run of vowels as one (good enough for stress position). */
function vowelGroups(word: string): { start: number; end: number }[] {
  const groups: { start: number; end: number }[] = [];
  const lower = word.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    if (!VOWELS.includes(lower[i])) continue;
    const start = i;
    // «αι», «ει», «οι», «ου», «αυ», «ευ» are one sound; a stressed second
    // letter («αΐ») or a diaeresis splits them, and is rare enough in names.
    while (i + 1 < lower.length && VOWELS.includes(lower[i + 1]) && !STRESSED.includes(lower[i + 1])) i++;
    groups.push({ start, end: i });
  }
  return groups;
}

/** The vocative of a Greek first name, where it is regular; otherwise the name as given. */
export function greekVocative(name: string): string {
  const trimmed = name.trim();
  // One word only: «Μαρία Ελένη» or a full name is left alone.
  if (!trimmed || /\s/.test(trimmed) || !/^[Ͱ-Ͽἀ-῿]+$/.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  const keepCase = (replacement: string) => (trimmed === trimmed.toUpperCase() ? replacement.toUpperCase() : replacement);

  if (/(ας|άς)$/.test(lower)) return trimmed.slice(0, -1);
  if (/(ης|ής)$/.test(lower)) return trimmed.slice(0, -1);
  if (/(ος|ός)$/.test(lower)) {
    const groups = vowelGroups(lower);
    const stressedAt = groups.findIndex((g) => Array.from(lower.slice(g.start, g.end + 1)).some((c) => STRESSED.includes(c)));
    if (stressedAt < 0) return trimmed;
    const fromEnd = groups.length - 1 - stressedAt;
    // fromEnd 0 is the last syllable («Θεός»): no rule here, as typed.
    if (fromEnd === 1) return trimmed.slice(0, -2) + keepCase("ο");
    if (fromEnd >= 2) return trimmed.slice(0, -2) + keepCase("ε");
  }
  return trimmed;
}

/**
 * «σήμερα», «χθες», «πριν από 3 ημέρες» — or, a week and more back, the date.
 * Counted in calendar days, so last night at 23:50 is «χθες» at 00:10.
 */
export function lastOpenWords(previous: Date, now: Date, lang: string): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(now) - day(previous)) / 86_400_000);
  if (days < 7) return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(-Math.max(days, 0), "day");
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", ...(previous.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).format(previous);
}

/**
 * What a user typed, as it is kept: no space at the start or the end, never
 * two spaces in a row inside. «  Σκι   διακοπές  » is saved as «Σκι διακοπές».
 *
 * Line breaks are the user's own layout and stay — a multi-line note keeps its
 * lines, each trimmed at both ends, and at most one empty line between two
 * paragraphs. Blank lines at the very start or end go. A one-line field never
 * has a line break to keep (an `<input>` strips them).
 *
 * Every writer that stores user text passes it through here — see
 * `cleanTextFields`, which the Firestore writers apply — and every name
 * comparison folds through `textKey`, which starts from the same cleaning.
 */
export function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

/** A one-line name: any run of whitespace — line breaks too — is one space. */
export function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * The key two names are compared by: cleaned, then case-, accent- and
 * final-sigma-insensitive. «  Ταξίδι  » and «ταξιδι» are the same name.
 */
export function textKey(value: string): string {
  return cleanLine(value).normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(/ς/g, "σ");
}

/**
 * The stored fields that hold text a person typed. Only these are cleaned:
 * ids, keys and codes pass through untouched.
 */
const LINE_FIELDS = new Set(["name", "description", "label", "person", "heldBy", "coveredBy", "goalName", "place", "displayName", "firstName", "lastName", "city", "country", "payee"]);
const MULTILINE_FIELDS = new Set(["notes", "note"]);

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * A document about to be written, with every user-text field cleaned — at any
 * depth, so a goal's parts, a bill's pause, the planner's lines and the
 * accounts list on the user document are covered too. Dates, Firestore
 * sentinels and other class instances are left exactly as they are.
 */
export function cleanTextFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cleanTextFields(item)) as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string") out[key] = MULTILINE_FIELDS.has(key) ? cleanText(v) : LINE_FIELDS.has(key) ? cleanLine(v) : v;
    else out[key] = cleanTextFields(v);
  }
  return out as T;
}

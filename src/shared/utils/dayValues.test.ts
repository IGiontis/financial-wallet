import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The app's one rule for "a day" (dates.ts, 2026-11-16): a stored date is read
// as its LOCAL calendar day (`toISODay`) and a picked day is saved as local
// midnight (`dayToDate` / `parseISODay`). Two shortcuts break it and have:
//
//  - `toISOString()` cut to a day (`.slice(0, 10)`, `.split("T")`, …) reads the
//    date in UTC — in Greece a record at local midnight opened in the edit form
//    on the day BEFORE the one the list showed;
//  - `new Date(<form string>)` parses "yyyy-MM-dd" as UTC midnight — a day
//    early anywhere west of Greenwich, and a different hour from every other
//    writer everywhere.
//
// Neither may appear in app code outside dates.ts. A whole-moment
// `toISOString()` (a key, a reading's `at`, a <time dateTime>) is fine.

const SRC = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const RULES: { what: string; pattern: RegExp }[] = [
  { what: "toISOString() cut to a day — use toISODay()", pattern: /toISOString\(\)\s*\.\s*(slice|substring|substr|split)\s*\(/ },
  { what: "new Date(<form value>) — use dayToDate()/parseISODay()", pattern: /new Date\(\s*(formik\.)?values\.\w+\s*\)/ },
  { what: "new Date(iso) on a day string — use dayToDate()/parseISODay()", pattern: /new Date\(\s*iso\w*\s*\)/ },
];

describe("a day is read and written one way (dates.ts)", () => {
  it("no app file reads or writes a day through UTC", () => {
    const found: string[] = [];
    for (const path of files(SRC)) {
      const name = relative(SRC, path).replace(/\\/g, "/");
      if (name === "shared/utils/dates.ts") continue;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          for (const rule of RULES) if (rule.pattern.test(line)) found.push(`${name}:${index + 1} ${rule.what}`);
        });
    }
    expect(found).toEqual([]);
  });

  it("the rules catch what they are meant to", () => {
    const hit = (line: string) => RULES.some((rule) => rule.pattern.test(line));
    expect(hit(`return firestoreToDate(value).toISOString().split("T")[0];`)).toBe(true);
    expect(hit(`const d = date.toISOString().slice(0, 10);`)).toBe(true);
    expect(hit(`date: new Date(values.date),`)).toBe(true);
    expect(hit(`date: new Date(formik.values.date),`)).toBe(true);
    expect(hit(`format(new Date(iso), "dd/MM/yyyy")`)).toBe(true);
    expect(hit(`<time dateTime={now.toISOString()}>`)).toBe(false);
    expect(hit(`at: new Date().toISOString(),`)).toBe(false);
  });
});

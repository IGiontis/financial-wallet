import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ONE place for date logic and date display (2026-11-16): `shared/utils/dates.ts`.
//
// Each screen used to build its own `Intl.DateTimeFormat` — some 130 of them,
// in six different looks for the same kind of date («16 Νοε 2026», «Nov 16,
// 2026», «06 Νοε 2026» …) — and some twenty files kept their own `startOfDay`
// or `sameDay`. A screen now names the look it wants (`formatDay`,
// `formatMonthYear`, `dateFormat("dayShort", lang)` …) and counts days with
// the shared `startOfDay` / `sameDay` / `daysBetween`, so the same kind of
// date reads the same everywhere and money code counts days one way.
//
// Outside dates.ts (tests and the demo aside) none of these may appear.

const SRC = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const HELPERS = "sameDay|isSameDay|startOfDay|endOfDay|daysBetween";

const RULES: { what: string; pattern: RegExp }[] = [
  { what: "toLocaleDateString / toLocaleTimeString — use a formatter from dates.ts", pattern: /\.toLocale(Date|Time)String\(/ },
  { what: "new Intl.DateTimeFormat — use a formatter (or dateFormat(look, lang)) from dates.ts", pattern: /new Intl\.DateTimeFormat\(/ },
  { what: "setHours(0, 0, 0, 0) — use startOfDay() from dates.ts", pattern: /\.setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/ },
  {
    what: "a local day helper — import it from dates.ts",
    pattern: new RegExp(`\\bfunction\\s+(${HELPERS})\\b|\\b(const|let)\\s+(${HELPERS})\\s*(:[^=]+)?=\\s*(\\(|async\\b|function\\b|\\w+\\s*=>)`),
  },
  { what: "an inline local midnight — use startOfDay() from dates.ts", pattern: /new Date\(\s*([\w.]+)\.getFullYear\(\)\s*,\s*\1\.getMonth\(\)\s*,\s*\1\.getDate\(\)\s*\)/ },
  { what: "date-fns format() with a display pattern — use a formatter from dates.ts (toISODay/monthKey for keys)", pattern: /\bformat\([^;]*?,\s*"[^"]*(yy|MM|dd|EEE|LLL)[^"]*"/ },
];

const skip = (name: string) => name === "shared/utils/dates.ts" || name.startsWith("demo/");

describe("dates are counted and shown one way (dates.ts)", () => {
  it("no app file formats a date or counts a day by itself", () => {
    const found: string[] = [];
    for (const path of files(SRC)) {
      const name = relative(SRC, path).replace(/\\/g, "/");
      if (skip(name)) continue;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          for (const rule of RULES) if (rule.pattern.test(line)) found.push(`${name}:${index + 1} ${rule.what}`);
        });
    }
    expect(found).toEqual([]);
  });

  it("the rules catch what they are meant to, and leave the rest alone", () => {
    const hit = (line: string) => RULES.some((rule) => rule.pattern.test(line));
    // Caught: every shape the local copies took.
    expect(hit(`return d.toLocaleDateString(lang, { month: "short" });`)).toBe(true);
    expect(hit(`const t = created.toLocaleTimeString("el");`)).toBe(true);
    expect(hit(`const fmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric" }), [lang]);`)).toBe(true);
    expect(hit(`  r.setHours(0, 0, 0, 0);`)).toBe(true);
    expect(hit(`new Date().setHours(0,0,0,0)`)).toBe(true);
    expect(hit(`function startOfDay(d: Date): Date {`)).toBe(true);
    expect(hit(`const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());`)).toBe(true);
    expect(hit(`const sameDay = (a: unknown, b: unknown) => {`)).toBe(true);
    expect(hit(`export function isSameDay(a: Date | null, b: Date | null): boolean {`)).toBe(true);
    expect(hit(`const daysBetween = (a: Date, b: Date) => Math.round(1);`)).toBe(true);
    expect(hit(`const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());`)).toBe(true);
    expect(hit(`if (d < new Date(row.date.getFullYear(), row.date.getMonth(), row.date.getDate())) {`)).toBe(true);
    expect(hit(`<span>{format(firestoreToDate(p.paidDate), "dd MMM yyyy", { locale })}</span>`)).toBe(true);
    expect(hit(`const key = format(d, "yyyy-MM");`)).toBe(true);
    // Left alone: using the shared pieces, a whole-moment key, other dates.
    expect(hit(`const fmt = dateFormat("dayShort", lang);`)).toBe(false);
    expect(hit(`dateFmt: Intl.DateTimeFormat;`)).toBe(false);
    expect(hit(`const startOfToday = startOfDay(now);`)).toBe(false);
    expect(hit(`const writtenThatDay = sameDay(created, day);`)).toBe(false);
    expect(hit(`return new Date(year, month, Math.min(day, lastDay));`)).toBe(false);
    expect(hit(`const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);`)).toBe(false);
    expect(hit(`r.setHours(12, 0, 0, 0);`)).toBe(false);
    expect(hit(`formatCurrency(amount)`)).toBe(false);
    expect(hit(`new Intl.NumberFormat(locale, { style: "currency" })`)).toBe(false);
  });
});

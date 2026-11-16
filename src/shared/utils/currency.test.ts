import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { currencyLabel, currencySymbol, MONEY_MARKS } from "./currency";

describe("currencySymbol", () => {
  it("writes each currency the app offers with its own sign", () => {
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("GBP")).toBe("£");
  });

  it("falls back to the euro with no code, and never to a prototype's name", () => {
    expect(currencySymbol(undefined)).toBe("€");
    expect(currencySymbol("")).toBe("€");
    expect(currencySymbol("toString")).toBe("toString");
  });

  it("asks the browser for any other code", () => {
    expect(currencySymbol("JPY")).toBe("¥");
  });

  it("labels the Settings picker", () => {
    expect(currencyLabel("USD")).toBe("USD — US Dollar ($)");
    expect(currencyLabel("GBP")).toBe("GBP — British Pound (£)");
  });

  it("strips every sign and code an amount may carry", () => {
    expect(" 214,50 € ".replace(MONEY_MARKS, "")).toBe("214,50");
    expect("$1,842.30".replace(MONEY_MARKS, "")).toBe("1,842.30");
    expect("£25".replace(MONEY_MARKS, "")).toBe("25");
    expect("120 eur".replace(MONEY_MARKS, "")).toBe("120");
  });
});

// ─── Convention: no «€» typed into the app ────────────────────────────────────
// A user keeps his money in dollars, euros or pounds; a «€» written into a
// screen or a string is wrong for two of the three. Figures go through
// `useCurrencyConverter().format`, input suffixes through `currencySymbol`.
// Allowed: comments, tests, the demo's invented data, and the helper itself.

const SRC = join(__dirname, "..", "..");
const ALLOWED = new Set(["shared/utils/currency.ts"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|json)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The source without its comments: block (JSX ones too) and line comments. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("no hardcoded «€»", () => {
  const sources = files(SRC)
    .map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }))
    .filter(({ path }) => !ALLOWED.has(path) && !path.startsWith("demo/") && !/fixtures?\b/i.test(path));

  it("scans the app and the locale files", () => {
    // The scan must keep seeing what it is meant to see.
    expect(sources.some(({ path }) => path === "i18n/locales/el.json")).toBe(true);
    expect(sources.some(({ path }) => path === "features/accounts/BankCard.tsx")).toBe(true);
  });

  it("no «€» outside comments, tests, demo data and the currency helper", () => {
    const found = sources.flatMap(({ path, text }) => {
      const body = path.endsWith(".json") ? text : withoutComments(text);
      return body
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => line.includes("€"))
        .map(({ line }) => `${path}: ${line.trim().slice(0, 100)}`);
    });
    expect(found).toEqual([]);
  });
});

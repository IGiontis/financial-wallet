import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { toneChip } from "./tone";

// Every tint of a meaning — income, expense, goal, invest, pending — comes from
// the one scale in index.css («Tones»). There used to be forty different
// percentages across the app and no two pages agreed; this keeps a new one from
// creeping back in.

const SRC = join(__dirname, "..", "..");
const RAW_TINT = /color-mix\(in srgb, var\(--color-(income|expense|goal|invest|pending)\) [\d.]+%/g;

/** The few that are not tints but colours of their own, each with its reason in place. */
const ALLOWED = new Set([
  // Muted "late" lettering: red pulled toward the secondary text colour.
  "features/bills/css/BillsPage.module.css:color-mix(in srgb, var(--color-expense) 80%",
  "features/bills/css/BillsPage.module.css:color-mix(in srgb, var(--color-expense) 75%",
  // The salary mark: a dark green, the colour pulled toward the text.
  "features/incomes/css/IncomesPage.module.css:color-mix(in srgb, var(--color-income) 72%",
]);

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith(".css") && !path.endsWith("index.css") ? [path] : [];
  });
}

describe("the tone scale", () => {
  it("is the only place a meaning's tint is mixed — no stylesheet sets a percentage of its own", () => {
    const strays = cssFiles(SRC).flatMap((file) => {
      const name = relative(SRC, file).split("\\").join("/");
      return [...readFileSync(file, "utf8").matchAll(RAW_TINT)].map((m) => `${name}:${m[0]}`).filter((hit) => !ALLOWED.has(hit));
    });
    expect(strays).toEqual([]);
  });

  it("gives a chip the shared wash and the text-safe colour, stronger when asked", () => {
    expect(toneChip("income")).toEqual({ background: "var(--income-wash)", color: "var(--color-income-text)" });
    expect(toneChip("goal", true)).toEqual({ background: "var(--goal-wash-strong)", color: "var(--color-goal-text)" });
  });
});

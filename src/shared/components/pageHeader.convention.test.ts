import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// «The page header is the shared card» (.claude/rules/ui.md 8, owner 2026-11-19):
// one `PageHeader` on every routed page of the signed-in app, never a header of
// a page's own. This test is the part of that rule a test can see: a new page
// added to `APP_PAGES` without the shared header fails here.
//
// Not checked: the public pages outside the app shell — the legal documents and
// sign-in / sign-up, which have their own layout and no page chrome.

const SRC = join(__dirname, "..", "..");

/** The chunk → file map in `lib/pageChunks.ts`, read as text so nothing is imported. */
function chunkFiles(): Record<string, string> {
  const text = readFileSync(join(SRC, "lib", "pageChunks.ts"), "utf8");
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(\w+):\s*\(\)\s*=>\s*import\("\.\.\/([^"]+)"\)/g)) out[m[1]] = `${m[2]}.tsx`;
  return out;
}

/** The names in `APP_PAGES` — the pages of the signed-in app. */
function appPages(): string[] {
  const text = readFileSync(join(SRC, "lib", "pageChunks.ts"), "utf8");
  const block = /APP_PAGES[^=]*=\s*\[([^\]]+)\]/.exec(text);
  return [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Pages whose header is drawn by a frame they share, and the file that draws
 * it. Both goal screens sit in `GoalsWorkbench`.
 */
const FRAME: Record<string, string> = {
  "features/goals/GoalsPage.tsx": "features/budget/components/GoalsWorkbench.tsx",
  "features/budget/InvestmentsPage.tsx": "features/budget/components/GoalsWorkbench.tsx",
};

/** Routed pages that live in another page's chunk, so `pageChunks` does not name them. */
const ALSO_ROUTED = ["features/debts/DebtPersonPage.tsx", "features/business/NewClosingPage.tsx"];

describe("the page header is the shared card", () => {
  const files = chunkFiles();
  const pages = appPages();

  it("every page of the signed-in app is in pageChunks", () => {
    expect(pages.filter((name) => !files[name])).toEqual([]);
  });

  it("every routed page draws its header with PageHeader", () => {
    const paths = [...pages.map((name) => files[name]), ...ALSO_ROUTED];
    const without = paths.filter((path) => {
      const where = FRAME[path] ?? path;
      return !/\bPageHeader\b/.test(readFileSync(join(SRC, where), "utf8"));
    });
    expect(without).toEqual([]);
  });

  it("`AddHeader` is gone — the card replaced it", () => {
    const paths = [...pages.map((name) => files[name]), ...ALSO_ROUTED, ...new Set(Object.values(FRAME))];
    const left = paths.filter((path) => /\bAddHeader\b/.test(readFileSync(join(SRC, path), "utf8")));
    expect(left).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// «The page header is the shared BAND» (.claude/rules/ui.md 8, owner
// 2026-11-24, «option Β»): one `PageHeader` on every routed page of the
// signed-in app, never a header of a page's own — and it is a band on the
// page's surface, edge to edge and flush under the top bar, not the soft card
// it was from 2026-11-19. This test is the part of that rule a test can see:
// a new page added to `APP_PAGES` without the shared header fails here, and so
// does a band that grows a radius, a shadow, a gap above it or a sticky
// position.
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

describe("the page header is the shared band", () => {
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

  it("`AddHeader` is gone — the shared header replaced it", () => {
    const paths = [...pages.map((name) => files[name]), ...ALSO_ROUTED, ...new Set(Object.values(FRAME))];
    const left = paths.filter((path) => /\bAddHeader\b/.test(readFileSync(join(SRC, path), "utf8")));
    expect(left).toEqual([]);
  });
});

// ─── The look: a band, not a card ────────────────────────────────────────────

const css = (path: string) => readFileSync(join(SRC, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** One rule's declarations, by its selector, from a stylesheet with no comments. */
const rule = (text: string, selector: string): string => {
  const found = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) => sel.trim() === selector);
  if (!found) throw new Error(`no rule \`${selector}\``);
  return found[2];
};

describe("the header is a band", () => {
  const header = css("shared/css/PageHeader.module.css");
  const band = rule(header, ".header");

  it("runs on the page's own surface, edge to edge, with a base it can be seen to end on", () => {
    expect(band).toMatch(/background:\s*var\(--surface\)/);
    expect(band).toMatch(/border-bottom:\s*1px solid var\(--border-soft\)/);
    // Out by exactly what the shell holds the page in by, both sides and up.
    expect(band).toMatch(/margin:\s*calc\(-1 \* var\(--page-bleed-top[^)]*\)\) calc\(-1 \* var\(--page-bleed-x[^)]*\)\)/);
    expect(css("shared/css/PageShell.module.css")).toMatch(/--page-bleed-x:|--page-bleed-top:/);
  });

  it("is not a card any more: no radius, no shadow, no edge all round", () => {
    expect(band).not.toMatch(/border-radius/);
    expect(band).not.toMatch(/box-shadow/);
    // `border-bottom` only — never a `border:` of its own.
    expect(band).not.toMatch(/(^|[;\s])border:/);
  });

  it("is not sticky, and does not re-add the notch the top bar already paints", () => {
    expect(header).not.toMatch(/position:\s*(sticky|fixed)/);
    expect(header).not.toMatch(/safe-area-inset/);
  });

  it("gives its bottom padding back to the page's tabs, so they sit on its base", () => {
    expect(rule(header, ".controls > [data-band]")).toMatch(/margin-bottom:\s*calc\(-1 \* var\(--band-pad-y\)\)/);
  });
});

describe("the page's tabs are the band's base", () => {
  const tabs = css("shared/css/PageTabs.module.css");

  it("in the band: underlines, no box — the chosen one in the brand, on a 2px brand line", () => {
    const tab = rule(tabs, ".band .tab");
    expect(tab).toMatch(/border-bottom:\s*2px solid transparent/);
    expect(tab).toMatch(/background:\s*none/);
    expect(tab).toMatch(/color:\s*var\(--text-2\)/);
    const active = rule(tabs, ".band .tab.active");
    expect(active).toMatch(/border-bottom-color:\s*var\(--brand\)/);
    expect(active).toMatch(/color:\s*var\(--brand-text\)/);
    // Not the filled brand box it wears on a bare page.
    expect(active).toMatch(/background:\s*none/);
    expect(active).not.toMatch(/--color-segment-active\b/);
  });

  // The words stand out (rule 2, owner 2026-11-24): a step up the scale from
  // the boxed tabs and heavier, the chosen one heavier still. A size in px
  // here would also fail `typeScale.test.ts`.
  it("the band's words are a step bigger and bolder than the boxed ones", () => {
    const boxed = rule(tabs, ".tab");
    const tab = rule(tabs, ".band .tab");
    expect(boxed).toMatch(/font-size:\s*var\(--fs-text\)/);
    expect(boxed).toMatch(/font-weight:\s*400/);
    expect(tab).toMatch(/font-size:\s*var\(--fs-lead\)/);
    expect(tab).toMatch(/font-weight:\s*600/);
    expect(rule(tabs, ".band .tab.active")).toMatch(/font-weight:\s*700/);
  });

  it("on a phone the gap gives way, never the words", () => {
    // The only phone rule in here narrows the row's gap; no font-size with it.
    const phone = /@media \(max-width: 575\.98px\) \{\s*([^{}]*\{[^{}]*\})\s*\}/.exec(tabs)?.[1] ?? "";
    expect(phone).toMatch(/gap:\s*var\(--space-3\)/);
    expect(phone).not.toMatch(/font-size/);
  });

  it("off the band: the boxes, unchanged", () => {
    expect(rule(tabs, ".tab.active")).toMatch(/background:\s*var\(--color-segment-active\)/);
  });

  it("still one row that scrolls sideways when tight, never a second row", () => {
    const strip = rule(tabs, ".strip");
    expect(strip).toMatch(/overflow-x:\s*auto/);
    expect(strip).toMatch(/grid-auto-flow:\s*column/);
    expect(tabs).not.toMatch(/flex-wrap:\s*wrap/);
    // The band keeps the scroller: it only changes what the row looks like.
    expect(rule(tabs, ".band")).not.toMatch(/overflow/);
  });
});

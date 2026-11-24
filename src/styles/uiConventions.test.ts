import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The page rules in CLAUDE.md («Every page looks like the others — MUST»), the
// parts a test can see in the source. The rest is the side-by-side screenshots.

const SRC = join(__dirname, "..");
/** Line endings differ between a checkout and a working tree here (core.autocrlf). */
const LINES = /\r?\n/;

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return ext.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const sources = files(SRC, /\.tsx$/).map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }));
/** Every stylesheet, comments stripped — a rule a test can see in the CSS. */
const styles = files(SRC, /\.css$/).map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));

/** Every `<Button …>` opening tag, with its line. */
function buttons(text: string): { line: number; tag: string }[] {
  const out: { line: number; tag: string }[] = [];
  const re = /<Button\b[^>]*>/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ line: text.slice(0, m.index).split("\n").length, tag: m[0] });
  return out;
}

describe("UI conventions", () => {
  it("no button is green: saves, confirms, «Ήρθε» and «Πληρώθηκε» wear the brand colour", () => {
    const green = sources.flatMap(({ path, text }) => buttons(text).filter((b) => /color=\{?["']success["']/.test(b.tag)).map((b) => `${path}:${b.line}`));
    expect(green).toEqual([]);
  });

  it("no hand-made Bootstrap button group: a one-of-many choice is the shared segmented control", () => {
    const groups = sources.filter(({ text }) => /\bbtn-group\b|<ButtonGroup\b/.test(text)).map(({ path }) => path);
    expect(groups).toEqual([]);
  });

  it("no page tells the user a load failed or asks them to try again — retries are silent", () => {
    const told = sources.filter(({ text }) => /\bLoadFailed\b|\bLoadErrorBar\b|loadFailedRetrying/.test(text)).map(({ path }) => path);
    expect(told).toEqual([]);
  });

  // The page header is a BAND, edge to edge and flush under the top bar
  // (rule 8, owner 2026-11-24, «option Β»), and only the shared one may pull
  // itself out to the content area's edges: a page doing that arithmetic on its
  // own is the hand-rolled header coming back. What the band itself looks like
  // is checked in `shared/components/pageHeader.convention.test.ts`.
  it("only the shared header reaches the page's edges", () => {
    const pulling = styles.filter(({ text }) => /--page-bleed/.test(text)).map(({ path }) => path);
    expect(pulling.sort()).toEqual(["shared/css/PageHeader.module.css", "shared/css/PageShell.module.css"]);
  });

  // One tab look on every page (the owner, 2026-11-12, re-cut as the band's
  // base 2026-11-24): `PageTabs`. A tablist anywhere else is a second look in
  // the making, and so is a brand underline strip of a page's own.
  it("page tabs are built only by PageTabs: no other tablist", () => {
    const tabRole = /\brole(?:=\{?|:\s*)["'`]tab(?:list)?["'`]/;
    const builders = sources.filter(({ text }) => tabRole.test(text)).map(({ path }) => path);
    // PageTabs itself must match, or the pattern has stopped seeing anything.
    expect(builders).toEqual(["shared/components/PageTabs.tsx"]);
  });

  // The segmented control is for a one-of-many choice (a period, a filter, a
  // form's «Έξοδο / Έσοδο»): it marks the pick with `aria-pressed`/`aria-checked`.
  // Tabs say `aria-selected`, section links `<NavLink>` — either beside it means
  // Segmented is being dressed up as tabs.
  it("the segmented control is never dressed up as tabs", () => {
    const asTabs = sources
      .filter(({ text }) => /Segmented\.module\.css["']/.test(text))
      .filter(({ text }) => /\baria-selected\b|<NavLink\b/.test(text))
      .map(({ path }) => path);
    expect(asTabs).toEqual([]);
  });

  it("only PageTabs wears the page tabs' styles", () => {
    const users = sources.filter(({ text }) => /PageTabs\.module\.css["']/.test(text)).map(({ path }) => path);
    expect(users).toEqual(["shared/components/PageTabs.tsx"]);
  });

  // The chosen tab's 2px brand underline belongs to `PageTabs` in the header's
  // band. A page that draws its own is a second tab look (the one already on
  // the books is `InvestmentsShared`'s history filter, COMPONENTS.md «Known
  // drift» 16 — inline-styled, not CSS, and a filter, so it should be
  // `Segmented`).
  it("the band's brand underline is PageTabs' alone", () => {
    const copies = styles.filter(({ text }) => /border-bottom(-color)?:\s*(2px solid )?var\(--brand\)/.test(text)).map(({ path }) => path);
    expect(copies).toEqual(["shared/css/PageTabs.module.css"]);
  });

  // One dialog title, one size (rule 16, owner 2026-11-23: he spotted it on the
  // Planner). Half the dialogs wrapped their title in a `--fs-lead` span, 14px
  // against the `.modal-title`'s own 20px. The title goes in `<ModalHeader>`
  // with no size of its own; a wrapper may still carry flex, a gap, an icon or
  // `textTransform`, and a SECOND line under the title may be smaller
  // (ArrivedSheet's subtitle), so only the first line of a header is checked.
  it("no dialog title carries a font size of its own", () => {
    const sized = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/<ModalHeader[^>]*>([\s\S]{0,240}?)<\/ModalHeader>/g)].flatMap((m) => {
        const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
        const firstLine = m[1].split(LINES).slice(0, 2).join(" ");
        return /fontSize/.test(openTag) || /fontSize/.test(firstLine) ? [`${path}:${text.slice(0, m.index).split(LINES).length}`] : [];
      }),
    );
    expect(sized).toEqual([]);
  });
});

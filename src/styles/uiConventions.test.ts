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

  // One tab look on every page (the owner, 2026-11-12): `PageTabs`. A tablist
  // anywhere else is a second look in the making.
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

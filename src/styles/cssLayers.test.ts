import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Bootstrap lives in a cascade layer under every rule the app writes (index.css,
// «Cascade layers»). Without it the production build — which links the CSS of
// shared chunks BEFORE the sheet holding Bootstrap — lets Bootstrap beat
// one-class module rules (item 88: the date field's icon fell against the date).
// These checks fail the moment Bootstrap is imported unlayered again, the
// order of the layers changes, or an app `!important` is written outside the
// layer where it can still beat Bootstrap's own `!important` utilities.

const SRC = join(__dirname, "..");
const ROOT = join(SRC, "..");
const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const ORDER = "@layer app-important, app-base, bootstrap, theme;";

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return ext.test(name) ? [path] : [];
  });
}

/** Each `!important` in a stylesheet, with whether it sits inside `@layer app-important { … }`. */
function importants(css: string): { line: number; layered: boolean }[] {
  const text = stripComments(css);
  const out: { line: number; layered: boolean }[] = [];
  const stack: string[] = [];
  let header = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      stack.push(header.trim());
      header = "";
    } else if (c === "}") {
      stack.pop();
      header = "";
    } else if (c === ";") {
      header = "";
    } else {
      header += c;
      if (text.startsWith("!important", i)) {
        out.push({ line: text.slice(0, i).split("\n").length, layered: stack.some((h) => /^@layer\s+app-important$/.test(h)) });
      }
    }
  }
  return out;
}

/** `!important`s with nothing of Bootstrap's to beat, each with its reason. */
const UNLAYERED_OK = new Set([
  // The date picker on a phone, over Floating UI's inline position.
  "index.css",
  // The tour overlay's z-index, over driver.js's inline one.
  "demo/guidedTour/css/guidedTour.css",
]);

describe("Bootstrap in a cascade layer", () => {
  const index = stripComments(read(join(SRC, "index.css")));

  it("declares the layers first, in the order that makes the app win", () => {
    expect(index.trimStart().startsWith(ORDER)).toBe(true);
  });

  it("imports Bootstrap and the skeleton sheet into the bootstrap layer", () => {
    expect(index).toMatch(/@import\s+"bootstrap\/dist\/css\/bootstrap\.min\.css"\s+layer\(bootstrap\);/);
    expect(index).toMatch(/@import\s+"react-loading-skeleton\/dist\/skeleton\.css"\s+layer\(bootstrap\);/);
  });

  it("is imported nowhere else, where it would land unlayered", () => {
    const strays = files(SRC, /\.(tsx?|css)$/)
      .filter((f) => !f.endsWith("index.css") && !f.endsWith(".test.ts"))
      .filter((f) => /bootstrap(\.min)?\.css|skeleton\.css/.test(read(f)))
      .map((f) => relative(SRC, f));
    expect(strays).toEqual([]);
  });

  it("has its order declared in index.html before any stylesheet is linked", () => {
    const html = read(join(ROOT, "index.html"));
    const decl = html.indexOf(`<style>${ORDER}</style>`);
    expect(decl).toBeGreaterThan(-1);
    const firstSheet = html.search(/<link[^>]+rel="stylesheet"|<style>(?!@layer)/);
    expect(firstSheet === -1 || firstSheet > decl).toBe(true);
  });

  it("keeps every app !important in the app-important layer", () => {
    const strays = files(SRC, /\.css$/).flatMap((f) => {
      const name = relative(SRC, f).split("\\").join("/");
      if (UNLAYERED_OK.has(name)) return [];
      return importants(read(f))
        .filter((i) => !i.layered)
        .map((i) => `${name}:${i.line}`);
    });
    expect(strays).toEqual([]);
  });

  it("puts theme.css's one-class rules on Bootstrap's pieces in the theme layer, under the modules", () => {
    const theme = stripComments(read(join(SRC, "styles", "theme.css")));
    for (const sel of [".form-control, .form-select, .input-group-text", ".dropdown-item", ".btn-primary", ".card", ".form-check-input"]) {
      const at = theme.search(new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/, /g, ",\\s*")}\\s*\\{`));
      expect(at, sel).toBeGreaterThan(-1);
      expect(theme.slice(Math.max(0, at - 20), at), sel).toMatch(/@layer theme \{\s*$/);
    }
  });

  it("can tell a layered !important from an unlayered one", () => {
    expect(importants("@layer app-important { .a { color: red !important; } } .b { color: red !important; }")).toEqual([
      { line: 1, layered: true },
      { line: 1, layered: false },
    ]);
  });
});

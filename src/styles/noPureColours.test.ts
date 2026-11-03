import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// No pure white and no pure black, anywhere in the app — the owner's rule: a
// #ffffff card glares and a #000000 shadow reads as a hole. Near-white and
// near-black (tokens.css) do the same jobs without either.
//
// The places checked: the whole app, since phase 2 cleaned every folder.
const SCANNED = ["src"];

/**
 * Words that only look like a colour. A card's finish is saved by name, and
 * "black" is one of them (accountTones.ts draws it in near-black); renaming the
 * key would orphan what is already stored.
 */
const ALLOWED = new Set(["src/features/accounts/accountsUtils.ts: \"black\"", "src/features/accounts/accountTones.ts: \"black\""]);

const ROOT = join(__dirname, "..", "..");

/** Every CSS, TS and TSX file under the scanned places, tests aside. */
function files(): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry));
    } else if (/\.(css|tsx?)$/.test(path) && !/\.test\.tsx?$/.test(path)) {
      out.push(path);
    }
  };
  for (const place of SCANNED) walk(join(ROOT, place));
  return out;
}

/** Comments say "white" and "black" as words; only what is drawn counts. */
const stripComments = (source: string, css: boolean) =>
  css
    ? source.replace(/\/\*[\s\S]*?\*\//g, "")
    : source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** Pure white or pure black, in every way CSS and an SVG attribute can say it. */
const PURE = [
  // #fff #ffff #ffffff #ffffffXX, and the same in zeros — also inside a data: URI (%23).
  /(?:#|%23)(?:(?:fff|000)[0-9a-f]?|(?:ffffff|000000)(?:[0-9a-f]{2})?)(?![0-9a-z])/gi,
  // rgb()/rgba(), comma or space syntax, any alpha.
  /rgba?\(\s*(?:255\s*[,\s]\s*255\s*[,\s]\s*255|0\s*[,\s]\s*0\s*[,\s]\s*0)(?![\d.])/gi,
  // hsl()/hsla() at full or no lightness.
  /hsla?\(\s*[\d.]+(?:deg)?\s*[,\s]\s*[\d.]+%\s*[,\s]\s*(?:100|0)%/gi,
];

/** The names, as a CSS value (not `white-space`) or as a quoted value in code. */
const NAMED_CSS = /(?<![-\w])(?:white|black)(?![-\w])/gi;
const NAMED_CODE = /["'`](?:white|black)["'`]/gi;

function offences(path: string): string[] {
  const css = path.endsWith(".css");
  const source = stripComments(readFileSync(path, "utf8"), css);
  const found = [...PURE, css ? NAMED_CSS : NAMED_CODE].flatMap((pattern) => source.match(pattern) ?? []);
  return found.map((hit) => `${relative(ROOT, path).replace(/\\/g, "/")}: ${hit}`);
}

describe("no pure white or pure black", () => {
  it("finds the files it is meant to check", () => {
    const all = files().map((f) => relative(ROOT, f).replace(/\\/g, "/"));
    expect(all).toContain("src/styles/tokens.css");
    expect(all).toContain("src/index.css");
    expect(all.some((f) => f.startsWith("src/features/layout/"))).toBe(true);
    expect(all.some((f) => f.startsWith("src/shared/"))).toBe(true);
  });

  it("catches every way of writing them, and lets the near ones and the words through", () => {
    const hits = (text: string, css = true) => [...PURE, css ? NAMED_CSS : NAMED_CODE].flatMap((p) => text.match(p) ?? []);
    for (const pure of ["#fff", "#FFF", "#ffffff", "#000", "#000000", "#ffffff80", "%23fff", "rgb(255, 255, 255)", "rgba(0,0,0,0.2)", "rgb(0 0 0 / 50%)", "hsl(0, 0%, 100%)", "color: white;", "fill: black"]) {
      expect(hits(pure), pure).not.toEqual([]);
    }
    expect(hits(`fill="white"`, false)).not.toEqual([]);
    for (const near of ["#fafbfc", "#0b0f14", "%23111", "#fff8f0", "#000a12", "rgba(248, 250, 252, 0.35)", "rgba(0, 10, 20, 0.2)", "white-space: nowrap", "hsl(0, 0%, 99%)"]) {
      expect(hits(near), near).toEqual([]);
    }
    expect(hits(`label="Black & gold"`, false)).toEqual([]);
  });

  it("are used nowhere in the scanned places", () => {
    expect(files().flatMap(offences).filter((hit) => !ALLOWED.has(hit))).toEqual([]);
  });
});

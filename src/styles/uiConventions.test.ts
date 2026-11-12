import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The page rules in CLAUDE.md («Every page looks like the others — MUST»), the
// parts a test can see in the source. The rest is the side-by-side screenshots.

const SRC = join(__dirname, "..");

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

  it("no page tells the user a load failed or asks them to try again — retries are silent", () => {
    const told = sources.filter(({ text }) => /\bLoadFailed\b|\bLoadErrorBar\b|loadFailedRetrying/.test(text)).map(({ path }) => path);
    expect(told).toEqual([]);
  });
});

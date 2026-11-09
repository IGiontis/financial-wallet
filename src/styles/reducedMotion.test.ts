import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Reduced motion drops MOVEMENT, not the effects (the owner, 2026-11-04/07):
// his laptop asks for less motion — Windows' «Animation effects» off — and
// whole animations used to switch off there, so the goal tiles, the dialogs'
// fades and the menus were still on his phone and dead on his PC. Under
// `prefers-reduced-motion: reduce` a rule may stop a thing travelling, growing
// or turning; whatever it plays instead is a fade or a change of colour.

const ROOT = join(__dirname, "..", "..");

function cssFiles(): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry));
    } else if (path.endsWith(".css")) {
      out.push(path);
    }
  };
  walk(join(ROOT, "src"));
  return out;
}

const read = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const name = (path: string) => relative(ROOT, path).replace(/\\/g, "/");

/** The body of every block whose prelude matches, braces balanced. */
function blocks(css: string, prelude: RegExp): { head: string; body: string }[] {
  const out: { head: string; body: string }[] = [];
  const re = new RegExp(prelude.source, "g");
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const open = css.indexOf("{", m.index);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) {
        out.push({ head: css.slice(m.index, open).trim(), body: css.slice(open + 1, i) });
        break;
      }
    }
  }
  return out;
}

const sources = cssFiles().map((path) => ({ path: name(path), css: read(path) }));
const reduceBlocks = sources.flatMap(({ path, css }) => blocks(css, /@media[^{]*prefers-reduced-motion:\s*reduce[^{]*/).map((b) => ({ path, ...b })));
const keyframes = new Map(sources.flatMap(({ css }) => blocks(css, /@keyframes\s+[\w-]+/).map((b) => [b.head.replace(/@keyframes\s+/, ""), b.body] as const)));

describe("reduced motion", () => {
  it("is asked about somewhere — the check below has blocks to read", () => {
    expect(reduceBlocks.length).toBeGreaterThan(5);
  });

  it("never keeps an effect for those who did NOT ask (no `no-preference` gate)", () => {
    const gated = sources.filter(({ css }) => /prefers-reduced-motion:\s*no-preference/.test(css)).map(({ path }) => path);
    expect(gated).toEqual([]);
  });

  it("keeps the motion timings, so fades and colour changes still ease", () => {
    const zeroed = reduceBlocks.filter(({ body }) => /--motion-[\w-]+\s*:/.test(body)).map(({ path }) => path);
    expect(zeroed).toEqual([]);
  });

  it("takes the rise out of the dialogs and toasts (shape.css)", () => {
    const shape = reduceBlocks.filter(({ path }) => path === "src/styles/shape.css");
    expect(shape.some(({ body }) => /--rise:\s*0\b/.test(body))).toBe(true);
  });

  it("plays only keyframes that do not move anything", () => {
    const played = reduceBlocks.flatMap(({ path, body }) =>
      [...body.matchAll(/animation(?:-name)?\s*:\s*([^;]+);/g)]
        .map((m) => m[1].trim().split(/\s+/)[0])
        .filter((first) => first !== "none")
        .map((frames) => ({ path, frames })),
    );
    expect(played.length).toBeGreaterThan(5);
    for (const { path, frames } of played) {
      const body = keyframes.get(frames);
      expect(body, `${path}: @keyframes ${frames} not found`).toBeDefined();
      expect(body, `${path}: @keyframes ${frames} moves`).not.toMatch(/\b(transform|translate|scale|rotate|top|left)\s*:/);
    }
  });
});

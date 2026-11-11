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

  // THE ONE NAMED EXCEPTION (the owner, 2026-11-11): the goal tanks' surface — a
  // small, slow wave flowing sideways — keeps playing under reduce. His own
  // Windows asks for reduced motion and the water has to move; this is gentle,
  // non-vestibular motion. What follows reduce there is the big one-off play
  // (stream, splash, bubbles, drain) and the level's slide. People who need
  // stillness have Settings → «Κινούμενα εφέ: Όχι», which stops every endless
  // animation (next test). CLAUDE.md, «Reduced motion drops movement…», says so.
  it("lets the goal tanks' wave flow under reduce — sideways only, never a blink — and nothing else of theirs", () => {
    const card = sources.find(({ path }) => path.endsWith("GoalCard.module.css"))!;
    const reduce = reduceBlocks.filter(({ path }) => path === card.path).map((b) => b.body).join("\n");
    expect(reduce, "the wave is not switched off under reduce").not.toMatch(/\.liquid::(before|after)/);
    // The wave: a row slid left, nothing that brightens, pulses, rises or turns.
    const flow = keyframes.get("tankFlow");
    expect(flow).toBeDefined();
    expect(flow).toMatch(/translateX\(/);
    expect(flow).not.toMatch(/opacity|translateY|scale|rotate|filter|background|color/);
    const wave = [...card.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => /\.liquid::(before|after)/.test(sel)).map(([, , body]) => body).join(";");
    expect(wave).toMatch(/animation:\s*tankFlow\b[^;]*infinite/);
    expect(wave).not.toMatch(/opacity/);
    // What follows reduce: the level does not slide, the save's play is hidden.
    expect(blocks(reduce, /\.liquid\s/).map((b) => b.body).join(";")).toMatch(/transition:\s*none/);
    expect(reduce).toMatch(/\.stream,\s*\.fx\s*\{[^}]*display:\s*none/);
  });

  it("stops every endless animation with «Κινούμενα εφέ: Όχι» (--loop-play)", () => {
    const index = sources.find(({ path }) => path === "src/index.css")!;
    expect(index.css).toMatch(/:root\[data-motion="off"\]\s*\{[^}]*--loop-play:\s*paused/);
    const endless = sources.flatMap(({ path, css }) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) => /animation[\w-]*\s*:[^;]*\binfinite\b/.test(body)).map(([, sel, body]) => ({ path, sel: sel.trim(), body })),
    );
    expect(endless.length).toBeGreaterThanOrEqual(4);
    for (const { path, sel, body } of endless) {
      expect(body, `${path} ${sel}`).toMatch(/animation-play-state:\s*var\(--loop-play,\s*running\)/);
    }
    // The loading shimmer is the library's own loop: it is held to it as well.
    expect(index.css).toMatch(/\.react-loading-skeleton::after\s*\{\s*animation-play-state:\s*var\(--loop-play,\s*running\)/);
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

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The goal / investment card's header band (item 80): a DEEP, saturated step of
// the card's tone, lettered at ≥ 8:1 in both colourways × both modes. Its
// strengths live on the tone scale in index.css; this reads them, and the
// palettes in tokens.css, and works the band out the way the browser does
// (`color-mix(in srgb, tone P%, ink)`), so a palette or a strength edited
// into breach fails here.

const SRC = join(__dirname, "..", "..", "..");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS = strip(readFileSync(join(SRC, "styles", "tokens.css"), "utf8"));
const INDEX = strip(readFileSync(join(SRC, "index.css"), "utf8"));
const CARD_TSX = readFileSync(join(__dirname, "InvestmentsShared.tsx"), "utf8");
const CARD_CSS = readFileSync(join(__dirname, "css", "GoalCard.module.css"), "utf8");

type Mode = "light" | "dark";
type Vars = Record<string, string>;
type RGB = [number, number, number];
const decls = (body: string): Vars => Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const colourway: Record<string, Partial<Record<Mode, Vars>>> = {};
const byMode: Record<Mode, Vars> = { light: {}, dark: {} };
for (const [, selector, body] of TOKENS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const first = selector.split(",")[0].trim();
  const cw = first.match(/^:root\[data-nav-style="(\w+)"\]\[data-bs-theme="(\w+)"\]$/);
  const mode = first.match(/^:root\[data-bs-theme="(\w+)"\]$/);
  if (cw) {
    const modes = (colourway[cw[1]] ??= {});
    modes[cw[2] as Mode] = { ...modes[cw[2] as Mode], ...decls(body) };
  } else if (mode) Object.assign(byMode[mode[1] as Mode], decls(body));
}
const vars = (cw: string, mode: Mode): Vars => ({ ...byMode[mode], ...colourway[cw][mode] });

/** The band's own settings for a mode, from the index.css block that holds them. */
const bandScale = (mode: Mode): Vars => {
  const block = [...INDEX.matchAll(/([^{}]+)\{([^{}]*--tone-band:[^{}]*)\}/g)].find(([, sel]) => (mode === "light" ? sel.includes(":root") : sel.includes('data-bs-theme="dark"')));
  if (!block) throw new Error(`no band scale for ${mode}`);
  return decls(block[2]);
};

function colour(value: string, v: Vars, depth = 0): RGB {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) {
    if (depth > 5 || !(ref[1] in v)) throw new Error(`unresolved ${value}`);
    return colour(v[ref[1]], v, depth + 1);
  }
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (!hex) throw new Error(`not a plain colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as RGB;
}
const mix = (a: RGB, b: RGB, p: number): RGB => a.map((c, i) => c * p + b[i] * (1 - p)) as RGB;
const luminance = ([r, g, b]: RGB) => {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** HSL saturation, 0–1: how far from grey. */
const saturation = (c: RGB) => {
  const [max, min] = [Math.max(...c) / 255, Math.min(...c) / 255];
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
};

// The card's accents: behind / ahead-or-done / a goal on its way / a recurring one.
const TONES = ["expense", "income", "goal", "brand"] as const;

const cases = Object.keys(colourway).flatMap((cw) =>
  (["light", "dark"] as Mode[]).flatMap((mode) =>
    TONES.map((tone) => {
      const v = { ...vars(cw, mode), ...bandScale(mode) };
      const strength = parseFloat(v[tone === "brand" ? "tone-band-brand" : "tone-band"]) / 100;
      const accent = colour(v[tone], v);
      const band = mix(accent, colour(v["band-ink"], v), strength);
      return { name: `${cw} ${mode} ${tone}`, tone, accent, band, text: colour(v["on-band"], v) };
    }),
  ),
);

describe("the goal card's header band", () => {
  it("covers both colourways in both modes", () => {
    expect(Object.keys(colourway).sort()).toEqual(["blue", "gold"]);
    expect(cases).toHaveLength(2 * 2 * TONES.length);
  });

  it.each(cases)("$name: the lettering reads at ≥ 8:1", ({ band, text }) => {
    expect(ratio(text, band)).toBeGreaterThanOrEqual(8);
  });

  it.each(cases)("$name: is a darker step of its tone, not a pastel wash", ({ accent, band }) => {
    expect(luminance(band)).toBeLessThan(luminance(accent));
    // Dark enough to carry light lettering: well below a pastel's luminance.
    expect(luminance(band)).toBeLessThan(0.1);
  });

  it.each(cases.filter((c) => c.tone !== "brand"))("$name: stays saturated enough to read as its colour", ({ band }) => {
    // Dark mode sinks the bright tones into the page; red keeps the least (≈ 0.2).
    expect(saturation(band)).toBeGreaterThanOrEqual(0.2);
  });

  it.each(Object.keys(colourway).flatMap((cw) => (["light", "dark"] as Mode[]).map((mode) => ({ cw, mode }))))(
    "$cw $mode: a paused card's grey band (page-inset, body ink) reads at ≥ 8:1",
    ({ cw, mode }) => {
      const css = CARD_CSS.match(/\.band\[data-tone="paused"\]\s*\{([^}]*)\}/)?.[1] ?? "";
      expect(css).toMatch(/--on-band:\s*var\(--text\)/);
      expect(css).toMatch(/background:\s*var\(--page-inset\)/);
      const v = vars(cw, mode);
      expect(ratio(colour(v.text, v), colour(v["page-inset"], v))).toBeGreaterThanOrEqual(8);
    },
  );

  it("sets no strength of its own: the TSX and the card's CSS only name the tone scale", () => {
    // No `color-mix(…var(${accent}) 10%…)` in the card any more.
    expect(CARD_TSX).not.toMatch(/var\(\$\{accent\}\)\s+\d/);
    const band = CARD_CSS.match(/\.band\s*\{[^}]*\}/)?.[0] ?? "";
    expect(band).toMatch(/var\(--band-strength\)/);
    expect(band).not.toMatch(/\d+%/);
  });
});

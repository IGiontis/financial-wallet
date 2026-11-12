import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_STYLES } from "../context/themeContextValue";

// The contrast contract. Every piece of text in the app sits on one of the
// grounds below, and every such pair is at least 8:1 (WCAG relative-luminance
// contrast) in both colourways × both modes. The values are read straight
// out of tokens.css, so a palette edited into breach fails here, not on a
// user's screen.
//
// To add a pair, append a line to PAIRS. To add a role, add it to
// REQUIRED_ROLES and to all six blocks in tokens.css.

const STYLES_DIR = __dirname;
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS = strip(readFileSync(join(STYLES_DIR, "tokens.css"), "utf8"));
const INDEX = strip(readFileSync(join(STYLES_DIR, "..", "index.css"), "utf8"));
const THEME = strip(readFileSync(join(STYLES_DIR, "theme.css"), "utf8"));
// The calendars' day squares (dayTone): the fill strength of a day with money on it.
const DAY_TONE = strip(readFileSync(join(STYLES_DIR, "..", "features", "calendar", "css", "DayTone.module.css"), "utf8"));
const DAY_FILL = parseFloat(DAY_TONE.match(/--day-fill:\s*([\d.]+)%/)?.[1] ?? "NaN") / 100;

type Mode = "light" | "dark";
type Vars = Record<string, string>;

const COLOURWAYS = ["blue", "gold"] as const;
const MODES: readonly Mode[] = ["light", "dark"];

// ─── Reading tokens.css ───────────────────────────────────────────────────────

const decls = (body: string): Vars => Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const colourwayVars: Record<string, Record<Mode, Vars>> = {};
const modeVars: Record<Mode, Vars> = { light: {}, dark: {} };

for (const [, selector, body] of TOKENS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const first = selector.split(",")[0].trim();
  const cw = first.match(/^:root\[data-nav-style="(\w+)"\]\[data-bs-theme="(\w+)"\]$/);
  const mode = first.match(/^:root\[data-bs-theme="(\w+)"\]$/);
  // Merged, not replaced: a colourway may add a second block for one mode.
  if (cw) {
    const modes = (colourwayVars[cw[1]] ??= {} as Record<Mode, Vars>);
    modes[cw[2] as Mode] = { ...modes[cw[2] as Mode], ...decls(body) };
  }
  else if (mode) Object.assign(modeVars[mode[1] as Mode], decls(body));
}

const varsCache = new Map<string, Vars>();
const vars = (cw: string, mode: Mode): Vars => {
  const key = `${cw}/${mode}`;
  if (!varsCache.has(key)) varsCache.set(key, { ...modeVars[mode], ...colourwayVars[cw]?.[mode] });
  return varsCache.get(key)!;
};

/** The tone washes' strengths, from the one scale in index.css. */
const washCache = new Map<Mode, { wash: number; strong: number }>();
const wash = (mode: Mode): { wash: number; strong: number } => {
  if (washCache.has(mode)) return washCache.get(mode)!;
  const block = [...INDEX.matchAll(/([^{}]+)\{([^{}]*--tone-wash:[^{}]*)\}/g)].find(([, sel]) => sel.includes(`data-bs-theme="${mode}"`));
  const d = block ? decls(block[2]) : {};
  const strengths = { wash: parseFloat(d["tone-wash"]) / 100, strong: parseFloat(d["tone-wash-strong"]) / 100 };
  washCache.set(mode, strengths);
  return strengths;
};

/** A strength set in a stylesheet's `[data-bs-theme="<mode>"]` block, as a fraction. */
const strength = (css: string, name: string, mode: Mode): number => {
  const block = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel, body]) => sel.includes(`data-bs-theme="${mode}"`) && `--${name}` in Object.fromEntries(Object.keys(decls(body)).map((k) => [`--${k}`, 1])));
  return block ? parseFloat(decls(block[2])[name]) / 100 : NaN;
};

// ─── Colour maths ─────────────────────────────────────────────────────────────

type RGBA = [number, number, number, number];

function parse(value: string, v: Vars, depth = 0): RGBA {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) {
    if (depth > 5 || !(ref[1] in v)) throw new Error(`unresolved ${value}`);
    return parse(v[ref[1]], v, depth + 1);
  }
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as RGBA;
  }
  const rgba = value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] === undefined ? 1 : +rgba[4]];
  throw new Error(`not a plain colour: ${value}`);
}

const over = (top: RGBA, ground: RGBA): RGBA => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + ground[i] * (1 - a)).concat(1) as RGBA;
};

const luminance = ([r, g, b]: RGBA) => {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

export const ratio = (a: RGBA, b: RGBA) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * A colour expression: a role (`surface`), a role over another (`shell-hover
 * over shell-dark`), or a meaning's wash over a ground (`income wash over
 * surface`, `income strong over page`).
 */
function resolve(expr: string, cw: string, mode: Mode): RGBA {
  const v = vars(cw, mode);
  const toneWash = expr.match(/^(income|expense|goal|invest|pending) (wash|strong) over (.+)$/);
  if (toneWash) {
    const [, tone, strength, ground] = toneWash;
    const fill = parse(v[tone], v);
    const strengths = wash(mode);
    return over([fill[0], fill[1], fill[2], strengths[strength === "wash" ? "wash" : "strong"]], resolve(ground, cw, mode));
  }
  // A chip's own ground (index.css, «Chips») or a list's amount chip
  // (theme.css, --figure-chip-wash): the tone mixed into the card surface.
  const chip = expr.match(/^(income|expense|goal|invest|pending) (chip|chip-strong|figure-chip)$/);
  if (chip) {
    const [, tone, kind] = chip;
    const fill = parse(v[tone], v);
    const p = kind === "figure-chip" ? strength(THEME, "figure-chip-wash", mode) : strength(INDEX, kind === "chip" ? "chip-wash" : "chip-wash-strong", mode);
    if (Number.isNaN(p)) throw new Error(`no strength for ${expr} in ${mode}`);
    return over([fill[0], fill[1], fill[2], p], resolve("surface", cw, mode));
  }
  // A calendar day with money still to come or to pay: the tone at --day-fill over the card.
  const day = expr.match(/^(income|expense) day-fill$/);
  if (day) {
    const fill = parse(v[day[1]], v);
    return over([fill[0], fill[1], fill[2], DAY_FILL], resolve("surface", cw, mode));
  }
  const layered = expr.match(/^(.+?) over (.+)$/);
  if (layered) return over(resolve(layered[1], cw, mode), resolve(layered[2], cw, mode));
  if (!(expr in v)) throw new Error(`no role --${expr} in ${cw}/${mode}`);
  return parse(v[expr], v);
}

// ─── The pairs ────────────────────────────────────────────────────────────────

interface Pair {
  fg: string;
  bg: string;
  /** Defaults to 8. Anything lower carries a `why`. */
  min?: number;
  why?: string;
  /** Checked in this mode only; both when left out. */
  mode?: Mode;
}

/**
 * The owner's own red and green (2026-11-03): #C4302B and #12855A in daylight,
 * one of each everywhere — lettering, figures, chips. His choice over the 8:1
 * contract, held instead to WCAG AA (4.5:1) wherever the dark mode can reach
 * it; the daylight green is measured below AA on the warm grounds (see
 * OWNER_GREEN_MIN) and reported to him.
 */
const OWNER = "owner's chosen meaning colours, 2026-11-03, WCAG AA";
const OWNER_MEANINGS = ["income", "expense"];
/**
 * #12855A on the warm off-white ground cannot reach 4.5:1: 4.45 on a card
 * (#fdfbf7), 4.18 on the page (#f6f3ec), lower on its own wash. Held here at
 * what it measures, so it cannot slip further while he decides.
 */
const OWNER_GREEN_MIN = 3.8;

const GROUNDS = ["page", "page-inset", "surface", "surface-raised"];
/** Where a meaning's chip or figure can sit. page-inset is for form fields and wells, which carry no chips. */
const CHIP_GROUNDS = ["page", "surface", "surface-raised"];
const TONES = ["income", "expense", "goal", "invest", "pending"];

export const PAIRS: Pair[] = [
  // Body, secondary text, links, the brand as lettering — on every ground.
  ...GROUNDS.flatMap((g) => [
    { fg: "text", bg: g },
    { fg: "text-2", bg: g }, // also the placeholder colour
    { fg: "link", bg: g },
    { fg: "brand-text", bg: g },
  ]),
  { fg: "link-hover", bg: "surface" },
  { fg: "link-hover", bg: "page" },

  // A highlighted row or tint, and the neutral resting state of a tab or chip.
  { fg: "text", bg: "brand-soft" },
  { fg: "text-2", bg: "brand-soft" },
  { fg: "link", bg: "brand-soft" },
  { fg: "on-brand-soft", bg: "brand-soft" },
  { fg: "on-neutral-soft", bg: "neutral-soft" },
  { fg: "on-neutral-soft", bg: "surface" },
  { fg: "on-neutral-soft", bg: "page" },

  // Buttons and the active tab: text on the brand, resting, hovered, pressed.
  { fg: "on-brand", bg: "brand" },
  { fg: "on-brand", bg: "brand-hover" },
  { fg: "on-brand", bg: "brand-active" },

  // Meaning-coloured buttons and badges, resting, hovered, pressed.
  // In daylight nothing is lettered on the solid green (theme.css draws it as a
  // chip), so its pair is the dark mode's only; the red carries near-white.
  ...["", "-hover", "-active"].map((step) => ({ fg: "on-success-solid", bg: `success-solid${step}`, mode: "dark" as Mode })),
  ...["", "-hover", "-active"].map((step) => ({ fg: "on-danger-solid", bg: `danger-solid${step}`, min: 4.5, why: OWNER })),
  ...["", "-hover", "-active"].map((step) => ({ fg: "on-warning-solid", bg: `warning-solid${step}` })),

  // Lettering on a solid of the text colour: the tooltip, the offline bar,
  // `.badge.bg-dark` and `.btn-dark` (page on text), `.badge.bg-secondary` and
  // the dark button under the pointer (page on text-2).
  { fg: "page", bg: "text" },
  { fg: "page", bg: "text-2" },

  // A neutral chip or tab at rest (text-2), under the pointer (text), and a
  // disabled secondary button; the brand's own lettering on its tint
  // (`.bg-primary-subtle` + `.text-primary-emphasis`, the update prompt's disc).
  { fg: "text-2", bg: "neutral-soft" },
  { fg: "text", bg: "neutral-soft" },
  { fg: "brand-text", bg: "brand-soft" },

  // The shell: sidebar, top bar, footer. One gradient of three stops, so every
  // pair is checked at each stop and under the hover and current-item layers.
  ...["shell-dark", "shell-mid", "shell-light"].flatMap((end) => [
    { fg: "shell-text", bg: end },
    { fg: "shell-text-2", bg: end },
    { fg: "shell-text", bg: `shell-hover over ${end}` },
    { fg: "shell-text-2", bg: `shell-hover over ${end}` },
    { fg: "shell-on-current", bg: `shell-current over ${end}` },
    { fg: "shell-accent", bg: end, min: 3, why: "the mark beside the current item and its icon: a shape, not lettering" },
    { fg: "shell-focus", bg: end, min: 3, why: "a focus ring is a boundary: 3:1 is the WCAG floor for one" },
  ]),
  { fg: "shell-on-logo", bg: "shell-logo" },
  // The shell's «due» badge is the dark mode's one red, so it is held to AA.
  { fg: "shell-on-badge", bg: "shell-badge", min: 4.5, why: OWNER },
  { fg: "shell-on-badge-warn", bg: "shell-badge-warn" },
  // The floating «+»: an icon, so AA (asked for in item 74), on both ends of its fill.
  ...["fab-dark", "fab-light"].map((end) => ({ fg: "on-fab", bg: end, min: 4.5, why: "the «+» is an icon on its own fill: WCAG AA" })),

  // Boundaries you must be able to see: inputs, cards' edges, focus.
  ...GROUNDS.flatMap((g) => [
    { fg: "border", bg: g, min: 3, why: "a component boundary, not lettering" },
    { fg: "focus", bg: g, min: 3, why: "a focus ring is a boundary: 3:1 is the WCAG floor for one" },
  ]),

  // The meanings: their lettering on the ground, on their own wash, on the
  // stronger wash of a chosen chip.
  ...TONES.flatMap((tone) =>
    CHIP_GROUNDS.flatMap((g) => [
      ...[g, `${tone} wash over ${g}`, `${tone} strong over ${g}`].flatMap((bg): Pair[] =>
        !OWNER_MEANINGS.includes(tone)
          ? [{ fg: `${tone}-text`, bg }]
          : tone === "income"
            ? [
                { fg: `${tone}-text`, bg, mode: "light", min: OWNER_GREEN_MIN, why: `${OWNER} — the daylight green measures under AA on these grounds` },
                { fg: `${tone}-text`, bg, mode: "dark", min: 4.5, why: OWNER },
              ]
            : [{ fg: `${tone}-text`, bg, min: 4.5, why: OWNER }],
      ),
      // Plain text on a meaning's tint: the chosen side of a two-way choice
      // (Segmented `.owe`/`.lend`), a tone tile's label.
      { fg: "text", bg: `${tone} wash over ${g}` },
      { fg: "text", bg: `${tone} strong over ${g}` },
    ]),
  ),

  // Chips (item 81): a ground you can see, the lettering on it still held to
  // the contract — the owner's red at AA, his green at its floor, the rest 8:1.
  // `figure-chip` is a list's amount chip (Transactions), on the card.
  ...TONES.flatMap((tone) =>
    ["chip", "chip-strong", ...(tone === "pending" ? [] : ["figure-chip"])].flatMap((kind): Pair[] => {
      const bg = `${tone} ${kind}`;
      if (tone === "income")
        return [
          { fg: "income-text", bg, mode: "light", min: OWNER_GREEN_MIN, why: `${OWNER} — the daylight green measures under AA on these grounds` },
          { fg: "income-text", bg, mode: "dark", min: 4.5, why: OWNER },
        ];
      if (tone === "expense") return [{ fg: "expense-text", bg, min: 4.5, why: OWNER }];
      return [{ fg: `${tone}-text`, bg }];
    }),
  ),

  // Calendar days (Ημερολόγιο, the Transactions calendar, Πάγια's months): the
  // day's number and figure are the body text, on a day still to come (the
  // tone at --day-fill) and on one that happened (the tone's chip ground).
  ...["income", "expense"].flatMap((tone): Pair[] => [
    { fg: "text", bg: `${tone} day-fill` },
    { fg: "text", bg: `${tone} chip` },
  ]),
];

// ─── The roles every colourway must define ────────────────────────────────────

export const REQUIRED_ROLES = [
  "page", "page-inset", "surface", "surface-raised",
  "text", "text-2", "border", "border-soft",
  "brand", "brand-hover", "brand-active", "on-brand", "brand-text", "brand-soft", "on-brand-soft", "brand-edge",
  "link", "link-hover", "focus", "neutral-soft", "on-neutral-soft",
  "shell-dark", "shell-mid", "shell-light", "shell-text", "shell-text-2", "shell-rule", "shell-hover", "shell-current", "shell-on-current",
  "shell-accent", "shell-focus", "shell-logo", "shell-on-logo", "shell-badge", "shell-on-badge", "shell-badge-warn", "shell-on-badge-warn",
  "fab-dark", "fab-light", "on-fab",
]; // prettier-ignore

/** Defined once per mode, shared by every colourway. */
export const REQUIRED_MODE_ROLES = [
  ...TONES.flatMap((t) => [t, `${t}-text`]),
  "success-solid", "success-solid-hover", "success-solid-active", "on-success-solid",
  "danger-solid", "danger-solid-hover", "danger-solid-active", "on-danger-solid",
  "warning-solid", "warning-solid-hover", "warning-solid-active", "on-warning-solid",
  "chart-income", "chart-expense", "chart-net",
]; // prettier-ignore

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("the palettes", () => {
  it("are exactly the colourways the app offers", () => {
    expect(Object.keys(colourwayVars).sort()).toEqual([...NAV_STYLES].sort());
    expect([...COLOURWAYS].sort()).toEqual([...NAV_STYLES].sort());
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s define every role", (cw, mode) => {
    const v = vars(cw, mode);
    expect(REQUIRED_ROLES.filter((r) => !(r in v))).toEqual([]);
    expect(REQUIRED_MODE_ROLES.filter((r) => !(r in v))).toEqual([]);
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s hold only plain colours the contract can read", (cw, mode) => {
    const v = vars(cw, mode);
    const unreadable = Object.entries(v).filter(([name, value]) => {
      if (name.endsWith("-rgb")) return false;
      try {
        parse(value, v);
        return false;
      } catch {
        return true;
      }
    });
    expect(unreadable).toEqual([]);
  });
});

describe("the -rgb twins", () => {
  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: each triple is its hex role's own colour", (cw, mode) => {
    const v = vars(cw, mode);
    const wrong = Object.keys(v)
      .filter((name) => name.endsWith("-rgb"))
      .filter((name) => {
        const [r, g, b] = parse(v[name.replace(/-rgb$/, "")], v);
        return v[name] !== `${r}, ${g}, ${b}`;
      });
    expect(wrong).toEqual([]);
  });
});

describe("the contrast contract", () => {
  it("has a wash strength for both modes", () => {
    for (const m of MODES) {
      expect(wash(m).wash).toBeGreaterThan(0);
      expect(wash(m).strong).toBeGreaterThan(wash(m).wash);
    }
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: every text pair is at least 8:1", (cw, mode) => {
    const failures = PAIRS.filter((p) => !p.mode || p.mode === mode).flatMap(({ fg, bg, min = 8 }) => {
      const r = ratio(over(resolve(fg, cw, mode), resolve(bg, cw, mode)), resolve(bg, cw, mode));
      return r >= min ? [] : [`${fg} on ${bg}: ${r.toFixed(2)} < ${min}`];
    });
    expect(failures).toEqual([]);
  });

  it("keeps every exception to a pair that explains itself", () => {
    expect(PAIRS.filter((p) => p.min !== undefined && !p.why)).toEqual([]);
  });

  it("matches the reference the owner measured: #112A46 on #ACC8E5 is 8.42", () => {
    expect(ratio(parse("#112A46", {}), parse("#ACC8E5", {})).toFixed(2)).toBe("8.42");
  });
});

// ─── Telling the brand from the meanings ──────────────────────────────────────
// A primary button, a brand chip or the shell's accent must never be mistaken
// for a goal (amber), a warning (its button) or something pending (orange). In
// the old gold colourway the brand was the goal's own amber at the same
// lightness — ΔE00 7 in the dark — and orange and amber badges were lost in it.
//
// The measure is CIEDE2000 between the two fills. About 2 is the smallest
// difference anyone sees side by side; around 10 two colours are plainly
// different when compared; 20 is a different colour family at a glance, which
// is what a badge read on its own, across a screen, needs. The blue colourway
// clears 40 against all three.

const MIN_DELTA_E = 20;

const lab = ([r, g, b]: RGBA): Lab => {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const fy = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const fz = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

type Lab = [number, number, number];

/** CIEDE2000 (Sharma, Wu & Dalal 2005), between two CIELAB colours. */
export function deltaE00Lab([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = Math.PI / 180;
  const Cbar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const [a1p, a2p] = [(1 + G) * a1, (1 + G) * a2];
  const [C1p, C2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const hue = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const [h1p, h2p] = [hue(a1p, b1), hue(a2p, b2)];
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dL = L2 - L1;
  const dC = C2p - C1p;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p !== 0) hb = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const RT = -Math.sin(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad) * RC;
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

export const deltaE00 = (c1: RGBA, c2: RGBA) => deltaE00Lab(lab(c1), lab(c2));

/** Fills that sit beside each other as badges, chips and buttons, and must not be confused. */
const DISTINCT: [string, string][] = [
  ["brand", "pending"],
  ["brand", "goal"],
  ["brand", "warning-solid"],
  ["brand", "danger-solid"],
  ["brand", "success-solid"],
  // In the shell: the current item's mark and the logo beside the amber «look at this» badge.
  ["shell-accent", "shell-badge-warn"],
  ["shell-logo", "shell-badge-warn"],
];

describe("the brand and the meanings", () => {
  it("measures ΔE00 as Sharma, Wu & Dalal's published test data does", () => {
    // Pairs 1, 7, 17 and 25 of their table (Color Res. Appl. 30, 2005).
    expect(deltaE00Lab([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE00Lab([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 4);
    expect(deltaE00Lab([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 4);
    expect(deltaE00Lab([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 4);
    // And through sRGB: black to white is the whole lightness scale.
    expect(deltaE00([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(100, 0);
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))(`%s / %s: the brand is at least ΔE00 ${MIN_DELTA_E} from every meaning fill`, (cw, mode) => {
    const close = DISTINCT.flatMap(([a, b]) => {
      const d = deltaE00(resolve(a, cw, mode), resolve(b, cw, mode));
      return d >= MIN_DELTA_E ? [] : [`${a} vs ${b}: ΔE00 ${d.toFixed(1)}`];
    });
    expect(close).toEqual([]);
  });
});

// ─── The shell runs dark to light ─────────────────────────────────────────────
// Every decorative gradient starts dark at the top left and ends light at the
// bottom right, in every colourway and mode. The shell's three stops are named
// for it; this keeps the names honest. The «+» is drawn the same way.

describe("the shell gradient", () => {
  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: dark, then mid, then light", (cw, mode) => {
    const [dark, mid, light] = ["shell-dark", "shell-mid", "shell-light"].map((r) => luminance(resolve(r, cw, mode)));
    expect(dark).toBeLessThan(mid);
    expect(mid).toBeLessThan(light);
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: the «+» runs dark to light too", (cw, mode) => {
    expect(luminance(resolve("fab-dark", cw, mode))).toBeLessThan(luminance(resolve("fab-light", cw, mode)));
  });
});

// ─── The «+» stands apart ─────────────────────────────────────────────────────
// It floats over the footer, over cards and over the page (AddFab). In daylight
// blue it was once the footer's own navy and vanished into it (item 74). Its
// edge is the fill, or the ring of page colour drawn around it: wherever it
// sits, one of the two must stand 3:1 off what is under it — the WCAG floor
// for a control's boundary.

describe("the floating «+»", () => {
  const SHELL_STOPS = ["shell-dark", "shell-mid", "shell-light"];
  const fill = (cw: string, mode: Mode, bg: string) => Math.min(...["fab-dark", "fab-light"].map((end) => ratio(resolve(end, cw, mode), resolve(bg, cw, mode))));

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: stands off the footer", (cw, mode) => {
    const blurred = SHELL_STOPS.filter((stop) => Math.max(fill(cw, mode, stop), ratio(resolve("page", cw, mode), resolve(stop, cw, mode))) < 3);
    expect(blurred).toEqual([]);
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: stands off the page and a card by its fill alone", (cw, mode) => {
    expect(GROUNDS.filter((g) => fill(cw, mode, g) < 3)).toEqual([]);
  });

  // Its focus ring is drawn between two rings of the page colour (AddFab): the
  // ring stands 3:1 off them, and on the footer the outer page ring — or, in
  // the dark, the focus colour itself — stands 3:1 off every stop.
  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: its focus ring reads on the footer", (cw, mode) => {
    const focus = resolve("focus", cw, mode);
    const page = resolve("page", cw, mode);
    expect(ratio(focus, page)).toBeGreaterThanOrEqual(3);
    const lost = SHELL_STOPS.filter((stop) => Math.max(ratio(page, resolve(stop, cw, mode)), ratio(focus, resolve(stop, cw, mode))) < 3);
    expect(lost).toEqual([]);
  });
});

// ─── A chosen tab runs dark to light ──────────────────────────────────────────
// theme.css paints the chosen tab and view switch with `--brand-gradient`,
// three of the brand's own steps (each carries on-brand at 8:1, PAIRS above).
// Which step is darker flips with the mode, so each mode's declaration is read
// here and its stops must climb in lightness in every colourway.

describe("the chosen tab's gradient", () => {
  const THEME = strip(readFileSync(join(STYLES_DIR, "theme.css"), "utf8"));
  const stops = (mode: Mode) => {
    const decl = [...THEME.matchAll(/([^{}]+)\{([^{}]*--brand-gradient:[^{}]*)\}/g)].find(([, sel]) => (mode === "dark") === sel.includes('data-bs-theme="dark"'));
    return [...(decl?.[2].match(/--brand-gradient:([^;]*)/)?.[1] ?? "").matchAll(/var\(--([\w-]+)\)/g)].map(([, role]) => role);
  };

  it("is what the chosen tab and view switch are painted with", () => {
    expect(THEME).toMatch(/--color-segment-active:\s*var\(--brand-gradient\)/);
    expect(THEME).toMatch(/--view-switch-on:\s*var\(--brand-gradient\)/);
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: three brand steps, darkest first", (cw, mode) => {
    const roles = stops(mode);
    expect([...roles].sort()).toEqual(["brand", "brand-active", "brand-hover"]);
    const lum = roles.map((r) => luminance(resolve(r, cw, mode)));
    expect(lum[0]).toBeLessThan(lum[1]);
    expect(lum[1]).toBeLessThan(lum[2]);
  });
});

// ─── The shell is a dark island ───────────────────────────────────────────────
// In both colourways the shell is dark in daylight too, and inside it the dark
// mode's roles apply whole (tokens.css, the `.app-shell` selector on each dark
// block). So the daylight shell must be the dark one value for value — or the
// sidebar would change colour with the mode — and the dark roles that letter
// a link, a chip or a button in the top bar must read on both of its ends.

const SHELL_ROLES = REQUIRED_ROLES.filter((r) => r.startsWith("shell-"));

describe("the shell island", () => {
  it.each(COLOURWAYS)("%s: the daylight shell is the dark mode's, value for value", (cw) => {
    const light = vars(cw, "light");
    const dark = vars(cw, "dark");
    expect(SHELL_ROLES.filter((r) => light[r] !== dark[r])).toEqual([]);
  });

  it("letters everything in the shell with the shell's own roles", () => {
    // theme.css points these at shell-text / shell-text-2 / shell-focus inside
    // `.app-shell`; tokens.css's island selectors are in :where() so they do
    // not outweigh it. Each is then a pair checked above (shell-text on both ends).
    const THEME = strip(readFileSync(join(STYLES_DIR, "theme.css"), "utf8"));
    const remap = decls(THEME.match(/(?:^|\})\s*\.app-shell\s*\{([^{}]*)\}/)?.[1] ?? "");
    expect(remap).toMatchObject({ text: "var(--shell-text)", "text-2": "var(--shell-text-2)", link: "var(--shell-text)", "link-hover": "var(--shell-text)", "brand-text": "var(--shell-text)", focus: "var(--shell-focus)" });
    const islands = [...TOKENS.matchAll(/([^{}]+)\{/g)].flatMap(([, sel]) => sel.split(",").map((x) => x.trim())).filter((x) => x.endsWith(".app-shell"));
    expect(islands.length).toBeGreaterThan(0);
    expect(islands.filter((x) => !x.startsWith(":where("))).toEqual([]);
  });
});

// ─── The owner's red and green ────────────────────────────────────────────────
describe("one red and one green", () => {
  it("is exactly #C4302B and #12855A in daylight, for lettering and fill alike", () => {
    for (const cw of COLOURWAYS) {
      const v = vars(cw, "light");
      expect([v["expense"], v["expense-text"], v["danger-solid"], v["chart-expense"]].map((x) => x.toLowerCase())).toEqual(Array(4).fill("#c4302b"));
      expect([v["income"], v["income-text"], v["success-solid"], v["chart-income"]].map((x) => x.toLowerCase())).toEqual(Array(4).fill("#12855a"));
    }
  });

  it("is one red and one green in the dark too", () => {
    for (const cw of COLOURWAYS) {
      const v = vars(cw, "dark");
      expect(new Set([v["expense"], v["expense-text"], v["danger-solid"], v["chart-expense"]]).size).toBe(1);
      expect(new Set([v["income"], v["income-text"], v["success-solid"], v["chart-income"]]).size).toBe(1);
    }
  });

  it.each(COLOURWAYS.flatMap((cw) => MODES.map((m) => [cw, m] as const)))("%s / %s: measured", (cw, mode) => {
    const fmt = (fg: string, bg: string) => ratio(resolve(fg, cw, mode), resolve(bg, cw, mode)).toFixed(2);
    // Logged so the report can quote them; the floors are in PAIRS.
    console.log(`${cw}/${mode} red on card ${fmt("expense-text", "surface")}, page ${fmt("expense-text", "page")}; green on card ${fmt("income-text", "surface")}, page ${fmt("income-text", "page")}; on red button ${fmt("on-danger-solid", "danger-solid")}`);
  });
});

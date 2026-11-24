import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_FINISH } from "./accountTones";

/**
 * What is written on a bank card has to be readable on every finish, in both
 * modes (owner, 2026-11-24 — in the dark mode the lettering was `--on-brand`,
 * which flips to a dark navy there, and the black card's name and balance
 * measured 1,1:1).
 *
 * The card is now lettered in `--card-ink`, the same in both modes, over a
 * face that fades into `--card-veil` at the top and the bottom — exactly where
 * the name, the balance and the note sit. This test reads all three straight
 * out of the stylesheets (never a copy of the numbers), blends each finish's
 * gradient stop with the veil that covers it, and measures the ink on it.
 *
 * Where each word sits on a 135° gradient:
 *   name   top-left      → the 0% stop,   under the TOP veil
 *   amount bottom-left   → the middle stop, under the BOTTOM veil
 *   note   bottom-right  → the 100% stop, under the BOTTOM veil
 */

const CSS = readFileSync(join(__dirname, "css", "BankCard.module.css"), "utf8");
const TOKENS = readFileSync(join(__dirname, "..", "..", "styles", "tokens.css"), "utf8");

/** WCAG AA for the small print on a card. The body text contract (8:1) is for the page's own grounds. */
const MIN = 4.5;

// ─── the values, read where they live ────────────────────────────────────────

const token = (name: string): string[] => [...TOKENS.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());

const inkDeclarations = token("card-ink");
/** The veil as the stylesheet composes it: the `-rgb` twin of `--card-veil`. */
const veilDeclarations = token("card-veil-rgb");

/** The two alphas of the veil, in the order the gradient paints them: top, bottom. */
const veilAlphas = [...CSS.matchAll(/rgba\(var\(--card-veil-rgb\),\s*([\d.]+)\)/g)].map((m) => parseFloat(m[1])).filter((a) => a > 0);

type RGB = [number, number, number];

const hex = (value: string): RGB => {
  const m = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`not a hex colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB;
};

const triple = (value: string): RGB => value.split(",").map((n) => Number(n.trim())) as RGB;

const luminance = ([r, g, b]: RGB): number => {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const contrast = (a: RGB, b: RGB): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** `colour` seen through `alpha` of the veil over it. */
const under = (colour: RGB, veil: RGB, alpha: number): RGB => colour.map((v, i) => v * (1 - alpha) + veil[i] * alpha) as RGB;

/** The three stops of a finish's gradient, in paint order. */
const stops = (background: string): RGB[] => [...background.matchAll(/#[0-9a-f]{6}/gi)].map((m) => hex(m[0]));

// ─── the contract ────────────────────────────────────────────────────────────

describe("a bank card's lettering", () => {
  it("is one ink, declared the same in daylight and in the dark", () => {
    expect(inkDeclarations.length).toBe(2);
    expect(new Set(inkDeclarations).size).toBe(1);
    expect(veilDeclarations.length).toBe(2);
    expect(new Set(veilDeclarations).size).toBe(1);
  });

  it("never reads `--on-brand` on the card's face, which flips with the mode", () => {
    // The whole bug: the card is not a brand-coloured surface, so it cannot
    // borrow the brand's ink. (`.check`, the chosen-tick, IS a brand chip and
    // keeps `--on-brand` — this looks at the face only.)
    const face = CSS.match(/\n\.card \{([\s\S]*?)\n\}/)?.[1];
    expect(face).toBeTruthy();
    expect(face).not.toMatch(/--on-brand/);
    expect(face).toMatch(/color:\s*var\(--card-ink\)/);
  });

  it("fades the face where the words are, top and bottom", () => {
    expect(veilAlphas).toHaveLength(2);
    const [top, bottom] = veilAlphas;
    expect(top).toBeGreaterThan(0.2);
    // The bottom carries two of the three words, and the finishes are at their
    // lightest there, so it is the stronger of the two.
    expect(bottom).toBeGreaterThanOrEqual(top);
  });

  it.each(Object.keys(CARD_FINISH))("holds AA on every word of the %s card", (name) => {
    const ink = hex(inkDeclarations[0]);
    const veil = triple(veilDeclarations[0]);
    const [top, bottom] = veilAlphas;
    const [first, middle, last] = stops(CARD_FINISH[name as keyof typeof CARD_FINISH].background);

    const measured = {
      name: contrast(ink, under(first, veil, top)),
      amount: contrast(ink, under(middle, veil, bottom)),
      note: contrast(ink, under(last, veil, bottom)),
    };

    expect(Object.entries(measured).filter(([, ratio]) => ratio < MIN)).toEqual([]);
  });

  it("is checked against hand-worked numbers, not only against itself", () => {
    // The gold finish is the worst case — it ends at #eab308, the lightest
    // stop of any card. By hand, with the veil at 0.46 over it:
    //   r = 234·0.54 + 6·0.46 = 129.12   g = 179·0.54 + 10·0.46 = 101.26
    //   b = 8·0.54 + 18·0.46 = 12.60
    //   sRGB → linear: r ((0.5064+0.055)/1.055)^2.4 = 0.2200
    //                  g ((0.3971+0.055)/1.055)^2.4 = 0.1309
    //                  b ((0.0494+0.055)/1.055)^2.4 = 0.0043
    //   L = 0.2126·0.2200 + 0.7152·0.1309 + 0.0722·0.0043 = 0.1407
    //   ink #f8fafc → L = 0.9566 → (0.9566 + 0.05) / (0.1407 + 0.05) = 5.27
    // The same figure, reached the other way, must come out of the code above.
    const ink = hex(inkDeclarations[0]);
    const veil = triple(veilDeclarations[0]);
    const lightest = stops(CARD_FINISH.gold.background)[2];
    expect(contrast(ink, under(lightest, veil, 0.46))).toBeCloseTo(5.27, 1);

    // And the bug this test exists for: the old ink on the same card.
    const oldDarkModeInk: RGB = [0x0b, 0x1f, 0x44];
    expect(contrast(oldDarkModeInk, hex("#0b0f14"))).toBeLessThan(1.3);
  });
});

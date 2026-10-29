import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import el from "../../i18n/locales/el.json";
import en from "../../i18n/locales/en.json";
import { TOUR_STEPS } from "./tourSteps";

// The tour is a list of promises about other files: that each page is a route
// the app has, that each step's words are written in both languages, and that
// what it points at is marked on a page. A page renamed or a mark removed
// would otherwise show up only as a step quietly skipped in the demo.

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every path the router knows: the absolute ones as written, the children under "/". */
function routerPaths(): Set<string> {
  const router = readFileSync(join(SRC, "lib", "router.tsx"), "utf8");
  const paths = new Set<string>();
  for (const [, path] of router.matchAll(/path:\s*"([^"]+)"/g)) paths.add(path.startsWith("/") ? path : `/${path}`);
  // The Overview is the index route under "/".
  if (/index:\s*true/.test(router)) paths.add("/");
  return paths;
}

const get = (tree: unknown, key: string) => key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), tree);

/** The keys of a nested object, as dotted paths. */
const keysOf = (tree: object, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) => (value && typeof value === "object" ? keysOf(value as object, `${prefix}${key}.`) : [`${prefix}${key}`]));

describe("the guided tour's steps", () => {
  it("has a step for every stop, each named once", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TOUR_STEPS.map((step) => step.id)).size).toBe(TOUR_STEPS.length);
  });

  it("goes only to pages the router has", () => {
    const paths = routerPaths();
    for (const step of TOUR_STEPS) expect(paths, `${step.id}: ${step.route}`).toContain(step.route);
  });

  it("starts and ends on the Overview, and only the last step asks for an account", () => {
    expect(TOUR_STEPS[0].route).toBe("/");
    expect(TOUR_STEPS.at(-1)!.route).toBe("/");
    expect(TOUR_STEPS.filter((step) => step.finale).map((step) => step.id)).toEqual([TOUR_STEPS.at(-1)!.id]);
  });

  it("has its words in Greek and in English", () => {
    const common = ["button", "buttonTitle", "next", "back", "done", "close", "progress", "createAccount"];
    for (const locale of [el, en]) {
      for (const key of common) expect(get(locale, `guidedTour.${key}`), key).toEqual(expect.any(String));
      for (const step of TOUR_STEPS) {
        expect(get(locale, `guidedTour.steps.${step.id}.title`), step.id).toEqual(expect.any(String));
        expect(get(locale, `guidedTour.steps.${step.id}.body`), step.id).toEqual(expect.any(String));
      }
    }
    expect(keysOf(el.guidedTour).sort()).toEqual(keysOf(en.guidedTour).sort());
  });

  it("points only at elements a page marks", () => {
    const sources = sourceFiles(SRC)
      .filter((path) => !path.includes(join("demo", "guidedTour")))
      .map((path) => readFileSync(path, "utf8"));
    const selectors = TOUR_STEPS.flatMap((step) => [step.target, ...(step.activate ? [step.activate] : [])]);
    for (const selector of selectors) {
      const marks = [...selector.matchAll(/\[(data-(?:tour|demo))="([^"]+)"\]/g)];
      expect(marks.length, selector).toBeGreaterThan(0);
      for (const [, attribute, name] of marks) {
        // Written as `data-tour="name"`, or chosen in an expression on the same line.
        const marked = sources.some((source) => source.split("\n").some((line) => line.includes(`${attribute}=`) && line.includes(`"${name}"`)));
        expect(marked, `${attribute}="${name}"`).toBe(true);
      }
    }
  });
});

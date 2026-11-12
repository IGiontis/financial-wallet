import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { OWNED_COLLECTIONS, USERS_COLLECTION } from "../firebase/ownedCollections";

// The project's map (docs/) is what every new session and agent reads instead of
// re-exploring the code. A map that misses a piece is how a second, drifted copy
// of it gets built — so a new shared piece, collection or page fails the tests
// until it is written into the map, in the same change.

const ROOT = join(__dirname, "..", "..");
const doc = (name: string) => readFileSync(join(ROOT, "docs", name), "utf8");

function files(dir: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "css" && !dir.endsWith("shared") ? [] : files(path, keep);
    return keep(name) ? [relative(ROOT, path).replace(/\\/g, "/")] : [];
  });
}

const isSource = (name: string) => /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts");

describe("the project map in docs/", () => {
  it("lists every shared piece in COMPONENTS.md by its path", () => {
    const registry = doc("COMPONENTS.md");
    const shared = ["components", "hooks", "utils", "feedback", "css"].flatMap((folder) => files(join(ROOT, "src", "shared", folder), isSource));
    expect(shared.length).toBeGreaterThan(20);
    const missing = shared.filter((path) => !registry.includes(`\`${path}\``));
    expect(missing).toEqual([]);
  });

  it("describes every collection the app writes in DATABASE.md", () => {
    const database = doc("DATABASE.md");
    const missing = [...OWNED_COLLECTIONS, USERS_COLLECTION].filter((name) => !new RegExp(`^###\\s+\`?${name}\`?\\s*$`, "m").test(database));
    expect(missing).toEqual([]);
  });

  it("maps every route of the router in PROJECT_MAP.md", () => {
    const map = doc("PROJECT_MAP.md");
    const router = readFileSync(join(ROOT, "src", "lib", "router.tsx"), "utf8");
    const paths = [...router.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*" && !p.startsWith(":"));
    expect(paths.length).toBeGreaterThan(15);
    const missing = paths.filter((p) => {
      const full = p.startsWith("/") ? p : `/${p}`;
      return !map.includes(`\`${full}\``) && !map.includes(`\`${full}/:tab\``);
    });
    expect(missing).toEqual([]);
  });
});

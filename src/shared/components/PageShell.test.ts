import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Every screen the same width.
//
// The widths had drifted to six different values — 720 on settings, 900 on
// debts, 1100 on the planner, 1200 on bills, 1240 on allocation, edge-to-edge
// on the rest — and four vertical paddings between them, so moving between tabs
// stepped the content in and out. Several pages were a different width again
// while loading, which made the page jump once its data arrived.
//
// That drift happened one page at a time, and each step looked reasonable on
// its own. This reads the routing table and holds every page it finds to the
// shared shell, so a page added next month is covered without anyone
// remembering to add it here.

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../..");

const routes = readFileSync(resolve(src, "lib/lazyRoutes.ts"), "utf8");

/** Every page module the router can land on, straight from the route table. */
const pageFiles = [...routes.matchAll(/import\("\.\.\/([^"]+)"\)/g)]
  .map((match) => match[1])
  .filter((path) => !path.includes("/auth/"));

describe("page width", () => {
  it("finds the pages to check", () => {
    // A rename that quietly emptied this list would make every case below pass
    // by testing nothing at all.
    expect(pageFiles.length).toBeGreaterThanOrEqual(10);
  });

  it.each(pageFiles)("%s goes through the shared shell", (path) => {
    const source = readFileSync(resolve(src, `${path}.tsx`), "utf8");

    expect(source).toContain("PageShell");
    // Including the loading and error branches: a page that is one width while
    // it waits and another once it has data jumps under the reader.
    expect(source).not.toMatch(/<Container\b/);
  });

  it.each(pageFiles)("%s does not set a width of its own", (path) => {
    const source = readFileSync(resolve(src, `${path}.tsx`), "utf8");

    // Inside a chart or a modal a max width is a normal thing to want; on the
    // element that wraps the whole screen it is how the drift started.
    const shellLine = source.split("\n").filter((line) => line.includes("<PageShell"));
    for (const line of shellLine) expect(line).not.toMatch(/maxWidth|max-width/);
  });
});

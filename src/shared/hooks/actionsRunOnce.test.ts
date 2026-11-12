import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// «An action waits for its answer» (.claude/rules/ui.md, MUST) — the parts a
// test can see in the source. The owner's report that started it (2026-11-12):
// «delete goal» pressed again while it ran → a second batch → an error toast
// for a goal that was gone.

const SRC = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const sources = files(SRC).map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }));

describe("every write runs once", () => {
  it("every mutation is declared through `useOnceMutation` — never TanStack's `useMutation` directly", () => {
    const direct = sources
      .filter(({ path }) => path !== "shared/hooks/useOnceMutation.ts")
      .filter(({ text }) => /\buseMutation\b/.test(text) && /from "@tanstack\/react-query"/.test(text) && /import\s*\{[^}]*\buseMutation\b[^}]*\}\s*from "@tanstack\/react-query"/.test(text))
      .map(({ path }) => path);
    expect(direct).toEqual([]);
  });

  it("the guard is in use: every feature hook file that writes declares its mutations with it", () => {
    // A tripwire against the convention quietly dying: these are the files that
    // hold the app's mutations today.
    const users = sources.filter(({ text }) => /\buseOnceMutation\(|\buseOnceMutation</.test(text)).map(({ path }) => path);
    expect(users.length).toBeGreaterThanOrEqual(9);
  });

  it("a dialog that says «Διαγραφή…» while it runs cannot be closed with Esc meanwhile", () => {
    const open = sources.filter(({ text }) => /t\("common\.deleting"\)/.test(text) && !/keyboard=\{!/.test(text)).map(({ path }) => path);
    expect(open).toEqual([]);
  });

  it("no delete reports back through `mutate(…, { onSuccess })`: those callbacks are dropped when the dialog closes or a second call is made, and the answer is lost", () => {
    // `mutateAsync` in a try/catch is the way: the toast is said whatever the screen does meanwhile.
    const lost = sources.filter(({ text }) => /\b(delete|remove)\w*\.mutate\([^)]*\{\s*onSuccess/.test(text)).map(({ path }) => path);
    expect(lost).toEqual([]);
  });
});

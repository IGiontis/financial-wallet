import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import { RequiredMark } from "./RequiredMark";
import { YesNoChoice } from "./YesNoChoice";
import { markedLabels } from "../../test/requiredMarks";

// One star for every required field, in every form (the owner, 2026-11-12:
// «μερικά πεδία στις φόρμες που είναι υποχρεωτικά δεν έχουν την ένδειξη (*)»).
// The forms' own tests check which fields carry it; this one checks the star
// itself, the YES/NO question's, and that no label still types its own.

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the required star", () => {
  it("is for the eye only, in the one red, and not taken for an error", () => {
    render(
      <label>
        Amount
        <RequiredMark />
      </label>,
    );
    const mark = document.querySelector(".required-mark")!;
    expect(mark).toHaveAttribute("aria-hidden", "true");
    // Not `.text-danger`: that is how an error already showing is recognised (noEarlyErrors).
    expect(mark).not.toHaveClass("text-danger");
    // Drawn by its stylesheet, not written: the label's text stays «Amount» —
    // what a screen reader reads and what `getByLabelText("Amount")` finds.
    expect(mark.textContent).toBe("");
    expect(readFileSync(join(__dirname, "css", "RequiredMark.module.css"), "utf8")).toMatch(/::after\s*\{\s*content:\s*"\*";\s*color:\s*var\(--expense-text\);/);
    expect(document.querySelector("label")!.textContent).toBe("Amount");
    expect(markedLabels()).toEqual(["Amount"]);
  });

  it("marks a required YES/NO question and its group, and only that one", () => {
    render(
      <>
        <YesNoChoice required question="Is it active?" questionHint="A paused one is kept" value={undefined} onChange={() => {}} />
        <YesNoChoice question="Optional?" value={undefined} onChange={() => {}} />
      </>,
    );
    expect(markedLabels()).toEqual(["Is it active?"]);
    // The star sits with the question, not after the hint under it.
    expect(document.querySelector(".required-mark")!.parentElement!.textContent).toBe("Is it active?");
    const [required, optional] = screen.getAllByRole("radiogroup");
    expect(required).toHaveAttribute("aria-required", "true");
    expect(optional).not.toHaveAttribute("aria-required");
    // The star is not part of the group's name.
    expect(required).toHaveAccessibleName(/^Is it active\?\s*A paused one is kept$/);
  });

  it("is never typed into a label by hand any more", () => {
    // `{t("common.date")} *` and the like: each one is a star that is not the
    // shared one — another colour, read aloud, and missed by the forms' tests.
    const SRC = join(__dirname, "..", "..");
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return files(path);
        return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
      });
    const literal = /(\}|[\p{L})]) \*\s*(<\/|$)/u;
    const found = files(SRC).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, i) => ({ line: line.trim(), at: `${relative(SRC, path).replace(/\\/g, "/")}:${i + 1}` }))
        .filter(({ line }) => !/^(\*|\/\/|\/\*|\{\/\*)/.test(line) && literal.test(line))
        .map(({ at }) => at),
    );
    expect(found).toEqual([]);
  });
});

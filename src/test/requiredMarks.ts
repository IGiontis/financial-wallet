// The «required» star in tests: which labels carry the shared one (`RequiredMark`).

const clean = (text: string) =>
  text
    .replace(/\s*\*\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * What each star on screen marks: the text of the label, question or prompt it
 * sits in, without the star — in the order they appear. A test compares it with
 * the fields its form's validation requires, so an unmarked required field and
 * a marked optional one both fail it.
 */
export function markedLabels(root: ParentNode = document.body): string[] {
  return [...root.querySelectorAll(".required-mark")].map((mark) => clean(mark.parentElement?.textContent ?? ""));
}

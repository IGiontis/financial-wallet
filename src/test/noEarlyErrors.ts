import { expect } from "vitest";

/**
 * Item 97b: a dialog shows no error before anything was touched or Next/Save
 * pressed. What would be on screen as red: an invalid field, a feedback line
 * forced visible, a danger text, an ARIA-invalid control.
 */
export function shownErrors(root: ParentNode = document): string[] {
  const nodes = root.querySelectorAll(".is-invalid, [aria-invalid='true'], .invalid-feedback.d-block, .text-danger");
  return [...nodes].map((n) => (n.textContent?.trim() || (n as HTMLElement).id || n.getAttribute("aria-label") || n.tagName) as string);
}

export function expectNoErrors(root: ParentNode = document) {
  expect(shownErrors(root)).toEqual([]);
}

import { expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Walking the bill wizard in tests: its rail, «Next», and the check's Save.

/** The step the rail marks as current. */
export const currentStep = () => document.querySelector('[aria-current="step"]')?.textContent ?? "";

/** A step on the rail, by its number — an edit's rail is open. */
export async function toStep(n: number) {
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: new RegExp(`^${n}`) }));
  await waitFor(() => expect(currentStep().startsWith(String(n))).toBe(true));
}

/** «Next ›»; false when the step stayed put — something on it is missing. */
export async function next(): Promise<boolean> {
  const before = currentStep();
  await userEvent.click(screen.getByRole("button", { name: /^next/i }));
  try {
    await waitFor(() => expect(currentStep()).not.toBe(before), { timeout: 400 });
    return true;
  } catch {
    return false;
  }
}

export const saveButton = () => screen.queryByRole("button", { name: /save changes|add bill/i });

/**
 * A new bill's yes / no questions start unanswered (no prefill, tiles
 * included): any still unanswered on the current step is answered «Όχι» —
 * what the form used to assume. A test that means «Ναι» picks it itself.
 */
export async function answerLeftWithNo() {
  const dialog = screen.queryByRole("dialog");
  if (!dialog) return;
  for (const group of within(dialog).queryAllByRole("radiogroup")) {
    const radios = within(group).queryAllByRole("radio");
    const no = radios.find((r) => /^no/i.test(r.textContent ?? ""));
    const yes = radios.find((r) => /^yes/i.test(r.textContent ?? ""));
    if (!no || !yes || radios.some((r) => r.getAttribute("aria-checked") === "true")) continue;
    await userEvent.click(no);
  }
}

/** Forward with «Next» to the check and save there — as far as the answers allow. */
export async function save() {
  for (let i = 0; i < 6 && !saveButton(); i++) {
    await answerLeftWithNo();
    if (!(await next())) return;
  }
  const button = saveButton();
  if (button) await userEvent.click(button);
}

/** The «Ναι» or «Όχι» tile of the question that matches. */
export const tile = async (question: RegExp, yes: boolean) => within(await screen.findByRole("radiogroup", { name: question })).getByRole("radio", { name: yes ? /^yes/i : /^no/i });

/**
 * A new bill's first two steps filled in: a name and «active? Ναι», then an
 * amount, a category and «changes? Όχι» — the answers the form used to assume.
 * Leaves it on «Ποσό».
 */
export async function fillNew(name: string, amount: string, categoryId: string) {
  await userEvent.type(await screen.findByLabelText(/^name/i), name);
  // «Is it active?» starts on «Ναι» (owner, 2026-11-12): clicking it again keeps it.
  await userEvent.click(await tile(/is it active/i, true));
  await next();
  // «Does it change?» starts on «Ναι» too, which names the field «Estimated amount»: «Όχι» first.
  await userEvent.click(await tile(/amount change/i, false));
  await userEvent.type(screen.getByLabelText(/^amount \(/i), amount);
  await userEvent.selectOptions(screen.getByLabelText(/^category/i), categoryId);
}

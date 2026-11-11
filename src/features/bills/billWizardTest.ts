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

/** Forward with «Next» to the check and save there — as far as the answers allow. */
export async function save() {
  for (let i = 0; i < 6 && !saveButton(); i++) if (!(await next())) return;
  const button = saveButton();
  if (button) await userEvent.click(button);
}

/** The «Ναι» or «Όχι» tile of the question that matches. */
export const tile = async (question: RegExp, yes: boolean) => within(await screen.findByRole("radiogroup", { name: question })).getByRole("radio", { name: yes ? /^yes/i : /^no/i });

/** A new bill's first two steps filled in: a name, then an amount and a category. Leaves it on «Ποσό». */
export async function fillNew(name: string, amount: string, categoryId: string) {
  await userEvent.type(await screen.findByLabelText(/^name/i), name);
  await next();
  await userEvent.type(screen.getByLabelText(/^amount \(/i), amount);
  await userEvent.selectOptions(screen.getByLabelText(/^category/i), categoryId);
}

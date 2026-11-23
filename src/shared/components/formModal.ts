/**
 * What every dialog that takes data is opened with: a click on the backdrop
 * does not close it. A tap beside a half-filled form threw away everything in
 * it; now the dialog gives a small shake instead, and closes only by its own
 * ✕, Cancel or Escape.
 *
 * Dialogs that only show something — a bill's details, a sheet of figures —
 * keep closing on a click outside: nothing is lost by it.
 *
 *   <Modal {...FORM_MODAL} isOpen={…} toggle={…}>
 */
export const FORM_MODAL = { backdrop: "static" } as const;

/** Which way the money in this dialog goes. */
export type MoneyTone = "expense" | "income";

/**
 * The tone band a money dialog wears on its HEADER (`.claude/rules/ui.md`
 * rule 15a, owner 2026-11-19): red for money going out or money I owe, green
 * for money coming in or owed to me. The body keeps the ordinary dialog
 * surface, so the red and green FIGURES inside it stay readable — the owner's
 * complaint about the debts dialogs, whose whole body used to be tinted red.
 *
 *   <ModalHeader className={moneyToneHead(borrowed ? "expense" : "income")} …>
 *
 * A dialog with no direction (a transfer, a bank reading, a plain confirmation)
 * passes nothing and keeps the plain header. Colours: styles/theme.css, «A
 * money dialog's tone goes on its HEADER».
 */
export const moneyToneHead = (tone: MoneyTone | null | undefined | false): string | undefined => (tone ? `tone-head tone-head-${tone}` : undefined);

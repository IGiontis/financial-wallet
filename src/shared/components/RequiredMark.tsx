import styles from "./css/RequiredMark.module.css";

/**
 * The «required» star after a field's label — every form, one look.
 *
 * Put it straight after the label text: `<Label>{t("common.date")}<RequiredMark /></Label>`,
 * on the question of a YES/NO pair (`<YesNoChoice required …>` does it), and on
 * the prompt of a step whose whole content is one required choice (a category,
 * a card). Only where the form's own validation refuses to go on without an
 * answer; optional fields stay unmarked.
 *
 * The star is for the eye only: drawn by CSS on an `aria-hidden` element, so
 * it is not part of the label's text or the field's accessible name; a screen
 * reader hears «required» from the field itself, which carries `aria-required`.
 * Its colour is the owner's one red, `--expense-text` (held to AA by
 * contrast.test.ts) — not `.text-danger`, which reads as an error already
 * showing (see the module's note). `required-mark` is a hook for tests.
 */
export function RequiredMark() {
  return <span className={`required-mark ms-1 ${styles.mark}`} aria-hidden="true" />;
}

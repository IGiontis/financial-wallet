import type { FocusEvent } from "react";

/**
 * A blur that counts as "touched" only once something was typed (item 97b).
 *
 * A dialog that opens with its first field focused loses that focus to the
 * dialog itself, or to Cancel, the close cross or a choice tile, before anyone
 * typed a letter — and formik's `handleBlur` then marked the empty field
 * touched, so «Το όνομα χρειάζεται» was on screen the moment the dialog opened.
 * An empty field is said to be missing when Next or Save is pressed instead.
 */
export function typedBlur<T extends HTMLInputElement | HTMLTextAreaElement>(onBlur: (e: FocusEvent<T>) => void) {
  return (e: FocusEvent<T>) => {
    if (e.target.value.trim() !== "") onBlur(e);
  };
}

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

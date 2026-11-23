import type { ReactNode } from "react";
import { ModalFooter } from "reactstrap";
import styles from "../css/DialogFooter.module.css";

/**
 * Every dialog's and wizard's footer, in three slots:
 *
 *   [🗑 Διαγραφή] │ [‹ Πίσω / Ακύρωση] ……… [Επόμενο › / Αποθήκευση]
 *
 * **Delete is kept apart** (rule 15b, owner 2026-11-19): `remove` goes first on
 * the far left, then a thin vertical rule with a clear gap on either side of
 * it, then `back` — the way out of this step. `children` are the forward
 * actions, and they alone sit on the right. The rule is what keeps a thumb
 * aiming for «Πίσω» off the bin; before it the two stood side by side in one
 * `d-flex gap-2`, half a centimetre apart.
 *
 *   <DialogFooter
 *     remove={isEdit && <DeleteButton iconOnly … />}
 *     back={<Button color="secondary" outline onClick={back}>‹ Πίσω</Button>}
 *   >
 *     <UnchangedHint show={unchanged} />
 *     <Button type="submit" color="primary">Επόμενο ›</Button>
 *   </DialogFooter>
 *
 * The rule is drawn only when the left slot really holds two buttons: a footer
 * with no delete, or with nothing but a delete, has nothing to keep apart and
 * gets no rule. `children` render in their order, so Save / Next comes last.
 *
 * `bare` + `className` draws the same three slots in a plain `<div>` — for a
 * wizard whose steps run across a PAGE rather than inside a dialog, where the
 * bar is sticky and the page's own (`TransactionWizard.module.css`
 * `.pageFooter`; reference: `AddTransactionModal`, `TransferWizard`,
 * `ClosingWizard`).
 *
 * The layout is this one piece's (`shared/css/DialogFooter.module.css`) —
 * never a `justify-content-between` and a `d-flex gap-2` of a dialog's own.
 */
export function DialogFooter({ remove, back, children, className, bare = false }: { remove?: ReactNode; back?: ReactNode; children?: ReactNode; className?: string; bare?: boolean }) {
  const parts = (
    <>
      <div className={styles.left}>
        {remove}
        {remove && back ? <span className={styles.rule} aria-hidden /> : null}
        {back}
      </div>
      <div className={styles.group}>{children}</div>
    </>
  );
  const classes = `${styles.foot} ${className ?? ""}`;
  return bare ? <div className={classes}>{parts}</div> : <ModalFooter className={classes}>{parts}</ModalFooter>;
}

export default DialogFooter;

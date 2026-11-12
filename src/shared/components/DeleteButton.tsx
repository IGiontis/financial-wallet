import { useState, type CSSProperties } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";
import { useRunOnce } from "../hooks/useRunOnce";

interface DeleteButtonProps {
  /**
   * Runs once the delete is confirmed — or at once, with `opensConfirm`.
   *
   * Return the delete's promise (`remove.mutateAsync(id)` inside a try/catch
   * that toasts) and this waits for it: the question stays up with
   * «Διαγραφή…», every button in it and its close locked, and goes when the
   * answer is in. Report the result (toast) in the handler — a rejection here
   * only closes the question.
   */
  onClick: () => void | Promise<unknown>;
  /** What it says beside the bin; "Delete" unless told otherwise. */
  label?: string;
  /** Only the bin — for a row with no room for a word. Still named for a screen reader. */
  iconOnly?: boolean;
  /** The word from `sm` up, the bin alone on a phone. */
  wordFromSm?: boolean;
  size?: "sm";
  disabled?: boolean;
  /**
   * The delete this button started is running somewhere else (the page's own
   * confirm, its mutation's `isPending`): drawn as working and locked.
   */
  busy?: boolean;
  /** Why it is disabled, when it is. */
  title?: string;
  /** A fuller name for a screen reader: "Delete Netflix" rather than "Delete". */
  ariaLabel?: string;
  /** What is being deleted, named in the question: «Διαγραφή του «Φαγητό»;». */
  what?: string;
  /**
   * The click opens the page's own "are you sure" — one that says more than
   * this one could, such as what else goes with it — so this one does not ask
   * a second time.
   */
  opensConfirm?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The one way the app asks to delete something: a red outlined button with a
 * bin, and the word when there is room for it.
 *
 * And nothing is deleted on one tap: unless the click opens a confirmation of
 * the page's own (`opensConfirm`), this asks first — "Delete …? It can't be
 * undone." — and deletes only on the second, red, button. A delete that a
 * screen forgets to guard is guarded anyway.
 *
 * And it runs once (`.claude/rules/ui.md`, «An action waits for its answer»):
 * from the confirming press until the delete answers, the red button says
 * «Διαγραφή…» and nothing in the question can be pressed or closed — a second
 * press used to send a second batch naming what the first had deleted, and
 * the rules refused it with an error for a delete that had gone through.
 */
export function DeleteButton({ onClick, label, iconOnly = false, wordFromSm = false, size, disabled, busy = false, title, ariaLabel, what, opensConfirm = false, className, style }: DeleteButtonProps) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [run, running] = useRunOnce();
  const working = running || busy;
  const text = label ?? t("common.delete");
  const close = () => {
    if (!working) setAsking(false);
  };
  // Whatever the answer, the question goes once it is in: the handler has
  // said what happened (`run` never rejects).
  const confirm = () => run(onClick).then(() => setAsking(false));

  return (
    <>
      <Button
        type="button"
        color="danger"
        outline
        size={size}
        disabled={disabled || working}
        aria-busy={working || undefined}
        onClick={() => (opensConfirm ? void run(onClick) : setAsking(true))}
        title={title ?? (iconOnly || wordFromSm ? text : undefined)}
        aria-label={ariaLabel ?? (iconOnly || wordFromSm ? text : undefined)}
        className={`d-inline-flex align-items-center justify-content-center gap-1 flex-shrink-0 text-nowrap ${className ?? ""}`}
        style={style}
      >
        <FiTrash2 size={size === "sm" ? 13 : 15} aria-hidden />
        {!iconOnly && <span className={wordFromSm ? "d-none d-sm-inline" : undefined}>{working && opensConfirm ? t("common.deleting") : text}</span>}
      </Button>

      {!opensConfirm && (
        // Above whatever sheet the button sits in. While the delete runs it
        // cannot be closed: no ×, no Esc, no tap outside.
        <Modal isOpen={asking} toggle={close} centered size="sm" zIndex={1080} backdrop={working ? "static" : true} keyboard={!working}>
          <ModalHeader toggle={working ? undefined : close}>{t("common.deleteConfirmTitle")}</ModalHeader>
          <ModalBody style={{ fontSize: "var(--fs-lead)" }}>{what ? t("common.deleteConfirmNamed", { name: what }) : t("common.deleteConfirmBody")}</ModalBody>
          <ModalFooter>
            <Button color="secondary" outline onClick={close} disabled={working}>
              {t("common.cancel")}
            </Button>
            <Button color="danger" onClick={() => void confirm()} disabled={working} aria-busy={working || undefined}>
              {working ? t("common.deleting") : text}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

export default DeleteButton;

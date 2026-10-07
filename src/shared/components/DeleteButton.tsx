import { useState, type CSSProperties } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";

interface DeleteButtonProps {
  /** Runs once the delete is confirmed — or at once, with `opensConfirm`. */
  onClick: () => void;
  /** What it says beside the bin; "Delete" unless told otherwise. */
  label?: string;
  /** Only the bin — for a row with no room for a word. Still named for a screen reader. */
  iconOnly?: boolean;
  /** The word from `sm` up, the bin alone on a phone. */
  wordFromSm?: boolean;
  size?: "sm";
  disabled?: boolean;
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
 */
export function DeleteButton({ onClick, label, iconOnly = false, wordFromSm = false, size, disabled, title, ariaLabel, what, opensConfirm = false, className, style }: DeleteButtonProps) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const text = label ?? t("common.delete");

  return (
    <>
      <Button
        type="button"
        color="danger"
        outline
        size={size}
        disabled={disabled}
        onClick={() => (opensConfirm ? onClick() : setAsking(true))}
        title={title ?? (iconOnly || wordFromSm ? text : undefined)}
        aria-label={ariaLabel ?? (iconOnly || wordFromSm ? text : undefined)}
        className={`d-inline-flex align-items-center justify-content-center gap-1 flex-shrink-0 text-nowrap ${className ?? ""}`}
        style={style}
      >
        <FiTrash2 size={size === "sm" ? 13 : 15} aria-hidden />
        {!iconOnly && <span className={wordFromSm ? "d-none d-sm-inline" : undefined}>{text}</span>}
      </Button>

      {!opensConfirm && (
        // Above whatever sheet the button sits in.
        <Modal isOpen={asking} toggle={() => setAsking(false)} centered size="sm" zIndex={1080}>
          <ModalHeader toggle={() => setAsking(false)}>{t("common.deleteConfirmTitle")}</ModalHeader>
          <ModalBody style={{ fontSize: 14 }}>{what ? t("common.deleteConfirmNamed", { name: what }) : t("common.deleteConfirmBody")}</ModalBody>
          <ModalFooter>
            <Button color="secondary" outline onClick={() => setAsking(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              color="danger"
              onClick={() => {
                setAsking(false);
                onClick();
              }}
            >
              {text}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

export default DeleteButton;

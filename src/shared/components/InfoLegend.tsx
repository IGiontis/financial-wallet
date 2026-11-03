import { useState, type ReactNode } from "react";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { FiInfo } from "react-icons/fi";
import styles from "../css/InfoLegend.module.css";

/** One line of a key: a sample of the mark, and what it means. */
export interface LegendEntry {
  /** Stable and unique within the key. */
  id: string;
  /** The mark itself, drawn with the classes the chart or calendar uses — so the two cannot drift. */
  swatch: ReactNode;
  text: ReactNode;
}

/**
 * What the colours mean, behind a small ⓘ beside the thing they colour.
 *
 * A key laid out under every calendar and chart took a screen of its own on a
 * phone, and was read once: after that it is something to scroll past. Behind
 * the ⓘ it is one tap away whenever the question comes up, and the page is the
 * calendar again. One button and one dialog for every key in the app, so the
 * way to ask is the same everywhere.
 *
 * A view, not a form: it closes on a tap outside, like the other read-only
 * dialogs.
 */
export function InfoLegend({
  title,
  entries,
  children,
  label,
  className,
}: {
  /** The dialog's heading — «Τι σημαίνουν τα χρώματα». */
  title: string;
  entries?: readonly LegendEntry[];
  /** Anything under the entries: a sentence on the signs, a note. */
  children?: ReactNode;
  /** The button's name for screen readers; the title by default. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button type="button" className={`${styles.button} ${className ?? ""}`} onClick={() => setOpen(true)} aria-label={label ?? title} title={label ?? title} aria-haspopup="dialog">
        <FiInfo aria-hidden />
      </button>
      <Modal isOpen={open} toggle={close} centered scrollable>
        <ModalHeader toggle={close}>
          {title}
        </ModalHeader>
        <ModalBody>
          {entries && entries.length > 0 && (
            <ul className={styles.list}>
              {entries.map((entry) => (
                <li key={entry.id} className={styles.entry}>
                  <span className={styles.swatch} aria-hidden>
                    {entry.swatch}
                  </span>
                  <span className={styles.text}>{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
          {children && <div className={styles.note}>{children}</div>}
        </ModalBody>
      </Modal>
    </>
  );
}

export default InfoLegend;

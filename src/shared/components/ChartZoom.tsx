import type { ReactNode } from "react";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiMaximize2 } from "react-icons/fi";
import styles from "../css/ChartZoom.module.css";

/**
 * "See it bigger", for any chart on any screen.
 *
 * A card in a two-column grid is the wrong size for most of these drawings and
 * far too small for all of them on a phone — labels collide, ribbons overlap,
 * and a row of forty bars becomes a texture. Rather than shrinking the charts
 * until they fit, every card offers the same escape: the identical drawing,
 * given the whole screen.
 *
 * Button and sheet are separate exports because the button belongs in a card
 * header the caller lays out and the sheet belongs at the end of the tree; the
 * caller owns the one boolean between them.
 */
export function ZoomButton({ onClick, label, className }: { onClick: () => void; label?: string; className?: string }) {
  const { t } = useTranslation();
  const text = label ?? t("analytics.expandChart");

  return (
    <button type="button" className={`${styles.expand} ${className ?? ""}`} onClick={onClick} aria-label={text} title={text}>
      <FiMaximize2 size={14} aria-hidden />
    </button>
  );
}

interface ZoomModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  hint?: ReactNode;
  /** Legends and scales, kept below the drawing exactly as in the card. */
  footer?: ReactNode;
  children: ReactNode;
}

export function ZoomModal({ open, onClose, title, hint, footer, children }: ZoomModalProps) {
  return (
    <Modal isOpen={open} toggle={onClose} fullscreen scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{title}</span>
      </ModalHeader>
      <ModalBody className="d-flex flex-column">
        {hint && (
          <p className="text-body-secondary mb-2" style={{ fontSize: 12 }}>
            {hint}
          </p>
        )}
        <div className={styles.zoomBody}>{children}</div>
        {footer}
      </ModalBody>
    </Modal>
  );
}

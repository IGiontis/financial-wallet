import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, ModalBody } from "reactstrap";
import { FiRefreshCw } from "react-icons/fi";
import { useAppUpdate } from "../hooks/useAppUpdate";

/** Marks this dialog, so it is not mistaken for someone's open form. */
const PROMPT_CLASS = "update-prompt";

/** Another dialog is open — most likely a form someone is typing into. */
const otherDialogOpen = () => document.querySelector(`.modal.show:not(.${PROMPT_CLASS})`) !== null;

/**
 * The one thing standing between a published build and the reader having it.
 *
 * Centred over a dimmed page with nothing to press but Refresh: a quiet bar at
 * the bottom was easy to leave for days, and every day on an old version is a
 * day that version can break when a screen reaches for a file the server has
 * already replaced.
 *
 * Blocking is only safe because of when it appears. This is an app people type
 * amounts into, and a reload throws away whatever was in the form — so while
 * another dialog is open the prompt waits, and appears the moment it closes.
 *
 * It has to be mounted unconditionally: the hook inside it is what registers
 * the service worker at all.
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const { needRefresh, apply } = useAppUpdate();
  const [applying, setApplying] = useState(false);

  // Watching the page only while there is an update to show: a whole-page
  // observer for the rest of the time would be work for nothing.
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!needRefresh) return () => {};
      const observer = new MutationObserver(notify);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    [needRefresh],
  );
  const busy = useSyncExternalStore(subscribe, otherDialogOpen, () => false);

  const refresh = () => {
    // One tap: the reload takes a moment while the new version takes over, and
    // a second tap in that moment would only queue a second reload.
    setApplying(true);
    apply();
  };

  return (
    <Modal isOpen={needRefresh && !busy} centered size="sm" backdrop="static" keyboard={false} modalClassName={PROMPT_CLASS} labelledBy="update-prompt-title">
      <ModalBody className="text-center p-4">
        <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3 bg-primary-subtle text-primary-emphasis" style={{ width: 52, height: 52 }}>
          <FiRefreshCw size={22} aria-hidden />
        </div>
        <h2 id="update-prompt-title" className="h6 fw-semibold text-body-emphasis mb-1">
          {t("common.updateTitle")}
        </h2>
        <p className="small text-body-secondary mb-3">{t("common.updateBody")}</p>
        <Button color="primary" className="w-100" onClick={refresh} disabled={applying}>
          {applying ? t("common.updating") : t("common.updateNow")}
        </Button>
      </ModalBody>
    </Modal>
  );
}

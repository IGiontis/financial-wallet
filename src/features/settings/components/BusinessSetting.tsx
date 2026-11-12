import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useWorkspaceSetting } from "../../../shared/hooks/useWorkspaceSetting";
import { FEATURE_KEYS, useHasAccess } from "../../../shared/hooks/useHasAccess";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { FORM_MODAL } from "../../../shared/components/formModal";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "../../../shared/css/ChoiceSwitch.module.css";

/**
 * «Σελίδα Δουλειά: Ναι / Όχι» — with the account, so it holds on every device.
 * The same two-button switch as «Κινούμενα εφέ», but a change reaches the user
 * document, so it is said and confirmed first (before → after, and what it
 * does). Off by default; switched off, the page and its menu entry go and the
 * records stay, ready for when it is switched on again. Switching it on makes
 * nothing: the businesses and their lines are the user's to make, on the page.
 */
export function BusinessSetting() {
  const { t } = useTranslation();
  const on = useHasAccess("business");
  const [, setOn] = useWorkspaceSetting<boolean>(FEATURE_KEYS.business, false);
  const guard = useOfflineGuard("settings");
  const [asking, setAsking] = useState<boolean | null>(null);
  const onOff = (value: boolean) => t(value ? "common.yes" : "common.no");

  const options = [
    { value: true, label: t("common.yes") },
    { value: false, label: t("common.no") },
  ];
  const confirm = () => {
    if (asking === null) return;
    setOn(asking);
    toast.success(t(asking ? "settings.businessTurnedOn" : "settings.businessTurnedOff"));
    setAsking(null);
  };

  return (
    <>
      <div role="group" aria-label={t("settings.business")} className={`${segmented.group} ${segmented.even} ${styles.switch} w-100`}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={on === option.value}
            disabled={guard.locked}
            title={guard.reason}
            className={`${segmented.item} ${on === option.value ? segmented.active : ""} ${styles.option}`}
            onClick={() => option.value !== on && setAsking(option.value)}
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      <Modal {...FORM_MODAL} isOpen={asking !== null} toggle={() => setAsking(null)} centered>
        <ModalHeader toggle={() => setAsking(null)}>{t("settings.businessConfirmTitle")}</ModalHeader>
        <ModalBody>
          <p className="d-flex flex-wrap justify-content-between gap-2">
            <span>{t("settings.business")}</span>
            <span>
              <s>{onOff(on)}</s> → <b>{onOff(asking ?? false)}</b>
            </span>
          </p>
          <p className="small text-body-secondary mb-0">{t(asking ? "settings.businessOnSays" : "settings.businessOffSays")}</p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setAsking(null)}>
            {t("common.back")}
          </Button>
          <Button color="primary" onClick={confirm}>
            {t("common.save")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

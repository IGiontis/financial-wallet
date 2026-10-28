import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { FiInfo } from "react-icons/fi";
import { useWorkspaceSetting } from "../../../shared/hooks/useWorkspaceSetting";
import { ViewSwitch } from "../../../shared/components/ViewSwitch";
import { FORM_MODAL } from "../../../shared/components/formModal";
import { useBills } from "../../bills/useBills";
import { BILL_ALERTS_BY_BILL_KEY, BILL_ALERTS_KEY, BILL_ALERTS_MODE_KEY, BILL_ALERTS_OFF_KEY, BILL_ALERTS_REACH_KEY, useBillAlerts, type BillAlertsMode } from "../../bills/useBillAlerts";
import { ALERT_REACHES, asReach, DEFAULT_REACH, reachParts, type AlertReach, type ReachByBill } from "../../bills/billAlerts";
import styles from "../css/BillAlertSetting.module.css";

/** Everything this section sets, as one draft. */
interface Draft {
  enabled: boolean;
  mode: BillAlertsMode;
  reach: AlertReach;
  byBill: ReachByBill;
  off: string[];
}

/**
 * The popup of bills to pay: on or off; how far ahead it looks, a day to six
 * months — one reach for every bill, or each bill its own, one way or the
 * other and never both; and which bills it names. With the account, so it
 * holds on every device.
 *
 * Changes are a draft until «Αποθήκευση», which first lists them to be
 * confirmed; «Επαναφορά» puts the draft back as it was saved. Under the switch,
 * what «Μην μου ξαναδείξεις» has hidden, with a way to show it again — the
 * switch stays on, since those payments are all it hid.
 *
 * The bills are the query the menu's badge already holds: no reads of its own.
 * Saving writes the user document once per setting changed. The popup links
 * here (`#bill-alerts`), and the page comes down to it.
 */
export default function BillAlertSetting() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const [enabled, setEnabled] = useWorkspaceSetting(BILL_ALERTS_KEY, true);
  const [mode, setMode] = useWorkspaceSetting<BillAlertsMode>(BILL_ALERTS_MODE_KEY, "all");
  const [reach, setReach] = useWorkspaceSetting<AlertReach>(BILL_ALERTS_REACH_KEY, DEFAULT_REACH);
  const [byBill, setByBill] = useWorkspaceSetting<ReachByBill>(BILL_ALERTS_BY_BILL_KEY, {});
  const [off, setOff] = useWorkspaceSetting<string[]>(BILL_ALERTS_OFF_KEY, []);
  const { data: bills } = useBills();
  const active = useMemo(() => (bills ?? []).filter((bill) => bill.isActive).sort((a, b) => a.name.localeCompare(b.name)), [bills]);

  // What is saved, and the edits on top of it: the saved values can still arrive
  // from the account after the page has opened, and the draft follows them.
  const saved: Draft = useMemo(() => ({ enabled, mode, reach: asReach(reach), byBill, off }), [enabled, mode, reach, byBill, off]);
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const draft: Draft = useMemo(() => ({ ...saved, ...edits }), [saved, edits]);
  const edit = (patch: Partial<Draft>) => setEdits((current) => ({ ...current, ...patch }));
  const [confirming, setConfirming] = useState(false);

  // The payments put away that the popup would name today, as it is saved.
  const [now] = useState(() => new Date());
  const { alerts, seen, setSeen } = useBillAlerts(now);
  const hidden = alerts.filter((alert) => seen.includes(alert.key));
  const showAgain = () => {
    setSeen([]);
    toast.success(t("settings.billAlertsShownAgain"));
  };

  // What saving would change, a line each, in words — for the confirmation.
  const changes = useMemo(() => {
    const reachLabel = (option: AlertReach) => {
      const { count, unit } = reachParts(option);
      return t(`settings.billAlertsReach_${unit}`, { count });
    };
    // In one-for-all, every bill is at that one, whatever was once set for it.
    const billReach = (state: Draft, id: string) => asReach(state.mode === "bill" ? (state.byBill[id] ?? state.reach) : state.reach);
    const onOff = (on: boolean) => t(on ? "settings.billAlertsOn" : "settings.billAlertsOff");
    const modeName = (m: BillAlertsMode) => t(m === "all" ? "settings.billAlertsModeAll" : "settings.billAlertsModeBill");
    const shownName = (shown: boolean) => t(shown ? "settings.billAlertsShown" : "settings.billAlertsHidden");

    const lines: { what: string; from: string; to: string }[] = [];
    if (draft.enabled !== saved.enabled) lines.push({ what: t("settings.billAlertsPopup"), from: onOff(saved.enabled), to: onOff(draft.enabled) });
    // The tab alone changes nothing: «Ανά πάγιο» with every bill still at the one for all
    // shows the same bills on the same days. It counts once some bill would move.
    const reachMoves = active.some((bill) => !draft.off.includes(bill.id) && billReach(saved, bill.id) !== billReach(draft, bill.id));
    if (draft.mode !== saved.mode && reachMoves) lines.push({ what: t("settings.billAlertsReach"), from: modeName(saved.mode), to: modeName(draft.mode) });
    if (draft.mode === "all" && draft.reach !== saved.reach) lines.push({ what: t("settings.billAlertsModeAll"), from: reachLabel(saved.reach), to: reachLabel(draft.reach) });
    for (const bill of active) {
      const wasShown = !saved.off.includes(bill.id);
      const shown = !draft.off.includes(bill.id);
      if (wasShown !== shown) lines.push({ what: bill.name, from: shownName(wasShown), to: shownName(shown) });
      else if (draft.mode === "bill" && shown && billReach(saved, bill.id) !== billReach(draft, bill.id)) {
        lines.push({ what: bill.name, from: reachLabel(billReach(saved, bill.id)), to: reachLabel(billReach(draft, bill.id)) });
      }
    }
    return lines;
  }, [draft, saved, active, t]);
  const dirty = changes.length > 0;

  const save = () => {
    if (draft.enabled !== saved.enabled) setEnabled(draft.enabled);
    if (draft.mode !== saved.mode) setMode(draft.mode);
    if (draft.reach !== saved.reach) setReach(draft.reach);
    if (draft.byBill !== saved.byBill) setByBill(draft.byBill);
    if (draft.off !== saved.off) setOff(draft.off);
    setEdits({});
    setConfirming(false);
    toast.success(t("settings.billAlertsSaved"));
  };

  // Opened from the popup: down to here. After the layout has put the new page at its top.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hash !== "#bill-alerts") return;
    const timer = setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    return () => clearTimeout(timer);
  }, [hash]);

  const reachOptions = ALERT_REACHES.map((option) => {
    const { count, unit } = reachParts(option);
    return (
      <option key={option} value={option}>
        {t(`settings.billAlertsReach_${unit}`, { count })}
      </option>
    );
  });
  const toggleBill = (id: string, shown: boolean) => edit({ off: shown ? draft.off.filter((other) => other !== id) : [...draft.off, id] });
  const perBill = draft.mode === "bill";

  return (
    <div id="bill-alerts" ref={ref} className={styles.section}>
      <FormGroup switch className="mb-3">
        <Input type="switch" id="bill-alerts-on" role="switch" checked={draft.enabled} onChange={(event) => edit({ enabled: event.target.checked })} />
        <Label check for="bill-alerts-on">
          {t("settings.billAlertsSwitch")}
        </Label>
      </FormGroup>
      {saved.enabled && hidden.length > 0 && (
        <p className={styles.hidden}>
          <FiInfo aria-hidden />
          <span>
            {t("settings.billAlertsPutAway", { count: hidden.length, names: hidden.map((alert) => alert.bill.name).join(", ") })}{" "}
            <button type="button" className={styles.showAgain} onClick={showAgain}>
              {t("settings.billAlertsShowAgain")}
            </button>
          </span>
        </p>
      )}

      <fieldset disabled={!draft.enabled}>
        <legend className={styles.legend}>{t("settings.billAlertsReach")}</legend>
        <ViewSwitch
          label={t("settings.billAlertsReach")}
          value={draft.mode}
          // Into «Ανά πάγιο» from one-for-all, every bill starts at that one — not at what was set
          // for it some time before. Saved per bill already, it finds its own again.
          onChange={(next) => edit({ mode: next, byBill: next === "bill" && saved.mode !== "bill" ? {} : saved.byBill })}
          block
          className="mb-2"
          options={[
            { id: "all", label: t("settings.billAlertsModeAll") },
            { id: "bill", label: t("settings.billAlertsModeBill") },
          ]}
        />
        {!perBill && (
          <Input type="select" aria-label={t("settings.billAlertsReachAll")} value={draft.reach} onChange={(event) => edit({ reach: asReach(event.target.value) })} className={`mb-3 ${styles.generalSelect}`}>
            {reachOptions}
          </Input>
        )}

        {/* The bills: ticked to be shown — and, each its own, how early. */}
        {active.length > 0 && (
          <>
            <p className={styles.legend}>{t("settings.billAlertsWhich")}</p>
            <div className={perBill ? styles.billRows : styles.billGrid}>
              {active.map((bill) => {
                const shown = !draft.off.includes(bill.id);
                return (
                  <div key={bill.id} className={perBill ? styles.billRow : undefined}>
                    {/* As wide as its box and name, not the row: a tap beside it does nothing. */}
                    <Label check className={styles.billName}>
                      <Input type="checkbox" className="m-0 flex-shrink-0" checked={shown} onChange={(event) => toggleBill(bill.id, event.target.checked)} />
                      {/* What will not be shown reads so: faded and struck through. */}
                      <span className={!draft.enabled || !shown ? styles.off : undefined}>{bill.name}</span>
                    </Label>
                    {perBill && (
                      // Each its own, starting from the one for all.
                      <Input
                        type="select"
                        bsSize="sm"
                        aria-label={t("settings.billAlertsReachOf", { name: bill.name })}
                        value={asReach(draft.byBill[bill.id] ?? draft.reach)}
                        disabled={!shown}
                        onChange={(event) => edit({ byBill: { ...draft.byBill, [bill.id]: asReach(event.target.value) } })}
                        className={styles.billSelect}
                      >
                        {reachOptions}
                      </Input>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </fieldset>

      <div className={styles.actions}>
        <Button color="secondary" outline disabled={!dirty} onClick={() => setEdits({})}>
          {t("settings.billAlertsRevert")}
        </Button>
        <Button color="primary" disabled={!dirty} onClick={() => setConfirming(true)}>
          {t("common.save")}
        </Button>
      </div>

      <Modal {...FORM_MODAL} isOpen={confirming} toggle={() => setConfirming(false)} centered>
        <ModalHeader toggle={() => setConfirming(false)}>{t("settings.billAlertsConfirmTitle")}</ModalHeader>
        <ModalBody>
          <ul className={styles.changes} aria-label={t("settings.billAlertsConfirmTitle")}>
            {changes.map((change, index) => (
              <li key={index}>
                <span>{change.what}</span>
                <span className={styles.change}>
                  <s>{change.from}</s> → <b>{change.to}</b>
                </span>
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setConfirming(false)}>
            {t("common.back")}
          </Button>
          <Button color="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

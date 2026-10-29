import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { FiAlertCircle, FiAlertTriangle } from "react-icons/fi";
import { hasUnseenAlert, reachFor, reachParts, type BillAlert } from "./billAlerts";
import { BILL_ALERTS_SETTINGS, useBillAlerts } from "./useBillAlerts";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { TOUR_PARAM, TOUR_SEEN_KEY } from "../tour/tourState";
import { isDemo } from "../../demo/demoMode";
import styles from "./css/BillAlertPopup.module.css";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * On arrival, the bills to pay: late or due today, and due within the reach
 * picked in the settings — five days unless changed (`useBillAlerts`). To look
 * at, with one way on to «Πάγια» — paying is done there.
 *
 * Once a session, and only while it has something not yet put away: ticking
 * «Μην μου ξαναδείξεις αυτές τις πληρωμές» puts away the payments listed, and
 * the popup comes back only for a new one — when it does, it lists every one
 * unpaid, the old ones with it. Switched off for good in the settings.
 *
 * Putting payments away writes the user document once; it reads nothing.
 *
 * A dialog in the middle of the screen, on a phone as on a desk — at the foot
 * of a phone it read as something left behind.
 */
export function BillAlertPopup() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { format } = useCurrencyConverter();
  const [now] = useState(() => new Date());
  const { loaded, enabled, reach, byBill, alerts, seen, setSeen } = useBillAlerts(now);
  const [closed, setClosed] = useState(false);
  const [putAway, setPutAway] = useState(false);
  // After the welcome tour, never over it: on a first visit it is the tour's turn.
  const [tourSeen] = useWorkspaceSetting(TOUR_SEEN_KEY, false);
  const touring = !tourSeen || new URLSearchParams(search).get(TOUR_PARAM) === "1";

  // Not before the account's own list has arrived: this device's copy could be missing what another put away.
  // Nor over the settings, where its own are being changed — it waits for the next page.
  // Nor in the demo: a visitor meets the app first, before a list of what to pay.
  const open = !closed && enabled && loaded && !touring && !isDemo() && !pathname.startsWith("/settings") && hasUnseenAlert(alerts, seen);

  const dayFmt = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage, { day: "numeric", month: "short" }), [i18n.resolvedLanguage]);
  const money = (alert: BillAlert) => `${alert.approximate ? "≈" : ""}${format(alert.amount)}`;
  const when = (alert: BillAlert) =>
    alert.late
      ? t("billAlert.lateBy", { count: -alert.days })
      : alert.days <= 0
        ? t("billAlert.today")
        : t("billAlert.inDays", { count: alert.days, date: dayFmt.format(alert.deadline) });

  const close = () => {
    // Only what is listed now: anything put away before and no longer due drops off, so the list never grows.
    if (putAway) setSeen(alerts.map((alert) => alert.key));
    setClosed(true);
  };
  const goTo = (path: string) => {
    close();
    navigate(path);
  };

  if (!open) return null;

  // «Μέσα σε 5 μέρες» while they share one reach; with reaches of their own, just «coming».
  const soonTitle = (rows: BillAlert[]) => {
    const reaches = new Set(rows.map((a) => reachFor(a.bill, reach, byBill)));
    if (reaches.size !== 1) return t("billAlert.groupSoonMixed");
    const { count, unit } = reachParts([...reaches][0]);
    return t(`billAlert.groupSoon_${unit}`, { count });
  };
  const groups = [
    { id: "now", title: t("billAlert.groupNow"), danger: true, rows: alerts.filter((a) => a.now) },
    { id: "soon", title: soonTitle(alerts.filter((a) => !a.now)), danger: false, rows: alerts.filter((a) => !a.now) },
  ].filter((group) => group.rows.length > 0);
  const total = round2(alerts.reduce((sum, a) => sum + a.amount, 0));
  // The furthest deadline still ahead; with every one gone, the money is needed now.
  const lastDay = alerts.reduce((last, a) => (a.deadline > last ? a.deadline : last), alerts[0].deadline);
  const needBy = alerts.every((a) => a.now) ? t("billAlert.needNow") : t("billAlert.needBy", { date: dayFmt.format(lastDay) });

  return (
    <Modal isOpen toggle={close} centered scrollable>
      <ModalHeader toggle={close}>{t("billAlert.title")}</ModalHeader>
      <ModalBody>
        <div className={styles.total}>
          <span>{needBy}</span>
          <strong>
            {alerts.some((a) => a.approximate) ? "≈" : ""}
            {format(total)}
          </strong>
        </div>
        {groups.map((group) => (
          <section key={group.id} className={group.danger ? styles.danger : styles.warning} aria-label={group.title}>
            <h3 className={styles.groupHead}>
              <span>{group.title}</span>
              <span>{format(round2(group.rows.reduce((sum, a) => sum + a.amount, 0)))}</span>
            </h3>
            {group.rows.map((alert) => (
              <div key={alert.key} className={styles.row}>
                <span className={styles.mark} aria-hidden>
                  {group.danger ? <FiAlertCircle /> : <FiAlertTriangle />}
                </span>
                <span className={styles.name}>{alert.bill.name}</span>
                <span className={styles.when}>{when(alert)}</span>
                <span className={styles.amount}>{money(alert)}</span>
              </div>
            ))}
          </section>
        ))}
        {/* These payments — not the popup: it comes back for a new one. */}
        <Label check className={styles.putAway}>
          <Input type="checkbox" checked={putAway} onChange={(event) => setPutAway(event.target.checked)} />
          {t("billAlert.putAway", { count: alerts.length })}
        </Label>
        <p className={styles.hint}>
          {t("billAlert.offHint")}{" "}
          <button type="button" className={styles.settingsLink} onClick={() => goTo(BILL_ALERTS_SETTINGS)}>
            {t("billAlert.toSettings")}
          </button>
        </p>
      </ModalBody>
      {/* Close at one end, the way on at the other. */}
      <ModalFooter className="justify-content-between">
        <Button color="secondary" outline onClick={close}>
          {t("common.close")}
        </Button>
        <Button color="primary" onClick={() => goTo("/bills/pay")}>
          {t("billAlert.toBills")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default BillAlertPopup;

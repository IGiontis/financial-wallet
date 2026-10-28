import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { FiAlertCircle, FiAlertTriangle } from "react-icons/fi";
import { useBills } from "./useBills";
import { asReach, billAlerts, DEFAULT_REACH, hasUnseenAlert, reachDays, reachFor, reachParts, type AlertReach, type BillAlert, type ReachByBill } from "./billAlerts";
import { useWorkspace, useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import styles from "./css/BillAlertPopup.module.css";

/** On or off, from «Ρυθμίσεις → Προτιμήσεις». On unless switched off. */
export const BILL_ALERTS_KEY = "bill-alerts";
/** How far ahead it looks (`AlertReach`), from the same place. */
export const BILL_ALERTS_REACH_KEY = "bill-alerts-reach";
/** One reach for every bill, or each bill its own — never both at once. */
export const BILL_ALERTS_MODE_KEY = "bill-alerts-scope";
export type BillAlertsMode = "all" | "bill";
/** A reach per bill (`ReachByBill`), read only in the "bill" mode. */
export const BILL_ALERTS_BY_BILL_KEY = "bill-alerts-by-bill";
/** The bills it leaves out, by id — picked there too. A new bill is in until left out. */
export const BILL_ALERTS_OFF_KEY = "bill-alerts-off";
/** Where those settings are: the address the popup's link opens. */
export const BILL_ALERTS_SETTINGS = "/settings/preferences#bill-alerts";
/** The payments «Μην μου τα ξαναδείξεις» put away — `BillAlert.key`s. */
const SEEN_KEY = "bill-alerts-seen";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * On arrival, the bills to pay: late or due today, and due within the reach
 * picked in the settings — five days unless changed (`billAlerts`). To look
 * at, with one way on to «Πάγια» — paying is done there.
 *
 * Once a session, and only while it has something not yet put away: ticking
 * «Μην μου τα ξαναδείξεις» puts away the payments listed, and the popup comes
 * back only for a new one — when it does, it lists every one unpaid, the old
 * ones with it. Switched off for good in the settings.
 *
 * Costs no reads of its own: the bills are the query the menu's badge already
 * holds, and both settings sit on the user document already read at start-up.
 * Putting payments away writes that document once.
 *
 * A dialog in the middle of the screen, on a phone as on a desk — at the foot
 * of a phone it read as something left behind.
 */
export function BillAlertPopup() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { format } = useCurrencyConverter();
  const { data: bills } = useBills();
  const { isSuccess: settingsLoaded } = useWorkspace();
  const [enabled] = useWorkspaceSetting(BILL_ALERTS_KEY, true);
  const [storedReach] = useWorkspaceSetting<AlertReach>(BILL_ALERTS_REACH_KEY, DEFAULT_REACH);
  const reach = asReach(storedReach);
  const [off] = useWorkspaceSetting<string[]>(BILL_ALERTS_OFF_KEY, []);
  const [mode] = useWorkspaceSetting<BillAlertsMode>(BILL_ALERTS_MODE_KEY, "all");
  const [storedByBill] = useWorkspaceSetting<ReachByBill>(BILL_ALERTS_BY_BILL_KEY, {});
  // Kept when the mode goes back to one for all, so switching back finds them; read only in their mode.
  const byBill = useMemo(() => (mode === "bill" ? storedByBill : {}), [mode, storedByBill]);
  const [seen, setSeen] = useWorkspaceSetting<string[]>(SEEN_KEY, []);
  const [closed, setClosed] = useState(false);
  const [putAway, setPutAway] = useState(false);
  const [now] = useState(() => new Date());

  const alerts = useMemo(
    () => billAlerts((bills ?? []).filter((bill) => !off.includes(bill.id)), now, (bill) => reachDays(reachFor(bill, reach, byBill), now)),
    [bills, off, now, reach, byBill],
  );
  // Not before the account's own list has arrived: this device's copy could be missing what another put away.
  // Nor over the settings, where its own are being changed — it waits for the next page.
  const open = !closed && enabled && settingsLoaded && !!bills && !pathname.startsWith("/settings") && hasUnseenAlert(alerts, seen);

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

  const groups = [
    { id: "now", title: t("billAlert.groupNow"), danger: true, rows: alerts.filter((a) => a.now) },
    { id: "soon", title: soonTitle(alerts.filter((a) => !a.now)), danger: false, rows: alerts.filter((a) => !a.now) },
  ].filter((group) => group.rows.length > 0);
  // «Μέσα σε 5 μέρες» while they share one reach; with reaches of their own, just «coming».
  function soonTitle(rows: BillAlert[]) {
    const reaches = new Set(rows.map((a) => reachFor(a.bill, reach, byBill)));
    if (reaches.size !== 1) return t("billAlert.groupSoonMixed");
    const { count, unit } = reachParts([...reaches][0]);
    return t(`billAlert.groupSoon_${unit}`, { count });
  }
  const total = round2(alerts.reduce((sum, a) => sum + a.amount, 0));
  // The furthest deadline still ahead; with every one gone, the money is needed now.
  const lastDay = alerts.reduce((last, a) => (a.deadline > last ? a.deadline : last), alerts[0].deadline);
  const needBy = alerts.every((a) => a.now) ? t("billAlert.needNow") : t("billAlert.needBy", { date: dayFmt.format(lastDay) });

  const body = (
    <>
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
      <Label check className={styles.putAway}>
        <Input type="checkbox" checked={putAway} onChange={(event) => setPutAway(event.target.checked)} />
        {t("billAlert.putAway")}
      </Label>
      <p className={styles.hint}>
        {t("billAlert.offHint")}{" "}
        <button type="button" className={styles.settingsLink} onClick={() => goTo(BILL_ALERTS_SETTINGS)}>
          {t("billAlert.toSettings")}
        </button>
      </p>
    </>
  );

  const buttons = (
    <>
      <Button color="secondary" outline onClick={close}>
        {t("common.close")}
      </Button>
      <Button color="primary" onClick={() => goTo("/bills/pay")}>
        {t("billAlert.toBills")}
      </Button>
    </>
  );

  return (
    <Modal isOpen toggle={close} centered scrollable>
      <ModalHeader toggle={close}>{t("billAlert.title")}</ModalHeader>
      <ModalBody>{body}</ModalBody>
      <ModalFooter>{buttons}</ModalFooter>
    </Modal>
  );
}

export default BillAlertPopup;

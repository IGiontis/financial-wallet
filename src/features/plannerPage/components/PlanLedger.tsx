import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiChevronRight, FiPlus } from "react-icons/fi";
import styles from "../css/PlannerPage.module.css";

/** One line of the plan, ready to show. */
export interface LedgerItem {
  id: string;
  label: string;
  /** Where it comes from, on the money-out side: «Πάγια», «Δικά μου»… */
  group?: string;
  /** Signed total across the window; zero while it is off. */
  total: number;
  enabled: boolean;
  /** False for a line with nothing in the window to switch — a payment outside the months shown. */
  canToggle: boolean;
  /** Shown instead of the total for a line that cannot be switched: its amount, and why it does not count. */
  aside?: { amount: string; tag: string; hint: string };
  /** The "›": its card, its editor or its details. */
  onOpen?: () => void;
  openLabel?: string;
  /** Or a page of its own, for what is changed elsewhere. */
  link?: { to: string; label: string };
}

type Side = "in" | "out";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * «Τα ποσά σου» as a pair of scales: what comes in, what goes out, what is
 * left, and under them one side at a time.
 *
 * It replaced five folded groups, each with a switch on every row — a page of
 * switches that said what was in the plan only after every group had been
 * opened. Here the three figures say it first, and a row is put in or taken
 * out by tapping it: struck through and greyed when out. What a row opens —
 * an income's card, a line's editor, a bill's details — is the "›" at its end.
 *
 * The figures are added up from the rows below them, so the two cannot
 * disagree.
 */
export function PlanLedger({
  inItems,
  outItems,
  months,
  formatCurrency,
  onToggle,
  onAddIn,
  onAddOut,
  inFooter,
}: {
  inItems: LedgerItem[];
  outItems: LedgerItem[];
  /** How many months the window covers, for the line under the figures. */
  months: number;
  formatCurrency: (n: number) => string;
  onToggle: (id: string) => void;
  onAddIn: () => void;
  onAddOut: () => void;
  /** Under the money-in list: where incomes are changed, or the empty state. */
  inFooter?: ReactNode;
}) {
  const { t } = useTranslation();
  const [side, setSide] = useState<Side>("in");

  const sum = (items: LedgerItem[]) => round2(items.reduce((total, item) => total + item.total, 0));
  const totalIn = sum(inItems);
  const totalOut = -sum(outItems);
  const net = round2(totalIn - totalOut);
  const scale = totalIn + totalOut;
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
  const items = side === "in" ? inItems : outItems;

  return (
    <div className={styles.ledger}>
      <div className={styles.ledgerFigures}>
        <div>
          <span className={styles.ledgerLabel}>{t("planner.ledgerIn")}</span>
          <span className={`${styles.ledgerValue} ${styles.ledgerIncome}`}>{signed(totalIn)}</span>
        </div>
        <div>
          <span className={styles.ledgerLabel}>{t("planner.ledgerOut")}</span>
          <span className={`${styles.ledgerValue} ${styles.ledgerExpense}`}>{signed(-totalOut)}</span>
        </div>
        <div>
          <span className={styles.ledgerLabel}>{t("planner.ledgerLeft")}</span>
          <span className={`${styles.ledgerValue} ${net < 0 ? styles.ledgerExpense : ""}`}>{signed(net)}</span>
        </div>
      </div>
      {/* In against out, as two lengths of one bar. */}
      <div className={styles.ledgerBar} aria-hidden>
        <span className={styles.ledgerBarIn} style={{ width: `${scale > 0 ? (totalIn / scale) * 100 : 50}%` }} />
        <span className={styles.ledgerBarOut} style={{ width: `${scale > 0 ? (totalOut / scale) * 100 : 50}%` }} />
      </div>
      <p className={styles.ledgerWindow}>{t("planner.ledgerWindow", { count: months })}</p>

      <div className={styles.ledgerSides} role="tablist" aria-label={t("planner.paneNumbers")}>
        {(["in", "out"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={side === key} className={side === key ? styles.ledgerSideOn : ""} onClick={() => setSide(key)}>
            {t(key === "in" ? "planner.ledgerIn" : "planner.ledgerOut")} <span className={styles.ledgerCount}>{(key === "in" ? inItems : outItems).length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {items.length === 0 && side === "out" && <p className={styles.ledgerEmpty}>{t("planner.ledgerEmptyOut")}</p>}
        {items.map((item) => (
          <div key={item.id} className={`${styles.ledgerRow} ${item.enabled || !item.canToggle ? "" : styles.ledgerRowOff}`}>
            {item.canToggle ? (
              // The row is the switch: one tap in or out of the plan.
              <button type="button" role="switch" aria-checked={item.enabled} aria-label={item.label} className={styles.ledgerToggle} onClick={() => onToggle(item.id)}>
                <span className={styles.ledgerName}>
                  {item.group && <span className={styles.ledgerGroup}>{item.group}</span>}
                  {item.label}
                </span>
                <span className={`${styles.ledgerAmount} ${!item.enabled ? "" : item.total > 0 ? styles.ledgerIncome : item.total < 0 ? styles.ledgerExpense : ""}`}>
                  {item.enabled ? signed(item.total) : t("planner.ledgerOffShort")}
                </span>
              </button>
            ) : (
              <span className={`${styles.ledgerToggle} ${styles.ledgerStatic}`}>
                <span className={styles.ledgerName}>
                  {item.label}
                  {item.aside && (
                    <span className={styles.oneOffTag} title={item.aside.hint}>
                      {item.aside.tag}
                    </span>
                  )}
                </span>
                <span className={styles.ledgerAmount}>{item.aside?.amount}</span>
              </span>
            )}
            {item.link ? (
              <Link to={item.link.to} className={styles.ledgerOpen} aria-label={item.link.label}>
                <FiChevronRight aria-hidden />
              </Link>
            ) : item.onOpen ? (
              <button type="button" className={styles.ledgerOpen} onClick={item.onOpen} aria-label={item.openLabel}>
                <FiChevronRight aria-hidden />
              </button>
            ) : (
              <span className={styles.ledgerOpen} aria-hidden />
            )}
          </div>
        ))}
        {side === "in" && inFooter}
      </div>

      <button type="button" className={styles.ledgerAdd} onClick={side === "in" ? onAddIn : onAddOut}>
        <FiPlus aria-hidden /> {t(side === "in" ? "planner.addOneOff" : "planner.addExpenseLine")}
      </button>
    </div>
  );
}

export default PlanLedger;

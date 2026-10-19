import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiEye, FiEyeOff, FiPlus } from "react-icons/fi";
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
 * opened. Here the three figures say it first. A tap on a row opens it — an
 * income's card, a line's editor, a bill's details — and the eye at its end puts
 * it in or takes it out of the plan: open when counted, shut and the row struck
 * through when not. (It was the other way round; the owner reached for the row
 * to see what a thing was, and switched it off instead.)
 *
 * The figures are added up from the rows below them, so the two cannot
 * disagree.
 */
export function PlanLedger({
  inItems,
  outItems,
  months,
  monthsLabel,
  formatCurrency,
  onToggle,
  onAddIn,
  onAddOut,
  inFooter,
}: {
  inItems: LedgerItem[];
  outItems: LedgerItem[];
  /** How many months the window covers, for the line under the figures: the number for the plural, and as written. */
  months: number;
  monthsLabel: string;
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
    <div className={styles.scale}>
      <div className={styles.scaleFigures}>
        <div>
          <span className={styles.scaleLabel}>{t("planner.ledgerIn")}</span>
          <span className={`${styles.scaleValue} ${styles.scaleIncome}`}>{signed(totalIn)}</span>
        </div>
        <div>
          <span className={styles.scaleLabel}>{t("planner.ledgerOut")}</span>
          <span className={`${styles.scaleValue} ${styles.scaleExpense}`}>{signed(-totalOut)}</span>
        </div>
        <div>
          <span className={styles.scaleLabel}>{t("planner.ledgerLeft")}</span>
          <span className={`${styles.scaleValue} ${net < 0 ? styles.scaleExpense : ""}`}>{signed(net)}</span>
        </div>
      </div>
      {/* In against out, as two lengths of one bar. */}
      <div className={styles.scaleBar} aria-hidden>
        <span className={styles.scaleBarIn} style={{ width: `${scale > 0 ? (totalIn / scale) * 100 : 50}%` }} />
        <span className={styles.scaleBarOut} style={{ width: `${scale > 0 ? (totalOut / scale) * 100 : 50}%` }} />
      </div>
      <p className={styles.scaleWindow}>{t("planner.ledgerWindow", { count: months, months: monthsLabel })}</p>

      <div className={styles.scaleSides} role="tablist" aria-label={t("planner.paneNumbers")}>
        {(["in", "out"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={side === key} className={side === key ? styles.scaleSideOn : ""} onClick={() => setSide(key)}>
            {t(key === "in" ? "planner.ledgerIn" : "planner.ledgerOut")} <span className={styles.scaleCount}>{(key === "in" ? inItems : outItems).length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {items.length === 0 && side === "out" && <p className={styles.scaleEmpty}>{t("planner.ledgerEmptyOut")}</p>}
        {groupsOf(items).map(({ group, rows }) => (
          <section key={group ?? "-"} aria-label={group}>
            {/* A title, a rule and the group's own total, then its rows: «Πάγια ─── −317,98 €». */}
            {group && (
              <div className={styles.scaleHeading}>
                <span>{group}</span>
                <span className={styles.scaleHeadingRule} aria-hidden />
                <span className={styles.scaleHeadingTotal}>{signed(sum(rows))}</span>
              </div>
            )}
            {/* A column of rows on a phone; from a laptop up, small boxes that wrap. */}
            <div className={styles.scaleCards}>{rows.map(renderItem)}</div>
          </section>
        ))}
        {side === "in" && inFooter}
      </div>

      <button type="button" className={`${styles.scaleAdd} ${side === "in" ? styles.scaleAddIn : styles.scaleAddOut}`} onClick={side === "in" ? onAddIn : onAddOut}>
        <FiPlus aria-hidden /> {t(side === "in" ? "planner.addOneOff" : "planner.addExpenseLine")}
      </button>
    </div>
  );

  function renderItem(item: LedgerItem) {
    const body = (
      <>
        <span className={styles.scaleName}>
          {item.label}
          {item.aside && (
            <span className={styles.oneOffTag} title={item.aside.hint}>
              {item.aside.tag}
            </span>
          )}
        </span>
        <span className={`${styles.scaleAmount} ${!item.enabled || !item.canToggle ? "" : item.total > 0 ? styles.scaleIncome : item.total < 0 ? styles.scaleExpense : ""}`}>
          {!item.canToggle ? item.aside?.amount : item.enabled ? signed(item.total) : t("planner.ledgerOffShort")}
        </span>
      </>
    );

    return (
      <div key={item.id} className={`${styles.scaleRow} ${item.enabled || !item.canToggle ? "" : styles.scaleRowOff}`}>
        {/* The row is the way in: what it is, and what it is made of. */}
        {item.link ? (
          <Link to={item.link.to} className={styles.scaleToggle} aria-label={item.link.label}>
            {body}
          </Link>
        ) : item.onOpen ? (
          <button type="button" className={styles.scaleToggle} onClick={item.onOpen} aria-label={item.openLabel}>
            {body}
          </button>
        ) : (
          <span className={`${styles.scaleToggle} ${styles.scaleStatic}`}>{body}</span>
        )}
        {/* The eye: open when it counts, shut when it does not. */}
        {item.canToggle ? (
          <button
            type="button"
            role="switch"
            aria-checked={item.enabled}
            className={`${styles.scaleOpen} ${styles.scaleEye} ${item.enabled ? styles.scaleEyeOn : ""}`}
            onClick={() => onToggle(item.id)}
            aria-label={t(item.enabled ? "planner.eyeTakeOut" : "planner.eyePutIn", { name: item.label })}
            title={t(item.enabled ? "planner.eyeTakeOut" : "planner.eyePutIn", { name: item.label })}
          >
            {item.enabled ? <FiEye aria-hidden /> : <FiEyeOff aria-hidden />}
          </button>
        ) : (
          <span className={styles.scaleOpen} aria-hidden />
        )}
      </div>
    );
  }
}

/** Rows in runs of the same group, in the order the groups first appear. */
function groupsOf(items: LedgerItem[]): { group?: string; rows: LedgerItem[] }[] {
  const runs: { group?: string; rows: LedgerItem[] }[] = [];
  for (const item of items) {
    const run = runs.find((r) => r.group === item.group);
    if (run) run.rows.push(item);
    else runs.push({ group: item.group, rows: [item] });
  }
  return runs;
}

export default PlanLedger;

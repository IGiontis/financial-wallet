import { Button, Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiPlus, FiX } from "react-icons/fi";
import { draftProblem, newPartDraft, partsFromDrafts, partsTotals, type GoalPartDraft } from "../goalParts";
import styles from "./css/GoalParts.module.css";

/**
 * A goal written as its parts — «Σπίτι 150–200», «Lift 50–90» — each with what
 * it roughly costs, from and to; the total under them. The order they are in
 * is the order money fills them. Shared by the new-goal and edit forms.
 */
export function GoalPartsEditor({ drafts, onChange, formatCurrency, showErrors }: { drafts: GoalPartDraft[]; onChange: (next: GoalPartDraft[]) => void; formatCurrency: (n: number) => string; showErrors: boolean }) {
  const { t } = useTranslation();
  const totals = partsTotals(partsFromDrafts(drafts));
  const set = (id: string, patch: Partial<GoalPartDraft>) => onChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <div className={styles.editor}>
      <div className={`${styles.row} ${styles.head}`} aria-hidden>
        <span>{t("goals.partFor")}</span>
        <span>{t("goals.partFrom")}</span>
        <span>{t("goals.partTo")}</span>
        <span />
      </div>
      {drafts.map((d, i) => {
        const problem = showErrors ? draftProblem(d) : undefined;
        const nameBad = problem === "missing" && !d.label.trim();
        const toBad = (problem === "missing" && !(parseFloat(d.max) > 0)) || problem === "minAboveMax";
        return (
          <div key={d.id}>
            <div className={styles.row}>
              <Input bsSize="sm" value={d.label} onChange={(e) => set(d.id, { label: e.target.value })} placeholder={t("goals.partPlaceholder")} aria-label={t("goals.partForN", { n: i + 1 })} invalid={nameBad} />
              <Input bsSize="sm" type="number" min={0} step="1" inputMode="decimal" value={d.min} onChange={(e) => set(d.id, { min: e.target.value })} placeholder="0" aria-label={t("goals.partFromN", { n: i + 1 })} invalid={problem === "minAboveMax"} />
              <Input bsSize="sm" type="number" min={0} step="1" inputMode="decimal" value={d.max} onChange={(e) => set(d.id, { max: e.target.value })} placeholder="0" aria-label={t("goals.partToN", { n: i + 1 })} invalid={toBad} />
              <button type="button" className={styles.remove} onClick={() => onChange(drafts.length > 1 ? drafts.filter((x) => x.id !== d.id) : [newPartDraft()])} aria-label={t("goals.partRemove", { n: i + 1 })}>
                <FiX aria-hidden />
              </button>
            </div>
            {problem && <div className={styles.problem}>{t(problem === "missing" ? "goals.partMissing" : "goals.partMinAboveMax")}</div>}
          </div>
        );
      })}
      <Button color="link" size="sm" className="p-0 d-inline-flex align-items-center gap-1 text-decoration-none" onClick={() => onChange([...drafts, newPartDraft()])}>
        <FiPlus aria-hidden /> {t("goals.partAdd")}
      </Button>
      <div className={styles.total}>
        <span>{t("goals.partsTotal")}</span>
        <b>{totals.min === totals.max ? formatCurrency(totals.max) : `${formatCurrency(totals.min)} – ${formatCurrency(totals.max)}`}</b>
      </div>
      {totals.max > 0 && <p className={styles.note}>{t("goals.partsTargetNote", { target: formatCurrency(totals.max), least: formatCurrency(totals.min) })}</p>}
    </div>
  );
}

export default GoalPartsEditor;

import { useState, type ReactNode } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiGitMerge } from "react-icons/fi";
import styles from "./css/Names.module.css";

/** How many pairs show before «Δείξε όλα». */
const FIRST = 3;

/**
 * «Πιθανά διπλά»: names in the list that look like one written two ways
 * (`similarPairs`), each with a «Συγχώνευση» that opens the merge's own
 * confirmation. Nothing is merged from here. Nothing at all when there are none.
 */
export function SimilarPairs<T>({ pairs, render, keyOf, onMerge }: { pairs: readonly [T, T][]; render: (item: T) => ReactNode; keyOf: (item: T) => string; onMerge: (pair: [T, T]) => void }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  if (pairs.length === 0) return null;
  const shown = all ? pairs : pairs.slice(0, FIRST);

  return (
    <section className={styles.similar} aria-labelledby="names-similar-title" data-testid="similar-pairs">
      <h2 id="names-similar-title" className={styles.similarTitle}>
        {t("names.similarTitle", { count: pairs.length })}
      </h2>
      <p className={styles.similarHint}>{t("names.similarHint")}</p>
      <ul className={styles.similarList}>
        {shown.map((pair) => (
          <li key={`${keyOf(pair[0])}|${keyOf(pair[1])}`} className={styles.similarRow}>
            <span className={styles.similarNames}>
              {render(pair[0])} <span aria-hidden>·</span> {render(pair[1])}
            </span>
            <Button type="button" size="sm" color="secondary" outline className="flex-shrink-0" onClick={() => onMerge(pair)}>
              <FiGitMerge aria-hidden className="me-1" />
              {t("names.mergeAction")}
            </Button>
          </li>
        ))}
      </ul>
      {pairs.length > FIRST && (
        <Button type="button" color="link" size="sm" className="px-0" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? t("names.showFewer") : t("names.showAll", { count: pairs.length })}
        </Button>
      )}
    </section>
  );
}

export default SimilarPairs;

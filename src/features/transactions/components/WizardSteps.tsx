import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import styles from "./css/TransactionWizard.module.css";

/**
 * The progress rail shared by the add and edit wizards.
 *
 * Both screens ask the same questions in the same order; only the first one
 * differs, because adding chooses the type and editing cannot change it. So the
 * step list is a parameter rather than a constant here — same control, same
 * behaviour, three stops or four.
 *
 * A finished step stays clickable: going back to change the category is the
 * correction people actually make, and making them tap Back twice for it would
 * be the whole reason wizards get a bad name.
 */
export function WizardSteps<Step extends string>({ steps, current, onGo }: { steps: readonly Step[]; current: Step; onGo: (step: Step) => void }) {
  const { t } = useTranslation();
  const index = steps.indexOf(current);

  return (
    <div className={styles.steps} aria-label={t("transactions.wizard.stepOf", { current: index + 1, total: steps.length })}>
      {steps.map((step, i) => (
        <Fragment key={step}>
          {i > 0 && <span className={`${styles.stepBar} ${i <= index ? styles.stepBarDone : ""}`} aria-hidden />}
          {/* An unreached step is inert rather than hidden, so the length of
              the path stays visible from the first screen. */}
          <button
            type="button"
            className={`${styles.step} ${i === index ? styles.stepCurrent : ""} ${i < index ? styles.stepDone : ""}`}
            disabled={i >= index}
            aria-current={i === index ? "step" : undefined}
            onClick={() => onGo(step)}
          >
            <span className={styles.stepDot}>{i + 1}</span>
            <span className={styles.stepLabel}>{t(`transactions.wizard.${step}`)}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Which way the money goes, said in one word.
 *
 * Carried through every step after the first: once the type stops being a
 * screen of its own it stops being on screen at all, and "which of these two
 * lists am I looking at" is not a question a category grid answers on its own.
 */
export function TypeBadge({ type }: { type: "income" | "expense" }) {
  const { t } = useTranslation();
  const token = type === "income" ? "income" : "expense";

  return (
    <span
      className="badge rounded-pill"
      style={{
        background: `color-mix(in srgb, var(--color-${token}) 14%, transparent)`,
        color: `var(--color-${token})`,
        fontWeight: 600,
      }}
    >
      {t(type === "income" ? "transactions.income" : "transactions.expense")}
    </span>
  );
}

import type { ReactNode } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle } from "react-icons/fi";

import type { ResolvedOccurrence } from "../plannerActuals";
import styles from "../css/UnconfirmedQuestion.module.css";

/**
 * "Your salary of 30 Sep wasn't found in your transactions — has it come
 * already?", and its two answers.
 *
 * Asked about money in that has no record yet but may already sit in the last
 * bank reading (see `mayBeInReading` in plannerActuals). Until it is answered
 * the plan leaves it out rather than count it a second time, so the question
 * has to be where the figures are read. Wherever it is asked, the answer is
 * recorded through `answerUnconfirmed`, so no two places can store it
 * differently.
 *
 * Two shapes. In a list it is one more row of that list. On the Planner it
 * sits inside the first card, between the money you have and the answer,
 * because it is a question about what that money holds — so there it is a
 * block of its own, with the warning sign, "it came" as the main answer, and
 * a line saying what the plan does in the meantime.
 */
export function UnconfirmedQuestion({
  occurrence,
  dateFmt,
  onAnswer,
  variant = "row",
  className,
  textClassName,
  amount,
}: {
  occurrence: ResolvedOccurrence;
  dateFmt: Intl.DateTimeFormat;
  /** True for "it came", false for "not yet". */
  onAnswer: (arrived: boolean) => void;
  variant?: "row" | "block";
  className?: string;
  textClassName?: string;
  /** Shown between the question and the buttons, where the row has room for it. */
  amount?: ReactNode;
}) {
  const { t } = useTranslation();
  // The salary is asked about as "your salary"; every other income by its name.
  const isSalary = !!occurrence.pay;
  const label = occurrence.label;
  const date = dateFmt.format(occurrence.date);
  const arrived = t("planner.unconfirmedArrived");
  const notYet = t("planner.unconfirmedNotYet");
  const question = isSalary ? t("planner.unconfirmedSalary", { date }) : t("planner.unconfirmedOther", { label, date });

  if (variant === "block") {
    return (
      <div className={`${styles.ask} ${className ?? ""}`} role="group" aria-label={question}>
        <div className={styles.askQuestion}>
          <FiAlertTriangle size={17} className={styles.askIcon} aria-hidden />
          <span>{question}</span>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button size="sm" color="primary" aria-label={`${label} · ${date}: ${arrived}`} onClick={() => onAnswer(true)}>
            {arrived}
          </Button>
          <Button size="sm" color="secondary" outline aria-label={`${label} · ${date}: ${notYet}`} onClick={() => onAnswer(false)}>
            {notYet}
          </Button>
        </div>
        <small className={styles.askNote}>{t(isSalary ? "planner.unconfirmedNoteSalary" : "planner.unconfirmedNoteOther")}</small>
      </div>
    );
  }

  return (
    <div className={className}>
      <span className={textClassName} style={{ flex: "1 1 auto", minWidth: 0 }}>
        {question}
      </span>
      {amount}
      <span className="d-inline-flex gap-1 flex-shrink-0">
        <Button size="sm" color="success" outline aria-label={`${label} · ${date}: ${arrived}`} onClick={() => onAnswer(true)}>
          {arrived}
        </Button>
        <Button size="sm" color="secondary" outline aria-label={`${label} · ${date}: ${notYet}`} onClick={() => onAnswer(false)}>
          {notYet}
        </Button>
      </span>
    </div>
  );
}

export default UnconfirmedQuestion;

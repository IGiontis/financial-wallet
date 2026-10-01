import type { ReactNode } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";

import { SALARY_ROW_ID } from "../plannerUtils";
import type { ResolvedOccurrence } from "../plannerActuals";

/**
 * "Your salary of 1 Oct wasn't found — has it come already?", and its two answers.
 *
 * Asked about money in that has no record yet but may already sit in the last
 * bank reading (see `mayBeInReading` in plannerActuals). Until it is answered
 * the plan leaves it out rather than count it a second time, so the question
 * has to be where the figures are read: on the Planner, and in the Overview's
 * list of things that want you. Both record the answer through
 * `answerUnconfirmed`, so the two cannot store it differently.
 *
 * Deliberately plain — one line and two buttons. The Planner's redesign is
 * where it gets a proper place.
 */
export function UnconfirmedQuestion({
  occurrence,
  dateFmt,
  onAnswer,
  className,
  textClassName,
  amount,
}: {
  occurrence: ResolvedOccurrence;
  dateFmt: Intl.DateTimeFormat;
  /** True for "it came", false for "not yet". */
  onAnswer: (arrived: boolean) => void;
  className?: string;
  textClassName?: string;
  /** Shown between the question and the buttons, where the row has room for it. */
  amount?: ReactNode;
}) {
  const { t } = useTranslation();
  const isSalary = occurrence.label === SALARY_ROW_ID;
  // The salary's own label is a row id, never something to print.
  const label = isSalary ? t("planner.salaryLabel") : occurrence.label;
  const date = dateFmt.format(occurrence.date);
  const arrived = t("planner.unconfirmedArrived");
  const notYet = t("planner.unconfirmedNotYet");

  return (
    <div className={className}>
      <span className={textClassName} style={{ flex: "1 1 auto", minWidth: 0 }}>
        {isSalary ? t("planner.unconfirmedSalary", { date }) : t("planner.unconfirmedOther", { label, date })}
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

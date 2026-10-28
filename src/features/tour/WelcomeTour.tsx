import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, ModalBody, ModalFooter } from "reactstrap";
import { BanksPreview, BillsPreview, CalendarPreview, DebtsPreview, GoalsPreview, IncomesPreview, InvestmentsPreview, OverviewPreview, PlannerPreview, QuickPreview, StatsPreview, TransactionsPreview } from "./TourPreviews";
import styles from "./css/WelcomeTour.module.css";

/** One card of the tour: its mark, its words (`tour.<id>.title` / `.body`), and a drawing of the page. */
interface TourStep {
  id: string;
  icon: string;
  preview: ReactNode;
}

// In the order of the menu, more or less — the Planner last, as what it all adds up to.
const STEPS: TourStep[] = [
  { id: "welcome", icon: "👋", preview: <OverviewPreview /> },
  { id: "quick", icon: "➕", preview: <QuickPreview /> },
  { id: "transactions", icon: "📒", preview: <TransactionsPreview /> },
  { id: "stats", icon: "📊", preview: <StatsPreview /> },
  { id: "incomes", icon: "💼", preview: <IncomesPreview /> },
  { id: "bills", icon: "🧾", preview: <BillsPreview /> },
  { id: "calendar", icon: "🗓️", preview: <CalendarPreview /> },
  { id: "goals", icon: "🎯", preview: <GoalsPreview /> },
  { id: "banks", icon: "🏦", preview: <BanksPreview /> },
  { id: "investments", icon: "📈", preview: <InvestmentsPreview /> },
  { id: "debts", icon: "🤝", preview: <DebtsPreview /> },
  { id: "planner", icon: "📅", preview: <PlannerPreview /> },
];

/**
 * A minute's look round the app: a card a page, each with a drawing of it in
 * made-up figures and two or three lines on what it is for. «Επόμενο» and
 * «Πίσω», the dots to jump, ← → on a keyboard, and «Παράλειψη» from the start.
 *
 * Reads and writes nothing itself — whoever shows it decides when, and what
 * finishing or skipping it means (`onDone`). Needs no account: the drawings
 * are made up, so it can be shown before signing in as well as after.
 */
export function WelcomeTour({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const go = (to: number) => setIndex(Math.max(0, Math.min(STEPS.length - 1, to)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Modal isOpen toggle={onDone} centered labelledBy="tour-title" backdrop="static">
      <ModalBody className="pt-4">
        <section className={styles.step} aria-live="polite">
          <span className={styles.icon} aria-hidden>
            {step.icon}
          </span>
          <h2 id="tour-title" className={styles.title}>
            {t(`tour.${step.id}.title`)}
          </h2>
          <p className={styles.body}>{t(`tour.${step.id}.body`)}</p>
          {step.preview}
        </section>
        <div className={styles.dots} role="group" aria-label={t("tour.progress", { step: index + 1, count: STEPS.length })}>
          {STEPS.map((s, i) => (
            <button key={s.id} type="button" className={`${styles.dot} ${i === index ? styles.dotOn : ""}`} aria-current={i === index ? "step" : undefined} aria-label={t(`tour.${s.id}.title`)} onClick={() => go(i)} />
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <div className={styles.footer}>
          <Button color="link" className="px-0 text-body-secondary" onClick={onDone}>
            {t("tour.skip")}
          </Button>
          <div>
            {index > 0 && (
              <Button color="secondary" outline onClick={() => go(index - 1)}>
                {t("common.back")}
              </Button>
            )}
            <Button color="primary" onClick={last ? onDone : () => go(index + 1)}>
              {last ? t("tour.start") : t("tour.next")}
            </Button>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}

export default WelcomeTour;

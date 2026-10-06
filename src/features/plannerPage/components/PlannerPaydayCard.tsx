import { useState, type Ref } from "react";
import { Link } from "react-router-dom";
import { DropdownItem, DropdownMenu, DropdownToggle, Input, InputGroup, InputGroupText, UncontrolledDropdown } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronRight, FiX } from "react-icons/fi";

import { PaydayCard } from "../../overview/components/PaydayCard";
import { moneyOrigin } from "../../overview/components/paydayParts";
import type { PaydayOutlook } from "../../overview/overviewTabs";
import type { OpeningBalance } from "../../../shared/utils/balance";
import type { ResolvedOccurrence } from "../plannerActuals";
import type { PlannerEvent } from "../plannerUtils";
import type { SliceStep } from "../payCycles";
import UnconfirmedQuestion from "./UnconfirmedQuestion";
import CycleSteps from "./CycleSteps";
import styles from "../css/PlannerPage.module.css";

/** The list behind the figure: what there was, each payment, and what is left. */
export interface PaydaySteps {
  steps: SliceStep[];
  days: number;
  close: { date: Date; amount: number };
  nextPay?: PlannerEvent;
}

interface PlannerPaydayCardProps {
  outlook: PaydayOutlook;
  steps: PaydaySteps;
  /** Counting from the money you have, rather than from a figure of your own. */
  fromBanks: boolean;
  /** The money you have — the Overview's figure. */
  available: number;
  source?: "readings" | "settings";
  banks?: number;
  inGoals: number;
  opening?: OpeningBalance;
  /** What the Overview says, worked out from `available` — for the line under a "what if". */
  realLeft?: number;
  openingInput: string;
  onOpening: (value: string) => void;
  onOpeningSource: (source: "banks" | "manual") => void;
  unconfirmed: ResolvedOccurrence[];
  onAnswer: (occurrence: ResolvedOccurrence, arrived: boolean) => void;
  onOccurrence: (key: string) => void;
  baseCurrency: string;
  now: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  cardRef?: Ref<HTMLDivElement>;
  /** In the sheet behind the tiles: no frame of its own, and "how it adds up" already open. */
  inSheet?: boolean;
}

/**
 * The Planner's first card: the Overview's own card, with what only the
 * Planner adds around it.
 *
 * It opens the page with the answer already met on the Overview — the same
 * name, the same figure, the same bar, the same "a day" — so the first number
 * here is never a different one to work out. Around it, the Planner's own:
 *
 * - where the money comes from, as a small menu where the Overview has its
 *   "add banks" button; picking a figure of your own turns the card into a
 *   scenario that says so, in a dashed frame, with what the Overview shows
 *   beside it and a ✕ back;
 * - the question about pay that may already be in the bank reading, between
 *   the figure and the answer, since it is about what the figure holds;
 * - the list behind the figure, folded under "how it adds up", landing on it
 *   to the cent.
 */
export function PlannerPaydayCard({
  outlook,
  steps,
  fromBanks,
  available,
  source,
  banks,
  inGoals,
  opening,
  realLeft,
  openingInput,
  onOpening,
  onOpeningSource,
  unconfirmed,
  onAnswer,
  onOccurrence,
  baseCurrency,
  now,
  formatCurrency,
  locale,
  cardRef,
  inSheet,
}: PlannerPaydayCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!inSheet);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const fromLabel = t(source === "readings" ? "planner.openingFromBanks" : "planner.openingFromRecords");

  const sourceMenu = (
    <UncontrolledDropdown className="flex-shrink-0">
      <DropdownToggle caret size="sm" color="secondary" outline className={styles.sourceToggle}>
        {fromLabel}
      </DropdownToggle>
      <DropdownMenu end>
        <DropdownItem active={fromBanks} onClick={() => onOpeningSource("banks")}>
          {fromLabel}
        </DropdownItem>
        <DropdownItem active={!fromBanks} onClick={() => onOpeningSource("manual")}>
          {t("planner.openingMine")}
        </DropdownItem>
      </DropdownMenu>
    </UncontrolledDropdown>
  );

  const scenarioChip = (
    <div className="mb-2">
      <span className={styles.scenarioChip}>
        {t("planner.scenarioChip")}
        <button type="button" className={styles.scenarioClose} onClick={() => onOpeningSource("banks")} aria-label={t("planner.scenarioBack", { source: fromLabel })} title={t("planner.scenarioBack", { source: fromLabel })}>
          <FiX size={14} aria-hidden />
        </button>
      </span>
    </div>
  );

  return (
    <PaydayCard
      cardRef={cardRef}
      className={`${fromBanks ? "" : styles.scenarioCard} ${inSheet ? styles.sheetCard : ""}`}
      top={fromBanks ? undefined : scenarioChip}
      label={t(fromBanks ? "overview.currentBalance" : "planner.scenarioIf")}
      figure={available}
      figureSlot={
        fromBanks ? undefined : (
          <InputGroup className={styles.scenarioInput}>
            <Input type="number" inputMode="decimal" placeholder="0" value={openingInput} onChange={(e) => onOpening(e.target.value)} aria-label={t("planner.scenarioIf")} />
            <InputGroupText>{baseCurrency}</InputGroupText>
          </InputGroup>
        )
      }
      origin={
        fromBanks
          ? moneyOrigin(t, { source, banks, inGoals, opening, locale, formatCurrency })
          : realLeft !== undefined
            ? t("planner.scenarioOverview", { amount: formatCurrency(realLeft) })
            : undefined
      }
      action={fromBanks ? sourceMenu : undefined}
      between={
        unconfirmed.length > 0 ? (
          <>
            {unconfirmed.map((occurrence) => (
              <UnconfirmedQuestion key={occurrence.key} variant="block" occurrence={occurrence} dateFmt={dateFmt} onAnswer={(arrived) => onAnswer(occurrence, arrived)} />
            ))}
          </>
        ) : undefined
      }
      footer={
        <>
          <div className="d-flex justify-content-between align-items-baseline gap-2 mt-2">
            <button type="button" className={styles.linkButton} onClick={() => setOpen(!open)} aria-expanded={open}>
              {t("planner.howItAddsUp")}
              {open ? <FiChevronDown size={14} aria-hidden /> : <FiChevronRight size={14} aria-hidden />}
            </button>
            {/* No pay day: the salary is set on «Έσοδα», which every screen reads it from. */}
            {!outlook.known && (
              <Link to="/incomes" className={styles.linkButton}>
                {t("planner.setPayday")}
              </Link>
            )}
          </div>
          {open && (
            <CycleSteps
              label={t("planner.howItAddsUp")}
              steps={steps.steps}
              days={steps.days}
              first
              close={{ label: t("planner.stepLeft"), date: steps.close.date, amount: steps.close.amount }}
              nextPay={steps.nextPay}
              today={now}
              onOccurrence={onOccurrence}
              formatCurrency={formatCurrency}
              locale={locale}
            />
          )}
        </>
      }
      outlook={outlook}
      now={now}
      formatCurrency={formatCurrency}
      locale={locale}
    />
  );
}

export default PlannerPaydayCard;

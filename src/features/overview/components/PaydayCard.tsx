import type { ReactNode, Ref } from "react";
import { Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FiCheckCircle, FiXCircle } from "react-icons/fi";
import { Skeleton } from "../../../shared/components/Skeletons";
import type { PaydayOutlook } from "../overviewTabs";
import { OUTGOING_COLOURS } from "./paydayParts";
import styles from "../pages/css/OverviewPage.module.css";

type Money = (n: number) => string;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * The line beside "what is left": which evening it is, and why that one.
 *
 * The figure is the balance at the end of the day *before* pay day, so it is
 * dated that day and the pay day is named after it. It used to be dated the
 * pay day itself — "left on 30 Oct" — which is the one day on which it is not
 * what is left, the pay having landed.
 */
function whenLeft(t: TFunction, outlook: PaydayOutlook, now: Date, locale: string): string {
  const dayDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const prefix = outlook.left >= 0 ? "left" : "short";
  if (!outlook.known) return t(`overview.${prefix}MonthEnd`, { day: dayDate.format(outlook.date) });
  // Pay held on today — late, or due today — has no evening before it: what
  // is left is the money there is now.
  if (startOfDay(outlook.date).getTime() <= startOfDay(now).getTime()) return t(`overview.${prefix}Today`);
  const eve = new Date(outlook.date.getFullYear(), outlook.date.getMonth(), outlook.date.getDate() - 1);
  return t(`overview.${prefix}BeforePay`, { day: dayDate.format(eve), payday: dayDate.format(outlook.date) });
}

/**
 * "Do you make it to pay day?" — the verdict, what is left, and the bar that
 * turns the one figure into the other.
 *
 * The figure is plain unless it is below zero: green was spent on a number that
 * is simply a number, and is kept for the one thing that is good news, "you
 * make it".
 */
export function PaydayAnswer({ outlook, now, formatCurrency, locale }: { outlook: PaydayOutlook; now: Date; formatCurrency: Money; locale: string }) {
  const { t } = useTranslation();
  const dayDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });

  const makesIt = outlook.lowest >= 0;
  const out = outlook.bills + outlook.commitments + outlook.lines;
  const have = outlook.start + outlook.incoming;
  // The bar's whole is everything there is to spend through the window; the
  // parts are what goes, and what stays.
  const whole = Math.max(have, out + Math.max(outlook.left, 0), 0.01);
  const parts = [
    { key: "bills", amount: outlook.bills, label: t("overview.partBills", { amount: formatCurrency(outlook.bills) }), colour: OUTGOING_COLOURS.bills },
    { key: "commitments", amount: outlook.commitments, label: t("overview.partCommitments", { amount: formatCurrency(outlook.commitments) }), colour: OUTGOING_COLOURS.commitments },
    { key: "lines", amount: outlook.lines, label: t("overview.partMine", { amount: formatCurrency(outlook.lines) }), colour: OUTGOING_COLOURS.lines },
  ].filter((part) => part.amount > 0);

  return (
    <>
      <span className="d-inline-flex align-items-center gap-2 fw-semibold" style={{ color: makesIt ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
        {makesIt ? <FiCheckCircle size={17} aria-hidden /> : <FiXCircle size={17} aria-hidden />}
        {t(makesIt ? (outlook.known ? "overview.verdictOk" : "overview.verdictOkMonth") : outlook.known ? "overview.verdictShort" : "overview.verdictShortMonth")}
      </span>

      <div className="d-flex align-items-baseline column-gap-2 flex-wrap mt-1">
        <span className={styles.heroLeft} style={{ color: outlook.left < 0 ? "var(--color-expense-text)" : undefined }}>
          {formatCurrency(outlook.left)}
        </span>
        <span className="small text-body-secondary">{whenLeft(t, outlook, now, locale)}</span>
      </div>

      {makesIt ? (
        <>
          <div className={styles.heroBar} aria-hidden>
            {parts.map((part) => (
              <span key={part.key} style={{ width: `${(part.amount / whole) * 100}%`, background: part.colour }} />
            ))}
            <span style={{ width: `${(Math.max(outlook.left, 0) / whole) * 100}%`, background: OUTGOING_COLOURS.left }} />
          </div>
          <ul className={styles.heroLegend}>
            {parts.map((part) => (
              <li key={part.key}>
                <span className={styles.spendKey} style={{ background: part.colour }} aria-hidden />
                {part.label}
              </li>
            ))}
            {outlook.incoming > 0 && <li>{t("overview.partIncoming", { amount: formatCurrency(outlook.incoming) })}</li>}
            <li>
              <span className={styles.spendKey} style={{ background: OUTGOING_COLOURS.left }} aria-hidden />
              {t("overview.partLeft", { amount: formatCurrency(outlook.left), perDay: formatCurrency(outlook.perDay) })}
            </li>
          </ul>
        </>
      ) : (
        <p className="small mb-0 mt-1">
          {t("overview.shortExplain", { need: formatCurrency(out), have: formatCurrency(have) })}{" "}
          {outlook.breaksOn &&
            (outlook.breaksAt ? t("overview.breaksAt", { date: dayDate.format(outlook.breaksOn), name: outlook.breaksAt }) : t("overview.breaksOn", { date: dayDate.format(outlook.breaksOn) }))}
        </p>
      )}
    </>
  );
}

/**
 * The money there is now, and whether it lasts until pay day — one card, one
 * answer, on the Overview and again at the top of the Planner.
 *
 * Both pages used to have a card of their own, and the two disagreed one tap
 * apart: different names for the same money, a "per day" worked out two ways.
 * This is the one card. Each page fills the slots around it — the Overview a
 * way to add banks and a link on, the Planner where the money comes from, the
 * question about unconfirmed pay and the list behind the figure — and the
 * answer in the middle is the same component reading the same `paydayOutlook`.
 */
export function PaydayCard({
  label,
  figure,
  figureSlot,
  origin,
  top,
  action,
  between,
  footer,
  outlook,
  now,
  isLoading = false,
  formatCurrency,
  locale,
  className,
  cardRef,
  split = false,
}: {
  label: ReactNode;
  figure: number;
  /** In place of the printed figure: the Planner's "what if I had…" box. */
  figureSlot?: ReactNode;
  origin?: ReactNode;
  /** Above everything, on a line of its own. */
  top?: ReactNode;
  /** Beside the label, on the right. */
  action?: ReactNode;
  /** Between the figure and the answer: whatever changes what the figure holds. */
  between?: ReactNode;
  /** After the answer. */
  footer?: ReactNode;
  outlook: PaydayOutlook;
  now: Date;
  isLoading?: boolean;
  formatCurrency: Money;
  locale: string;
  className?: string;
  cardRef?: Ref<HTMLDivElement>;
  /**
   * Two cards side by side — the money, and whether it lasts — from `lg` up,
   * one over the other below it. The Overview has the width for it; the
   * Planner's sheet does not, and keeps the one card.
   */
  split?: boolean;
}) {
  const money = (
    <>
      {top}
      {/* The action shares the label's line, not the figure's: beside the
          figure, "From my banks ▾" squeezed 1.000,00 € onto two lines on a
          phone, and the line under it into a column. */}
      <div className="d-flex justify-content-between align-items-center gap-3">
        <p className={styles.heroLabel}>{label}</p>
        {action}
      </div>
      {figureSlot ??
        (isLoading ? (
          <Skeleton height={38} width={180} style={{ marginBottom: 4 }} />
        ) : (
          <p className={styles.heroFigure} style={{ color: figure < 0 ? "var(--color-expense-text)" : undefined }}>
            {formatCurrency(figure)}
          </p>
        ))}
      {origin !== undefined && <p className="text-body-secondary mb-0 small">{isLoading ? <Skeleton width={200} /> : origin}</p>}

      {between}
    </>
  );
  const answer = (
    <>
      <PaydayAnswer outlook={outlook} now={now} formatCurrency={formatCurrency} locale={locale} />
      {footer}
    </>
  );

  if (split) {
    return (
      <div ref={cardRef} className={`row g-3 mb-3 ${className ?? ""}`}>
        <div className="col-12 col-lg-5 d-flex">
          <Card className="mb-0 w-100">
            <CardBody className="p-3 p-sm-4">{money}</CardBody>
          </Card>
        </div>
        <div className="col-12 col-lg-7 d-flex">
          <Card className="mb-0 w-100">
            <CardBody className="p-3 p-sm-4">{isLoading ? <Skeleton height={60} /> : answer}</CardBody>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef}>
      <Card className={`mb-3 ${className ?? ""}`}>
        <CardBody className="p-3 p-sm-4">
          {money}
          {!isLoading && <div className={styles.heroVerdict}>{answer}</div>}
        </CardBody>
      </Card>
    </div>
  );
}

export default PaydayCard;

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiPrinter } from "react-icons/fi";

import { useCategories, useTransactions } from "../transactions/hooks/useTransactions";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { categoryLabel } from "../../shared/utils/categories";
import { buildStatement, monthRange, yearRange, yearsWithRecords, type StatementLine } from "./statementUtils";
import styles from "./css/Statement.module.css";

const WHOLE_YEAR = "all";

/**
 * A period's figures, laid out to be printed.
 *
 * There is no PDF library behind this. The browser's own print dialogue offers
 * "Save as PDF" on every platform the app runs on, and it renders Greek with
 * the fonts already on the machine — where generating the file in JavaScript
 * would mean shipping a Greek typeface of a few hundred kilobytes to do worse.
 * What that leaves to do is the part that actually matters: making the printed
 * page a document rather than a photograph of a screen.
 */
export default function StatementModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();

  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();

  const [now] = useState(() => new Date());
  const years = useMemo(() => yearsWithRecords(transactions, now), [transactions, now]);
  const [year, setYear] = useState(() => years[0] ?? now.getFullYear());
  const [month, setMonth] = useState<string>(WHOLE_YEAR);

  // The print rules key off this rather than off a selector guess, so nothing
  // else in the app is affected by having been printed near this dialog.
  useEffect(() => {
    document.body.classList.add("statement-open");
    return () => document.body.classList.remove("statement-open");
  }, []);

  const nameFor = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return (categoryId: string) => {
      const category = byId.get(categoryId);
      return category ? { label: categoryLabel(category.name, t), icon: category.icon ?? "🧾" } : { label: t("analytics.unknownCategory"), icon: "🧾" };
    };
  }, [categories, t]);

  const range = useMemo(() => (month === WHOLE_YEAR ? yearRange(year) : monthRange(year, Number(month))), [year, month]);
  const statement = useMemo(() => buildStatement(transactions, range.from, range.to, nameFor), [transactions, range, nameFor]);

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2026, i, 1)));
  }, [lang]);

  const shortMonth = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);
  const generatedAt = useMemo(() => new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(now), [lang, now]);
  const periodLabel = month === WHOLE_YEAR ? String(year) : `${monthNames[Number(month)]} ${year}`;

  const percent = useMemo(() => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }), [lang]);
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;

  const renderLines = (title: string, lines: StatementLine[], total: number, tone: string) => {
    if (lines.length === 0) return null;
    return (
      <>
        <h3 className={styles.sectionTitle}>{title}</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("common.category")}</th>
              <th className={styles.num}>{t("statement.entries")}</th>
              <th className={styles.num}>{t("common.amount")}</th>
              <th className={styles.num}>{t("statement.share")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.categoryId}>
                <td>
                  <span aria-hidden>{line.icon}</span> {line.label}
                </td>
                <td className={styles.num}>{line.count}</td>
                <td className={`${styles.num} ${tone}`}>{formatCurrency(line.amount)}</td>
                <td className={styles.num}>{percent.format(line.share)}</td>
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td>{t("common.total")}</td>
              <td className={styles.num}>{lines.reduce((n, l) => n + l.count, 0)}</td>
              <td className={`${styles.num} ${tone}`}>{formatCurrency(total)}</td>
              <td className={styles.num} />
            </tr>
          </tbody>
        </table>
      </>
    );
  };

  return (
    <Modal isOpen toggle={onClose} fullscreen scrollable>
      <ModalHeader toggle={onClose}>{t("statement.title")}</ModalHeader>
      <ModalBody>
        {/* Controls are marked rather than merely styled: `.noPrint` is what the
            print rules look for, so a control added later is one class away
            from being handled correctly. */}
        <div className={`${styles.noPrint} d-flex flex-wrap align-items-end gap-2 mb-4`}>
          <div>
            <label className="form-label mb-1" style={{ fontSize: 12 }} htmlFor="statement-year">
              {t("statement.period")}
            </label>
            <div className="d-flex gap-2">
              <Input id="statement-year" type="select" bsSize="sm" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Input>
              <Input type="select" bsSize="sm" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 150 }} aria-label={t("statement.period")}>
                <option value={WHOLE_YEAR}>{t("statement.wholeYear")}</option>
                {monthNames.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </Input>
            </div>
          </div>

          <Button color="primary" size="sm" onClick={() => window.print()} className="ms-auto">
            <FiPrinter size={15} className="me-1" />
            {t("statement.print")}
          </Button>
        </div>

        <div className={styles.sheet}>
          <header className={styles.head}>
            <div>
              <p className={styles.brand}>MyFiWallet</p>
              <p className={styles.period}>
                {t("statement.title")} — {periodLabel}
              </p>
            </div>
            <div className={styles.generated}>{t("statement.generated", { date: generatedAt })}</div>
          </header>

          {statement.count === 0 ? (
            <p className={`${styles.emptyNote} mt-3`}>{t("statement.empty")}</p>
          ) : (
            <>
              <div className={styles.summary}>
                <div className={styles.figure}>
                  <div className={styles.figureLabel}>{t("transactions.income")}</div>
                  <div className={`${styles.figureValue} ${styles.income}`}>{formatCurrency(statement.income)}</div>
                </div>
                <div className={styles.figure}>
                  <div className={styles.figureLabel}>{t("transactions.expense")}</div>
                  <div className={`${styles.figureValue} ${styles.expense}`}>{formatCurrency(statement.expenses)}</div>
                </div>
                <div className={styles.figure}>
                  <div className={styles.figureLabel}>{t("statement.net")}</div>
                  <div className={`${styles.figureValue} ${statement.net < 0 ? styles.expense : styles.income}`}>{signed(statement.net)}</div>
                </div>
              </div>

              {renderLines(t("statement.expensesByCategory"), statement.expenseLines, statement.expenses, styles.expense)}
              {renderLines(t("statement.incomeByCategory"), statement.incomeLines, statement.income, styles.income)}

              {/* One row is the period itself restated, which the summary above
                  already says — so the month table only earns its place when
                  there is more than one month to compare. */}
              {statement.months.length > 1 && (
                <>
                  <h3 className={styles.sectionTitle}>{t("statement.byMonth")}</h3>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{t("statement.month")}</th>
                        <th className={styles.num}>{t("transactions.income")}</th>
                        <th className={styles.num}>{t("transactions.expense")}</th>
                        <th className={styles.num}>{t("statement.net")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.months.map((m) => (
                        <tr key={m.key}>
                          <td>{shortMonth.format(m.start)}</td>
                          <td className={styles.num}>{formatCurrency(m.income)}</td>
                          <td className={styles.num}>{formatCurrency(m.expenses)}</td>
                          <td className={`${styles.num} ${m.net < 0 ? styles.expense : styles.income}`}>{signed(m.net)}</td>
                        </tr>
                      ))}
                      <tr className={styles.totalRow}>
                        <td>{t("common.total")}</td>
                        <td className={styles.num}>{formatCurrency(statement.income)}</td>
                        <td className={styles.num}>{formatCurrency(statement.expenses)}</td>
                        <td className={`${styles.num} ${statement.net < 0 ? styles.expense : styles.income}`}>{signed(statement.net)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}

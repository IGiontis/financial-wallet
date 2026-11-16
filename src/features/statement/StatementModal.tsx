import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiDownload, FiPrinter } from "react-icons/fi";

import { useCategories, useTransactions } from "../transactions/hooks/useTransactions";
import { SkeletonHeading, SkeletonRows } from "../../shared/components/Skeletons";
import { PageWaiting } from "../../shared/components/PageWaiting";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { categoryLabel } from "../../shared/utils/categories";
import { standaloneMonthName } from "../../shared/utils/dates";
import { buildStatement, monthRange, yearRange, yearsWithRecords, type StatementLine } from "./statementUtils";
import styles from "./css/Statement.module.css";
import { findCategory } from "../../shared/utils/categories";
import type { PdfStatement, PdfTable } from "./statementPdf";

const WHOLE_YEAR = "all";

/**
 * A phone, or the app installed on one: where printing fails — an installed
 * app on iOS ignores `window.print()` outright — and a PDF file is offered
 * instead (see `statementPdf`). A computer keeps the print dialogue, which
 * makes a better PDF (real text), and gets the file as a second choice.
 */
const prefersPdfFile = () =>
  typeof window !== "undefined" &&
  (!!window.matchMedia?.("(pointer: coarse)").matches || !!window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * Paper is light whatever the screen is: for as long as the print dialogue is
 * open, the page is in the light mode, so the printed sheet reads the light
 * mode's roles. The mode on screen comes back the moment it closes.
 */
function usePrintInLight() {
  useEffect(() => {
    const root = document.documentElement;
    let before: string | null | undefined;
    const toLight = () => {
      before = root.getAttribute("data-bs-theme");
      root.setAttribute("data-bs-theme", "light");
    };
    const back = () => {
      if (before === undefined) return;
      if (before === null) root.removeAttribute("data-bs-theme");
      else root.setAttribute("data-bs-theme", before);
      before = undefined;
    };
    window.addEventListener("beforeprint", toLight);
    window.addEventListener("afterprint", back);
    return () => {
      window.removeEventListener("beforeprint", toLight);
      window.removeEventListener("afterprint", back);
      back();
    };
  }, []);
}

type PdfState = { phase: "idle" } | { phase: "making" } | { phase: "ready"; blob: Blob } | { phase: "failed" };

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

  // Without a loading gate this dialog printed a complete, well-formed statement
  // with nothing in it — and a statement that says "no records" is a claim, not
  // a placeholder. Whoever read it in that second read a wrong document. Gated
  // on the records having come (a failed read too — `isLoading` was not), the
  // skeleton for a few seconds, then a quiet line (`usePageLoad`); nothing to
  // print or save until then.
  const transactionsQuery = useTransactions();
  const { data: transactions = [] } = transactionsQuery;
  const load = usePageLoad(noAnswerYet(transactionsQuery));
  const isLoading = load !== "ready";
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
  usePrintInLight();
  const [pdfFirst] = useState(prefersPdfFile);
  const [pdf, setPdf] = useState<PdfState>({ phase: "idle" });

  const nameFor = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return (categoryId: string) => {
      const category = byId.get(categoryId) ?? findCategory([], categoryId);
      return category ? { label: categoryLabel(category.name, t), icon: category.icon ?? "🧾" } : { label: t("analytics.unknownCategory"), icon: "🧾" };
    };
  }, [categories, t]);

  const range = useMemo(() => (month === WHOLE_YEAR ? yearRange(year) : monthRange(year, Number(month))), [year, month]);
  const statement = useMemo(() => buildStatement(transactions, range.from, range.to, nameFor), [transactions, range, nameFor]);

  // Named on their own in the picker and before the year in the title, so the
  // stand-alone form: "Μάρτιος 2026", never "Μαρτίου 2026".
  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, i) => standaloneMonthName(lang, new Date(2026, i, 1))), [lang]);

  const shortMonth = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);
  const generatedAt = useMemo(() => new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(now), [lang, now]);
  const periodLabel = month === WHOLE_YEAR ? String(year) : `${monthNames[Number(month)]} ${year}`;

  const percent = useMemo(() => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }), [lang]);
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;

  // ── The file ──
  const fileName = `MyFiWallet-${month === WHOLE_YEAR ? year : `${year}-${String(Number(month) + 1).padStart(2, "0")}`}.pdf`;

  /** The same figures as the sheet on screen, as words the file draws. */
  const pdfModel = (): PdfStatement => {
    const lineTable = (title: string, lines: StatementLine[], total: number, tone: "income" | "expense"): PdfTable => ({
      title,
      columns: [t("common.category"), t("statement.entries"), t("common.amount"), t("statement.share")],
      rows: [
        ...lines.map((line) => ({ cells: [{ text: `${line.icon} ${line.label}` }, { text: String(line.count) }, { text: formatCurrency(line.amount), tone }, { text: percent.format(line.share) }] })),
        { total: true, cells: [{ text: t("common.total") }, { text: String(lines.reduce((n, l) => n + l.count, 0)) }, { text: formatCurrency(total), tone }, { text: "" }] },
      ],
    });
    const tables: PdfTable[] = [];
    if (statement.expenseLines.length) tables.push(lineTable(t("statement.expensesByCategory"), statement.expenseLines, statement.expenses, "expense"));
    if (statement.incomeLines.length) tables.push(lineTable(t("statement.incomeByCategory"), statement.incomeLines, statement.income, "income"));
    if (statement.months.length > 1) {
      const netTone = (n: number) => (n < 0 ? ("expense" as const) : ("income" as const));
      tables.push({
        title: t("statement.byMonth"),
        columns: [t("statement.month"), t("transactions.income"), t("transactions.expense"), t("statement.net")],
        rows: [
          ...statement.months.map((m) => ({ cells: [{ text: shortMonth.format(m.start) }, { text: formatCurrency(m.income) }, { text: formatCurrency(m.expenses) }, { text: signed(m.net), tone: netTone(m.net) }] })),
          { total: true, cells: [{ text: t("common.total") }, { text: formatCurrency(statement.income) }, { text: formatCurrency(statement.expenses) }, { text: signed(statement.net), tone: netTone(statement.net) }] },
        ],
      });
    }
    return {
      brand: "MyFiWallet",
      heading: `${t("statement.title")} — ${periodLabel}`,
      generated: t("statement.generated", { date: generatedAt }),
      summary: [
        { label: t("transactions.income"), value: { text: formatCurrency(statement.income), tone: "income" } },
        { label: t("transactions.expense"), value: { text: formatCurrency(statement.expenses), tone: "expense" } },
        { label: t("statement.net"), value: { text: signed(statement.net), tone: statement.net < 0 ? "expense" : "income" } },
      ],
      tables,
      empty: statement.count === 0 ? t("statement.empty") : undefined,
      pageLabel: (page, total) => t("statement.pageOf", { page, total }),
    };
  };

  /** Hands a made file over; a share sheet that wants a fresh tap gets a button for it. */
  const hand = async (blob: Blob) => {
    const { deliverPdf } = await import("./statementPdf");
    try {
      await deliverPdf(blob, fileName, `${t("statement.title")} — ${periodLabel}`);
      setPdf({ phase: "idle" });
    } catch {
      setPdf({ phase: "ready", blob });
    }
  };

  const makePdf = async () => {
    setPdf({ phase: "making" });
    try {
      const { buildStatementPdf } = await import("./statementPdf");
      const blob = await buildStatementPdf(pdfModel());
      await hand(blob);
    } catch {
      setPdf({ phase: "failed" });
    }
  };

  // A changed period makes a made file stale.
  useEffect(() => setPdf({ phase: "idle" }), [year, month]);

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
            <label className="form-label mb-1 small" htmlFor="statement-year">
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

          <div className="ms-auto d-flex flex-wrap gap-2">
            {/* On a phone the file is the way; on a computer, the print
                dialogue first (real text), the file beside it. */}
            {!pdfFirst && (
              <Button color="primary" size="sm" onClick={() => window.print()} disabled={isLoading}>
                <FiPrinter size={15} className="me-1" aria-hidden />
                {t("statement.print")}
              </Button>
            )}
            {pdf.phase === "ready" ? (
              <Button color="primary" size="sm" onClick={() => void hand(pdf.blob)}>
                <FiDownload size={15} className="me-1" aria-hidden />
                {t("statement.savePdf")}
              </Button>
            ) : (
              <Button color="primary" outline={!pdfFirst} size="sm" onClick={() => void makePdf()} disabled={isLoading || pdf.phase === "making"}>
                <FiDownload size={15} className="me-1" aria-hidden />
                {pdf.phase === "making" ? t("statement.makingPdf") : t("statement.pdf")}
              </Button>
            )}
          </div>
        </div>
        {pdf.phase === "failed" && (
          <Alert color="danger" className={`${styles.noPrint} small py-2`} toggle={() => setPdf({ phase: "idle" })}>
            {t("statement.pdfFailed")}
          </Alert>
        )}

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

          {load === "waiting" ? (
            <PageWaiting />
          ) : isLoading ? (
            <div className="py-2">
              <SkeletonHeading width="30%" sub={false} />
              <SkeletonRows count={5} icon={false} />
              <div className="mt-4">
                <SkeletonHeading width="30%" sub={false} />
                <SkeletonRows count={5} icon={false} />
              </div>
            </div>
          ) : statement.count === 0 ? (
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

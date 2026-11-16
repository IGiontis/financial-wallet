import { useMemo, useState } from "react";
import { Collapse, Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { PageShell } from "../../../shared/components/PageShell";
import { SkeletonCard, SkeletonRows, SkeletonStats } from "../../../shared/components/Skeletons";
import { PageWaiting } from "../../../shared/components/PageWaiting";
import { noAnswerYet, usePageLoad } from "../../../shared/hooks/usePageLoad";
import { SearchInput } from "../../../shared/components/SearchInput";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { categoryLabel, findCategory } from "../../../shared/utils/categories";
import { useCategories, useTransactions } from "../hooks/useTransactions";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { accountOf, mainAccount } from "../../accounts/accountsUtils";
import { useLoadMore } from "../../../shared/hooks/useLoadMore";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import TransactionViewModal from "../components/TransactionsViewModal";
import LedgerCategoryModal from "../components/LedgerCategoryModal";
import { categoryChoices, matchesSearch } from "../transactionFilter";
import { useSearchNames } from "../hooks/useSearchNames";
import { buildLedger, LEDGER_SIDES, toggleSide, type LedgerCategory, type LedgerRow, type LedgerSide } from "../ledger";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "./css/Ledger.module.css";
import { dateFormat } from "../../../shared/utils/dates";

type Span = "month" | "year";

/**
 * Rows drawn at a time; the next ones arrive as the end comes into view (see
 * `useLoadMore`). It was 250 at once, behind a button at the very bottom — on a
 * phone a long wall to scroll through before anything more could be asked for.
 */
const PAGE = 40;

/**
 * «Βιβλίο κινήσεων»: a month or a year of records, dense and read-only.
 *
 * Nothing here changes anything. It is for reading: what came in and went
 * out, by day, the time each was written down, the card it went through, and
 * the stretch's net as it stood after each one — so a month reads as it
 * happened, not only as where it ended. A tap opens the record, to look at.
 * Changing one is the list's job («Όλες οι συναλλαγές»).
 */
export function LedgerPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format } = useCurrencyConverter();
  const transactionsQuery = useTransactions();
  const { data: transactions = [] } = transactionsQuery;
  // The skeleton for a few seconds at most, then the page — see `usePageLoad`.
  const load = usePageLoad(noAnswerYet(transactionsQuery));
  const isLoading = load === "loading";
  const { data: categories = [] } = useCategories();
  // One entry per name, over every category something was written in: «Άλλο»
  // as an income and «Άλλο» as an expense are one choice, both shown, and the
  // «Είδος» filter beside it is what splits money in from money out.
  // «Δουλειά», «Μεταφορά» and the other categories with no document are offered too, when used.
  const categoryNames = useMemo(() => categoryChoices(categories, transactions, { label: (name) => categoryLabel(name, t), onlyUsed: true }), [transactions, categories, t]);
  const searchNames = useSearchNames();
  const accounts = useAccountList();
  const main = mainAccount(accounts);

  const [span, setSpan] = useState<Span>("month");
  const [offset, setOffset] = useState(0);
  // Any of the three kinds, at least one; all three is «Όλα».
  const [kinds, setKinds] = useState<readonly LedgerSide[]>(LEDGER_SIDES);
  const allKinds = kinds.length === LEDGER_SIDES.length;
  // «Πού πήγαν» / «Από πού ήρθαν» folded away or open, remembered on this device.
  const [outOpen, setOutOpen] = useLocalStorage("ledger-where-out-open", true);
  const [inOpen, setInOpen] = useLocalStorage("ledger-where-in-open", true);
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  // The ids behind the name picked — one name can be an income and an expense category.
  const categoryIds = categoryNames.find((c) => c.value === category)?.ids;
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Transaction | null>(null);
  // A line of «Πού πήγαν» / «Από πού ήρθαν» opened out, with the colour of its side.
  const [openedCategory, setOpenedCategory] = useState<{ entry: LedgerCategory; tone: string } | null>(null);

  const [now] = useState(() => new Date());
  const { from, to } = useMemo(() => {
    if (span === "year") return { from: new Date(now.getFullYear() + offset, 0, 1), to: new Date(now.getFullYear() + offset, 11, 31) };
    return { from: new Date(now.getFullYear(), now.getMonth() + offset, 1), to: new Date(now.getFullYear(), now.getMonth() + offset + 1, 0) };
  }, [span, offset, now]);

  const ledger = useMemo(
    () => buildLedger(transactions, { from, to, now, kinds, query, account: account || undefined, categories: categoryIds, accountOf: (tx) => accountOf(tx, accounts, main), matches: (tx, q) => matchesSearch(tx, q, tx.isGoalTransaction ? { id: "__goal__", name: "Goal" } : findCategory(categories, tx.categoryId), searchNames) }),
    [transactions, from, to, now, kinds, query, account, categoryIds, accounts, main, categories, searchNames],
  );

  // Every change of what is shown is a new list, read from its top.
  const { limit, hasMore, more, sentinel } = useLoadMore(ledger.count, PAGE, `${span}|${offset}|${kinds.join(",")}|${account}|${category}|${query}`);

  const periodLabel = useMemo(
    () => (span === "year" ? String(from.getFullYear()) : dateFormat("monthYear", lang).format(from)),
    [span, from, lang],
  );
  const dayFmt = dateFormat("weekdayDay", lang);
  // A category's records on one line each: the day without its weekday.
  const shortDayFmt = dateFormat("dayShort", lang);
  const timeFmt = dateFormat("time", lang);

  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${format(Math.abs(n))}`;
  const tone = (n: number) => (n > 0 ? "var(--color-income-text)" : n < 0 ? "var(--color-expense-text)" : undefined);
  const categoryOf = (categoryId: string) => {
    const category = findCategory(categories, categoryId);
    return { icon: category?.icon ?? "•", name: category ? categoryLabel(category.name, t) : t("analytics.unknownCategory") };
  };
  const nameOf = (tx: Transaction) => (tx.isGoalTransaction ? { icon: "🎯", name: categoryLabel("Goal", t) } : categoryOf(tx.categoryId));
  const cardOf = (tx: Transaction) => accounts.find((a) => a.id === accountOf(tx, accounts, main))?.name;

  // A change of what is shown starts the list from the top again.
  const step = (n: number) => setOffset((o) => o + n);

  // The rows drawn so far, day by day, cut at `limit`.
  const shownDays = useMemo(() => {
    let left = limit;
    const days = [];
    for (const day of ledger.days) {
      if (left <= 0) break;
      const rows = day.rows.slice(0, left);
      left -= rows.length;
      days.push({ ...day, rows });
    }
    return days;
  }, [ledger.days, limit]);

  const row = (r: LedgerRow) => {
    const { icon, name } = nameOf(r.tx);
    const card = cardOf(r.tx);
    const amount = r.sign * r.amount;
    return (
      <button key={r.tx.id} type="button" className={`${styles.row} ${r.counted ? "" : styles.rowMove}`} onClick={() => setViewing(r.tx)}>
        <span className={styles.time}>{r.recordedAt ? timeFmt.format(r.recordedAt) : "—"}</span>
        <span className={styles.icon} aria-hidden>
          {r.tx.transferId ? "🔁" : icon}
        </span>
        <span className={styles.what}>
          <span className={styles.desc}>{r.tx.description || name}</span>
          <span className={styles.meta}>
            {r.tx.transferId ? t("transactions.transfer.badge") : name}
            {card && <span className={styles.card}>{card}</span>}
            {!r.counted && <span className={styles.moveTag}>{t("ledger.notCounted")}</span>}
          </span>
        </span>
        <span className={styles.amounts}>
          <span className={styles.amount} style={{ color: r.counted ? tone(amount) : undefined }}>
            {signed(amount)}
          </span>
          <span className={styles.running} title={t("ledger.runningTitle")}>
            {signed(r.running)}
          </span>
        </span>
      </button>
    );
  };

  const categoryList = (id: string, title: string, list: typeof ledger.spending, total: number, color: string, tone: string, open: boolean, setOpen: (open: boolean) => void) =>
    list.length > 0 && (
      <section className={styles.catSection}>
        {/* The whole heading folds the list (the accordion pattern: a button
            inside the heading): the chevron opposite the title says which way
            it is, and the row is a tap target a thumb can find. */}
        <h2 className={styles.sideHeading}>
          <button type="button" className={styles.sideHead} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            <span className={styles.sideTitle}>{title}</span>
            <span className={styles.sideTotal}>{format(total)}</span>
            <FiChevronDown aria-hidden className={`${styles.sideChevron} ${open ? styles.sideChevronOpen : ""}`} />
          </button>
        </h2>
        <Collapse isOpen={open} id={id}>
          <div className={styles.sideList}>
            {list.slice(0, 8).map((c) => {
              const { icon, name } = categoryOf(c.categoryId);
              return (
                // A tap lists the records behind the line.
                <button key={c.categoryId} type="button" className={styles.cat} onClick={() => setOpenedCategory({ entry: c, tone })}>
                  <div className={styles.catHead}>
                    <span className={styles.catName}>
                      {icon} {name} <span className={styles.catCount}>· {c.count}</span>
                    </span>
                    <span className={styles.catAmount}>{format(c.amount)}</span>
                  </div>
                  <div className={styles.catTrack}>
                    <span style={{ width: `${Math.max(c.share * 100, 2)}%`, background: color }} />
                  </div>
                </button>
              );
            })}
          </div>
        </Collapse>
      </section>
    );

  return (
    <PageShell>
      <div className="mb-3">
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("ledger.title")}</h1>
        <p className="small text-body-secondary mb-0">{t("ledger.subtitle")}</p>
      </div>

      {/* What stretch, and what of it. */}
      <div className={styles.controls}>
        <div className={styles.period}>
          <button type="button" className={styles.stepBtn} onClick={() => step(-1)} aria-label={t("common.prev")}>
            <FiChevronLeft aria-hidden />
          </button>
          <span className={styles.periodLabel}>{periodLabel}</span>
          <button type="button" className={styles.stepBtn} onClick={() => step(1)} disabled={offset >= 0} aria-label={t("common.next")}>
            <FiChevronRight aria-hidden />
          </button>
        </div>
        <div className={`${segmented.group} ${styles.span}`} role="group" aria-label={t("ledger.span")}>
          {(["month", "year"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={span === s}
              className={`${segmented.item} ${span === s ? segmented.active : ""}`}
              onClick={() => {
                setSpan(s);
                setOffset(0);
              }}
            >
              {t(`ledger.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.filters}>
        {/* «Όλα» and the three kinds as chips that combine: income and
            expenses without the moves, say. Under «Όλα» a tap on one picks it
            alone, as the single choice always did; then each tap adds or takes
            one away (`toggleSide`). */}
        <div className={`${segmented.group} ${styles.kinds}`} role="group" aria-label={t("ledger.kind")}>
          <button type="button" aria-pressed={allKinds} className={`${segmented.item} ${allKinds ? segmented.active : ""}`} onClick={() => setKinds(LEDGER_SIDES)}>
            {t("ledger.kind_all")}
          </button>
          {LEDGER_SIDES.map((k) => {
            const on = !allKinds && kinds.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} className={`${segmented.item} ${styles.kindChip} ${on ? segmented.active : ""}`} onClick={() => setKinds((current) => toggleSide(current, k))}>
                {on && <FiCheck aria-hidden className={styles.kindCheck} />}
                {t(`ledger.kind_${k}`)}
              </button>
            );
          })}
        </div>
        {accounts.length > 1 && (
          <Input type="select" bsSize="sm" value={account} onChange={(e) => setAccount(e.target.value)} aria-label={t("ledger.card")} className={styles.cardSelect}>
            <option value="">{t("ledger.allCards")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Input>
        )}
        {/* Only categories something was ever written in: an unused one would offer a page of nothing. */}
        <Input type="select" bsSize="sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("ledger.category")} className={styles.cardSelect}>
          <option value="">{t("ledger.allCategories")}</option>
          {categoryNames.map((c) => (
            <option key={c.value} value={c.value}>
              {c.icon} {categoryLabel(c.name, t)}
            </option>
          ))}
        </Input>
        <div className={styles.search}>
          <SearchInput value={query} onChange={setQuery} placeholder={t("transactions.searchShort")} block />
        </div>
      </div>

      {/* The stretch in four figures. */}
      {isLoading ? (
        <SkeletonStats />
      ) : load === "waiting" ? null : (
      <div className={styles.sums}>
        <div className={styles.sum}>
          <span className={styles.sumLabel}>{t("ledger.in")}</span>
          <span className={styles.sumValue} style={{ color: "var(--color-income-text)" }}>
            {format(ledger.in)}
          </span>
        </div>
        <div className={styles.sum}>
          <span className={styles.sumLabel}>{t("ledger.out")}</span>
          <span className={styles.sumValue} style={{ color: "var(--color-expense-text)" }}>
            {format(ledger.out)}
          </span>
        </div>
        <div className={styles.sum}>
          <span className={styles.sumLabel}>{t("ledger.net")}</span>
          <span className={styles.sumValue} style={{ color: tone(ledger.net) }}>
            {signed(ledger.net)}
          </span>
        </div>
        <div className={styles.sum}>
          <span className={styles.sumLabel}>{t("ledger.perDay")}</span>
          <span className={styles.sumValue}>{format(ledger.perDay)}</span>
          <span className={styles.sumSub}>{t("ledger.count", { count: ledger.count })}</span>
        </div>
      </div>
      )}

      <div className={styles.body}>
        <div className={styles.list}>
          {isLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} className="mb-3">
                  <SkeletonRows count={3} />
                </SkeletonCard>
              ))}
            </>
          ) : load === "waiting" ? (
            <PageWaiting />
          ) : ledger.count === 0 ? (
            <p className={styles.empty}>{t("ledger.empty")}</p>
          ) : (
            <>
              <div className={styles.legend}>
                <span>{t("ledger.legendTime")}</span>
                <span>{t("ledger.legendRunning")}</span>
              </div>
              {shownDays.map((day) => (
                <section key={day.key} className={styles.day}>
                  <header className={styles.dayHead}>
                    <span className={styles.dayName}>{dayFmt.format(day.date)}</span>
                    <span className={styles.dayTotals}>
                      {day.in > 0 && <span style={{ color: "var(--color-income-text)" }}>+{format(day.in)}</span>}
                      {day.out > 0 && <span style={{ color: "var(--color-expense-text)" }}>−{format(day.out)}</span>}
                    </span>
                  </header>
                  {day.rows.map(row)}
                </section>
              ))}
              {hasMore && (
                <>
                  {/* Watched: in view, the next rows are drawn. The button is for
                      a browser without the observer, and for whoever wants to ask. */}
                  <div ref={sentinel} aria-hidden />
                  <button type="button" className={`btn btn-outline-secondary btn-sm w-100 mt-2`} onClick={more}>
                    {t("ledger.more", { count: ledger.count - limit })}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <aside className={styles.side} data-tour="ledger-categories">
          {categoryList("ledger-where-out", t("ledger.whereOut"), ledger.spending, ledger.out, "var(--color-expense)", "var(--color-expense-text)", outOpen, setOutOpen)}
          {categoryList("ledger-where-in", t("ledger.whereIn"), ledger.earning, ledger.in, "var(--color-income)", "var(--color-income-text)", inOpen, setInOpen)}
        </aside>
      </div>

      {openedCategory && (
        <LedgerCategoryModal
          {...categoryOf(openedCategory.entry.categoryId)}
          entry={openedCategory.entry}
          period={periodLabel}
          tone={openedCategory.tone}
          formatCurrency={format}
          dayFmt={shortDayFmt}
          cardOf={cardOf}
          onOpen={setViewing}
          onClose={() => setOpenedCategory(null)}
        />
      )}

      {/* To look at only: no Edit, no Delete. Over the category's list, when opened from it. */}
      {viewing && <TransactionViewModal transaction={viewing} categories={categories} formatCurrency={format} onClose={() => setViewing(null)} />}
    </PageShell>
  );
}

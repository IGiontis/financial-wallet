import { useMemo, useState } from "react";
import { Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { PageShell } from "../../../shared/components/PageShell";
import { SkeletonCard, SkeletonRows, SkeletonStats } from "../../../shared/components/Skeletons";
import { SearchInput } from "../../../shared/components/SearchInput";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { categoryLabel, findCategory } from "../../../shared/utils/categories";
import { useCategories, useTransactions } from "../hooks/useTransactions";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { accountOf, mainAccount } from "../../accounts/accountsUtils";
import { useLoadMore } from "../../../shared/hooks/useLoadMore";
import TransactionViewModal from "../components/TransactionsViewModal";
import { buildLedger, type LedgerKind, type LedgerRow } from "../ledger";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "./css/Ledger.module.css";

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
  const { data: transactions = [], isLoading } = useTransactions();
  const { data: categories = [] } = useCategories();
  const accounts = useAccountList();
  const main = mainAccount(accounts);

  const [span, setSpan] = useState<Span>("month");
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<LedgerKind>("all");
  const [account, setAccount] = useState("");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Transaction | null>(null);

  const [now] = useState(() => new Date());
  const { from, to } = useMemo(() => {
    if (span === "year") return { from: new Date(now.getFullYear() + offset, 0, 1), to: new Date(now.getFullYear() + offset, 11, 31) };
    return { from: new Date(now.getFullYear(), now.getMonth() + offset, 1), to: new Date(now.getFullYear(), now.getMonth() + offset + 1, 0) };
  }, [span, offset, now]);

  const ledger = useMemo(
    () => buildLedger(transactions, { from, to, now, kind, query, account: account || undefined, accountOf: (tx) => accountOf(tx, accounts, main) }),
    [transactions, from, to, now, kind, query, account, accounts, main],
  );

  // Every change of what is shown is a new list, read from its top.
  const { limit, hasMore, more, sentinel } = useLoadMore(ledger.count, PAGE, `${span}|${offset}|${kind}|${account}|${query}`);

  const periodLabel = useMemo(
    () => (span === "year" ? String(from.getFullYear()) : new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(from)),
    [span, from, lang],
  );
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }), [lang]);
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), [lang]);

  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${format(Math.abs(n))}`;
  const tone = (n: number) => (n > 0 ? "var(--color-income-text)" : n < 0 ? "var(--color-expense-text)" : undefined);
  const nameOf = (tx: Transaction) => {
    if (tx.isGoalTransaction) return { icon: "🎯", name: categoryLabel("Goal", t) };
    const category = findCategory(categories, tx.categoryId);
    return { icon: category?.icon ?? "•", name: category ? categoryLabel(category.name, t) : t("analytics.unknownCategory") };
  };
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

  const categoryList = (title: string, list: typeof ledger.spending, color: string) =>
    list.length > 0 && (
      <section className={styles.catSection}>
        <h2 className={styles.sideTitle}>{title}</h2>
        {list.slice(0, 8).map((c) => {
          const { icon, name } = (() => {
            const category = findCategory(categories, c.categoryId);
            return { icon: category?.icon ?? "•", name: category ? categoryLabel(category.name, t) : t("analytics.unknownCategory") };
          })();
          return (
            <div key={c.categoryId} className={styles.cat}>
              <div className={styles.catHead}>
                <span className="text-truncate">
                  {icon} {name} <span className={styles.catCount}>· {c.count}</span>
                </span>
                <span className={styles.catAmount}>{format(c.amount)}</span>
              </div>
              <div className={styles.catTrack}>
                <span style={{ width: `${Math.max(c.share * 100, 2)}%`, background: color }} />
              </div>
            </div>
          );
        })}
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
        <div className={segmented.group} role="group" aria-label={t("ledger.span")}>
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
        <div className={`${segmented.group} ${styles.kinds}`} role="group" aria-label={t("ledger.kind")}>
          {(["all", "in", "out", "moves"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} className={`${segmented.item} ${kind === k ? segmented.active : ""}`} onClick={() => setKind(k)}>
              {t(`ledger.kind_${k}`)}
            </button>
          ))}
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
        <div className={styles.search}>
          <SearchInput value={query} onChange={setQuery} placeholder={t("transactions.searchShort")} block />
        </div>
      </div>

      {/* The stretch in four figures. */}
      {isLoading ? (
        <SkeletonStats />
      ) : (
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

        <aside className={styles.side}>
          {categoryList(t("ledger.whereOut"), ledger.spending, "var(--color-expense)")}
          {categoryList(t("ledger.whereIn"), ledger.earning, "var(--color-income)")}
        </aside>
      </div>

      {/* To look at only: no Edit, no Delete. */}
      {viewing && <TransactionViewModal transaction={viewing} categories={categories} formatCurrency={format} onClose={() => setViewing(null)} />}
    </PageShell>
  );
}

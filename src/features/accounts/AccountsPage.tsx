import { useMemo, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Card, CardBody, Col, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalFooter, ModalHeader, Row } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiChevronRight, FiEdit2, FiPlus, FiRefreshCw, FiTrash2, FiTrendingUp, FiX } from "react-icons/fi";

import { PageShell } from "../../shared/components/PageShell";
import { SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../shared/components/Skeletons";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { currentBalance, isAfterReading } from "../../shared/utils/balance";
import { useMoneyAccounts } from "./useMoneyAccounts";
import {
  STALE_AFTER_DAYS,
  daysSince,
  expectedByAccount,
  goalHeldTotal,
  mainAccount,
  newId,
  parseAmount,
  projectedTotal,
  withoutAccount,
  type CheckInReading,
  type MoneyAccount,
  type MoneyAccountKind,
} from "./accountsUtils";
import { ACCOUNT_ICON, accountTones } from "./accountTones";
import CheckInModal from "./CheckInModal";
import AccountModal, { type AccountDraft } from "./AccountModal";
import styles from "./css/AccountsPage.module.css";

const HISTORY_SHOWN = 6;

/** Only one account can be the one new records land in. */
const withMain = (accounts: MoneyAccount[], id: string, main: boolean): MoneyAccount[] =>
  accounts.map((a) => (a.id === id ? { ...a, main } : main ? { ...a, main: false } : a));

/**
 * Banks & cash: what is really there, read off the banks now and then.
 *
 * The rest of the app works out a balance from what was written down; this is
 * where it is checked against the truth, and where the difference — money that
 * went without a record — is found and shown rather than silently absorbed.
 * See `accountsUtils` for the arithmetic.
 *
 * One column on a phone, with the update button held under the thumb; two on a
 * wide screen, the money on the left and what the readings found on the right.
 */
export function AccountsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency, baseCurrency } = useCurrencyConverter();
  const { accounts, setAccounts, setCheckIns, readings, latest, anchors, transactions, isLoading } = useMoneyAccounts();
  const deleteGuard = useOfflineGuard("delete");

  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState<MoneyAccount | "new" | null>(null);
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState<MoneyAccount | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const dayFmt = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }), [lang]);
  const expected = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  const tones = useMemo(() => accountTones(accounts), [accounts]);
  const projected = latest ? projectedTotal(latest, transactions) : 0;
  const inGoals = goalHeldTotal(transactions);
  const available = currentBalance(transactions, anchors.at(-1));
  const since = latest ? transactions.filter((tx) => isAfterReading(tx, latest.at)).length : 0;
  const age = daysSince(latest);
  const main = mainAccount(accounts);

  if (isLoading) {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <SkeletonStats count={1} />
        <SkeletonRows count={3} />
      </PageShell>
    );
  }

  const record = (amounts: Record<string, number>) => setCheckIns((prev) => [...prev, { id: newId(), at: new Date().toISOString(), amounts }]);

  const saveAccount = (draft: AccountDraft) => {
    if (editing === "new") {
      const id = newId();
      const first = accounts.length === 0;
      let next = [...accounts, { id, name: draft.name, kind: draft.kind, main: first || draft.main }];
      if (draft.main) next = withMain(next, id, true);
      setAccounts(next);
      // Joins with the others at what they are expected to hold, so adding an
      // account never shows up as money found or lost.
      record({ ...expected, [id]: draft.amount ?? 0 });
    } else if (editing) {
      let next = accounts.map((a) => (a.id === editing.id ? { ...a, name: draft.name, kind: draft.kind } : a));
      next = withMain(next, editing.id, draft.main);
      setAccounts(next);
    }
    setEditing(null);
  };

  const deleteAccount = (id: string) => {
    if (deleteGuard.locked) return;
    const next = accounts.filter((a) => a.id !== id);
    // The main account went with it: the first bank takes over.
    const fallback = next.some((a) => a.main) ? next : next.map((a) => (a.id === mainAccount(next)?.id ? { ...a, main: true } : a));
    setAccounts(fallback);
    setCheckIns((prev) => withoutAccount(prev, id));
    setEditing(null);
    setDeleting(null);
    if (next.length === 0) setManaging(false);
  };

  const undoLatest = () => {
    if (!latest || deleteGuard.locked) return;
    setCheckIns((prev) => prev.filter((c) => c.id !== latest.checkIn.id));
    setConfirmUndo(false);
  };

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "";

  const describe = (r: CheckInReading, index: number): { text: string; color: string; tone: string } => {
    if (index === 0) return { text: t("accounts.historyFirst"), color: "secondary-subtle", tone: "text-secondary-emphasis" };
    if (r.unlogged === undefined || r.unlogged === 0) {
      return r.added.length > 0
        ? { text: t("accounts.historyAdded", { name: r.added.map(accountName).join(", ") }), color: "primary-subtle", tone: "text-primary-emphasis" }
        : { text: t("accounts.historyAllWritten"), color: "success-subtle", tone: "text-success-emphasis" };
    }
    return r.unlogged < 0
      ? { text: t("accounts.historyMissing", { amount: formatCurrency(-r.unlogged) }), color: "warning-subtle", tone: "text-warning-emphasis" }
      : { text: t("accounts.historyExtra", { amount: formatCurrency(r.unlogged) }), color: "info-subtle", tone: "text-info-emphasis" };
  };

  const history = readings.map((r, i) => ({ r, i })).reverse();
  const positiveTotal = accounts.reduce((sum, a) => sum + Math.max(0, expected[a.id] ?? 0), 0);

  if (accounts.length === 0) {
    return (
      <PageShell>
        <Header />
        <Row className="justify-content-center">
          <Col lg={7} xl={6}>
            <Setup
              baseCurrency={baseCurrency}
              onSave={(rows) => {
                const created = rows.map((row, i) => ({ id: newId() + i, name: row.name, kind: row.kind }));
                const mainId = (created.find((a) => a.kind === "bank") ?? created[0]).id;
                setAccounts(created.map((a) => ({ ...a, main: a.id === mainId })));
                record(Object.fromEntries(created.map((a, i) => [a.id, rows[i].amount])));
              }}
            />
          </Col>
        </Row>
      </PageShell>
    );
  }

  const updateButton = (
    <Button color="primary" size="lg" className={`w-100 fw-semibold ${styles.cta}`} onClick={() => setReading(true)}>
      <FiRefreshCw size={17} className="me-2" aria-hidden />
      {t("accounts.update")}
    </Button>
  );

  return (
    <PageShell>
      <Header
        action={
          <Button color="primary" outline onClick={() => setEditing("new")} className="text-nowrap">
            <FiPlus size={16} className="me-1" aria-hidden />
            {t("accounts.add")}
          </Button>
        }
      />

      <Row className="g-3">
        <Col lg={7}>
          {/* ── The total ── */}
          <Card className="mb-3">
            <CardBody className="p-3 p-sm-4">
              <div className={styles.eyebrow}>{latest && since === 0 ? t("accounts.totalRead", { date: dayFmt.format(latest.at) }) : t("accounts.totalNow")}</div>
              <div className={styles.total}>{formatCurrency(projected)}</div>
              {latest && <div className="small text-body-secondary">{since > 0 ? t("accounts.sinceReading", { date: dayFmt.format(latest.at), count: since }) : t("accounts.nothingSince")}</div>}

              {positiveTotal > 0 && accounts.length > 1 && (
                <div className={styles.shareBar} role="img" aria-label={accounts.map((a) => `${a.name} ${formatCurrency(expected[a.id] ?? 0)}`).join(", ")}>
                  {accounts.map((a) =>
                    (expected[a.id] ?? 0) > 0 ? <span key={a.id} style={{ width: `${((expected[a.id] ?? 0) / positiveTotal) * 100}%`, background: tones[a.id] }} /> : null,
                  )}
                </div>
              )}

              {/* What sits in goals is in these banks too, but it is not money
                  to spend — so the figure the rest of the app calls "money you
                  have" is this one less that. */}
              {inGoals !== 0 && (
                <dl className={styles.sum}>
                  <div>
                    <dt>{t("accounts.sumBanks")}</dt>
                    <dd>{formatCurrency(projected)}</dd>
                  </div>
                  <div>
                    <dt>{t("accounts.sumGoals")}</dt>
                    <dd style={{ color: "var(--color-goal-text)" }}>−{formatCurrency(inGoals)}</dd>
                  </div>
                  <div className={styles.sumTotal}>
                    <dt>{t("accounts.sumAvailable")}</dt>
                    <dd style={{ color: available < 0 ? "var(--color-expense-text)" : "var(--color-income-text)" }}>{formatCurrency(available)}</dd>
                  </div>
                </dl>
              )}
            </CardBody>
          </Card>

          {/* ── The accounts ── */}
          <Card className="mb-3">
            <CardBody className="pt-2 pb-1 px-3">
              <div className="d-flex justify-content-between align-items-center pt-1 pb-1">
                <span className="small fw-semibold text-body-secondary">{t("accounts.listTitle", { count: accounts.length })}</span>
                <Button color="link" size="sm" className="p-0 text-decoration-none" onClick={() => setManaging((m) => !m)} aria-pressed={managing}>
                  {managing ? (
                    t("accounts.done")
                  ) : (
                    <>
                      <FiEdit2 size={13} className="me-1" aria-hidden />
                      {t("accounts.manage")}
                    </>
                  )}
                </Button>
              </div>

              {accounts.map((account) => {
                const isMain = account.id === main?.id;
                const moved = isMain && since > 0;
                const amount = expected[account.id] ?? 0;
                const tile = (
                  <span className={styles.tile} style={{ ["--tone" as string]: tones[account.id] }} aria-hidden>
                    {ACCOUNT_ICON[account.kind]}
                  </span>
                );
                const text = (
                  <span className="flex-grow-1" style={{ minWidth: 0 }}>
                    <span className={styles.name}>{account.name}</span>
                    <span className={styles.note}>
                      {moved ? t("accounts.estimated") : latest && account.id in latest.checkIn.amounts ? t("accounts.readOn", { date: dayFmt.format(latest.at) }) : t("accounts.notRead")}
                      {isMain && accounts.length > 1 && ` · ${t("accounts.mainShort")}`}
                    </span>
                  </span>
                );
                return (
                  <div key={account.id} className={styles.row}>
                    <button type="button" className={styles.rowButton} onClick={() => setEditing(account)} aria-label={t("accounts.openAccount", { name: account.name })}>
                      {tile}
                      {text}
                      <span className={styles.amount} style={{ color: amount < 0 ? "var(--color-expense-text)" : undefined }}>
                        {formatCurrency(amount)}
                      </span>
                      {!managing && <FiChevronRight size={16} className="text-body-tertiary flex-shrink-0" aria-hidden />}
                    </button>
                    {managing && (
                      <Button
                        color="danger"
                        outline
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => setDeleting(account)}
                        disabled={deleteGuard.locked}
                        title={deleteGuard.reason}
                        aria-label={t("accounts.deleteNamed", { name: account.name })}
                      >
                        <FiTrash2 size={15} aria-hidden />
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>

        </Col>

        <Col lg={5}>
          <div className="d-none d-lg-block mb-3">{updateButton}</div>

          <LatestFinding latest={latest} count={readings.length} formatCurrency={formatCurrency} dayFmt={dayFmt} />

          {age !== undefined && age >= STALE_AFTER_DAYS && (
            <Alert color="warning" className="small py-2 d-flex gap-2 align-items-start">
              <FiAlertTriangle size={16} className="flex-shrink-0 mt-1" aria-hidden />
              <span>{t("accounts.stale", { count: age })}</span>
            </Alert>
          )}

          {readings.length > 0 && (
            <Card className="mb-3">
              <CardBody className="pt-2 pb-2 px-3">
                <div className="d-flex justify-content-between align-items-center pt-1 pb-1">
                  <span className="small fw-semibold text-body-secondary">{t("accounts.history")}</span>
                  {readings.length > 1 && !confirmUndo && (
                    <Button color="link" size="sm" className="p-0 text-decoration-none" onClick={() => setConfirmUndo(true)} disabled={deleteGuard.locked} title={deleteGuard.reason}>
                      {t("accounts.undoLatest")}
                    </Button>
                  )}
                </div>
                {confirmUndo && (
                  <Alert color="warning" className="small py-2 mb-2">
                    <div className="mb-2">{t("accounts.undoConfirm")}</div>
                    <div className="d-flex gap-2">
                      <Button size="sm" color="secondary" outline onClick={() => setConfirmUndo(false)}>
                        {t("common.cancel")}
                      </Button>
                      <Button size="sm" color="danger" onClick={undoLatest} disabled={deleteGuard.locked}>
                        {t("accounts.undoYes")}
                      </Button>
                    </div>
                  </Alert>
                )}
                {(showAll ? history : history.slice(0, HISTORY_SHOWN)).map(({ r, i }) => {
                  const said = describe(r, i);
                  return (
                    <div key={r.checkIn.id} className={styles.history}>
                      <span style={{ minWidth: 0 }}>
                        <span className="fw-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatCurrency(r.total)}
                        </span>
                        <span className={styles.when}>{dayFmt.format(r.at)}</span>
                      </span>
                      <Badge pill color={said.color} className={`${said.tone} text-wrap text-end fw-semibold`} style={{ fontSize: 11.5 }}>
                        {said.text}
                      </Badge>
                    </div>
                  );
                })}
                {!showAll && history.length > HISTORY_SHOWN && (
                  <Button color="link" size="sm" className="p-0 text-decoration-none" onClick={() => setShowAll(true)}>
                    {t("accounts.showAll", { count: history.length })}
                  </Button>
                )}
              </CardBody>
            </Card>
          )}

          <details className={`${styles.how} mb-3`}>
            <summary>{t("accounts.howTitle")}</summary>
            <p>{t("accounts.howItWorks")}</p>
          </details>
        </Col>
      </Row>

      {/* On a phone the button is docked under the thumb for the whole page.
          Last in the page on purpose: a sticky element only sticks within its
          parent, and this one's parent is the whole page. */}
      <div className={`d-lg-none ${styles.dock}`}>{updateButton}</div>

      {reading && (
        <CheckInModal
          accounts={accounts}
          expected={expected}
          tones={tones}
          baseCurrency={baseCurrency}
          formatCurrency={formatCurrency}
          onSave={(amounts) => {
            record(amounts);
            setReading(false);
          }}
          onClose={() => setReading(false)}
        />
      )}
      {editing && (
        <AccountModal
          account={editing === "new" ? undefined : editing}
          baseCurrency={baseCurrency}
          onSave={saveAccount}
          onDelete={editing === "new" ? undefined : () => deleteAccount(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && <DeleteAccountModal account={deleting} onConfirm={() => deleteAccount(deleting.id)} onClose={() => setDeleting(null)} />}
    </PageShell>
  );
}

function Header({ action }: { action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
      <div style={{ minWidth: 0 }}>
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("accounts.title")}</h1>
        <p className="small text-body-secondary mb-0">{t("accounts.subtitle")}</p>
      </div>
      {action}
    </div>
  );
}

function DeleteAccountModal({ account, onConfirm, onClose }: { account: MoneyAccount; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>{t("accounts.delete")}</ModalHeader>
      <ModalBody>
        <p className="mb-0" style={{ fontSize: 14 }}>
          {t("accounts.deleteConfirm", { name: account.name })}
        </p>
        {deleteGuard.locked && <p className="small text-body-secondary mt-2 mb-0">{deleteGuard.reason}</p>}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button color="danger" onClick={onConfirm} disabled={deleteGuard.locked}>
          {t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** What the most recent reading found, said once and plainly. */
function LatestFinding({
  latest,
  count,
  formatCurrency,
  dayFmt,
}: {
  latest: CheckInReading | undefined;
  count: number;
  formatCurrency: (n: number) => string;
  dayFmt: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation();
  if (!latest) return null;
  const date = dayFmt.format(latest.at);
  const box = (color: string, Icon: typeof FiCheckCircle, text: string) => (
    <Alert color={color} className="small py-2 d-flex gap-2 align-items-start">
      <Icon size={16} className="flex-shrink-0 mt-1" aria-hidden />
      <span>{text}</span>
    </Alert>
  );

  // The first reading has nothing before it to compare with, except what the
  // app had been saying — worth showing once, since it is the reason to start.
  if (count === 1) {
    if (latest.appSaid === undefined) return null;
    const gap = Math.round((latest.total - latest.appSaid) * 100) / 100;
    return box("info", FiTrendingUp, t("accounts.firstFinding", { said: formatCurrency(latest.appSaid), gap: `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${formatCurrency(Math.abs(gap))}` }));
  }

  if (latest.unlogged === undefined) return null;
  if (latest.unlogged === 0) return box("success", FiCheckCircle, t("accounts.findingClean", { date }));
  return latest.unlogged < 0
    ? box("warning", FiAlertTriangle, t("accounts.findingMissing", { date, amount: formatCurrency(-latest.unlogged) }))
    : box("info", FiTrendingUp, t("accounts.findingExtra", { date, amount: formatCurrency(latest.unlogged) }));
}

interface SetupRow {
  key: number;
  name: string;
  kind: MoneyAccountKind;
  amount: string;
}

/**
 * The first visit: every account at once, so the first reading is a whole
 * picture and can be held up against what the app had been saying.
 */
function Setup({ baseCurrency, onSave }: { baseCurrency: string; onSave: (rows: { name: string; kind: MoneyAccountKind; amount: number }[]) => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SetupRow[]>([
    { key: 1, name: "", kind: "bank", amount: "" },
    { key: 2, name: t("accounts.kindCash"), kind: "cash", amount: "" },
  ]);
  const [touched, setTouched] = useState(false);

  const update = (key: number, patch: Partial<SetupRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // A row left completely empty is a row not wanted, not a mistake.
  const filled = rows.filter((r) => r.name.trim() !== "" || r.amount.trim() !== "");
  const problems = filled.filter((r) => r.name.trim() === "" || parseAmount(r.amount) === undefined);
  const ready = filled.length > 0 && problems.length === 0;
  const tones = accountTones(rows.map((r) => ({ id: String(r.key), kind: r.kind })));

  const save = () => {
    setTouched(true);
    if (!ready) return;
    onSave(filled.map((r) => ({ name: r.name.trim(), kind: r.kind, amount: parseAmount(r.amount) as number })));
  };

  return (
    <Card>
      <CardBody className="p-3 p-sm-4">
        <h2 className="h5 fw-semibold mb-1">{t("accounts.setupTitle")}</h2>
        <p className="small text-body-secondary">{t("accounts.setupHint")}</p>

        {rows.map((row) => {
          const isFilled = row.name.trim() !== "" || row.amount.trim() !== "";
          return (
            <div key={row.key} className={styles.row}>
              <button
                type="button"
                className={`${styles.tile} border-0`}
                style={{ ["--tone" as string]: tones[String(row.key)] }}
                aria-label={t("accounts.kindToggle")}
                title={t("accounts.kindToggle")}
                onClick={() => update(row.key, { kind: row.kind === "bank" ? "cash" : "bank" })}
              >
                {ACCOUNT_ICON[row.kind]}
              </button>
              {/* Name over amount on a phone, so neither is squeezed to a few
                  letters; side by side once there is room. */}
              <div className="flex-grow-1 d-flex flex-column flex-sm-row gap-2" style={{ minWidth: 0 }}>
                <Input
                  value={row.name}
                  placeholder={row.kind === "bank" ? t("accounts.namePlaceholderBank") : t("accounts.kindCash")}
                  aria-label={t("accounts.name")}
                  invalid={touched && isFilled && row.name.trim() === ""}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                  maxLength={40}
                  style={{ fontSize: 16, minWidth: 0 }}
                />
                <InputGroup className={styles.setupAmount}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    aria-label={t("accounts.holdsNow")}
                    value={row.amount}
                    invalid={touched && isFilled && parseAmount(row.amount) === undefined}
                    onChange={(e) => update(row.key, { amount: e.target.value })}
                  />
                  <InputGroupText>{baseCurrency}</InputGroupText>
                </InputGroup>
              </div>
              {rows.length > 1 && (
                <Button color="link" className="p-1 text-body-secondary flex-shrink-0" aria-label={t("accounts.removeRow")} onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                  <FiX size={18} aria-hidden />
                </Button>
              )}
            </div>
          );
        })}

        <Button
          color="link"
          size="sm"
          className="px-0 text-decoration-none"
          onClick={() => setRows((all) => [...all, { key: Math.max(0, ...all.map((r) => r.key)) + 1, name: "", kind: "bank", amount: "" }])}
        >
          <FiPlus size={14} className="me-1" aria-hidden />
          {t("accounts.setupAnother")}
        </Button>

        <Button color="primary" size="lg" className="w-100 mt-3 fw-semibold" onClick={save} disabled={touched && !ready}>
          {t("accounts.setupSave")}
        </Button>

        <details className={`${styles.how} mt-3`}>
          <summary>{t("accounts.howTitle")}</summary>
          <p>{t("accounts.howItWorks")}</p>
        </details>
      </CardBody>
    </Card>
  );
}

export default AccountsPage;

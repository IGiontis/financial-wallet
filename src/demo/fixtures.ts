import { addDays, addMonths, endOfMonth, startOfDay, startOfMonth, subMonths } from "date-fns";
import type { Bill, BillPayment, Category, Debt, DebtPayment, InvestmentContribution, InvestmentGoal, Transaction, TransactionType, User } from "../shared/types/IndexTypes";
import { DEFAULT_CATEGORIES } from "../firebase/defaultCategories";
import { ACCOUNTS_KEY, CHECK_INS_KEY, accountOf, mainAccount, realDelta, type BalanceCheckIn, type MoneyAccount } from "../features/accounts/accountsUtils";
import { isAfterReading } from "../shared/utils/balance";
import { getPeriodDueDate, getPeriodKey, getPeriodStart, shiftPeriodStart } from "../features/bills/billsUtils";
import { computeDebtStatus, monthlyInstalment } from "../features/debts/debtsUtils";
import { debtCashRecords } from "../features/debts/debtCash";
import { coveredFundingVars } from "../features/budget/coveredFunding";
import { arrivalTransaction, incomeOccurrences, INCOMES_KEY, type Income } from "../features/incomes/incomesUtils";
import type { OccurrenceOverride } from "../features/plannerPage/plannerActuals";
import { transferRecords } from "../features/transactions/transfers";
import { PLANNER_KEYS } from "../features/plannerPage/plannerInputs";
import type { BudgetLine, OneOff } from "../features/plannerPage/plannerUtils";
import { TOUR_SEEN_KEY } from "../features/tour/tourState";
import { toISODay } from "../shared/utils/dates";
import { DEMO_EMAIL, DEMO_UID } from "./demoUser";

// ─── The demo's account ──────────────────────────────────────────────────────
//
// One invented person's money — no one's real names, cards or plans — a year
// of it (Statistics sets the last six months against the six before, and with
// only six there was nothing before: «+488% σε σχέση με πριν»), with every date counted back from `now` so it always looks
// like this week's. Everything is built the
// way the app itself writes it — a bill's payment through the same period keys,
// a salary through the same «Ήρθε» record, a loan's money through
// `debtCashRecords`, a transfer through `transferRecords` — so each screen finds
// what it would find on a real account, and nothing heals or migrates on open.
//
// What each screen should show, whatever day it is:
//
// - Bills: the home internet a few days late, the phone due within the week,
//   the rest paid or not yet due; electricity varies from month to month.
// - Incomes: a salary on the 30th and a studio's rent on the 5th, every one
//   that has come recorded as come; besides them two freelance jobs and a
//   refund.
// - Banks & cash: a bank, a card wallet, a savings account holding the goals'
//   money, and cash; two readings, the latest a few days old and 9,50 short —
//   a coffee that was never written down.
// - Goals: a trip to Sifnos built from parts, part of it paid by a friend who
//   is now owed for it; an emergency fund, two years from its date.
//   Investments: an index fund bought monthly.
// - Debts: a car loan with interest, paid monthly; a friend who owes 300 back
//   in a fortnight; the friend owed for the ferry.
// - Transactions: groceries, coffee at 3,50 often enough to be a «usual» with
//   its amount, fuel with its litres, eating out, transfers between accounts.
// - Planner: four monthly lines, three of them limits on categories, and a tax
//   refund expected next month.
//
// The figures are fixed per calendar day, not drawn afresh: the same day always
// shows the same coffee and the same supermarket bill.

export type DemoLanguage = "el" | "en";

/** The account, as the documents of each collection. */
export interface DemoData {
  user: User;
  categories: Category[];
  transactions: Transaction[];
  bills: Bill[];
  billPayments: BillPayment[];
  investmentGoals: InvestmentGoal[];
  investmentContributions: InvestmentContribution[];
  debts: Debt[];
  debtPayments: DebtPayment[];
}

/** The ids the rest of the account — and its tests — refer to. */
export const DEMO_IDS = {
  accounts: { main: "acc-main", card: "acc-card", savings: "acc-savings", cash: "acc-cash" },
  incomes: { salary: "inc-salary", rent: "inc-rent" },
  bills: { electricity: "bill-electricity", water: "bill-water", internet: "bill-internet", phone: "bill-phone", netflix: "bill-netflix", rent: "bill-rent" },
  /** The bill left unpaid past its day, and the one due within the week. */
  lateBill: "bill-internet",
  soonBill: "bill-phone",
  goals: { trip: "goal-sifnos", home: "goal-emergency", etf: "goal-etf" },
  debts: { car: "debt-car", friend: "debt-stelios", covered: "debt-despina" },
  checkIns: { first: "checkin-1", latest: "checkin-2" },
} as const;

/** The Planner's mark that the old Allocation page's buckets have been moved into it — see `allocationMigration`. */
export const ALLOCATION_MOVED_KEY = "allocation-moved-to-planner";

/** What the latest reading found missing: a coffee and a croissant nobody wrote down. */
export const DEMO_UNLOGGED = -9.5;

// ─── Words ───────────────────────────────────────────────────────────────────

const WORDS = {
  el: {
    firstName: "Κατερίνα",
    lastName: "Οικονόμου",
    accounts: { main: "Alpha Bank", card: "Viva Wallet", savings: "Πειραιώς Αποταμίευση", cash: "Μετρητά" },
    salary: "Μισθός",
    rentIncome: "Ενοίκιο γκαρσονιέρας",
    bills: { electricity: "ΔΕΗ", water: "ΕΥΔΑΠ", internet: "Cosmote Internet", phone: "Vodafone κινητό", netflix: "Netflix", rent: "Ενοίκιο σπιτιού" },
    market: "Λαϊκή",
    presents: "Δώρα",
    rental: "Ενοίκια",
    coffee: "Καφές",
    stores: ["Σκλαβενίτης", "Lidl", "Σκλαβενίτης", "ΑΒ Βασιλόπουλος"],
    eatingOut: ["Σουβλάκια", "Ταβέρνα «Το Στέκι»", "Πίτσα", "Sushi"],
    drinks: "Ποτό με φίλους",
    barber: "Κουρείο",
    pharmacy: "Φαρμακείο",
    cinema: "Σινεμά",
    present: "Δώρο γενεθλίων",
    freelance: "Μετάφραση (freelance)",
    refund: "Επιστροφή Skroutz",
    trip: "Ταξίδι στη Σίφνο",
    tripParts: ["Πλοίο", "Δωμάτια", "Φαγητό & βόλτες"],
    home: "Ταμείο έκτακτης ανάγκης",
    etf: "Παγκόσμιο ETF",
    bank: "Alpha Bank",
    carLoan: "Δάνειο αυτοκινήτου",
    friend: "Στέλιος",
    friendLoan: "Δανεικά για το νοίκι",
    coveredBy: "Δέσποινα",
    ferry: "Εισιτήρια πλοίου",
    atm: "Ανάληψη ΑΤΜ",
    lines: { groceries: "Σούπερ μάρκετ", out: "Καφές & έξοδοι", fuel: "Βενζίνη", other: "Διάφορα" },
    taxRefund: "Επιστροφή φόρου",
  },
  en: {
    firstName: "Katerina",
    lastName: "Oikonomou",
    accounts: { main: "Alpha Bank", card: "Viva Wallet", savings: "Piraeus Savings", cash: "Cash" },
    salary: "Salary",
    rentIncome: "Studio rent",
    bills: { electricity: "Electricity", water: "Water", internet: "Home internet", phone: "Mobile phone", netflix: "Netflix", rent: "Rent" },
    market: "Farmers' market",
    presents: "Presents",
    rental: "Rental income",
    coffee: "Coffee",
    stores: ["Sklavenitis", "Lidl", "Sklavenitis", "AB Vassilopoulos"],
    eatingOut: ["Souvlaki", "Taverna", "Pizza", "Sushi"],
    drinks: "Drinks with friends",
    barber: "Barber",
    pharmacy: "Pharmacy",
    cinema: "Cinema",
    present: "Birthday present",
    freelance: "Translation job (freelance)",
    refund: "Skroutz refund",
    trip: "Trip to Sifnos",
    tripParts: ["Ferry", "Rooms", "Food & outings"],
    home: "Emergency fund",
    etf: "Global ETF",
    bank: "Alpha Bank",
    carLoan: "Car loan",
    friend: "Stelios",
    friendLoan: "Loan for his rent",
    coveredBy: "Despina",
    ferry: "Ferry tickets",
    atm: "ATM withdrawal",
    lines: { groceries: "Groceries", out: "Coffee & going out", fuel: "Fuel", other: "Everything else" },
    taxRefund: "Tax refund",
  },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A fixed number in [0, 1) for a calendar day and a purpose: the same day always draws the same. */
function draw(day: Date, salt: number): number {
  const seed = day.getFullYear() * 10_000 + (day.getMonth() + 1) * 100 + day.getDate() + salt * 7919;
  const x = Math.sin(seed) * 43_758.5453;
  return x - Math.floor(x);
}

const amountOn = (day: Date, salt: number, min: number, max: number) => round2(min + draw(day, salt) * (max - min));

/** The day at a time of day, local. */
const at = (day: Date, hours: number, minutes = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);

/** The id of a shared default category, from its English name and type. */
const defaultCategoryId = (name: string, type: TransactionType) => `cat-${type}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

// ─── The account ─────────────────────────────────────────────────────────────

export function demoData(lang: DemoLanguage, now: Date = new Date()): DemoData {
  const w = WORDS[lang];
  const ids = DEMO_IDS;
  const userId = DEMO_UID;
  const today = startOfDay(now);
  /** The first day with records: the 1st, twelve months back. */
  const start = startOfMonth(subMonths(now, 12));
  const happened = (date: Date) => date.getTime() <= now.getTime();

  // ── Categories ──
  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({
    ...c,
    id: defaultCategoryId(c.name, c.type as TransactionType),
    type: c.type as TransactionType,
    createdAt: subMonths(start, 24),
    updatedAt: subMonths(start, 24),
  }));
  const custom = (id: string, name: string, type: TransactionType, icon: string, color: string): Category => ({ id, name, type, icon, color, isDefault: false, userId, createdAt: subMonths(start, 6), updatedAt: subMonths(start, 6) });
  categories.push(custom("cat-market", w.market, "expense", "🥬", "#65A30D"), custom("cat-presents", w.presents, "expense", "🎁", "#DB2777"), custom("cat-rental", w.rental, "income", "🏠", "#0EA5E9"));
  const cat = (name: string, type: TransactionType = "expense") => defaultCategoryId(name, type);

  // ── Banks & cash ──
  const accounts: MoneyAccount[] = [
    { id: ids.accounts.main, name: w.accounts.main, kind: "bank", main: true, color: "blue" },
    { id: ids.accounts.card, name: w.accounts.card, kind: "bank", color: "purple" },
    { id: ids.accounts.savings, name: w.accounts.savings, kind: "bank", color: "teal" },
    { id: ids.accounts.cash, name: w.accounts.cash, kind: "cash" },
  ];

  // ── Records ──
  const transactions: Transaction[] = [];
  let txCount = 0;
  /** A record as the app stores it, written a few minutes after the moment it is dated — never after now. */
  const record = (fields: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: Date }) => {
    const { id, createdAt, ...rest } = fields;
    const written = createdAt ?? new Date(Math.min(rest.date.getTime() + 5 * 60_000, now.getTime()));
    const row = { ...rest, id: id ?? `demo-tx-${String(++txCount).padStart(4, "0")}`, userId, createdAt: written, updatedAt: written } as Transaction;
    transactions.push(row);
    return row;
  };
  const transfer = (key: string, from: string, to: string, amount: number, date: Date, label: string) => {
    if (!happened(date) || date < start) return;
    for (const half of transferRecords({ id: `${key}-${toISODay(date)}`, from, to, amount, date, label })) record(half);
  };

  // Every month in the window, the 1st of it.
  const months: Date[] = [];
  for (let m = start; m <= now; m = addMonths(m, 1)) months.push(m);
  const dayOf = (month: Date, day: number) => new Date(month.getFullYear(), month.getMonth(), Math.min(day, endOfMonth(month).getDate()));

  // ── Incomes ──
  const incomes: Income[] = [
    { id: ids.incomes.salary, name: w.salary, kind: "salary", amount: 1720, frequency: "monthly", day: 30, start: toISODay(subMonths(start, 30)).slice(0, 7), accountId: ids.accounts.main, categoryId: cat("Salary", "income"), isSalary: true },
    { id: ids.incomes.rent, name: w.rentIncome, kind: "rent", amount: 350, frequency: "monthly", day: 5, start: toISODay(subMonths(start, 14)).slice(0, 7), accountId: ids.accounts.main, categoryId: "cat-rental" },
  ];
  for (const income of incomes) {
    for (const occurrence of incomeOccurrences(income, start, now)) {
      // The salary lands overnight, as banks credit it; the rent when the tenant sends it.
      const date = income.isSalary ? at(occurrence.date, 0) : at(occurrence.date, 11, 30);
      if (!happened(date)) continue;
      record(arrivalTransaction(income, occurrence, { amount: income.amount, date, categoryId: income.categoryId!, accountId: income.accountId }));
    }
  }

  // ── Goals and the index fund ──
  const tripDeadline = (() => {
    const july = new Date(now.getFullYear(), 6, 10);
    return july < addMonths(now, 4) ? new Date(now.getFullYear() + 1, 6, 10) : july;
  })();
  const goalCreated = (monthsBack: number) => subMonths(start, monthsBack);
  // The trip began to be saved for seven months ago: with a year of records it
  // would otherwise be full (13 × 80 € and the friend's 160 € make 1.200 €), and
  // the goal shown off is one on its way.
  const tripFrom = startOfMonth(subMonths(now, 6));
  const investmentGoals: InvestmentGoal[] = [
    {
      id: ids.goals.trip,
      userId,
      name: w.trip,
      icon: "🏝️",
      color: "#0EA5E9",
      goalType: "targeted",
      targetAmount: 1200,
      targetPeriod: "custom",
      deadline: tripDeadline,
      parts: [
        { id: "part-ferry", label: w.tripParts[0], min: 120, max: 160 },
        { id: "part-rooms", label: w.tripParts[1], min: 600, max: 760 },
        { id: "part-food", label: w.tripParts[2], min: 200, max: 280 },
      ],
      isActive: true,
      isCompleted: false,
      createdAt: tripFrom,
      updatedAt: tripFrom,
    },
    {
      id: ids.goals.home,
      userId,
      name: w.home,
      icon: "🛟",
      color: "#10B981",
      goalType: "targeted",
      targetAmount: 8000,
      targetPeriod: "custom",
      deadline: new Date(now.getFullYear() + 2, 11, 31),
      isActive: true,
      isCompleted: false,
      createdAt: goalCreated(8),
      updatedAt: goalCreated(8),
    },
    { id: ids.goals.etf, userId, name: w.etf, icon: "📈", color: "#6366F1", goalType: "open_ended", isActive: true, isCompleted: false, createdAt: goalCreated(6), updatedAt: goalCreated(6) },
  ];
  const goalName = (goalId: string) => investmentGoals.find((g) => g.id === goalId)!.name;

  const investmentContributions: InvestmentContribution[] = [];
  /**
   * A deposit and the record that mirrors it, as `useAddContribution` writes
   * them. Into a savings goal the money stays in the bank it is kept in; into
   * the fund it leaves for the broker.
   */
  const contribute = (goalId: string, amount: number, date: Date, accountId: string) => {
    if (!happened(date)) return;
    const n = investmentContributions.length + 1;
    const savings = goalId !== ids.goals.etf;
    const contribution: InvestmentContribution = { id: `demo-contribution-${n}`, userId, goalId, amount, contributionType: "deposit", date, accountId, createdAt: date, updatedAt: date };
    investmentContributions.push(contribution);
    record({
      id: `demo-goal-tx-${n}`,
      amount,
      type: "investment",
      categoryId: "",
      date,
      description: goalName(goalId),
      isInvestmentTransaction: true,
      isGoalTransaction: savings,
      goalId,
      goalName: goalName(goalId),
      contributionType: "deposit",
      accountId,
    });
  };
  // Before the window: what the goals and the fund held when the records begin.
  contribute(ids.goals.home, 2500, at(goalCreated(8), 10), ids.accounts.savings);
  for (let k = 6; k >= 1; k--) {
    const month = subMonths(start, k);
    if (k <= 4) contribute(ids.goals.home, 150, at(month, 9, 35), ids.accounts.savings);
    contribute(ids.goals.etf, 50, at(dayOf(month, 2), 10), ids.accounts.main);
  }
  /** Money in savings goals when the records begin — kept in the savings account. */
  const heldAtStart = round2(investmentContributions.filter((c) => c.goalId !== ids.goals.etf).reduce((sum, c) => sum + c.amount, 0));

  // ── Every month in the window ──
  for (const month of months) {
    transfer("xfer-card", ids.accounts.main, ids.accounts.card, 120, at(month, 9, 10), `${w.accounts.main} → ${w.accounts.card}`);
    transfer("xfer-savings", ids.accounts.main, ids.accounts.savings, 230, at(month, 9, 20), `${w.accounts.main} → ${w.accounts.savings}`);
    if (month >= tripFrom) contribute(ids.goals.trip, 80, at(month, 9, 30), ids.accounts.savings);
    contribute(ids.goals.home, 150, at(month, 9, 35), ids.accounts.savings);
    contribute(ids.goals.etf, 50, at(dayOf(month, 2), 10), ids.accounts.main);
    transfer("xfer-atm", ids.accounts.main, ids.accounts.cash, 100, at(dayOf(month, 3), 13), w.atm);

    const once = (day: number, hour: number, fields: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt" | "date">) => {
      const date = at(dayOf(month, day), hour);
      if (happened(date)) record({ ...fields, date });
    };
    once(12, 20, { amount: amountOn(month, 31, 24, 64), type: "expense", categoryId: cat("Skroutz"), description: "Skroutz", accountId: ids.accounts.main });
    once(20, 18, { amount: amountOn(month, 37, 7.5, 21), type: "expense", categoryId: cat("Healthcare"), description: w.pharmacy, accountId: ids.accounts.main });
    once(23, 21, { amount: 18, type: "expense", categoryId: cat("Entertainment"), description: w.cinema, accountId: ids.accounts.card });
  }
  // What does not come every month: a present, two freelance jobs, a refund.
  record({ amount: 35, type: "expense", categoryId: "cat-presents", description: w.present, date: at(addDays(today, -26), 17), accountId: ids.accounts.card });
  record({ amount: 380, type: "income", categoryId: cat("Freelance", "income"), description: w.freelance, date: at(addDays(today, -52), 12), accountId: ids.accounts.main });
  record({ amount: 240, type: "income", categoryId: cat("Freelance", "income"), description: w.freelance, date: at(addDays(today, -146), 12), accountId: ids.accounts.main });
  record({ amount: 24.9, type: "income", categoryId: cat("Other Income", "income"), description: w.refund, date: at(addDays(today, -73), 10), accountId: ids.accounts.main });

  // ── Every day in the window ──
  const fuelPlaces = ["Shell", "EKO", "BP"];
  for (let day = start, i = 0; day <= today; day = addDays(day, 1), i++) {
    const weekday = day.getDay();
    const add = (hour: number, minutes: number, fields: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt" | "date">) => {
      const date = at(day, hour, minutes);
      if (happened(date)) record({ ...fields, date });
    };
    // Coffee with a colleague on Thursdays, always 3,50.
    if (weekday === 4) add(8, 15, { amount: 3.5, type: "expense", categoryId: cat("Coffee"), description: w.coffee, accountId: ids.accounts.cash });
    // The supermarket on Wednesdays, the farmers' market every other Saturday.
    if (weekday === 3) add(19, 0, { amount: amountOn(day, 3, 34, 78), type: "expense", categoryId: cat("Groceries"), description: w.stores[Math.floor(i / 7) % w.stores.length], accountId: ids.accounts.main });
    if (weekday === 6 && Math.floor(i / 7) % 2 === 1) add(11, 0, { amount: amountOn(day, 6, 11, 24), type: "expense", categoryId: "cat-market", description: w.market, accountId: ids.accounts.cash });
    // Out every other Friday; drinks once in four weeks.
    if (weekday === 5 && Math.floor(i / 7) % 2 === 0) add(21, 30, { amount: amountOn(day, 5, 18, 38), type: "expense", categoryId: cat("Dining Out"), description: w.eatingOut[Math.floor(i / 14) % w.eatingOut.length], accountId: ids.accounts.card });
    if (weekday === 6 && Math.floor(i / 7) % 4 === 0) add(23, 0, { amount: amountOn(day, 9, 12, 22), type: "expense", categoryId: cat("Drinks Out"), description: w.drinks, accountId: ids.accounts.card });
    // Fuel every twelve days, with what the pump said.
    if (i % 12 === 4) {
      const amount = amountOn(day, 11, 45, 60);
      const pricePerUnit = round2(1.79 + draw(day, 12) * 0.12);
      const place = fuelPlaces[Math.floor(i / 12) % fuelPlaces.length];
      add(18, 10, { amount, type: "expense", categoryId: cat("Fuel"), description: place, accountId: ids.accounts.main, metadata: { fuelType: "petrol", pricePerUnit, quantity: round2(amount / pricePerUnit), totalCost: amount, place } });
    }
    // The barber, every four weeks.
    if (i % 28 === 10) add(12, 0, { amount: 15, type: "expense", categoryId: cat("Personal Care"), description: w.barber, accountId: ids.accounts.cash });
  }

  // ── Bills ──
  const lateDue = addDays(today, -6);
  // Three days on, or the month's last day when three days on is next month:
  // past the turn of the month this period would already be paid.
  const soonDue = (() => {
    const inThree = addDays(today, 3);
    return inThree.getMonth() === today.getMonth() ? inThree : endOfMonth(today);
  })();
  const bill = (id: string, name: string, categoryId: string, amount: number, dueDay: number, extra: Partial<Bill> = {}): Bill => ({
    id,
    userId,
    name,
    amount,
    categoryId,
    frequency: "monthly",
    dueDay,
    anchorDate: start,
    isActive: true,
    createdAt: start,
    updatedAt: start,
    ...extra,
  });
  const bills: Bill[] = [
    bill(ids.bills.electricity, w.bills.electricity, cat("Electricity"), 70, 18, { isVariableAmount: true, graceDays: 20, icon: "⚡" }),
    bill(ids.bills.water, w.bills.water, cat("Water"), 38.6, 12, { intervalCount: 4, graceDays: 15, icon: "💧" }),
    bill(ids.bills.internet, w.bills.internet, cat("Internet"), 32.9, lateDue.getDate(), { icon: "🌐" }),
    bill(ids.bills.phone, w.bills.phone, cat("Subscriptions"), 15, soonDue.getDate(), { icon: "📱" }),
    bill(ids.bills.netflix, w.bills.netflix, cat("Subscriptions"), 13.99, 8, { icon: "🎬" }),
    bill(ids.bills.rent, w.bills.rent, cat("Rent"), 450, 3, { icon: "🏠" }),
  ];
  const electricityBills = [58.4, 71.25, 66.1, 74.9, 62.35, 81.7, 69.45];

  const billPayments: BillPayment[] = [];
  for (const b of bills) {
    let period = getPeriodStart(b, start);
    for (let n = 0; period <= now; n++, period = shiftPeriodStart(b, period, 1)) {
      const due = getPeriodDueDate(b, period);
      if (!due) continue;
      const key = getPeriodKey(b, period);
      // Left unpaid on purpose: the late one, and the one coming up.
      if (b.id === ids.lateBill && key === getPeriodKey(b, lateDue)) continue;
      if (b.id === ids.soonBill && key === getPeriodKey(b, soonDue)) continue;
      // Paid on the day once it has come; a week or less ahead it is paid early,
      // as people do, so only the two above ask for anything. Further off, not yet.
      let paidDate: Date;
      if (due <= today) paidDate = at(due, 10);
      else if (due <= addDays(today, 7)) paidDate = at(today, 7) <= now ? at(today, 7) : at(addDays(today, -1), 19);
      else continue;
      if (!happened(paidDate)) paidDate = new Date(now.getTime() - 60_000);
      const amount = b.isVariableAmount ? electricityBills[n % electricityBills.length] : b.amount;
      const expense = record({ amount, type: "expense", categoryId: b.categoryId, date: paidDate, description: b.name, billId: b.id });
      billPayments.push({ id: `demo-billpay-${b.id}-${key}`, userId, billId: b.id, periodKey: key, amount, paidDate, transactionId: expense.id, createdAt: expense.createdAt });
    }
  }

  // ── Debts ──
  const debts: Debt[] = [];
  const debtPayments: DebtPayment[] = [];

  // The car: borrowed before the records begin, so the loan itself moved
  // nothing here; the repayments since then come out of the main bank.
  const carTaken = dayOf(subMonths(today, 14), 10);
  const instalment = round2(monthlyInstalment(8000, 6.9, 48));
  debts.push({ id: ids.debts.car, userId, person: w.bank, direction: "owed_by_me", label: w.carLoan, amount: 8000, date: carTaken, interestRate: 6.9, termMonths: 48, rateType: "fixed", createdAt: carTaken, updatedAt: carTaken });
  for (let k = 1; ; k++) {
    const date = at(dayOf(addMonths(carTaken, k), 10), 8);
    if (!happened(date)) break;
    debtPayments.push({ id: `demo-debtpay-car-${k}`, userId, debtId: ids.debts.car, amount: instalment, date, ...(date >= start ? { accountId: "" } : {}), createdAt: date });
  }

  // Lent to a friend from the main bank, due back in a fortnight.
  const lentOn = at(addDays(today, -40), 19);
  debts.push({ id: ids.debts.friend, userId, person: w.friend, direction: "owed_to_me", label: w.friendLoan, amount: 300, date: lentOn, dueDate: addDays(today, 12), accountId: "", createdAt: lentOn, updatedAt: lentOn });

  // A friend paid the ferry for the trip: the goal's deposit, the debt to him and
  // the expense, as «Κάποιος πλήρωσε για μένα» writes them.
  const coveredOn = at(addDays(today, -18), 14);
  const covered = coveredFundingVars({ goal: { id: ids.goals.trip, name: w.trip }, who: w.coveredBy, amount: 160, date: coveredOn, categoryId: cat("Travel"), notes: w.ferry, expenseNotes: w.ferry });
  const coveredExpense = record({ ...covered.expense, id: "demo-covered-expense" } as Transaction);
  investmentContributions.push({ ...covered.contribution, id: "demo-contribution-covered", userId, debtId: ids.debts.covered, createdAt: coveredOn, updatedAt: coveredOn });
  debts.push({ ...covered.debt, id: ids.debts.covered, userId, coveredExpenseId: coveredExpense.id, createdAt: coveredOn, updatedAt: coveredOn });

  // Each debt's money, exactly as `syncDebtCash` would write it.
  for (const debt of debts) {
    for (const { id, createdAt, ...cash } of debtCashRecords(computeDebtStatus(debt, debtPayments, now), now).records) record({ ...cash, id, createdAt });
  }

  // ── Readings of the banks ──
  // What each account held when the records begin. The savings account holds
  // the goals' money and a little of its own; the rest is spendable.
  const opening: Record<string, number> = { [ids.accounts.main]: 1640, [ids.accounts.card]: 120, [ids.accounts.cash]: 85, [ids.accounts.savings]: round2(heldAtStart + 300) };
  const spendableAtStart = round2(1640 + 120 + 85 + 300);
  const main = mainAccount(accounts);
  const inWindow = transactions.filter((tx) => tx.date >= start);
  /** Each account as a reading at `when` would find it, from the records alone. */
  const balancesAt = (when: Date) => {
    const amounts = { ...opening };
    for (const tx of inWindow) {
      if (isAfterReading(tx, when)) continue;
      const account = accountOf(tx, accounts, main)!;
      amounts[account] = round2((amounts[account] ?? 0) + realDelta(tx));
    }
    return amounts;
  };
  const firstAt = at(addDays(today, -35), 21);
  const latestAt = at(addDays(today, -3), 21, 30);
  const latest = balancesAt(latestAt);
  latest[ids.accounts.cash] = round2(latest[ids.accounts.cash] + DEMO_UNLOGGED);
  const checkIns: BalanceCheckIn[] = [
    { id: ids.checkIns.first, at: firstAt.toISOString(), amounts: balancesAt(firstAt) },
    { id: ids.checkIns.latest, at: latestAt.toISOString(), amounts: latest },
  ];

  // ── The planner ──
  const lines: BudgetLine[] = [
    { id: "line-groceries", label: w.lines.groceries, amount: 320, kind: "expense", categoryIds: [cat("Groceries"), "cat-market"] },
    { id: "line-out", label: w.lines.out, amount: 200, kind: "expense", categoryIds: [cat("Coffee"), cat("Dining Out"), cat("Drinks Out")] },
    { id: "line-fuel", label: w.lines.fuel, amount: 160, kind: "expense", categoryIds: [cat("Fuel")] },
    { id: "line-other", label: w.lines.other, amount: 120, kind: "expense" },
  ];
  const oneOffs: OneOff[] = [{ id: "oneoff-tax", label: w.taxRefund, amount: 240, date: toISODay(dayOf(addMonths(today, 1), 20)) }];

  // Each income's next one already answered «όχι ακόμα». The latest reading is
  // three days old, so in the last days before the 30th the app would ask
  // whether the salary had come early — and leave it out of «Βγαίνεις ως τον
  // μισθό» until answered, which on a first look reads as a wrong figure. The
  // same answer the question itself stores (`answerUnconfirmed`, "waiting").
  const occurrences: Record<string, OccurrenceOverride> = {};
  for (const income of incomes) {
    const next = incomeOccurrences(income, today, addMonths(today, 2)).find((o) => startOfDay(o.date) >= today);
    if (next) occurrences[next.key] = { state: "waiting" };
  }

  const user: User = {
    id: userId,
    email: DEMO_EMAIL,
    username: w.firstName,
    firstName: w.firstName,
    lastName: w.lastName,
    currency: "EUR",
    baseCurrency: "EUR",
    locale: lang,
    // The figure the records start from: what could be spent on their first day.
    openingBalance: spendableAtStart,
    openingBalanceDate: start,
    workspace: {
      [ACCOUNTS_KEY]: accounts,
      [CHECK_INS_KEY]: checkIns,
      [INCOMES_KEY]: incomes,
      [PLANNER_KEYS.lines]: lines,
      [PLANNER_KEYS.oneOffs]: oneOffs,
      [PLANNER_KEYS.occurrences]: occurrences,
      // Made after the Allocation page was folded into the Planner, so there is
      // nothing to move. Without the mark the Planner moves nothing and writes
      // it on its first open — and an account written to is no longer made
      // again in the other language when the visitor switches (`demoSession`).
      // `ALLOCATION_KEYS.moved`, written out: the module that holds it brings
      // the data layer and Firebase with it, which must load after the demo is
      // decided (a test holds the two to the same word).
      [ALLOCATION_MOVED_KEY]: true,
      // The welcome carousel is for a new account, not for a look around.
      [TOUR_SEEN_KEY]: true,
    },
    createdAt: subMonths(start, 30),
    updatedAt: today,
  };

  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { user, categories, transactions, bills, billPayments, investmentGoals, investmentContributions, debts, debtPayments };
}

/**
 * The account as Firestore holds it: collection → id → fields. The id is the
 * document's name, not one of its fields — except on the user, whose document
 * has always carried its own. Fields left undefined are dropped, as the data
 * layer's `clean()` drops them before every write.
 */
export function demoCollections(data: DemoData): Record<string, Record<string, Record<string, unknown>>> {
  const clean = (fields: object) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map(({ id, ...fields }) => [id, clean(fields)]));
  return {
    users: { [data.user.id]: clean(data.user) },
    categories: byId(data.categories),
    transactions: byId(data.transactions),
    bills: byId(data.bills),
    billPayments: byId(data.billPayments),
    investmentGoals: byId(data.investmentGoals),
    investmentContributions: byId(data.investmentContributions),
    debts: byId(data.debts),
    debtPayments: byId(data.debtPayments),
  };
}

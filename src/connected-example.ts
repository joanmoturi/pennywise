import {
  initialState,
  today,
  uid,
  addDays,
  type State,
  type Transaction,
} from "./domain";
import { parseMoney } from "./money";
import {
  recordDistribution,
  reallocateBudget,
  returnAllowanceSavings,
} from "./connected-finance";

export function untouchedWorkspace(s: State) {
  const defaults = initialState();
  return (
    s.revision === 0 &&
    !s.settings.setup &&
    !s.settings.demo &&
    s.budgets.length === defaults.budgets.length &&
    s.budgets.every(
      (b, i) =>
        b.name === defaults.budgets[i].name &&
        !b.allocations.length &&
        b.notes === defaults.budgets[i].notes &&
        !b.archived &&
        !b.rollover,
    ) &&
    Object.entries(s).every(
      ([key, value]) =>
        !Array.isArray(value) || key === "budgets" || value.length === 0,
    ) &&
    !s.notifications.inbox.length &&
    !s.notifications.rules.length &&
    !s.notifications.sources.length
  );
}
export function connectedExample(): State {
  const s = initialState();
  s.settings.setup = true;
  s.settings.demo = true;
  const bank = uid(),
    savings = uid(),
    company = uid(),
    companyBank = uid(),
    planId = uid(),
    budgetId = uid();
  s.accounts.push(
    {
      id: bank,
      name: "TEST personal bank",
      kind: "bank",
      opening: parseMoney("1000000"),
      restricted: 0,
      notes: "Fictional example only",
    },
    {
      id: savings,
      name: "TEST personal savings",
      kind: "savings",
      opening: parseMoney("20000"),
      restricted: 0,
      notes: "Fictional example only",
    },
    {
      id: companyBank,
      name: "TEST business bank",
      kind: "bank",
      businessId: company,
      opening: 0,
      restricted: 0,
      notes: "Fictional business-owned account",
    },
  );
  s.businesses.push({
    id: company,
    name: "TEST shared business",
    ownershipBps: 5000,
    partners: [{ name: "TEST partner", ownershipBps: 5000 }],
    openingRetainedProfit: 0,
    notes: "Fictional ownership, not a financial assumption",
  });
  const transaction = (
    type: Transaction["type"],
    amount: string,
    category: string,
    accountId = bank,
    extra: Partial<Transaction> = {},
  ) =>
    s.transactions.push({
      id: uid(),
      type,
      amount: parseMoney(amount),
      date: today(),
      accountId,
      description: `TEST ${category}`,
      category,
      subcategory: "",
      notes: "Fictional preview example",
      paymentMethod: "",
      recurringReference: "",
      ...extra,
    });
  transaction("income", "100000", "Salary");
  transaction("income", "200000", "Business revenue", companyBank);
  transaction("expense", "40000", "Business operating costs", companyBank);
  recordDistribution(s, {
    id: uid(),
    businessId: company,
    accountId: companyBank,
    destinationId: bank,
    amount: parseMoney("60000"),
    date: today(),
  });
  recordDistribution(s, {
    id: uid(),
    businessId: company,
    accountId: companyBank,
    partnerName: "TEST partner",
    amount: parseMoney("20000"),
    date: today(),
  });
  const period = s.budgets[0];
  const budget = {
    ...structuredClone(period),
    id: budgetId,
    profileId: budgetId,
    name: "Allowance: TEST monthly plan",
    allocations: [
      ["Rent", "25000", "spending"],
      ["Groceries", "15000", "spending"],
      ["Transport", "10000", "spending"],
      ["Personal", "10000", "spending"],
      ["Savings", "30000", "savings"],
      ["Miscellaneous", "10000", "spending"],
    ].map(([category, amount, purpose]) => ({
      category,
      amount: parseMoney(amount),
      purpose: purpose as "spending" | "savings",
      essential: ["Rent", "Groceries", "Transport"].includes(category),
      priority: 1,
      rolloverRule: "none" as const,
      rolloverAmount: 0,
    })),
  };
  s.budgets.push(budget);
  s.allowances.push({
    id: planId,
    name: "TEST monthly plan",
    budgetId,
    accountId: bank,
    amount: parseMoney("100000"),
    notes: "Fictional existing-cash plan",
  });
  s.settings.activeBudgetId = budgetId;
  transaction("expense", "17000", "Groceries");
  transaction("expense", "3000", "Unexpected repair");
  transaction("expense", "6000", "Personal");
  reallocateBudget(s, {
    id: uid(),
    budgetId,
    date: today(),
    reason: "TEST fund unexpected repair",
    moves: [
      {
        from: "Miscellaneous",
        to: "Unexpected repair",
        amount: parseMoney("1000"),
      },
      {
        from: "Transport",
        to: "Unexpected repair",
        amount: parseMoney("2000"),
      },
    ],
  });
  reallocateBudget(s, {
    id: uid(),
    budgetId,
    date: today(),
    reason: "TEST cover grocery overspend",
    moves: [
      { from: "Miscellaneous", to: "Groceries", amount: parseMoney("2000") },
    ],
  });
  const debtId = uid(),
    loanId = uid();
  s.liabilities.push({
    id: debtId,
    name: "TEST creditor",
    principal: parseMoney("20000"),
    date: today(),
    due: addDays(today(), 20),
    priority: 1,
    accountId: bank,
    source: "",
    notes: "Pre-existing, already reflected in opening cash",
  });
  s.receivables.push({
    id: loanId,
    name: "TEST borrower",
    principal: parseMoney("10000"),
    date: today(),
    due: addDays(today(), 20),
    priority: 1,
    accountId: bank,
    source: "",
    notes: "Pre-existing loan, not available cash",
    interestBps: 0,
    writtenOff: false,
  });
  transaction("liability_repayment", "5000", "Debt repayment", bank, {
    relatedId: debtId,
  });
  transaction("loan_recovery", "3000", "Loan recovery", bank, {
    relatedId: loanId,
  });
  transaction("transfer", "30000", "Savings", bank, {
    destinationId: savings,
    allowanceId: planId,
  });
  returnAllowanceSavings(s, {
    id: uid(),
    allowanceId: planId,
    category: "Personal",
    amount: parseMoney("4000"),
    destinationId: savings,
    date: today(),
  });
  const incomeId = uid();
  s.incomes.push({
    id: incomeId,
    name: "TEST future business distribution",
    businessId: company,
    sourceAccountId: companyBank,
    accountId: bank,
    type: "Investment distribution",
    amount: parseMoney("10000"),
    frequency: "one-off",
    reliability: "uncertain",
    active: true,
    description: "Projected, not actual cash",
    taxBps: 0,
    notes: "Fictional example",
  });
  s.events.push({
    id: uid(),
    sourceId: incomeId,
    kind: "income",
    due: addDays(today(), 14),
    amount: parseMoney("10000"),
    status: "expected",
    reliability: "uncertain",
    notes: "TEST projected distribution",
  });
  return s;
}

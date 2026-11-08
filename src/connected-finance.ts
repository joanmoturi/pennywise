import {
  today,
  type State,
  type Transaction,
  type Budget,
  type BudgetChange,
  type SavingsCapture,
} from "./domain";
import { sum, ratio } from "./money";
import { restrictedValue } from "./currency";
import {
  accountBalances,
  outstanding,
  budgetActual,
  rolloverAmount,
  reserveBalance,
} from "./engine";
import {
  effectiveAllocations,
  captured,
  commitCapture,
} from "./expense-engine";

export function businessForAccount(s: State, accountId: string) {
  return s.accounts.find((a) => a.id === accountId)?.businessId;
}
export function personalIncome(s: State, t: Transaction) {
  return (
    (t.type === "income" && !businessForAccount(s, t.accountId)) ||
    (t.type === "transfer" && t.businessMovement === "owner_distribution")
  );
}
export function personalExpense(s: State, t: Transaction) {
  return t.type === "expense" && !businessForAccount(s, t.accountId);
}
export function businessStats(s: State, businessId: string, asOf = today()) {
  const business = s.businesses.find((b) => b.id === businessId);
  if (!business) throw new Error("Business not found");
  const accounts = s.accounts.filter((a) => a.businessId === businessId);
  const ids = new Set(accounts.map((a) => a.id));
  const txs = s.transactions.filter(
    (t) => ids.has(t.accountId) && t.date <= asOf,
  );
  const revenue = sum(
    txs.filter((t) => t.type === "income").map((t) => t.amount),
  );
  const expenses = sum(
    txs
      .filter((t) => t.type === "expense" && !t.businessMovement)
      .map((t) => t.amount),
  );
  const profit = sum([business.openingRetainedProfit, revenue, -expenses]);
  const ownerDistributions = sum(
    txs
      .filter((t) => t.businessMovement === "owner_distribution")
      .map((t) => t.amount),
  );
  const partnerDistributions = sum(
    txs
      .filter((t) => t.businessMovement === "partner_distribution")
      .map((t) => t.amount),
  );
  const balances = accountBalances(s, asOf);
  const cash = sum(
    accounts
      .filter((a) => a.kind !== "investment")
      .map((a) => balances.get(a.id)!),
  );
  const liabilities = sum(
    s.liabilities
      .filter((r) => ids.has(r.accountId) && r.date <= asOf)
      .map((r) => outstanding(s, r.id, "liability", asOf)),
  );
  const protectedCash = sum([
    ...accounts
      .filter((a) => a.kind !== "investment")
      .map((a) =>
        a.kind === "savings"
          ? Math.max(0, balances.get(a.id)!)
          : restrictedValue(s, a),
      ),
    ...s.reserves
      .filter((r) => ids.has(r.accountId))
      .map((r) => reserveBalance(s, r.id, asOf)),
  ]);
  return {
    revenue,
    expenses,
    profit,
    ownerDistributions,
    partnerDistributions,
    retained: sum([profit, -ownerDistributions, -partnerDistributions]),
    indicativeShare: ratio(profit, business.ownershipBps),
    cash,
    liabilities,
    availableCash: Math.max(0, sum([cash, -protectedCash, -liabilities])),
  };
}
export function recordDistribution(
  s: State,
  input: {
    id: string;
    businessId: string;
    accountId: string;
    destinationId?: string;
    amount: number;
    date: string;
    partnerName?: string;
    relatedId?: string;
    eventId?: string;
  },
  post = true,
): Transaction {
  if (s.transactions.some((t) => t.id === input.id))
    throw new Error("This distribution was already recorded.");
  const business = s.businesses.find((b) => b.id === input.businessId);
  const source = s.accounts.find(
    (a) => a.id === input.accountId && a.businessId === input.businessId,
  );
  if (!business || !source)
    throw new Error("Choose this business's source account.");
  const cash =
    accountBalances(s).get(source.id)! -
    restrictedValue(s, source) -
    sum(
      s.reserves
        .filter((r) => r.accountId === source.id)
        .map((r) => reserveBalance(s, r.id)),
    );
  const position = businessStats(s, business.id);
  if (
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    input.amount > cash ||
    input.amount > position.retained ||
    input.amount > position.availableCash ||
    source.kind === "investment" ||
    source.kind === "savings"
  )
    throw new Error(
      "Distribution exceeds retained profit or unrestricted business cash.",
    );
  const partner = Boolean(input.partnerName);
  if (
    partner
      ? !business.partners.some((p) => p.name === input.partnerName)
      : !s.accounts.some(
          (a) =>
            a.id === input.destinationId &&
            !a.businessId &&
            a.kind !== "investment",
        )
  )
    throw new Error(
      "Choose a recorded partner or your personal receiving account.",
    );
  const transaction: Transaction = {
    id: input.id,
    type: partner ? "expense" : "transfer",
    accountId: source.id,
    ...(partner
      ? { partnerName: input.partnerName }
      : { destinationId: input.destinationId }),
    ...(!partner || input.relatedId
      ? { relatedId: input.relatedId ?? business.id }
      : {}),
    ...(input.eventId ? { eventId: input.eventId } : {}),
    businessMovement: partner ? "partner_distribution" : "owner_distribution",
    amount: input.amount,
    date: input.date,
    description:
      `Distribution: ${business.name}${partner ? ` / ${input.partnerName}` : " / to me"}`.slice(
        0,
        160,
      ),
    category: "Business distribution",
    subcategory: "",
    paymentMethod: "",
    recurringReference: "",
    notes: "",
  };
  if (post) s.transactions.push(transaction);
  return transaction;
}
export function categoryPosition(s: State, b: Budget, category: string) {
  const allocation = effectiveAllocations(s, b).find(
    (a) => a.category === category,
  );
  const planned = sum([
    allocation?.amount ?? 0,
    rolloverAmount(s, b, category),
  ]);
  const spent = budgetActual(s, b, category);
  const decided = captured(s, b.id, category);
  return {
    planned,
    spent,
    decided,
    remaining: sum([planned, -spent, -decided]),
    status: !allocation
      ? "Unbudgeted"
      : spent > planned
        ? "Over budget"
        : planned > 0 && spent >= planned * 0.8
          ? "Nearing limit"
          : "On track",
  };
}
export function reallocateBudget(s: State, change: BudgetChange) {
  const b = s.budgets.find((b) => b.id === change.budgetId && !b.archived);
  if (!b || b.start > today() || b.end < today())
    throw new Error("Reallocate only an open current-period budget.");
  if (
    !change.moves.length ||
    !change.reason.trim() ||
    change.date < b.start ||
    change.date > b.end ||
    change.date > today()
  )
    throw new Error(
      "Add funding moves, a reason and a valid current-period date.",
    );
  if (s.budgetChanges.some((r) => r.id === change.id))
    throw new Error("This reallocation was already saved.");
  if (change.reversalOf) {
    const original = s.budgetChanges.find(
      (r) => r.id === change.reversalOf && !r.reversalOf,
    );
    if (
      !original ||
      original.budgetId !== b.id ||
      s.budgetChanges.some((r) => r.reversalOf === original.id) ||
      JSON.stringify(change.moves) !==
        JSON.stringify(
          original.moves.map((m) => ({
            from: m.to,
            to: m.from,
            amount: m.amount,
          })),
        )
    )
      throw new Error("Invalid or already reversed reallocation.");
  }
  const requested = new Map<string, number>();
  const allCategories = new Set(
    effectiveAllocations(s, b).map((a) => a.category),
  );
  for (const move of change.moves) {
    if (
      !Number.isSafeInteger(move.amount) ||
      move.amount <= 0 ||
      !move.to.trim() ||
      move.from === move.to ||
      !allCategories.has(move.from) ||
      effectiveAllocations(s, b).some(
        (a) =>
          [move.from, move.to].includes(a.category) && a.purpose !== "spending",
      )
    )
      throw new Error(
        "Choose different spending categories and positive funding amounts.",
      );
    requested.set(move.from, sum([requested.get(move.from) ?? 0, move.amount]));
  }
  const automatic = effectiveAllocations(
    { ...s, budgetChanges: [], captures: [] },
    { ...b, allocations: [] },
  );
  for (const [from, amount] of requested) {
    const current = categoryPosition(s, b, from);
    const minimum = automatic.find((a) => a.category === from)?.amount ?? 0;
    const movable =
      effectiveAllocations(s, b).find((a) => a.category === from)?.amount ?? 0;
    if (
      amount > movable - minimum ||
      (!change.reversalOf && amount > Math.max(0, current.remaining))
    )
      throw new Error(
        `${from}: funding exceeds unused limits or would remove a scheduled bill's minimum.`,
      );
  }
  s.budgetChanges.push(change);
}
export function returnAllowanceSavings(
  s: State,
  input: {
    id: string;
    allowanceId: string;
    category: string;
    amount: number;
    destinationId: string;
    date: string;
  },
) {
  const plan = s.allowances.find((p) => p.id === input.allowanceId);
  const budget = s.budgets.find((b) => b.id === plan?.budgetId);
  const source = s.accounts.find(
    (a) => a.id === plan?.accountId && !a.businessId,
  );
  const destination = s.accounts.find(
    (a) =>
      a.id === input.destinationId && !a.businessId && a.kind === "savings",
  );
  if (
    !plan ||
    !budget ||
    !source ||
    !destination ||
    budget.start > input.date ||
    input.date > today() ||
    source.id === destination.id ||
    input.amount > accountBalances(s).get(source.id)! - source.restricted
  )
    throw new Error(
      "Choose an actual, available personal source and a different savings account.",
    );
  if (s.captures.some((c) => c.id === input.id))
    throw new Error("This savings return was already recorded.");
  const capture: SavingsCapture = {
    id: input.id,
    allowanceId: plan.id,
    reduceAllocation: true,
    budgetId: budget.id,
    category: input.category,
    date: input.date,
    accountId: source.id,
    actions: [
      { kind: "transfer", amount: input.amount, accountId: destination.id },
    ],
    notes:
      "Explicit allowance return: lowers the plan and records one actual savings transfer.",
  };
  commitCapture(s, capture);
}
export function validateConnected(s: State) {
  const businessIds = new Set(s.businesses.map((b) => b.id));
  for (const b of s.businesses) {
    if (
      sum([b.ownershipBps, ...b.partners.map((p) => p.ownershipBps)]) > 10000 ||
      new Set(b.partners.map((p) => p.name.toLowerCase())).size !==
        b.partners.length
    )
      throw new Error("Business ownership exceeds 100% or repeats a partner.");
  }
  for (const a of s.accounts)
    if (a.businessId && !businessIds.has(a.businessId))
      throw new Error("Account business is missing.");
  for (const source of s.incomes) {
    if (
      source.businessId &&
      (!businessIds.has(source.businessId) ||
        businessForAccount(s, source.accountId) ||
        businessForAccount(s, source.sourceAccountId ?? "") !==
          source.businessId)
    )
      throw new Error(
        "Expected distribution needs business and personal receiving accounts.",
      );
    if (source.sourceAccountId && !source.businessId)
      throw new Error("Distribution source needs its business.");
  }
  const balances = new Map(s.accounts.map((a) => [a.id, a.opening]));
  const retained = new Map(
    s.businesses.map((b) => [b.id, b.openingRetainedProfit]),
  );
  const repaid = new Map<string, number>();
  const earmarked = new Map<string, number>();
  const ownershipTransactions = s.businesses.length
    ? [...s.transactions].sort((a, b) => a.date.localeCompare(b.date))
    : s.transactions.filter((t) => t.businessMovement);
  for (const t of ownershipTransactions) {
    const businessId = businessForAccount(s, t.accountId);
    const destinationBusiness = businessForAccount(s, t.destinationId ?? "");
    const obligation = ["loan_disbursement", "loan_recovery"].includes(t.type)
      ? s.receivables.find((r) => r.id === t.relatedId)
      : ["liability_draw", "liability_repayment", "debt_repayment"].includes(
            t.type,
          )
        ? s.liabilities.find((r) => r.id === t.relatedId)
        : undefined;
    if (
      obligation &&
      businessForAccount(s, obligation.accountId) !== businessId
    )
      throw new Error(
        "Debt payments must stay within the obligation's personal or business ownership.",
      );
    const income = s.incomes.find((i) => i.id === t.relatedId);
    if (
      t.type === "income" &&
      income &&
      (income.businessId ||
        businessForAccount(s, income.accountId) !== businessId)
    )
      throw new Error(
        "Use a linked business distribution, or the income source's own account ownership.",
      );
    if (
      t.type === "transfer" &&
      businessId !== destinationBusiness &&
      !(
        t.businessMovement === "owner_distribution" &&
        businessId &&
        !destinationBusiness
      ) &&
      !(t.businessMovement === "capital" && !businessId && destinationBusiness)
    )
      throw new Error(
        "Transfers crossing business ownership need an explicit distribution or capital classification.",
      );
    if (
      t.businessMovement === "owner_distribution" ||
      t.businessMovement === "partner_distribution"
    ) {
      const partner = t.businessMovement === "partner_distribution";
      const source = s.accounts.find((a) => a.id === t.accountId)!;
      const businessAccounts = s.accounts.filter(
        (a) => a.businessId === businessId && a.kind !== "investment",
      );
      const outstandingDebt = sum(
        s.liabilities
          .filter(
            (l) =>
              businessForAccount(s, l.accountId) === businessId &&
              l.date <= t.date,
          )
          .map((l) => sum([l.principal, -(repaid.get(l.id) ?? 0)])),
      );
      const protectedMoney = sum(
        businessAccounts.map((a) =>
          sum([
            a.kind === "savings"
              ? Math.max(0, balances.get(a.id)!)
              : a.restricted,
            earmarked.get(a.id) ?? 0,
          ]),
        ),
      );
      const freeBusinessCash = sum([
        ...businessAccounts.map((a) => balances.get(a.id)!),
        -protectedMoney,
        -outstandingDebt,
      ]);
      if (
        !businessId ||
        source.kind === "investment" ||
        source.kind === "savings" ||
        (partner
          ? t.type !== "expense" ||
            !s.businesses
              .find((b) => b.id === businessId)!
              .partners.some((p) => p.name === t.partnerName)
          : t.type !== "transfer" || !t.destinationId || destinationBusiness) ||
        (!t.reversalOf &&
          (t.amount > (retained.get(businessId) ?? 0) ||
            t.amount > freeBusinessCash ||
            t.amount >
              (balances.get(source.id) ?? 0) -
                source.restricted -
                (earmarked.get(source.id) ?? 0)))
      )
        throw new Error(
          "Distribution must use retained profit and available business cash.",
        );
      retained.set(businessId, sum([retained.get(businessId)!, -t.amount]));
    } else if (t.businessMovement === "capital") {
      if (t.type !== "transfer" || businessId || !destinationBusiness)
        throw new Error(
          "Capital must move personal funds into a business account.",
        );
    } else if (businessId && (t.type === "income" || t.type === "expense"))
      retained.set(
        businessId,
        sum([
          retained.get(businessId)!,
          t.type === "income" ? t.amount : -t.amount,
        ]),
      );
    if (t.type === "transfer") {
      balances.set(t.accountId, sum([balances.get(t.accountId)!, -t.amount]));
      balances.set(
        t.destinationId!,
        sum([balances.get(t.destinationId!)!, t.amount]),
      );
    } else if (t.type !== "reserve_transfer") {
      const outgoing = [
        "expense",
        "loan_disbursement",
        "liability_repayment",
        "debt_repayment",
      ].includes(t.type);
      balances.set(
        t.accountId,
        sum([balances.get(t.accountId)!, outgoing ? -t.amount : t.amount]),
      );
    }
    if (t.type === "reserve_transfer")
      earmarked.set(
        t.accountId,
        sum([earmarked.get(t.accountId) ?? 0, t.amount]),
      );
    if (
      ["liability_repayment", "debt_repayment"].includes(t.type) &&
      t.relatedId
    )
      repaid.set(t.relatedId, sum([repaid.get(t.relatedId) ?? 0, t.amount]));
  }
  for (const change of s.budgetChanges) {
    if (
      !s.budgets.some((b) => b.id === change.budgetId) ||
      change.date > today()
    )
      throw new Error("Reallocation budget or date is invalid.");
    if (change.reversalOf) {
      const original = s.budgetChanges.find(
        (c) => c.id === change.reversalOf && !c.reversalOf,
      );
      if (
        !original ||
        original.budgetId !== change.budgetId ||
        change.date < original.date ||
        s.budgetChanges.filter((c) => c.reversalOf === original.id).length !==
          1 ||
        JSON.stringify(change.moves) !==
          JSON.stringify(
            original.moves.map((m) => ({
              from: m.to,
              to: m.from,
              amount: m.amount,
            })),
          )
      )
        throw new Error("Invalid budget reallocation reversal.");
    }
    if (change.moves.some((m) => m.from === m.to))
      throw new Error("Reallocation categories must differ.");
    const budget = s.budgets.find((b) => b.id === change.budgetId)!;
    if (
      budget.allocations.some(
        (a) =>
          a.purpose !== "spending" &&
          change.moves.some(
            (m) => m.from === a.category || m.to === a.category,
          ),
      )
    )
      throw new Error("Budget reallocations must use spending categories.");
  }
  for (const b of s.budgets)
    if (
      s.budgetChanges.some((c) => c.budgetId === b.id) ||
      s.captures.some((c) => c.budgetId === b.id && c.reduceAllocation)
    )
      if (effectiveAllocations(s, b).some((a) => a.amount < 0))
        throw new Error(
          "A budget change would create a negative category limit.",
        );
  const planBudgets = new Set<string>();
  for (const p of s.allowances) {
    const b = s.budgets.find((b) => b.id === p.budgetId);
    const account = s.accounts.find(
      (a) => a.id === p.accountId && !a.businessId && a.kind !== "investment",
    );
    const e = s.events.find(
      (e) => e.id === p.fundingEventId && e.kind === "income",
    );
    if (
      !b ||
      !account ||
      planBudgets.has(b.id) ||
      (p.fundingEventId &&
        (!e ||
          s.incomes.find((i) => i.id === e.sourceId)?.accountId !== account.id))
    )
      throw new Error(
        "Allowance needs one distinct budget and its personal funding account or income event.",
      );
    planBudgets.add(b.id);
    if (
      s.allowances.some((other) => {
        const period = s.budgets.find((r) => r.id === other.budgetId);
        return (
          other.id !== p.id &&
          period &&
          period.start <= b.end &&
          b.start <= period.end
        );
      })
    )
      throw new Error(
        "Allowance periods cannot overlap. Use one allocation plan per personal period.",
      );
    if (
      p.fundingEventId &&
      sum(
        s.allowances
          .filter((other) => other.fundingEventId === p.fundingEventId)
          .map((other) => other.amount),
      ) > e!.amount
    )
      throw new Error(
        "Allowance envelopes exceed the linked expected payment.",
      );
  }
  for (const t of s.transactions.filter((t) => t.allowanceId)) {
    const p = s.allowances.find((p) => p.id === t.allowanceId);
    const b = s.budgets.find((b) => b.id === p?.budgetId);
    if (
      !p ||
      !b ||
      t.accountId !== p.accountId ||
      t.date < b.start ||
      t.date > b.end ||
      businessForAccount(s, t.accountId)
    )
      throw new Error(
        "Allowance transaction does not match its account and period.",
      );
  }
  for (const c of s.captures.filter((c) => c.reduceAllocation || c.allowanceId))
    if (
      !c.reduceAllocation ||
      !s.allowances.some(
        (p) =>
          p.id === c.allowanceId &&
          p.budgetId === c.budgetId &&
          p.accountId === c.accountId,
      ) ||
      c.actions.some(
        (a) =>
          a.kind !== "transfer" || businessForAccount(s, a.accountId ?? ""),
      )
    )
      throw new Error("Allowance savings return relationship is invalid.");
}

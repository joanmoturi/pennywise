import {
  addDays,
  daysBetween,
  today,
  uid,
  stateSchema,
  type State,
  type Transaction,
  type Bond,
  type PaymentEvent,
  type Budget,
  type Scenario,
} from "./domain";
import { sum, ratio, floorDivide, safe } from "./money";
import {
  effectiveAllocations,
  categoryRollover,
  prepaidRecognition,
  prepaidBalance,
  coveringPrepaid,
  occurrenceRemaining,
  captured,
} from "./expense-engine";

export function accountBalance(
  s: State,
  id: string,
  until = "9999-12-31",
): number {
  const account = s.accounts.find((a) => a.id === id);
  if (!account) throw new Error("Account not found");
  return sum([
    account.opening,
    ...s.transactions
      .filter((t) => t.date <= until)
      .map((t) => {
        if (t.type === "reserve_transfer") return 0;
        if (t.type === "transfer")
          return t.accountId === id
            ? -t.amount
            : t.destinationId === id
              ? t.amount
              : 0;
        if (t.accountId !== id) return 0;
        return [
          "expense",
          "debt_repayment",
          "loan_disbursement",
          "liability_repayment",
        ].includes(t.type)
          ? -t.amount
          : t.amount;
      }),
  ]);
}
export function outstanding(
  s: State,
  id: string,
  kind: "liability" | "receivable",
  asOf = "9999-12-31",
): number {
  const record = (kind === "liability" ? s.liabilities : s.receivables).find(
    (r) => r.id === id,
  );
  if (!record) throw new Error("Obligation not found");
  if (
    kind === "receivable" &&
    s.receivables.find((r) => r.id === id)?.writtenOff
  )
    return 0;
  const types =
    kind === "liability"
      ? ["liability_repayment", "debt_repayment"]
      : ["loan_recovery"];
  return sum([
    record.principal,
    -sum(
      s.transactions
        .filter(
          (t) => types.includes(t.type) && t.relatedId === id && t.date <= asOf,
        )
        .map((t) => t.amount),
    ),
  ]);
}
export function reserveBalance(
  s: State,
  id: string,
  asOf = "9999-12-31",
): number {
  return sum(
    s.transactions
      .filter(
        (t) =>
          t.type === "reserve_transfer" && t.reserveId === id && t.date <= asOf,
      )
      .map((t) => t.amount),
  );
}
export function necessityRemaining(s: State, id: string): number {
  const item = s.necessities.find((n) => n.id === id);
  if (!item) throw new Error("Necessity not found");
  return Math.max(
    0,
    sum([
      item.amount,
      -sum(
        s.transactions
          .filter((t) => t.type === "expense" && t.relatedId === id)
          .map((t) => t.amount),
      ),
    ]),
  );
}
export function summary(s: State, asOf = today()) {
  const liquid = sum(
    s.accounts
      .filter((a) => a.kind !== "investment")
      .map((a) => accountBalance(s, a.id, asOf)),
  );
  const restricted = sum(
    s.accounts
      .filter((a) => a.kind !== "investment" && a.kind !== "savings")
      .map((a) => a.restricted),
  );
  const savingsAccounts = sum(
    s.accounts
      .filter((a) => a.kind === "savings")
      .map((a) => Math.max(0, accountBalance(s, a.id, asOf))),
  );
  const carried = sum(
    s.captures
      .filter((c) => c.date <= asOf)
      .flatMap((c) =>
        c.actions
          .filter(
            (a) =>
              a.kind === "carry" &&
              s.budgets.find((b) => b.id === a.targetBudgetId)!.start > asOf,
          )
          .map((a) => a.amount),
      ),
  );
  const reserves = sum([
    savingsAccounts,
    carried,
    ...s.reserves.map((r) => reserveBalance(s, r.id, asOf)),
  ]);
  const liabilities = sum(
    s.liabilities
      .filter((l) => l.date <= asOf)
      .map((l) => outstanding(s, l.id, "liability", asOf)),
  );
  const receivables = sum(
    s.receivables
      .filter((r) => r.date <= asOf)
      .map((r) => outstanding(s, r.id, "receivable", asOf)),
  );
  const bondAssets = sum(
    s.bonds.map((b) =>
      Math.max(
        0,
        b.principal -
          sum(
            s.transactions
              .filter(
                (t) =>
                  t.type === "bond_maturity" &&
                  t.relatedId === b.id &&
                  t.date <= asOf,
              )
              .map((t) => t.amount),
          ),
      ),
    ),
  );
  const assets = sum([
    sum(s.accounts.map((a) => accountBalance(s, a.id, asOf))),
    bondAssets,
    receivables,
    ...s.prepaids.map((p) => prepaidBalance(s, p, asOf)),
  ]);
  const available = sum([liquid, -restricted, -reserves, -liabilities]);
  const month = asOf.slice(0, 7);
  const actual = s.transactions.filter(
    (t) => t.date.slice(0, 7) === month && t.date <= asOf,
  );
  return {
    liquid,
    restricted,
    reserves,
    liabilities,
    receivables,
    assets,
    available,
    netWorth: sum([assets, -liabilities]),
    income: sum(actual.filter((t) => t.type === "income").map((t) => t.amount)),
    expenses: sum(
      actual.filter((t) => t.type === "expense").map((t) => t.amount),
    ),
    emergency: sum(
      s.reserves
        .filter((r) => r.emergency)
        .map((r) => reserveBalance(s, r.id, asOf)),
    ),
  };
}
export function coupon(b: Bond): { gross: number; tax: number; net: number } {
  const gross = ratio(b.principal, b.couponBps, b.paymentsPerYear * 10000);
  const tax = ratio(gross, b.taxBps);
  return { gross, tax, net: sum([gross, -tax]) };
}
export function eventRemaining(s: State, e: PaymentEvent): number {
  return Math.max(
    0,
    sum([
      e.amount,
      -sum(
        s.transactions.filter((t) => t.eventId === e.id).map((t) => t.amount),
      ),
    ]),
  );
}
export function eventStatus(s: State, e: PaymentEvent): string {
  if (e.status === "cancelled") return "cancelled";
  const left = eventRemaining(s, e);
  if (left === 0) return "received";
  if (left < e.amount) return "partially received";
  return e.status === "delayed" || e.due < today() ? "delayed" : "expected";
}
export function sourceAccount(s: State, e: PaymentEvent): string {
  const list =
    e.kind === "income"
      ? s.incomes
      : e.kind === "bond"
        ? s.bonds
        : s.receivables;
  const source = list.find((r) => r.id === e.sourceId);
  if (!source) throw new Error("Payment source not found");
  return source.accountId;
}
export function receiveEvent(
  s: State,
  eventId: string,
  amount: number,
  date: string,
): Transaction {
  const e = s.events.find((e) => e.id === eventId);
  if (!e || e.status === "cancelled") throw new Error("Payment is unavailable");
  if (
    e.kind === "receivable" &&
    s.receivables.find((r) => r.id === e.sourceId)?.writtenOff
  )
    throw new Error("Cannot receive a written-off loan");
  if (amount <= 0) throw new Error("Receipt must be positive");
  const income = s.incomes.find((i) => i.id === e.sourceId);
  if (income?.type === "Loan repayment")
    throw new Error("Record loan recovery using the receivables module");
  return {
    id: uid(),
    type: e.kind === "receivable" ? "loan_recovery" : "income",
    amount,
    date,
    description: `Receipt: ${e.notes || e.kind}`,
    category: e.kind === "bond" ? "Bond coupon" : "Income",
    subcategory: "",
    accountId: sourceAccount(s, e),
    eventId,
    relatedId: e.sourceId,
    notes:
      amount !== eventRemaining(s, e) ? "Partial or reconciled receipt" : "",
    paymentMethod: "",
    recurringReference: "",
  };
}
export function scheduleDates(
  first: string,
  frequency: string,
  count: number,
): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 240)
    throw new Error("Schedule count must be 1-240");
  if (["custom", "irregular", "one-off"].includes(frequency)) return [first];
  const months: Record<string, number> = {
    monthly: 1,
    quarterly: 3,
    semiannual: 6,
    annual: 12,
  };
  if (frequency === "weekly" || frequency === "fortnightly")
    return Array.from({ length: count }, (_, i) =>
      addDays(first, i * (frequency === "weekly" ? 7 : 14)),
    );
  if (!months[frequency]) throw new Error("Unsupported schedule frequency");
  const d = new Date(first);
  return Array.from({ length: count }, (_, i) => {
    const target = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i * months[frequency], 1),
    );
    const last = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(d.getUTCDate(), last));
    return target.toISOString().slice(0, 10);
  });
}
export function budgetActual(
  s: State,
  budget: Budget,
  category?: string,
): number {
  return sum([
    ...s.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.date >= budget.start &&
          t.date <= budget.end &&
          !t.prepaidId &&
          (!category || t.category === category),
      )
      .map((t) => t.amount),
    prepaidRecognition(
      s,
      budget.start,
      budget.end < today() ? budget.end : today(),
      category,
    ),
  ]);
}
export function rolloverAmount(
  s: State,
  budget: Budget,
  category: string,
): number {
  return categoryRollover(s, budget, category);
}
export function budgetStats(s: State, b: Budget) {
  const planned = sum(
    effectiveAllocations(s, b).map((a) =>
      sum([a.amount, rolloverAmount(s, b, a.category)]),
    ),
  );
  const actual = budgetActual(s, b);
  const available = Math.max(0, summary(s).available);
  const remaining = sum([planned, -actual, -captured(s, b.id)]);
  return {
    planned,
    actual,
    remaining,
    unallocated: sum([available, -Math.max(0, remaining)]),
  };
}
export function necessitiesFunding(s: State) {
  let remaining = Math.max(0, summary(s).available);
  return [...s.necessities]
    .sort(
      (a, b) =>
        Number(b.essential) - Number(a.essential) ||
        a.priority - b.priority ||
        a.due.localeCompare(b.due),
    )
    .map((n) => {
      const outstanding = necessityRemaining(s, n.id);
      const funded = Math.min(remaining, outstanding);
      remaining -= funded;
      return {
        ...n,
        outstanding,
        funded,
        status:
          outstanding === 0
            ? "paid"
            : funded === outstanding
              ? "fully funded"
              : funded
                ? "partially funded"
                : "unfunded",
      };
    });
}
export function dailyAllowance(s: State, asOf = today()) {
  const b = s.budgets.find((b) => b.id === s.settings.activeBudgetId);
  const allocations = b ? effectiveAllocations(s, b) : [];
  const categoryNeeds = new Map<string, number>();
  for (const n of s.necessities.filter((n) => n.essential))
    categoryNeeds.set(
      n.category,
      sum([categoryNeeds.get(n.category) ?? 0, necessityRemaining(s, n.id)]),
    );
  for (const o of s.occurrences.filter(
    (o) => o.due <= addDays(asOf, s.settings.allowanceDays),
  )) {
    const r = s.recurring.find((r) => r.id === o.recurringId)!;
    if (r.essential)
      categoryNeeds.set(
        r.category,
        sum([categoryNeeds.get(r.category) ?? 0, occurrenceRemaining(s, o)]),
      );
  }
  for (const a of allocations.filter(
    (a) => a.essential && a.purpose === "spending",
  )) {
    categoryNeeds.set(
      a.category,
      Math.max(
        categoryNeeds.get(a.category) ?? 0,
        Math.max(0, a.amount - budgetActual(s, b!, a.category)),
      ),
    );
  }
  const protectedEssentials = sum([...categoryNeeds.values()]);
  const discretionaryBudget = b
    ? sum(
        allocations
          .filter((a) => !a.essential && a.purpose === "spending")
          .map((a) =>
            Math.max(
              0,
              sum([
                a.amount,
                rolloverAmount(s, b, a.category),
                -budgetActual(s, b, a.category),
              ]),
            ),
          ),
      )
    : 0;
  const pool = Math.max(0, summary(s, asOf).available - protectedEssentials);
  const safeAmount = Math.min(pool, discretionaryBudget);
  const next = s.events
    .filter(
      (e) =>
        e.reliability === "confirmed" &&
        e.status === "expected" &&
        e.due > asOf &&
        eventRemaining(s, e) > 0,
    )
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  const days = next
    ? Math.max(1, daysBetween(asOf, next.due))
    : s.settings.allowanceDays;
  return {
    safeAmount,
    daily: floorDivide(safeAmount, days),
    weekly: Math.min(safeAmount, floorDivide(safeAmount, days) * 7),
    days,
    protectedEssentials,
    discretionaryBudget,
    next,
  };
}
export function decision(s: State, amount: number) {
  if (amount <= 0) throw new Error("Purchase amount must be positive");
  const daily = dailyAllowance(s);
  const available = summary(s).available;
  if (amount > Math.max(0, available - daily.protectedEssentials))
    return {
      outcome: "Financially unsafe",
      reason:
        "This purchase would consume protected necessities, restricted funds, reserves, or money owed.",
    };
  if (amount > daily.discretionaryBudget)
    return {
      outcome: "Not recommended",
      reason:
        "The purchase exceeds the remaining discretionary allocation. Expected receipts do not fund this assessment.",
    };
  if (amount > daily.daily)
    return {
      outcome: "Affordable with adjustments",
      reason:
        "It fits available cash and discretionary budget, but exceeds today's allowance; reduce later spending.",
    };
  return {
    outcome: "Affordable",
    reason:
      "Within today's allowance, after protecting necessities, reserves, restrictions, and all outstanding liabilities.",
  };
}
export function forecast(s: State, scenario: Scenario, asOf = today()) {
  const snapshot = summary(s, asOf);
  const b = s.budgets.find((b) => b.id === s.settings.activeBudgetId);
  const allocations = b ? effectiveAllocations(s, b) : [];
  const monthlySpending = sum(
    allocations.filter((a) => a.purpose !== "debt").map((a) => a.amount),
  );
  const monthlySurvival = sum(
    allocations
      .filter((a) => a.essential && a.purpose === "spending")
      .map((a) => a.amount),
  );
  const spending = ratio(monthlySpending, scenario.spendingBps);
  const opening = sum([snapshot.available, scenario.income, -scenario.expense]);
  const lines: {
    date: string;
    confirmed: number;
    expected: number;
    optimistic: number;
  }[] = [];
  const balances = [opening, opening, opening];
  const inflows = [
    new Map<string, number>(),
    new Map<string, number>(),
    new Map<string, number>(),
  ];
  const billsByCategory = new Map<string, number>();
  const cashPlans = new Map<number, number>();
  const seen = new Set<string>();
  let low = opening;
  let insufficient: string | undefined = opening < 0 ? asOf : undefined;
  for (let day = 0; day <= scenario.days; day++) {
    const date = addDays(asOf, day);
    if (day > 0) {
      // Cumulative prorating preserves every minor unit across a 30-day planning month.
      const bucket = Math.floor((day - 1) / 30);
      if (!cashPlans.has(bucket)) {
        const start = addDays(asOf, bucket * 30 + 1),
          end = addDays(start, 29);
        const shifted = b ? { ...b, start, end } : undefined;
        const plan = shifted
          ? sum(
              effectiveAllocations(s, shifted)
                .filter((a) => a.purpose !== "debt")
                .map((a) => {
                  const prepaid = prepaidRecognition(
                    s,
                    start,
                    end,
                    a.category,
                    s.prepaids.some(
                      (p) =>
                        p.category === a.category && p.recognition === "normal",
                    ),
                  );
                  const base =
                    b!.frequency === "monthly"
                      ? a.amount
                      : ratio(a.amount, 30, daysBetween(b!.start, b!.end) + 1);
                  return Math.max(0, base - prepaid);
                }),
            )
          : 0;
        cashPlans.set(bucket, ratio(plan, scenario.spendingBps));
      }
      const cashSpending = cashPlans.get(bucket)!;
      const expense =
        safe((BigInt(cashSpending) * BigInt(day % 30 || 30)) / 30n) -
        safe((BigInt(cashSpending) * BigInt((day - 1) % 30)) / 30n);
      for (let k = 0; k < 3; k++)
        balances[k] = sum([
          balances[k],
          -expense,
          day % 30 === 0 ? scenario.monthlyIncome : 0,
        ]);
      for (const n of s.necessities.filter(
        (n) => n.due === date || (day === 1 && n.due <= asOf),
      )) {
        const bucket = `${Math.floor((day - 1) / 30)}:${n.category}`;
        const covered = ratio(
          b?.allocations.find(
            (a) => a.category === n.category && a.purpose === "spending",
          )?.amount ?? 0,
          scenario.spendingBps,
        );
        const previous = billsByCategory.get(bucket) ?? 0;
        const amount = necessityRemaining(s, n.id);
        const extra =
          Math.max(0, sum([previous, amount, -covered])) -
          Math.max(0, previous - covered);
        billsByCategory.set(bucket, sum([previous, amount]));
        for (let k = 0; k < 3; k++) balances[k] = sum([balances[k], -extra]);
      }
    }
    for (const e of s.events) {
      const due = addDays(e.due, scenario.delayDays);
      if (due !== date || seen.has(e.id) || e.status !== "expected") continue;
      if (
        e.kind === "income" &&
        !s.incomes.find((i) => i.id === e.sourceId)?.active
      )
        continue;
      seen.add(e.id);
      for (let k = 0; k < 3; k++) {
        if (
          e.reliability === "confirmed" ||
          (scenario.includeExpected &&
            (k === 2 || (k === 1 && e.reliability === "reliable")))
        ) {
          const remaining =
            e.kind === "receivable"
              ? Math.min(
                  eventRemaining(s, e),
                  outstanding(s, e.sourceId, "receivable") -
                    (inflows[k].get(e.sourceId) ?? 0),
                )
              : eventRemaining(s, e);
          const amount = Math.max(0, remaining);
          balances[k] = sum([balances[k], amount]);
          if (e.kind === "receivable")
            inflows[k].set(
              e.sourceId,
              sum([inflows[k].get(e.sourceId) ?? 0, amount]),
            );
        }
      }
    }
    lines.push({
      date,
      confirmed: balances[0],
      expected: balances[1],
      optimistic: balances[2],
    });
    low = Math.min(low, balances[0]);
    if (!insufficient && balances[0] < 0) insufficient = date;
  }
  return {
    lines,
    low,
    insufficient,
    monthlySurvival,
    monthlySpending: spending,
    monthlyDeficit: sum([spending, -scenario.monthlyIncome]),
    breakEven: spending,
    runwayDays: insufficient
      ? Math.max(0, daysBetween(asOf, insufficient))
      : null,
  };
}
export function allocateWindfall(s: State, receiptId: string) {
  const receipt = s.transactions.find((t) => t.id === receiptId);
  if (
    !receipt ||
    !["income", "loan_recovery", "bond_maturity"].includes(receipt.type)
  )
    throw new Error("Choose an actual received windfall");
  if (s.transactions.some((t) => t.windfallId === receiptId))
    throw new Error("This receipt has already been allocated");
  let remaining = Math.min(
    receipt.amount,
    Math.max(
      0,
      summary(s).liquid - summary(s).restricted - summary(s).reserves,
    ),
  );
  const initial = remaining;
  const allocations: {
    ruleId: string;
    name: string;
    amount: number;
    target: string;
    targetId: string;
  }[] = [];
  const used = new Map<string, number>();
  for (const rule of s.rules) {
    if (remaining < rule.minimumCash) continue;
    const key = `${rule.target}:${rule.targetId}`;
    let capacity = remaining;
    if (rule.target === "liability")
      capacity = outstanding(s, rule.targetId, "liability");
    if (rule.target === "necessity")
      capacity = necessityRemaining(s, rule.targetId);
    if (rule.target === "reserve") {
      const r = s.reserves.find((r) => r.id === rule.targetId);
      if (!r) throw new Error("Reserve rule target is missing");
      capacity = Math.max(0, r.target - reserveBalance(s, r.id));
      if (r.accountId !== receipt.accountId)
        throw new Error(
          "Reserve must use the windfall's account; transfer funds first",
        );
    }
    capacity = Math.max(0, capacity - (used.get(key) ?? 0));
    const requested =
      rule.mode === "percent"
        ? ratio(receipt.amount, rule.value)
        : rule.mode === "threshold"
          ? Math.max(
              0,
              rule.value -
                (rule.target === "reserve"
                  ? reserveBalance(s, rule.targetId)
                  : 0),
            )
          : rule.value;
    const amount = Math.min(
      remaining,
      capacity,
      requested,
      rule.cap || remaining,
    );
    if (!amount) continue;
    allocations.push({
      ruleId: rule.id,
      name: rule.name,
      amount,
      target: rule.target,
      targetId: rule.targetId,
    });
    remaining -= amount;
    used.set(key, sum([used.get(key) ?? 0, amount]));
  }
  return { receipt, allocations, remaining, initial };
}
export function commitWindfall(s: State, receiptId: string) {
  const preview = allocateWindfall(s, receiptId);
  if (!preview.allocations.length)
    throw new Error("Configure at least one applicable allocation rule");
  const groupId = uid();
  for (const a of preview.allocations) {
    const base: Transaction = {
      id: uid(),
      amount: a.amount,
      date: today(),
      description: `Windfall: ${a.name}`,
      category:
        a.target === "necessity"
          ? s.necessities.find((n) => n.id === a.targetId)!.category
          : a.name,
      subcategory: "",
      accountId: preview.receipt.accountId,
      type: "adjustment",
      windfallId: receiptId,
      groupId,
      paymentMethod: "",
      notes: "Confirmed allocation",
      recurringReference: "",
    };
    if (a.target === "liability") {
      base.type = "liability_repayment";
      base.relatedId = a.targetId;
    }
    if (a.target === "necessity") {
      base.type = "expense";
      base.relatedId = a.targetId;
    }
    if (a.target === "reserve") {
      base.type = "reserve_transfer";
      base.reserveId = a.targetId;
    }
    // A discretionary allocation is an earmark, not a fictitious expense or a new cash receipt.
    if (a.target === "discretionary") {
      const r = {
        id: uid(),
        name: `Windfall envelope: ${a.name}`,
        target: a.amount,
        due: addDays(today(), 30),
        accountId: base.accountId,
        priority: 100,
        contribution: 0,
        frequency: "one-off" as const,
        emergency: false,
        notes: "Release before spending",
      };
      s.reserves.push(r);
      base.type = "reserve_transfer";
      base.reserveId = r.id;
    }
    s.transactions.push(base);
  }
}
export function validateState(input: unknown): State {
  const s = stateSchema.parse(input);
  const collections = [
    s.accounts,
    s.transactions,
    s.incomes,
    s.liabilities,
    s.receivables,
    s.bonds,
    s.events,
    s.budgets,
    s.necessities,
    s.reserves,
    s.rules,
    s.scenarios,
    s.recurring,
    s.occurrences,
    s.occasional,
    s.prepaids,
    s.captures,
    s.reviews,
  ];
  const allIds = collections.flatMap((c) => c.map((r) => r.id));
  if (new Set(allIds).size !== allIds.length)
    throw new Error("Duplicate record IDs");
  const accountIds = new Set(s.accounts.map((a) => a.id));
  for (const r of [
    ...s.incomes,
    ...s.liabilities,
    ...s.receivables,
    ...s.bonds,
    ...s.reserves,
    ...s.recurring,
    ...s.prepaids,
    ...s.captures,
  ]) {
    if (!accountIds.has(r.accountId))
      throw new Error("Record references a missing account");
  }
  if (
    s.settings.activeBudgetId &&
    !s.budgets.some((b) => b.id === s.settings.activeBudgetId && !b.archived)
  )
    throw new Error("Active budget is unavailable");
  for (const b of s.budgets) {
    if (b.end < b.start) throw new Error("Budget end precedes start");
    if (
      new Set(b.allocations.map((a) => a.category)).size !==
      b.allocations.length
    )
      throw new Error("Duplicate budget category");
    if (
      s.budgets.some(
        (other) =>
          other.id !== b.id &&
          other.profileId === b.profileId &&
          other.start <= b.end &&
          b.start <= other.end,
      )
    )
      throw new Error(
        "Budget history periods in the same profile cannot overlap",
      );
  }
  const paymentDates = new Set<string>();
  for (const e of s.events) {
    const key = `${e.kind}:${e.sourceId}:${e.due}`;
    if (e.status !== "cancelled" && paymentDates.has(key))
      throw new Error("Duplicate expected payment date for the same source");
    if (e.status !== "cancelled") paymentDates.add(key);
    const list =
      e.kind === "income"
        ? s.incomes
        : e.kind === "bond"
          ? s.bonds
          : s.receivables;
    if (!list.some((r) => r.id === e.sourceId))
      throw new Error("Expected payment references missing source");
  }
  const receiptTotal = new Map<string, number>();
  for (const t of s.transactions) {
    if (!accountIds.has(t.accountId))
      throw new Error("Transaction account is missing");
    if (t.date > today())
      throw new Error(
        "Future transactions belong in expected payments, not actual cash",
      );
    if (
      t.type !== "adjustment" &&
      t.type !== "reserve_transfer" &&
      t.amount <= 0
    )
      throw new Error("Transaction amount must be positive");
    if (
      t.type === "transfer" &&
      (!t.destinationId ||
        !accountIds.has(t.destinationId) ||
        t.destinationId === t.accountId)
    )
      throw new Error("Transfer needs two different owned accounts");
    if (
      t.type === "reserve_transfer" &&
      !s.reserves.some(
        (r) => r.id === t.reserveId && r.accountId === t.accountId,
      )
    )
      throw new Error("Reserve account mismatch");
    if (
      ["liability_draw", "liability_repayment", "debt_repayment"].includes(
        t.type,
      ) &&
      !s.liabilities.some((l) => l.id === t.relatedId)
    )
      throw new Error("Select a liability");
    if (
      ["loan_disbursement", "loan_recovery"].includes(t.type) &&
      !s.receivables.some((r) => r.id === t.relatedId)
    )
      throw new Error("Select a receivable");
    if (
      t.type === "bond_maturity" &&
      !s.bonds.some((b) => b.id === t.relatedId)
    )
      throw new Error("Select a bond");
    if (t.occurrenceId) {
      const o = s.occurrences.find((o) => o.id === t.occurrenceId);
      const r = s.recurring.find((r) => r.id === o?.recurringId);
      if (
        !o ||
        !r ||
        t.type !== "expense" ||
        r.accountId !== t.accountId ||
        r.category !== t.category
      )
        throw new Error("Recurring payment relationship mismatch");
      if (coveringPrepaid(s, o) && !t.additionalPayment)
        throw new Error(
          "Period is prepaid; explicitly approve additional payment",
        );
    }
    if (
      t.occasionalId &&
      (t.type !== "expense" ||
        !s.occasional.some((o) => o.id === t.occasionalId))
    )
      throw new Error("Occasional expense is missing");
    if (t.prepaidId && !s.prepaids.some((p) => p.id === t.prepaidId))
      throw new Error("Prepaid record is missing");
    if (t.prepaidId && !["expense", "prepaid_refund"].includes(t.type))
      throw new Error("Prepaid records only link actual payments and refunds");
    if (t.type === "prepaid_refund" && !t.prepaidId)
      throw new Error("Prepaid refund requires a prepaid record");
    if (t.captureId && !s.captures.some((c) => c.id === t.captureId))
      throw new Error("Savings capture is missing");
    if (
      t.receipt &&
      !t.receipt.data.startsWith(`data:${t.receipt.mime};base64,`)
    )
      throw new Error("Receipt data does not match its safe MIME type");
    if (
      t.receipt &&
      !/^data:[^;]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(t.receipt.data)
    )
      throw new Error("Receipt is not a valid Base64 data URL");
    if (
      t.type === "expense" &&
      t.relatedId &&
      !s.necessities.some((n) => n.id === t.relatedId)
    )
      throw new Error("Expense obligation is missing");
    if (t.type === "income" && t.relatedId) {
      const i = s.incomes.find((i) => i.id === t.relatedId);
      if (!i && !s.bonds.some((b) => b.id === t.relatedId))
        throw new Error("Income source is missing");
      if (i?.type === "Loan repayment")
        throw new Error("Loan repayments are recoveries, not earned income");
    }
    if (t.eventId) {
      const e = s.events.find((e) => e.id === t.eventId);
      if (
        !e ||
        t.relatedId !== e.sourceId ||
        sourceAccount(s, e) !== t.accountId ||
        t.type !== (e.kind === "receivable" ? "loan_recovery" : "income")
      )
        throw new Error("Receipt does not match its payment event");
    }
    if (t.windfallId) {
      const receipt = s.transactions.find((r) => r.id === t.windfallId);
      if (
        !receipt ||
        !["income", "loan_recovery", "bond_maturity"].includes(receipt.type) ||
        !t.groupId
      )
        throw new Error("Windfall receipt is missing");
      receiptTotal.set(
        receipt.id,
        sum([receiptTotal.get(receipt.id) ?? 0, t.amount]),
      );
      if (receiptTotal.get(receipt.id)! > receipt.amount)
        throw new Error("Allocations exceed the actual windfall");
    }
  }
  for (const l of s.liabilities) {
    const repayments = sum(
      s.transactions
        .filter(
          (t) =>
            ["liability_repayment", "debt_repayment"].includes(t.type) &&
            t.relatedId === l.id,
        )
        .map((t) => t.amount),
    );
    if (repayments > l.principal)
      throw new Error("Repayment exceeds liability principal");
    if (
      sum(
        s.transactions
          .filter((t) => t.type === "liability_draw" && t.relatedId === l.id)
          .map((t) => t.amount),
      ) > l.principal
    )
      throw new Error("Draw exceeds liability principal");
  }
  for (const r of s.receivables) {
    if (
      sum(
        s.transactions
          .filter((t) => t.type === "loan_recovery" && t.relatedId === r.id)
          .map((t) => t.amount),
      ) > r.principal
    )
      throw new Error(
        "Loan recovery exceeds principal; record interest separately as income",
      );
    if (
      sum(
        s.transactions
          .filter((t) => t.type === "loan_disbursement" && t.relatedId === r.id)
          .map((t) => t.amount),
      ) > r.principal
    )
      throw new Error("Loan disbursement exceeds principal");
  }
  for (const b of s.bonds)
    if (
      sum(
        s.transactions
          .filter((t) => t.type === "bond_maturity" && t.relatedId === b.id)
          .map((t) => t.amount),
      ) > b.principal
    )
      throw new Error(
        "Maturity recovery exceeds recorded principal; record gain separately",
      );
  for (const r of s.reserves)
    if (reserveBalance(s, r.id) < 0)
      throw new Error("Reserve withdrawal exceeds its balance");
  for (const r of s.reserves)
    if (
      s.accounts.find((a) => a.id === r.accountId)?.kind === "savings" &&
      reserveBalance(s, r.id) > 0
    )
      throw new Error(
        "Savings accounts are already protected; use a normal liquid account for reserve earmarks",
      );
  for (const a of s.accounts) {
    const reserved = sum(
      s.reserves
        .filter((r) => r.accountId === a.id)
        .map((r) => reserveBalance(s, r.id)),
    );
    if (reserved > 0 && a.kind === "investment")
      throw new Error("Reserves need a liquid account");
    if (sum([reserved, a.restricted]) > Math.max(0, accountBalance(s, a.id)))
      throw new Error(
        "Restricted and reserved money exceeds account balance; release reserves before spending",
      );
  }
  for (const r of s.rules) {
    const list =
      r.target === "liability"
        ? s.liabilities
        : r.target === "necessity"
          ? s.necessities
          : r.target === "reserve"
            ? s.reserves
            : undefined;
    if (list && !list.some((item) => item.id === r.targetId))
      throw new Error("Allocation target is missing");
    if (r.mode === "percent" && r.value > 10000)
      throw new Error("Percentage exceeds 100%");
  }
  validateExpenses(s);
  summary(s);
  return s;
}
function validateExpenses(s: State) {
  const occurrences = new Set<string>();
  for (const r of s.recurring) {
    if (r.firstDue < r.start || (r.end && r.end < r.firstDue))
      throw new Error("Invalid recurring date range");
    if (
      r.minimum !== undefined &&
      r.maximum !== undefined &&
      r.minimum > r.maximum
    )
      throw new Error("Recurring minimum exceeds maximum");
  }
  for (const o of s.occurrences) {
    if (!s.recurring.some((r) => r.id === o.recurringId))
      throw new Error("Occurrence references missing recurring definition");
    const key = `${o.recurringId}:${o.scheduledDate}`;
    if (occurrences.has(key)) throw new Error("Duplicate recurring occurrence");
    occurrences.add(key);
  }
  for (const o of s.occasional) {
    if (o.due && !o.due.startsWith(o.month))
      throw new Error("Occasional date must be in its expected month");
    if (o.maximum > 0 && o.estimated > o.maximum)
      throw new Error("Occasional estimate exceeds maximum");
    if (o.reserveId && !s.reserves.some((r) => r.id === o.reserveId))
      throw new Error("Occasional reserve is missing");
  }
  for (const p of s.prepaids) {
    if (
      s.prepaids.some(
        (other) =>
          other.id !== p.id &&
          p.recurringId &&
          other.recurringId === p.recurringId &&
          other.coverageStart <=
            (p.terminatedOn ? addDays(p.terminatedOn, -1) : p.coverageEnd) &&
          p.coverageStart <=
            (other.terminatedOn
              ? addDays(other.terminatedOn, -1)
              : other.coverageEnd),
      )
    )
      throw new Error("Prepaid coverage overlaps another record");
    if (
      p.recurringId &&
      !s.recurring.some(
        (r) =>
          r.id === p.recurringId &&
          r.category === p.category &&
          r.accountId === p.accountId,
      )
    )
      throw new Error(
        "Prepaid recurring source must match category and account",
      );
    if (
      p.coverageEnd < p.coverageStart ||
      p.periods.length !== p.count ||
      sum(p.periods.map((period) => period.amount)) !== p.amount
    )
      throw new Error("Invalid prepaid coverage allocation");
    const cash = s.transactions.filter(
      (t) => t.type === "expense" && t.prepaidId === p.id,
    );
    if (
      cash.length !== 1 ||
      cash[0].amount !== p.amount ||
      cash[0].date !== p.paymentDate ||
      cash[0].accountId !== p.accountId
    )
      throw new Error("Prepaid actual cash payment is missing or inconsistent");
    const refunds = sum(
      s.transactions
        .filter((t) => t.type === "prepaid_refund" && t.prepaidId === p.id)
        .map((t) => t.amount),
    );
    if (refunds > p.amount || (refunds && !p.terminatedOn))
      throw new Error("Invalid prepaid refund");
    if (
      s.transactions.some(
        (t) =>
          t.type === "prepaid_refund" &&
          t.prepaidId === p.id &&
          (t.accountId !== p.accountId || t.date !== p.terminatedOn),
      )
    )
      throw new Error("Prepaid refund does not match the terminated coverage");
    for (let i = 0; i < p.periods.length; i++) {
      const period = p.periods[i];
      if (
        period.end < period.start ||
        (i && period.start !== addDays(p.periods[i - 1].end, 1))
      )
        throw new Error("Prepaid periods must be contiguous");
    }
    if (
      p.periods[0].start !== p.coverageStart ||
      p.periods.at(-1)!.end !== p.coverageEnd
    )
      throw new Error("Prepaid periods do not cover declared dates");
  }
  for (const c of s.captures) {
    if (!s.budgets.some((b) => b.id === c.budgetId))
      throw new Error("Savings capture budget is missing");
    for (const a of c.actions) {
      const linked = s.transactions.filter((t) => t.captureId === c.id);
      if (
        a.kind === "transfer" &&
        (!s.accounts.some((r) => r.id === a.accountId) ||
          !linked.some(
            (t) =>
              t.type === "transfer" &&
              t.destinationId === a.accountId &&
              t.amount === a.amount,
          ))
      )
        throw new Error("Savings transfer is missing");
      if (
        a.kind === "reserve" &&
        (!s.reserves.some((r) => r.id === a.reserveId) ||
          !linked.some(
            (t) =>
              t.type === "reserve_transfer" &&
              t.reserveId === a.reserveId &&
              t.amount === a.amount,
          ))
      )
        throw new Error("Savings reserve earmark is missing");
      if (
        a.kind === "carry" &&
        !s.budgets.some(
          (b) =>
            b.id === a.targetBudgetId &&
            b.start > s.budgets.find((b) => b.id === c.budgetId)!.end,
        )
      )
        throw new Error("Carry-forward target must be a later budget period");
    }
  }
  for (const r of s.reviews)
    if (!s.budgets.some((b) => b.id === r.budgetId))
      throw new Error("Monthly review budget is missing");
}

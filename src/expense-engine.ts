import {
  addDays,
  daysBetween,
  today,
  uid,
  type State,
  type Recurring,
  type Occurrence,
  type Prepaid,
  type Budget,
  type SavingsCapture,
} from "./domain";
import { sum, safe } from "./money";
import { scheduleDates, budgetActual, summary, reserveBalance } from "./engine";

function recurrenceDate(
  first: string,
  frequency: string,
  customDays: number,
  index: number,
): string {
  if (frequency === "custom" || frequency === "irregular")
    return addDays(first, customDays * index);
  if (frequency === "one-off") return first;
  if (frequency === "weekly" || frequency === "fortnightly")
    return addDays(first, index * (frequency === "weekly" ? 7 : 14));
  // Anchor each occurrence on the original day, including after short calendar months.
  const months: Record<string, number> = {
    monthly: 1,
    quarterly: 3,
    semiannual: 6,
    annual: 12,
  };
  const d = new Date(first);
  const target = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + index * months[frequency],
      1,
    ),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(last, d.getUTCDate()));
  return target.toISOString().slice(0, 10);
}
export function generateOccurrences(s: State, until: string): number {
  let generated = 0;
  for (const r of s.recurring.filter((r) => r.status === "active")) {
    for (let i = 0; i < 20000; i++) {
      const date = recurrenceDate(r.firstDue, r.frequency, r.customDays, i);
      if (date > until || (r.end && date > r.end)) break;
      if (
        date >= r.start &&
        !s.occurrences.some(
          (o) => o.recurringId === r.id && o.scheduledDate === date,
        )
      ) {
        s.occurrences.push({
          id: uid(),
          recurringId: r.id,
          scheduledDate: date,
          due: date,
          amount: r.expected,
          status: "scheduled",
          notes: "",
        });
        generated++;
      }
      if (r.frequency === "one-off") break;
      if (i === 19999)
        throw new Error(
          "Recurrence horizon is too large; shorten the schedule",
        );
    }
  }
  return generated;
}
export function occurrencePaid(s: State, id: string): number {
  return sum(
    s.transactions
      .filter((t) => t.type === "expense" && t.occurrenceId === id)
      .map((t) => t.amount),
  );
}
export function coveringPrepaid(s: State, o: Occurrence): Prepaid | undefined {
  return s.prepaids.find(
    (p) =>
      p.recurringId === o.recurringId &&
      o.due >= p.coverageStart &&
      o.due <= p.coverageEnd &&
      (!p.terminatedOn || o.due < p.terminatedOn),
  );
}
export function occurrenceRemaining(s: State, o: Occurrence): number {
  return o.status === "skipped" || coveringPrepaid(s, o)
    ? 0
    : Math.max(0, sum([o.amount, -occurrencePaid(s, o.id)]));
}
export function occurrenceStatus(s: State, o: Occurrence): string {
  if (o.status === "skipped") return "skipped";
  if (coveringPrepaid(s, o)) return "prepaid";
  const paid = occurrencePaid(s, o.id);
  return paid >= o.amount
    ? "paid"
    : paid > 0
      ? "partially paid"
      : o.due < today()
        ? "overdue"
        : "scheduled";
}
export function nextOccurrence(s: State, r: Recurring): string | undefined {
  return s.occurrences
    .filter((o) => o.recurringId === r.id && occurrenceRemaining(s, o) > 0)
    .sort((a, b) => a.due.localeCompare(b.due))[0]?.due;
}
export function recurringReminders(s: State, asOf = today()): Occurrence[] {
  return s.occurrences
    .filter((o) => {
      const r = s.recurring.find((r) => r.id === o.recurringId);
      return (
        r?.status === "active" &&
        occurrenceRemaining(s, o) > 0 &&
        o.due <= addDays(asOf, r.reminderDays)
      );
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}
export function payOccurrence(
  s: State,
  id: string,
  amount: number,
  date: string,
  additional = false,
) {
  const o = s.occurrences.find((o) => o.id === id);
  if (!o || o.status === "skipped")
    throw new Error("Occurrence is skipped or unavailable");
  const r = s.recurring.find((r) => r.id === o.recurringId)!;
  if (coveringPrepaid(s, o) && !additional)
    throw new Error(
      "This period is already prepaid; explicitly confirm an additional payment",
    );
  if (amount <= 0) throw new Error("Payment must be positive");
  if (!additional && amount > occurrenceRemaining(s, o))
    throw new Error(
      "Payment exceeds occurrence amount; adjust the variable amount or explicitly approve an additional payment",
    );
  s.transactions.push({
    id: uid(),
    type: "expense",
    amount,
    date,
    description: r.name,
    category: r.category,
    subcategory: "",
    accountId: r.accountId,
    occurrenceId: o.id,
    additionalPayment: additional,
    paymentMethod: "",
    notes: additional ? "Explicit additional payment" : "",
    recurringReference: r.id,
  });
}
export function prepaidPeriods(
  input: Omit<Prepaid, "periods">,
): Prepaid["periods"] {
  if (input.coverageEnd < input.coverageStart)
    throw new Error("Coverage end precedes start");
  const dates =
    input.frequency === "custom"
      ? Array.from({ length: input.count + 1 }, (_, i) =>
          addDays(input.coverageStart, input.customDays * i),
        )
      : [
          ...scheduleDates(input.coverageStart, input.frequency, input.count),
          recurrenceDate(
            input.coverageStart,
            input.frequency,
            input.customDays,
            input.count,
          ),
        ];
  if (
    dates[input.count - 1] > input.coverageEnd ||
    addDays(dates[input.count], -1) < input.coverageEnd
  )
    throw new Error(
      "Coverage end and number of periods do not agree; partial final coverage is supported",
    );
  const base = safe(BigInt(input.amount) / BigInt(input.count));
  const extra = Number(BigInt(input.amount) % BigInt(input.count));
  return dates.slice(0, input.count).map((start, i) => ({
    start,
    end: i === input.count - 1 ? input.coverageEnd : addDays(dates[i + 1], -1),
    amount: base + (i < extra ? 1 : 0),
    normal: input.normalPrice,
  }));
}
export function recordPrepaid(s: State, p: Omit<Prepaid, "periods">) {
  if (
    s.occurrences.some(
      (o) =>
        o.recurringId === p.recurringId &&
        o.due >= p.coverageStart &&
        o.due <= p.coverageEnd &&
        occurrencePaid(s, o.id) > 0,
    )
  )
    throw new Error(
      "Covered period already has a payment; correct it first or start coverage later",
    );
  if (
    s.prepaids.some(
      (old) =>
        p.recurringId &&
        old.recurringId === p.recurringId &&
        old.coverageStart <= p.coverageEnd &&
        p.coverageStart <=
          (old.terminatedOn ? addDays(old.terminatedOn, -1) : old.coverageEnd),
    )
  ) {
    throw new Error("Prepaid coverage overlaps an existing payment");
  }
  if (p.amount <= 0) throw new Error("Actual prepaid payment must be positive");
  s.prepaids.push({ ...p, periods: prepaidPeriods(p) });
  s.transactions.push({
    id: uid(),
    type: "expense",
    amount: p.amount,
    date: p.paymentDate,
    description: `Prepaid: ${p.name}`,
    category: p.category,
    subcategory: "",
    accountId: p.accountId,
    prepaidId: p.id,
    paymentMethod: "",
    notes: p.notes,
    recurringReference: p.recurringId ?? "",
  });
}
function consumed(p: Prepaid, date: string, normal = false): number {
  const cutoff =
    p.terminatedOn && p.terminatedOn < date
      ? addDays(p.terminatedOn, -1)
      : date;
  return sum(
    p.periods.map((period) => {
      if (cutoff < period.start) return 0;
      const totalDays = daysBetween(period.start, period.end) + 1;
      const elapsed = Math.min(
        totalDays,
        daysBetween(period.start, cutoff) + 1,
      );
      return safe(
        (BigInt(normal ? period.normal : period.amount) * BigInt(elapsed)) /
          BigInt(totalDays),
      );
    }),
  );
}
export function prepaidRefunds(s: State, p: Prepaid, asOf = today()): number {
  return sum(
    s.transactions
      .filter(
        (t) =>
          t.type === "prepaid_refund" && t.prepaidId === p.id && t.date <= asOf,
      )
      .map((t) => t.amount),
  );
}
export function prepaidRecognized(
  s: State,
  p: Prepaid,
  asOf = today(),
  normal = false,
): number {
  if (p.paymentDate > asOf) return 0;
  if (p.terminatedOn && p.terminatedOn <= asOf && !normal)
    return Math.max(0, p.amount - prepaidRefunds(s, p, asOf));
  return consumed(p, asOf, normal);
}
export function prepaidBalance(s: State, p: Prepaid, asOf = today()): number {
  if (p.paymentDate > asOf || (p.terminatedOn && p.terminatedOn <= asOf))
    return 0;
  return Math.max(
    0,
    sum([
      p.amount,
      -prepaidRefunds(s, p, asOf),
      -prepaidRecognized(s, p, asOf),
    ]),
  );
}
export function prepaidRecognition(
  s: State,
  start: string,
  end: string,
  category?: string,
  comparison = false,
): number {
  if (end < start) return 0;
  return sum(
    s.prepaids
      .filter((p) => !category || p.category === category)
      .map((p) =>
        sum([
          prepaidRecognized(s, p, end, comparison),
          -prepaidRecognized(s, p, addDays(start, -1), comparison),
        ]),
      ),
  );
}
export function prepaidSavings(p: Prepaid): number {
  return sum([sum(p.periods.map((period) => period.normal)), -p.amount]);
}
export function terminatePrepaid(
  s: State,
  id: string,
  date: string,
  refund: number,
) {
  const p = s.prepaids.find((p) => p.id === id);
  if (!p || p.terminatedOn)
    throw new Error("Prepaid record is already terminated or unavailable");
  if (date < p.paymentDate || date > today())
    throw new Error("Use an actual termination date after payment");
  const refundable = Math.max(
    0,
    sum([
      p.amount,
      -prepaidRecognized(s, p, addDays(date, -1)),
      -prepaidRefunds(s, p, date),
    ]),
  );
  if (refund < 0 || refund > refundable)
    throw new Error("Refund exceeds unconsumed prepaid balance");
  p.terminatedOn = date;
  if (refund > 0)
    s.transactions.push({
      id: uid(),
      type: "prepaid_refund",
      amount: refund,
      date,
      description: `Prepaid refund: ${p.name}`,
      category: p.category,
      subcategory: "",
      accountId: p.accountId,
      prepaidId: p.id,
      paymentMethod: "",
      notes: "Early termination refund",
      recurringReference: "",
    });
}
export function effectiveAllocations(
  s: State,
  b: Budget,
): Budget["allocations"] {
  const allocations = structuredClone(b.allocations);
  const automatic = new Map<string, { amount: number; essential: boolean }>();
  for (const o of s.occurrences.filter(
    (o) => o.due >= b.start && o.due <= b.end && o.status !== "skipped",
  )) {
    const r = s.recurring.find((r) => r.id === o.recurringId)!;
    if (!r.autoBudget || coveringPrepaid(s, o)) continue;
    const previous = automatic.get(r.category);
    automatic.set(r.category, {
      amount: sum([
        previous?.amount ?? 0,
        Math.max(o.amount, occurrencePaid(s, o.id)),
      ]),
      essential: r.essential || Boolean(previous?.essential),
    });
  }
  for (const p of s.prepaids) {
    const amount = prepaidRecognition(
      s,
      b.start,
      b.end,
      p.category,
      p.recognition === "normal",
    );
    // Recognition is aggregated once per category, not once for every prepaid record.
    if (automatic.has(`prepaid:${p.category}`)) continue;
    const previous = automatic.get(p.category);
    automatic.set(p.category, {
      amount: sum([previous?.amount ?? 0, amount]),
      essential:
        Boolean(previous?.essential) ||
        (s.recurring.find((r) => r.id === p.recurringId)?.essential ?? false),
    });
    automatic.set(`prepaid:${p.category}`, { amount: 0, essential: false });
  }
  for (const [category, planned] of automatic) {
    if (category.startsWith("prepaid:")) continue;
    const existing = allocations.find((a) => a.category === category);
    if (existing) existing.amount = Math.max(existing.amount, planned.amount);
    else
      allocations.push({
        category,
        amount: planned.amount,
        essential: planned.essential,
        priority: planned.essential ? 1 : 5,
        purpose: "spending",
        rolloverRule: "none",
        rolloverAmount: 0,
      });
  }
  return allocations;
}
export function categoryUnspent(s: State, b: Budget, category: string): number {
  const allocation =
    effectiveAllocations(s, b).find((a) => a.category === category)?.amount ??
    0;
  return Math.max(
    0,
    sum([
      allocation,
      categoryRollover(s, b, category),
      -budgetActual(s, b, category),
    ]),
  );
}
export function captured(
  s: State,
  budgetId: string,
  category?: string,
): number {
  return sum(
    s.captures
      .filter(
        (c) =>
          c.budgetId === budgetId && (!category || c.category === category),
      )
      .flatMap((c) => c.actions.map((a) => a.amount)),
  );
}
export function categoryRollover(
  s: State,
  b: Budget,
  category: string,
): number {
  const explicit = sum(
    s.captures.flatMap((c) =>
      c.category === category
        ? c.actions
            .filter((a) => a.kind === "carry" && a.targetBudgetId === b.id)
            .map((a) => a.amount)
        : [],
    ),
  );
  const previous = s.budgets
    .filter((p) => p.profileId === b.profileId && p.end < b.start)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!previous) return explicit;
  const rule = previous.allocations.find((a) => a.category === category);
  if (!rule || !["full", "partial"].includes(rule.rolloverRule))
    return explicit;
  const leftover = Math.max(
    0,
    categoryUnspent(s, previous, category) - captured(s, previous.id, category),
  );
  return sum([
    explicit,
    rule.rolloverRule === "partial"
      ? Math.min(leftover, rule.rolloverAmount)
      : leftover,
  ]);
}
export function savingsCaptureCapacity(
  s: State,
  b: Budget,
  category: string,
): number {
  if (
    effectiveAllocations(s, b).find((a) => a.category === category)?.purpose !==
    "spending"
  )
    return 0;
  return Math.min(
    Math.max(0, categoryUnspent(s, b, category) - captured(s, b.id, category)),
    Math.max(0, summary(s).available),
  );
}
export function commitCapture(s: State, capture: SavingsCapture) {
  const b = s.budgets.find((b) => b.id === capture.budgetId);
  if (!b) throw new Error("Budget not found");
  const total = sum(capture.actions.map((a) => a.amount));
  if (total <= 0 || total > savingsCaptureCapacity(s, b, capture.category))
    throw new Error(
      "Capture exceeds unspent allocation or actual available cash",
    );
  s.captures.push(capture);
  for (const a of capture.actions) {
    const base = {
      id: uid(),
      amount: a.amount,
      date: capture.date,
      description: `Savings capture: ${capture.category}`,
      category: capture.category,
      subcategory: "",
      accountId: capture.accountId,
      captureId: capture.id,
      groupId: capture.id,
      paymentMethod: "",
      notes: capture.notes,
      recurringReference: "",
    };
    if (!a.amount) continue;
    if (a.kind === "transfer") {
      if (!a.accountId || a.accountId === capture.accountId)
        throw new Error("Select a different savings destination account");
      const destination = s.accounts.find((r) => r.id === a.accountId);
      if (!destination || destination.kind !== "savings")
        throw new Error("Transfer destination must be a savings account");
      s.transactions.push({
        ...base,
        type: "transfer",
        destinationId: a.accountId,
      });
    }
    if (a.kind === "reserve") {
      const r = s.reserves.find((r) => r.id === a.reserveId);
      if (!r || r.accountId !== capture.accountId)
        throw new Error("Reserve must use the selected source account");
      s.transactions.push({
        ...base,
        type: "reserve_transfer",
        reserveId: a.reserveId,
      });
    }
    if (a.kind === "carry") {
      const target = s.budgets.find((r) => r.id === a.targetBudgetId);
      if (!target || target.start <= b.end)
        throw new Error("Carry forward needs a later budget period");
    }
  }
}
export function undoCapture(s: State, id: string) {
  const capture = s.captures.find((c) => c.id === id);
  if (!capture) throw new Error("Capture not found");
  s.transactions = s.transactions.filter((t) => t.captureId !== id);
  s.captures = s.captures.filter((c) => c.id !== id);
}
export function monthlyReview(s: State, b: Budget) {
  const allocations = effectiveAllocations(s, b);
  const rows = allocations.map((a) => {
    const planned = sum([a.amount, categoryRollover(s, b, a.category)]);
    const actual = budgetActual(s, b, a.category);
    return {
      ...a,
      planned,
      actual,
      unspent: a.purpose === "spending" ? Math.max(0, planned - actual) : 0,
      overspent: Math.max(0, actual - planned),
      captured: captured(s, b.id, a.category),
      capturable: savingsCaptureCapacity(s, b, a.category),
    };
  });
  const actions = s.captures
    .filter((c) => c.budgetId === b.id)
    .flatMap((c) => c.actions);
  const saved = sum(
    actions
      .filter((a) => a.kind === "transfer" || a.kind === "reserve")
      .map((a) => a.amount),
  );
  const carried = sum(
    actions.filter((a) => a.kind === "carry").map((a) => a.amount),
  );
  const unspent = sum(rows.map((r) => r.unspent));
  return {
    rows,
    snapshot: {
      planned: sum(rows.map((r) => r.planned)),
      actual: budgetActual(s, b),
      unspent,
      saved,
      carried,
      available: summary(s).available,
    },
    remainingDecision: Math.max(0, unspent - captured(s, b.id)),
    overspending: sum(rows.map((r) => r.overspent)),
    cashPaid: sum(
      s.transactions
        .filter(
          (t) => t.type === "expense" && t.date >= b.start && t.date <= b.end,
        )
        .map((t) => t.amount),
    ),
    incomeReceived: sum(
      s.transactions
        .filter(
          (t) => t.type === "income" && t.date >= b.start && t.date <= b.end,
        )
        .map((t) => t.amount),
    ),
    startingAvailable: summary(s, addDays(b.start, -1)).available,
  };
}
export function correctTermination(
  s: State,
  id: string,
  date: string,
  refund: number,
) {
  const p = s.prepaids.find((p) => p.id === id);
  if (!p) throw new Error("Prepaid record is missing");
  delete p.terminatedOn;
  s.transactions = s.transactions.filter(
    (t) => !(t.prepaidId === id && t.type === "prepaid_refund"),
  );
  terminatePrepaid(s, id, date, refund);
}
export function finalizeReview(s: State, b: Budget) {
  const record = {
    id: uid(),
    budgetId: b.id,
    month: b.start.slice(0, 7),
    finalizedAt: new Date().toISOString(),
    revision: s.revision + 1,
    snapshot: monthlyReview(s, b).snapshot,
  };
  s.reviews.push(record);
}
export function backupReminder(s: State, appVersion = "1.1.0"): string[] {
  const reasons: string[] = [];
  if (
    !s.settings.lastBackupAt ||
    daysBetween(s.settings.lastBackupAt.slice(0, 10), today()) >=
      s.settings.backupDays
  )
    reasons.push("Your full backup is due");
  if (
    Math.max(
      0,
      s.transactions.length - s.settings.lastBackupTransactionCount,
    ) >= s.settings.backupTransactions
  )
    reasons.push("Many new ledger entries since your last backup");
  if (
    s.settings.lastBackupAppVersion &&
    s.settings.lastBackupAppVersion !== appVersion
  )
    reasons.push(
      "The application version has changed; download a fresh backup",
    );
  return reasons;
}
export function reserveFunding(s: State, id?: string): number {
  return id ? reserveBalance(s, id) : 0;
}

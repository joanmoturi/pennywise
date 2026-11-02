import { today, uid, type State, type Transaction } from "./domain";
import { outstanding, validateState } from "./engine";
import { fingerprint as statementFingerprint } from "./import";
import {
  notificationBatchSchema,
  notificationCandidateSchema,
  postingSchema,
  type NotificationCandidate,
  type NotificationPosting,
  type InboxRecord,
  type ApprovalRule,
} from "./notification-schema";

export const MAX_HANDOFF_BYTES = 500_000;
const normalize = (value = "") =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
const sensitive =
  /\b(otp|one[- ]time|verification code|password|passcode|login|log[- ]in|security code|pin)\b/i;
export function parseNotificationBatch(text: string) {
  if (new TextEncoder().encode(text).length > MAX_HANDOFF_BYTES)
    throw new Error("Handoff is limited to 500 KB and 100 candidates");
  return notificationBatchSchema.parse(JSON.parse(text));
}
function details(record: InboxRecord) {
  return record.amended ?? record.candidate;
}
function transactionDate(c: NotificationCandidate) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(c.occurredAt!));
}
function identity(c: NotificationCandidate) {
  return c.reference
    ? `${normalize(c.source)}|${normalize(c.reference)}|${c.kind === "reversal" ? "reversal" : "payment"}`
    : `${c.source}|${c.fingerprint}`;
}
function content(c: NotificationCandidate) {
  return JSON.stringify([
    c.amount,
    c.currency,
    c.direction,
    c.kind,
    c.occurredAt,
    normalize(c.counterparty),
    c.fee,
    c.balance,
    c.originalReference,
  ]);
}
export function mappedAccount(s: State, c: NotificationCandidate) {
  const mappings = s.notifications.sources.filter(
    (m) =>
      m.enabled &&
      m.source === c.source &&
      (!m.accountHint || normalize(m.accountHint) === normalize(c.accountHint)),
  );
  return mappings.length === 1 ? mappings[0] : undefined;
}
function matchingRules(
  s: State,
  c: NotificationCandidate,
  includeDisabled = false,
) {
  return s.notifications.rules
    .filter(
      (rule) =>
        (includeDisabled || rule.enabled) &&
        rule.source === c.source &&
        rule.kind === c.kind &&
        rule.direction === c.direction &&
        c.amount !== undefined &&
        c.amount >= rule.minimum &&
        c.amount <= rule.maximum &&
        (!rule.counterparty ||
          normalize(rule.counterparty) === normalize(c.counterparty)) &&
        (!rule.referenceRequired || Boolean(c.reference)) &&
        c.confidence >= rule.confidence,
    )
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}
function automaticBlock(s: State, c: NotificationCandidate) {
  if (!mappedAccount(s, c)?.trusted)
    return "Source/account mapping is not uniquely trusted for automation";
  if (
    !c.amount ||
    !c.currency ||
    c.currency !== s.settings.currency ||
    !c.occurredAt ||
    !c.reference ||
    c.direction === "unknown" ||
    c.confidence < 90 ||
    c.validation !== "valid" ||
    c.missing.length
  )
    return "Incomplete, low-confidence or incompatible candidate; review required";
  if (["reversal", "failed", "balance", "unknown"].includes(c.kind))
    return "This notification type cannot be automatically posted";
  if (transactionDate(c) > today()) return "Future transaction timestamp";
  return "";
}
export function simulateNotification(
  s: State,
  c: NotificationCandidate,
  includeDisabled = false,
) {
  const matching = matchingRules(s, c, includeDisabled);
  if (!matching.length)
    return { reason: "No rule matched; manual review required" };
  // A lower-priority contradictory rule is still a conflict, not a silent fallback.
  const signatures = new Set(
    matching.map((r) => JSON.stringify([r.action, r.posting])),
  );
  if (signatures.size > 1)
    return { reason: "Conflicting rules matched; manual review required" };
  const rule = matching[0];
  if (rule.action !== "approve")
    return { rule, reason: `Matched ${rule.name}: ${rule.action}` };
  try {
    postingSafety(s, c, rule.posting, true);
    if (
      [
        "earned_income",
        "borrowed_funds",
        "loan_repayment",
        "investment_income",
      ].includes(rule.posting.classification) &&
      !rule.counterparty
    )
      throw new Error(
        "Incoming automation requires an exact known counterparty, not a broad incoming rule",
      );
    return { rule, reason: `Matched ${rule.name}` };
  } catch (error) {
    return {
      rule,
      reason: error instanceof Error ? error.message : "Rule blocked",
    };
  }
}
function postingSafety(
  s: State,
  c: NotificationCandidate,
  p: NotificationPosting,
  automatic: boolean,
) {
  if (
    !c.amount ||
    !c.currency ||
    c.currency !== s.settings.currency ||
    !c.occurredAt
  )
    throw new Error(
      "Choose a valid amount, currency and actual transaction timestamp",
    );
  if (transactionDate(c) > today())
    throw new Error("Future transaction cannot be posted");
  if (
    c.validation === "excluded" ||
    ["failed", "balance", "unknown"].includes(c.kind)
  )
    throw new Error(
      "Failed, balance-only, excluded or unknown candidates cannot enter the ledger",
    );
  if (!s.accounts.some((a) => a.id === p.accountId))
    throw new Error("Choose an existing account");
  const credit = [
    "earned_income",
    "investment_income",
    "bond_coupon",
    "borrowed_funds",
    "loan_repayment",
    "refund",
    "other_receipt",
    "bond_principal",
  ];
  if (credit.includes(p.classification) && c.direction !== "credit")
    throw new Error("Receipt requires an unambiguous credit");
  if (
    ["expense", "liability_repayment"].includes(p.classification) &&
    c.direction !== "debit"
  )
    throw new Error("Payment requires an unambiguous debit");
  if (p.classification === "transfer") {
    if (
      !p.destinationId ||
      p.destinationId === p.accountId ||
      !s.accounts.some((a) => a.id === p.destinationId)
    )
      throw new Error(
        "Choose two distinct owned accounts (source and destination)",
      );
  }
  if (c.kind === "transfer" && p.classification !== "transfer")
    throw new Error("A transfer must not become income or an expense");
  if (c.kind === "reversal" && p.classification !== "reversal")
    throw new Error("A reversal must link the original transaction");
  if (
    c.kind === "loan_repayment" &&
    !["loan_repayment", "liability_repayment"].includes(p.classification)
  )
    throw new Error(
      "A principal repayment must link a receivable or liability",
    );
  if (c.kind === "principal" && p.classification !== "bond_principal")
    throw new Error("Bond principal is not income");
  if (c.kind === "coupon" && p.classification !== "bond_coupon")
    throw new Error("Bond coupon must be linked investment income");
  if (c.kind === "interest" && p.classification !== "investment_income")
    throw new Error("Interest must be classified as investment income");
  if (c.kind === "refund" && p.classification !== "refund")
    throw new Error("A refund must not become earned income");
  if (
    p.classification === "loan_repayment" &&
    (!s.receivables.some((r) => r.id === p.relatedId && !r.writtenOff) ||
      c.amount > outstanding(s, p.relatedId!, "receivable"))
  )
    throw new Error(
      "Select an outstanding receivable; separate interest from principal",
    );
  if (
    ["borrowed_funds", "liability_repayment"].includes(p.classification) &&
    !s.liabilities.some(
      (r) => r.id === p.relatedId && r.accountId === p.accountId,
    )
  )
    throw new Error(
      "Create/select the liability first; its principal must include this borrowing",
    );
  if (
    ["bond_coupon", "bond_principal"].includes(p.classification) &&
    !s.bonds.some((r) => r.id === p.relatedId && r.accountId === p.accountId)
  )
    throw new Error("Select the bond and its receiving account");
  if (automatic) {
    const block = automaticBlock(s, c);
    if (block) throw new Error(block);
    if (p.classification === "reversal")
      throw new Error("Reversals always require manual review");
    if (p.classification === "transfer" && c.direction !== "debit")
      throw new Error(
        "Incoming owned-transfer notification requires source/destination review",
      );
    if (mappedAccount(s, c)?.accountId !== p.accountId)
      throw new Error("Rule target conflicts with source account mapping");
  }
}
function transactionFor(
  c: NotificationCandidate,
  p: NotificationPosting,
): Transaction {
  const types = {
    expense: "expense",
    earned_income: "income",
    investment_income: "income",
    bond_coupon: "income",
    borrowed_funds: "liability_draw",
    loan_repayment: "loan_recovery",
    liability_repayment: "liability_repayment",
    transfer: "transfer",
    refund: "adjustment",
    other_receipt: "adjustment",
    bond_principal: "bond_maturity",
    reversal: "adjustment",
  } as const;
  return {
    id: uid(),
    type: types[p.classification],
    amount: c.amount!,
    date: transactionDate(c),
    description:
      `${c.counterparty || c.kind}${c.reference ? ` (${c.reference})` : ""}`.slice(
        0,
        160,
      ),
    category: p.classification === "bond_coupon" ? "Bond coupon" : p.category,
    subcategory: "",
    accountId: p.accountId,
    ...(p.classification === "transfer"
      ? { destinationId: p.destinationId }
      : {}),
    ...([
      "loan_repayment",
      "borrowed_funds",
      "liability_repayment",
      "bond_coupon",
      "bond_principal",
    ].includes(p.classification)
      ? { relatedId: p.relatedId }
      : {}),
    paymentMethod: "Notification import",
    recurringReference: "",
    notes: `Reviewed notification: ${p.classification}. Parser ${c.parserId}/${c.parserVersion}.`,
  };
}
export function approveNotification(
  s: State,
  inboxId: string,
  input: NotificationPosting,
  rule?: ApprovalRule,
) {
  const record = s.notifications.inbox.find((r) => r.id === inboxId);
  if (!record) throw new Error("Inbox record not found");
  if (record.status === "approved" || record.transactionIds.length) return;
  if (["duplicate", "rejected"].includes(record.status))
    throw new Error("This item cannot be posted");
  if (record.status === "conflict")
    throw new Error("Conflicting capture must be reconciled before posting");
  if (
    record.candidate.validation === "excluded" ||
    ["failed", "balance"].includes(record.candidate.kind)
  )
    throw new Error(
      "Original capture is failed, excluded or balance-only; it cannot enter the ledger",
    );
  const c = details(record);
  const p = postingSchema.parse(input);
  postingSafety(s, c, p, Boolean(rule));
  if (
    rule &&
    [
      "earned_income",
      "borrowed_funds",
      "loan_repayment",
      "investment_income",
    ].includes(p.classification) &&
    !rule.counterparty
  )
    throw new Error(
      "Incoming automation requires an exact known counterparty, not a broad incoming rule",
    );
  const proposed = transactionFor(c, p);
  const existing = s.transactions.find(
    (t) =>
      t.notification &&
      t.notification.reference &&
      normalize(t.notification.reference) === normalize(c.reference) &&
      (t.accountId === p.accountId || t.destinationId === p.accountId) &&
      !t.reversalOf,
  );
  if (existing && p.classification !== "reversal") {
    record.status = existing.amount === c.amount ? "duplicate" : "conflict";
    record.reason = "Reference already exists in the ledger; no second posting";
    return;
  }
  if (
    rule &&
    s.transactions.some(
      (t) =>
        statementFingerprint(t) === statementFingerprint(proposed) ||
        (t.accountId === proposed.accountId &&
          t.date === proposed.date &&
          t.amount === proposed.amount &&
          (t.type === proposed.type || t.type === "transfer")),
    )
  )
    throw new Error(
      "Possible existing statement entry or opposite transfer notification; review required",
    );
  let additions: Transaction[];
  if (p.classification === "reversal") {
    const original = s.transactions.find(
      (t) => t.id === p.originalTransactionId,
    );
    if (
      !original ||
      original.reversalOf ||
      original.amount <= 0 ||
      original.accountId !== p.accountId ||
      c.amount !== original.amount ||
      original.prepaidId ||
      original.captureId ||
      original.windfallId ||
      original.type === "liability_draw" ||
      original.type === "bond_maturity" ||
      original.type === "reserve_transfer" ||
      s.transactions.some((t) => t.reversalOf === original.id)
    )
      throw new Error(
        "Select an unreversed exact original; complex borrowing/prepaid/principal/reserve reversals require separate manual reconciliation",
      );
    if (
      c.originalReference &&
      normalize(original.notification?.reference) !==
        normalize(c.originalReference)
    )
      throw new Error(
        "Reversal reference does not match the selected original",
      );
    const originalDirection = [
      "expense",
      "debt_repayment",
      "liability_repayment",
      "loan_disbursement",
    ].includes(original.type)
      ? "debit"
      : "credit";
    if (
      c.direction === "unknown" ||
      (original.type !== "transfer" && c.direction === originalDirection)
    )
      throw new Error("Reversal direction must offset the original");
    const inverse: Transaction = {
      ...original,
      id: uid(),
      amount: -original.amount,
      date: proposed.date,
      description: `Reversal: ${original.description}`.slice(0, 160),
      reversalOf: original.id,
      notes: "Explicitly reviewed reversal; original retained",
    };
    delete inverse.notification;
    delete inverse.receipt;
    additions = [inverse];
  } else additions = [proposed];
  if (c.fee) {
    if (p.classification === "reversal")
      throw new Error("Review reversal fees separately");
    additions.push({
      ...proposed,
      id: uid(),
      type: "expense",
      amount: c.fee,
      description: `Fee: ${proposed.description}`.slice(0, 160),
      category: "Transaction fees",
      relatedId: undefined,
      destinationId: undefined,
    });
  }
  const now = new Date().toISOString();
  for (const t of additions)
    t.notification = {
      inboxId: record.id,
      fingerprint: c.fingerprint,
      source: c.source,
      reference: c.reference,
      approvedAt: now,
      confidence: c.confidence,
      explanation: rule
        ? `Rule ${rule.name} v${rule.version}`
        : "Explicit manual approval",
      ...(rule ? { ruleId: rule.id, ruleVersion: rule.version } : {}),
    };
  // Validate a copy before mutating; a blocked candidate must not partially post fees.
  const trial = structuredClone(s);
  trial.transactions.push(...additions);
  const trialRecord = trial.notifications.inbox.find(
    (r) => r.id === record.id,
  )!;
  Object.assign(trialRecord, {
    status: "approved",
    posting: p,
    transactionIds: additions.map((t) => t.id),
    reason: additions[0].notification!.explanation,
    approvedAt: now,
    ...(rule ? { ruleId: rule.id, ruleVersion: rule.version } : {}),
  });
  validateState(trial);
  s.transactions.push(...additions);
  Object.assign(record, trialRecord);
}
export function ingestNotifications(
  s: State,
  input: unknown,
  runRules = false,
) {
  const batch = notificationBatchSchema.parse(input);
  for (const incoming of batch.candidates) {
    if (
      sensitive.test(
        [incoming.raw, incoming.counterparty].filter(Boolean).join(" "),
      )
    )
      continue; // Do not retain unrelated secrets, even as an inbox error.
    const candidate = { ...incoming };
    delete candidate.raw;
    const key = identity(candidate);
    const exact = s.notifications.inbox.find(
      (r) => r.candidate.id === candidate.id || r.identity === key,
    );
    if (exact) {
      exact.deliveries++;
      if (exact.content !== content(candidate)) {
        exact.updates ??= [];
        if (exact.updates.length >= 20)
          throw new Error(
            "Too many conflicting updates; reconcile this capture first",
          );
        exact.updates.push(candidate);
        exact.status = exact.transactionIds.length ? "approved" : "conflict";
        exact.reason =
          "Conflicting notification update received; original and ledger retained. Review the original before correcting.";
      }
      continue;
    }
    const crossSource = s.notifications.inbox.find(
      (r) =>
        candidate.reference &&
        normalize(r.candidate.reference) === normalize(candidate.reference) &&
        mappedAccount(s, r.candidate)?.accountId ===
          mappedAccount(s, candidate)?.accountId &&
        Boolean(mappedAccount(s, candidate)) &&
        r.candidate.kind !== "reversal" &&
        candidate.kind !== "reversal",
    );
    const record: InboxRecord = {
      id: uid(),
      candidate,
      batchId: batch.batchId,
      importedAt: new Date().toISOString(),
      status: crossSource
        ? crossSource.content === content(candidate)
          ? "duplicate"
          : "conflict"
        : candidate.validation === "excluded" ||
            ["balance", "failed"].includes(candidate.kind)
          ? "error"
          : "pending",
      reason: crossSource
        ? "Same account/reference already captured; reconcile source update"
        : "Awaiting explicit financial classification",
      deliveries: 1,
      transactionIds: [],
      identity: key,
      content: content(candidate),
    };
    s.notifications.inbox.push(record);
    if (record.status !== "pending" || !runRules) continue;
    const decision = simulateNotification(s, candidate);
    record.reason = decision.reason;
    const rule = decision.rule;
    if (!rule) continue;
    rule.lastMatchedAt = record.importedAt;
    rule.matchCount++;
    record.ruleId = rule.id;
    record.ruleVersion = rule.version;
    if (decision.reason.startsWith("Conflicting")) continue;
    if (rule.action === "reject") {
      record.status = "rejected";
    } else if (rule.action === "assign" || rule.action === "categorise") {
      record.posting = rule.posting;
    } else if (rule.action === "approve") {
      try {
        approveNotification(s, record.id, rule.posting, rule);
      } catch (error) {
        record.reason = error instanceof Error ? error.message : "Rule blocked";
      }
    }
  }
}
export function amendNotification(s: State, id: string, input: unknown) {
  const record = s.notifications.inbox.find((r) => r.id === id);
  if (
    !record ||
    record.transactionIds.length ||
    ["duplicate", "rejected", "conflict"].includes(record.status)
  )
    throw new Error(
      "Posted, duplicate, rejected or conflicting records cannot be rewritten",
    );
  const candidate = notificationCandidateSchema.parse(input);
  if (
    candidate.id !== record.candidate.id ||
    candidate.source !== record.candidate.source ||
    candidate.fingerprint !== record.candidate.fingerprint
  )
    throw new Error(
      "Capture identity cannot be edited; reconcile reference/source conflicts separately",
    );
  delete candidate.raw;
  record.amended = candidate;
  record.status = "pending";
  record.reason = "Details amended manually; original capture retained";
}
export function resolveNotificationConflict(
  s: State,
  id: string,
  update?: number,
) {
  const record = s.notifications.inbox.find((r) => r.id === id);
  if (!record || record.status !== "conflict" || record.transactionIds.length)
    throw new Error("Only an unposted conflict can be manually reconciled");
  if (update !== undefined) {
    const selected = record.updates?.[update];
    if (!selected) throw new Error("Conflicting update not found");
    record.amended = { ...selected, id: record.candidate.id };
  }
  record.status = "pending";
  record.reason =
    update === undefined
      ? "Conflict reviewed: original capture selected manually"
      : "Conflict reviewed: selected update retained as amended details";
}

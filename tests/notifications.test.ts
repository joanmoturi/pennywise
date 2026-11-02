import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  ingestNotifications,
  approveNotification,
  parseNotificationBatch,
  simulateNotification,
  amendNotification,
  mappedAccount,
  resolveNotificationConflict,
} from "../src/notifications";
import {
  accountBalance,
  outstanding,
  summary,
  validateState,
} from "../src/engine";
import { fullBackup, encryptBackup, decodeBackup } from "../src/backup";
import { migrate, Repository, openDatabase } from "../src/storage";
import { stageHandoff, stagedHandoffs, discardHandoff } from "../src/handoff";
import { fixture, cash, liability, receivable } from "./fixtures";
import type { State } from "../src/domain";
import type {
  NotificationCandidate,
  ApprovalRule,
  NotificationPosting,
} from "../src/notification-schema";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});
function candidate(
  extra: Partial<NotificationCandidate> = {},
): NotificationCandidate {
  return {
    id: crypto.randomUUID(),
    source: "synthetic.mpesa",
    parserId: "synthetic-labelled",
    parserVersion: "1",
    capturedAt: "2026-11-02T08:00:00Z",
    occurredAt: "2026-11-02T07:59:00Z",
    reference: crypto.randomUUID(),
    amount: cash("5000"),
    currency: "KES",
    direction: "credit",
    kind: "received",
    counterparty: "TEST known sender",
    fee: 0,
    confidence: 99,
    missing: [],
    validation: "valid",
    fingerprint: "a".repeat(64),
    ...extra,
  };
}
function batch(...candidates: NotificationCandidate[]) {
  return {
    format: "pennywise-notification-batch",
    version: 1,
    batchId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    candidates,
  };
}
function posting(
  classification: NotificationPosting["classification"] = "other_receipt",
): NotificationPosting {
  return { classification, accountId: "cash", category: "TEST category" };
}
function mapped(): State {
  const s = fixture();
  s.notifications.sources.push({
    id: "mapping",
    source: "synthetic.mpesa",
    name: "TEST source",
    accountId: "cash",
    accountHint: "",
    trusted: true,
    enabled: true,
  });
  return s;
}
function rule(extra: Partial<ApprovalRule> = {}): ApprovalRule {
  return {
    id: crypto.randomUUID(),
    version: 1,
    name: "TEST exact sender",
    enabled: true,
    priority: 1,
    source: "synthetic.mpesa",
    kind: "received",
    direction: "credit",
    minimum: 1,
    maximum: cash("100000"),
    counterparty: "TEST known sender",
    referenceRequired: true,
    confidence: 95,
    action: "approve",
    posting: posting(),
    createdAt: new Date().toISOString(),
    matchCount: 0,
    ...extra,
  };
}
function importOne(s: State, c: NotificationCandidate) {
  ingestNotifications(s, batch(c));
  return s.notifications.inbox.at(-1)!;
}
describe("notification financial accounting", () => {
  it("adds KES 5,000 to the selected wallet once, not automatically earned income", () => {
    const s = mapped();
    const c = candidate();
    const item = importOne(s, c);
    approveNotification(s, item.id, { ...posting(), accountId: "other" });
    ingestNotifications(s, batch(c), true);
    approveNotification(s, item.id, posting());
    expect(accountBalance(s, "other")).toBe(cash("5000"));
    expect(summary(s).income).toBe(0);
    expect(s.transactions).toHaveLength(1);
    expect(item.deliveries).toBe(2);
  });
  it("records KES 2,000 merchant payment and a separate fee without inventing income", () => {
    const s = mapped();
    const item = importOne(
      s,
      candidate({
        kind: "merchant",
        direction: "debit",
        amount: cash("2000"),
        fee: cash("20"),
      }),
    );
    approveNotification(s, item.id, posting("expense"));
    expect(accountBalance(s, "cash")).toBe(cash("97980"));
    expect(summary(s).income).toBe(0);
    expect(s.transactions.map((t) => t.amount)).toEqual([
      cash("2000"),
      cash("20"),
    ]);
    validateState(s);
  });
  it("moves KES 10,000 between owned accounts without income or expenses", () => {
    const s = mapped();
    const item = importOne(
      s,
      candidate({
        kind: "transfer",
        direction: "debit",
        amount: cash("10000"),
      }),
    );
    approveNotification(s, item.id, {
      ...posting("transfer"),
      destinationId: "other",
    });
    expect(accountBalance(s, "cash")).toBe(cash("90000"));
    expect(accountBalance(s, "other")).toBe(cash("10000"));
    expect(summary(s).income).toBe(0);
    expect(s.transactions.filter((t) => t.type === "expense")).toHaveLength(0);
  });
  it("reduces a receivable by KES 5,000, not earned income", () => {
    const s = mapped();
    receivable(s);
    const item = importOne(s, candidate({ kind: "loan_repayment" }));
    approveNotification(s, item.id, {
      ...posting("loan_repayment"),
      relatedId: "borrower",
    });
    expect(outstanding(s, "borrower", "receivable")).toBe(cash("5000"));
    expect(accountBalance(s, "cash")).toBe(cash("105000"));
    expect(summary(s).income).toBe(0);
  });
  it("receives KES 100,000 against an explicitly recorded liability without income", () => {
    const s = mapped();
    liability(s, "100000");
    const item = importOne(s, candidate({ amount: cash("100000") }));
    approveNotification(s, item.id, {
      ...posting("borrowed_funds"),
      relatedId: "business",
    });
    expect(outstanding(s, "business", "liability")).toBe(cash("100000"));
    expect(accountBalance(s, "cash")).toBe(cash("200000"));
    expect(summary(s).income).toBe(0);
  });
  it("records a KES 3,000 bond coupon as linked investment income", () => {
    const s = mapped();
    s.bonds.push({
      id: "bond",
      name: "TEST hypothetical bond",
      identifier: "TEST-BOND",
      issuer: "TEST",
      principal: cash("100000"),
      couponBps: 600,
      taxBps: 0,
      paymentsPerYear: 2,
      maturity: "2030-01-01",
      maturityValue: cash("100000"),
      accountId: "cash",
      notes: "",
    });
    const item = importOne(
      s,
      candidate({ kind: "coupon", amount: cash("3000") }),
    );
    approveNotification(s, item.id, {
      ...posting("bond_coupon"),
      relatedId: "bond",
    });
    expect(summary(s).income).toBe(cash("3000"));
    expect(s.transactions[0].category).toBe("Bond coupon");
    expect(s.transactions[0].relatedId).toBe("bond");
  });
  it("retains and offsets the original expense using an exact linked reversal", () => {
    const s = mapped();
    const original = importOne(
      s,
      candidate({ kind: "merchant", direction: "debit" }),
    );
    approveNotification(s, original.id, posting("expense"));
    const reversing = importOne(
      s,
      candidate({
        kind: "reversal",
        originalReference: original.candidate.reference,
      }),
    );
    approveNotification(s, reversing.id, {
      ...posting("reversal"),
      originalTransactionId: s.transactions[0].id,
    });
    expect(s.transactions).toHaveLength(2);
    expect(s.transactions[1].reversalOf).toBe(s.transactions[0].id);
    expect(accountBalance(s, "cash")).toBe(cash("100000"));
    expect(
      s.transactions
        .filter((t) => t.type === "expense")
        .reduce((v, t) => v + t.amount, 0),
    ).toBe(0);
    validateState(s);
  });
  it("reverses a loan recovery without losing the outstanding receivable", () => {
    const s = mapped();
    receivable(s);
    const original = importOne(s, candidate({ kind: "loan_repayment" }));
    approveNotification(s, original.id, {
      ...posting("loan_repayment"),
      relatedId: "borrower",
    });
    const reversing = importOne(
      s,
      candidate({ kind: "reversal", direction: "debit" }),
    );
    approveNotification(s, reversing.id, {
      ...posting("reversal"),
      originalTransactionId: s.transactions[0].id,
    });
    expect(outstanding(s, "borrower", "receivable")).toBe(cash("10000"));
    expect(summary(s).income).toBe(0);
  });
  it("blocks second reversals and transfer misclassification", () => {
    const s = mapped();
    const t = importOne(s, candidate({ kind: "transfer", direction: "debit" }));
    expect(() => approveNotification(s, t.id, posting("expense"))).toThrow(
      /transfer/i,
    );
    expect(s.transactions).toHaveLength(0);
  });
  it("prevents a second reversal of the same original even with a different capture reference", () => {
    const s = mapped();
    const original = importOne(
      s,
      candidate({ kind: "merchant", direction: "debit" }),
    );
    approveNotification(s, original.id, posting("expense"));
    const originalId = s.transactions[0].id;
    for (let index = 0; index < 2; index++) {
      const item = importOne(s, candidate({ kind: "reversal" }));
      const perform = () =>
        approveNotification(s, item.id, {
          ...posting("reversal"),
          originalTransactionId: originalId,
        });
      if (index === 0) perform();
      else expect(perform).toThrow(/unreversed exact original/);
    }
    expect(s.transactions).toHaveLength(2);
  });
  it("rejects a reversal with a conflicting original reference without touching the original", () => {
    const s = mapped();
    const original = importOne(
      s,
      candidate({ kind: "merchant", direction: "debit" }),
    );
    approveNotification(s, original.id, posting("expense"));
    const reversing = importOne(
      s,
      candidate({ kind: "reversal", originalReference: "TEST-wrong-original" }),
    );
    expect(() =>
      approveNotification(s, reversing.id, {
        ...posting("reversal"),
        originalTransactionId: s.transactions[0].id,
      }),
    ).toThrow(/reference does not match/);
    expect(s.transactions).toHaveLength(1);
  });
  it("does not partially commit principal or fees when repayment exceeds the receivable", () => {
    const s = mapped();
    receivable(s, "1000");
    const item = importOne(
      s,
      candidate({
        kind: "loan_repayment",
        amount: cash("5000"),
        fee: cash("20"),
      }),
    );
    expect(() =>
      approveNotification(s, item.id, {
        ...posting("loan_repayment"),
        relatedId: "borrower",
      }),
    ).toThrow(/outstanding receivable/);
    expect(s.transactions).toHaveLength(0);
    expect(item.status).toBe("pending");
  });
  it("blocks misclassifying refunds, coupons, principal and interest as earned income", () => {
    for (const kind of ["refund", "coupon", "principal", "interest"] as const) {
      const s = mapped();
      const item = importOne(s, candidate({ kind }));
      expect(() =>
        approveNotification(s, item.id, posting("earned_income")),
      ).toThrow();
      expect(s.transactions).toHaveLength(0);
    }
  });
});
describe("rules, confidence and identity boundaries", () => {
  it("automatically applies an exact trusted sender rule with immutable provenance", () => {
    const s = mapped();
    s.notifications.rules.push(rule({ posting: posting("earned_income") }));
    ingestNotifications(s, batch(candidate()), true);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].notification?.ruleVersion).toBe(1);
    expect(s.notifications.rules[0].matchCount).toBe(1);
    expect(s.notifications.inbox[0].status).toBe("approved");
  });
  it.each([
    { confidence: 60 },
    { amount: undefined },
    { reference: undefined },
    { direction: "unknown" as const },
    { currency: undefined },
    { occurredAt: undefined },
    { missing: ["reference"] },
    { kind: "reversal" as const },
    { kind: "failed" as const },
    { kind: "balance" as const },
    { currency: "USD" as const },
  ])("holds unsafe automated candidate %j", (extra) => {
    const s = mapped();
    const c = candidate(extra);
    s.notifications.rules.push(rule({ kind: c.kind, direction: c.direction }));
    ingestNotifications(s, batch(c), true);
    expect(s.transactions).toHaveLength(0);
  });
  it("blocks broad all-receipts income rules", () => {
    const s = mapped();
    s.notifications.rules.push(
      rule({ counterparty: "", posting: posting("earned_income") }),
    );
    ingestNotifications(s, batch(candidate()), true);
    expect(s.transactions).toHaveLength(0);
    expect(s.notifications.inbox[0].reason).toMatch(/exact known counterparty/);
  });
  it("holds contradictory matching rules regardless of priority", () => {
    const s = mapped();
    s.notifications.rules.push(
      rule(),
      rule({ priority: 50, posting: posting("earned_income") }),
    );
    ingestNotifications(s, batch(candidate()), true);
    expect(s.transactions).toHaveLength(0);
    expect(s.notifications.inbox[0].reason).toMatch(/Conflicting/);
  });
  it("simulates disabled rules without mutating state", () => {
    const s = mapped();
    s.notifications.rules.push(rule({ enabled: false }));
    const original = structuredClone(s);
    expect(simulateNotification(s, candidate(), true).rule?.name).toBe(
      "TEST exact sender",
    );
    expect(s).toEqual(original);
  });
  it("requires explicit import permission before running rules", () => {
    const s = mapped();
    s.notifications.rules.push(rule());
    ingestNotifications(s, batch(candidate()));
    expect(s.transactions).toHaveLength(0);
  });
  it("requires one enabled mapping and never guesses between two accounts", () => {
    const s = mapped();
    s.notifications.sources.push({
      ...s.notifications.sources[0],
      id: "mapping2",
      accountId: "other",
    });
    expect(mappedAccount(s, candidate())).toBeUndefined();
    s.notifications.rules.push(rule());
    ingestNotifications(s, batch(candidate()), true);
    expect(s.transactions).toHaveLength(0);
  });
  it("identifies retries by stable references, not notification ID or payload batch ID", () => {
    const s = mapped();
    s.notifications.rules.push(rule());
    const c = candidate();
    ingestNotifications(s, batch(c), true);
    ingestNotifications(s, batch({ ...c, id: crypto.randomUUID() }), true);
    expect(s.notifications.inbox).toHaveLength(1);
    expect(s.transactions).toHaveLength(1);
  });
  it("holds conflicting updates and preserves the changed candidate for inspection", () => {
    const s = mapped();
    const c = candidate();
    importOne(s, c);
    ingestNotifications(s, batch({ ...c, amount: 1 }));
    expect(s.notifications.inbox[0].status).toBe("conflict");
    expect(s.notifications.inbox[0].updates?.[0].amount).toBe(1);
    expect(() =>
      approveNotification(s, s.notifications.inbox[0].id, posting()),
    ).toThrow(/Conflicting/);
    expect(s.transactions).toHaveLength(0);
  });
  it("retains a posted original when a changed notification arrives", () => {
    const s = mapped();
    const c = candidate();
    const item = importOne(s, c);
    approveNotification(s, item.id, posting());
    ingestNotifications(s, batch({ ...c, amount: 1 }));
    expect(accountBalance(s, "cash")).toBe(cash("105000"));
    expect(item.updates).toHaveLength(1);
  });
  it("allows explicit conflict resolution while retaining original and updated evidence", () => {
    const s = mapped();
    const c = candidate();
    const item = importOne(s, c);
    ingestNotifications(s, batch({ ...c, amount: cash("4000") }));
    resolveNotificationConflict(s, item.id, 0);
    approveNotification(s, item.id, posting());
    expect(s.transactions[0].amount).toBe(cash("4000"));
    expect(item.candidate.amount).toBe(cash("5000"));
    expect(item.updates).toHaveLength(1);
  });
  it("holds an already-entered CSV/ledger receipt instead of auto-posting it again", () => {
    const s = mapped();
    s.transactions.push({
      id: "TEST-statement",
      type: "adjustment",
      amount: cash("5000"),
      accountId: "cash",
      date: "2026-11-02",
      description: "TEST existing statement row",
      category: "Other",
      subcategory: "",
      paymentMethod: "Statement",
      notes: "",
      recurringReference: "",
    });
    s.notifications.rules.push(rule());
    ingestNotifications(s, batch(candidate()), true);
    expect(s.transactions).toHaveLength(1);
    expect(s.notifications.inbox[0].reason).toMatch(
      /Possible existing statement/,
    );
  });
  it("guards against duplicate SMS and app captures mapped to the same account", () => {
    const s = mapped();
    s.notifications.sources.push({
      ...s.notifications.sources[0],
      id: "sms",
      source: "synthetic.sms",
    });
    const c = candidate();
    importOne(s, c);
    ingestNotifications(
      s,
      batch({ ...c, id: crypto.randomUUID(), source: "synthetic.sms" }),
    );
    expect(s.notifications.inbox[1].status).toBe("duplicate");
    expect(() =>
      approveNotification(s, s.notifications.inbox[1].id, posting()),
    ).toThrow(/cannot be posted/);
  });
  it("drops sensitive text without retaining it in inbox or ledger", () => {
    const s = mapped();
    ingestNotifications(
      s,
      batch(candidate({ raw: "TEST OTP verification code 123456" })),
    );
    expect(s.notifications.inbox).toHaveLength(0);
    expect(JSON.stringify(s)).not.toContain("123456");
  });
  it("retains missing-field candidates for correction without inventing amounts", () => {
    const s = mapped();
    const c = candidate({
      amount: undefined,
      occurredAt: undefined,
      confidence: 10,
      missing: ["amount", "occurredAt"],
      validation: "incomplete",
    });
    const item = importOne(s, c);
    expect(() => approveNotification(s, item.id, posting())).toThrow(/amount/);
    amendNotification(s, item.id, {
      ...c,
      amount: cash("5000"),
      occurredAt: "2026-11-02T00:00:00+03:00",
      missing: [],
      validation: "valid",
    });
    approveNotification(s, item.id, posting());
    expect(s.transactions[0].date).toBe("2026-11-02");
    expect(item.candidate.amount).toBeUndefined();
  });
  it("rejects malformed or oversized payloads and unknown versions", () => {
    for (const text of [
      "{",
      JSON.stringify({ ...batch(candidate()), version: 2 }),
      "x".repeat(500001),
    ])
      expect(() => parseNotificationBatch(text)).toThrow();
    expect(() =>
      parseNotificationBatch(JSON.stringify(batch(candidate({ amount: -1 })))),
    ).toThrow();
  });
});
describe("notification atomic persistence and recovery", () => {
  it("backs up inbox, rules, mappings, provenance and fingerprints; restore stays idempotent", async () => {
    const s = mapped();
    s.notifications.rules.push(rule());
    const c = candidate();
    ingestNotifications(s, batch(c), true);
    const restored = await decodeBackup(
      await encryptBackup(s, "TEST long portable password"),
      "TEST long portable password",
    );
    expect(restored).toEqual(s);
    ingestNotifications(restored, batch(c), true);
    expect(restored.transactions).toHaveLength(1);
    validateState(restored);
  });
  it("migrates schema 3 without changing ledger/account/settings data", () => {
    const original = fixture();
    const { notifications: ignored, ...old } = original;
    void ignored;
    const migrated = migrate({ ...old, version: 3 });
    expect(migrated.accounts).toEqual(original.accounts);
    expect(migrated.settings).toEqual(original.settings);
    expect(migrated.version).toBe(4);
    expect(migrated.notifications.inbox).toEqual([]);
  });
  it("rejects backups with broken inbox/ledger relationships", async () => {
    const s = mapped();
    const item = importOne(s, candidate());
    approveNotification(s, item.id, posting());
    s.transactions = [];
    await expect(fullBackup(s)).rejects.toThrow(/relationship/);
  });
  it("serializes concurrent repeated handoffs within the existing database transaction", async () => {
    const db = await openDatabase(`TEST-notify-${crypto.randomUUID()}`);
    try {
      const repo = new Repository(db);
      await repo.restore(mapped());
      const payload = batch(candidate());
      await Promise.all([
        repo.update("TEST handoff", (s) => ingestNotifications(s, payload)),
        repo.update("TEST retry", (s) => ingestNotifications(s, payload)),
      ]);
      const s = await repo.read();
      expect(s.notifications.inbox).toHaveLength(1);
      expect(s.notifications.inbox[0].deliveries).toBe(2);
    } finally {
      db.close();
    }
  });
  it("locally stages valid shares without modifying the financial ledger", async () => {
    const payload = batch(candidate());
    await stageHandoff(JSON.stringify(payload));
    const staged = (await stagedHandoffs()).find(
      (v) => v.id === payload.batchId,
    )!;
    expect(staged.batch.candidates).toHaveLength(1);
    await discardHandoff(payload.batchId);
    expect(
      (await stagedHandoffs()).find((v) => v.id === payload.batchId),
    ).toBeUndefined();
  });
});

import { z } from "zod";

const label = z.string().trim().min(1).max(160);
const identifier = z.string().min(1).max(100);
const minor = z.number().int().safe().nonnegative();
export const candidateKinds = [
  "received",
  "sent",
  "withdrawal",
  "deposit",
  "transfer",
  "merchant",
  "paybill",
  "buy_goods",
  "charge",
  "loan_repayment",
  "interest",
  "coupon",
  "refund",
  "principal",
  "reversal",
  "failed",
  "balance",
  "unknown",
] as const;
export const classifications = [
  "expense",
  "earned_income",
  "investment_income",
  "bond_coupon",
  "borrowed_funds",
  "loan_repayment",
  "liability_repayment",
  "transfer",
  "refund",
  "other_receipt",
  "bond_principal",
  "reversal",
] as const;
export const notificationCandidateSchema = z
  .object({
    id: identifier,
    source: z
      .string()
      .regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/)
      .max(200),
    parserId: label,
    parserVersion: identifier,
    capturedAt: z.string().datetime({ offset: true }),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    reference: label.optional(),
    originalReference: label.optional(),
    amount: minor.positive().optional(),
    currency: z.enum(["KES", "USD", "EUR", "GBP"]).optional(),
    direction: z.enum(["credit", "debit", "unknown"]),
    kind: z.enum(candidateKinds),
    counterparty: z.string().max(200).optional(),
    accountHint: z.string().max(160).optional(),
    fee: minor.optional(),
    balance: minor.optional(),
    confidence: z.number().int().min(0).max(100),
    missing: z.array(z.string().max(80)).max(30),
    validation: z.enum(["valid", "incomplete", "excluded"]),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    raw: z.string().max(4000).optional(),
  })
  .strict();
export const notificationBatchSchema = z
  .object({
    format: z.literal("pennywise-notification-batch"),
    version: z.literal(1),
    batchId: identifier,
    createdAt: z.string().datetime({ offset: true }),
    candidates: z.array(notificationCandidateSchema).min(1).max(100),
  })
  .strict();
export const postingSchema = z
  .object({
    classification: z.enum(classifications),
    accountId: identifier,
    category: label,
    destinationId: identifier.optional(),
    relatedId: identifier.optional(),
    originalTransactionId: identifier.optional(),
  })
  .strict();
export const approvalRuleSchema = z
  .object({
    id: identifier,
    version: z.number().int().positive(),
    name: label,
    enabled: z.boolean(),
    priority: z.number().int().min(1).max(1000),
    source: z.string().min(1).max(200),
    kind: z.enum(candidateKinds),
    direction: z.enum(["credit", "debit", "unknown"]),
    minimum: minor,
    maximum: minor,
    counterparty: z.string().max(200),
    referenceRequired: z.boolean(),
    confidence: z.number().int().min(90).max(100),
    action: z.enum(["approve", "categorise", "assign", "hold", "reject"]),
    posting: postingSchema,
    createdAt: z.string().datetime(),
    lastMatchedAt: z.string().datetime().optional(),
    matchCount: z.number().int().nonnegative(),
  })
  .strict();
export const sourceMappingSchema = z
  .object({
    id: identifier,
    source: z.string().min(1).max(200),
    name: label,
    accountId: identifier,
    accountHint: z.string().max(160),
    trusted: z.boolean(),
    enabled: z.boolean(),
  })
  .strict();
export const inboxRecordSchema = z
  .object({
    id: identifier,
    candidate: notificationCandidateSchema,
    amended: notificationCandidateSchema.optional(),
    batchId: identifier,
    importedAt: z.string().datetime(),
    status: z.enum([
      "pending",
      "approved",
      "rejected",
      "duplicate",
      "error",
      "conflict",
    ]),
    reason: z.string().max(2000),
    deliveries: z.number().int().positive(),
    posting: postingSchema.optional(),
    transactionIds: z.array(identifier).max(4),
    identity: z.string().max(600),
    content: z.string().max(2000),
    updates: z.array(notificationCandidateSchema).max(20).optional(),
    ruleId: identifier.optional(),
    ruleVersion: z.number().int().positive().optional(),
    approvedAt: z.string().datetime().optional(),
  })
  .strict();
export const notificationStateSchema = z
  .object({
    inbox: z.array(inboxRecordSchema).max(10000),
    rules: z.array(approvalRuleSchema).max(200),
    sources: z.array(sourceMappingSchema).max(500),
  })
  .strict();
export type NotificationCandidate = z.infer<typeof notificationCandidateSchema>;
export type NotificationBatch = z.infer<typeof notificationBatchSchema>;
export type NotificationPosting = z.infer<typeof postingSchema>;
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;
export type InboxRecord = z.infer<typeof inboxRecordSchema>;

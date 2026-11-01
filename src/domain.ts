import { z } from "zod";

export const moneySchema = z.number().int().safe();
const nonnegative = moneySchema.nonnegative();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Use a valid calendar date",
  );
const id = z.string().min(1).max(100);
const text = z.string().max(2000);
const name = z.string().trim().min(1).max(160);
export const transactionTypes = [
  "income",
  "expense",
  "transfer",
  "debt_repayment",
  "loan_disbursement",
  "loan_recovery",
  "liability_draw",
  "liability_repayment",
  "adjustment",
  "reserve_transfer",
  "bond_maturity",
  "prepaid_refund",
] as const;
export const incomeTypes = [
  "Employment",
  "Business income",
  "Consulting",
  "Freelancing",
  "Rental income",
  "Bond coupon",
  "Investment distribution",
  "Loan repayment",
  "Gift",
  "Asset sale",
  "Other",
] as const;
export const frequencies = [
  "one-off",
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "custom",
  "irregular",
] as const;
export const accountSchema = z
  .object({
    id,
    name,
    kind: z.enum(["cash", "bank", "mobile", "investment", "savings"]),
    opening: moneySchema,
    restricted: nonnegative,
    notes: text,
  })
  .strict();
export const transactionSchema = z
  .object({
    id,
    type: z.enum(transactionTypes),
    amount: moneySchema.refine((n) => n !== 0),
    date: dateSchema,
    description: name,
    category: name,
    subcategory: text,
    accountId: id,
    destinationId: id.optional(),
    relatedId: id.optional(),
    eventId: id.optional(),
    reserveId: id.optional(),
    windfallId: id.optional(),
    groupId: id.optional(),
    paymentMethod: text,
    notes: text,
    occurrenceId: id.optional(),
    occasionalId: id.optional(),
    prepaidId: id.optional(),
    captureId: id.optional(),
    additionalPayment: z.boolean().optional(),
    recurringReference: text,
    receipt: z
      .object({
        name: name,
        mime: z.enum(["image/png", "image/jpeg", "application/pdf"]),
        data: z.string().max(3_000_000),
      })
      .strict()
      .optional(),
  })
  .strict();
export const incomeSchema = z
  .object({
    id,
    name,
    type: z.enum(incomeTypes),
    description: text,
    amount: nonnegative,
    frequency: z.enum(frequencies),
    reliability: z.enum(["confirmed", "reliable", "uncertain"]),
    taxBps: z.number().int().min(0).max(10000),
    accountId: id,
    active: z.boolean(),
    notes: text,
  })
  .strict();
export const liabilitySchema = z
  .object({
    id,
    name,
    principal: nonnegative,
    date: dateSchema,
    due: dateSchema,
    priority: z.number().int().min(1).max(100),
    accountId: id,
    source: text,
    notes: text,
  })
  .strict();
export const receivableSchema = liabilitySchema
  .extend({
    interestBps: z.number().int().min(0).max(10000),
    writtenOff: z.boolean(),
  })
  .strict();
export const bondSchema = z
  .object({
    id,
    name,
    identifier: name,
    issuer: name,
    principal: nonnegative,
    couponBps: z.number().int().min(0).max(10000),
    taxBps: z.number().int().min(0).max(10000),
    paymentsPerYear: z.number().int().min(1).max(12),
    maturity: dateSchema,
    maturityValue: nonnegative,
    accountId: id,
    notes: text,
  })
  .strict();
export const eventSchema = z
  .object({
    id,
    sourceId: id,
    kind: z.enum(["income", "bond", "receivable"]),
    due: dateSchema,
    amount: nonnegative,
    status: z.enum(["expected", "delayed", "cancelled"]),
    reliability: z.enum(["confirmed", "reliable", "uncertain"]),
    notes: text,
  })
  .strict();
export const allocationSchema = z
  .object({
    category: name,
    amount: nonnegative,
    essential: z.boolean(),
    priority: z.number().int().min(1).max(100),
    purpose: z.enum(["spending", "savings", "reserve", "debt"]),
    rolloverRule: z
      .enum(["none", "full", "savings", "partial", "manual"])
      .default("none"),
    rolloverAmount: nonnegative.default(0),
  })
  .strict();
export const budgetSchema = z
  .object({
    id,
    name,
    start: dateSchema,
    end: dateSchema,
    frequency: z.enum(["weekly", "monthly", "custom"]),
    profileId: id,
    allocations: z.array(allocationSchema).max(500),
    rollover: z.boolean(),
    archived: z.boolean(),
    notes: text,
  })
  .strict();
export const necessitySchema = z
  .object({
    id,
    name,
    category: name,
    amount: nonnegative,
    due: dateSchema,
    priority: z.number().int().min(1).max(100),
    essential: z.boolean(),
    notes: text,
  })
  .strict();
export const reserveSchema = z
  .object({
    id,
    name,
    target: nonnegative,
    due: dateSchema,
    accountId: id,
    priority: z.number().int().min(1).max(100),
    contribution: nonnegative,
    frequency: z.enum(frequencies),
    emergency: z.boolean(),
    notes: text,
  })
  .strict();
export const ruleSchema = z
  .object({
    id,
    name,
    target: z.enum(["liability", "necessity", "reserve", "discretionary"]),
    targetId: z.string(),
    mode: z.enum(["fixed", "percent", "threshold"]),
    value: nonnegative,
    cap: nonnegative,
    minimumCash: nonnegative,
  })
  .strict();
export const scenarioSchema = z
  .object({
    id,
    name,
    days: z.number().int().min(1).max(730),
    income: moneySchema,
    expense: nonnegative,
    monthlyIncome: nonnegative,
    spendingBps: z.number().int().min(0).max(30000),
    delayDays: z.number().int().min(0).max(730),
    includeExpected: z.boolean(),
  })
  .strict();
export const auditSchema = z
  .object({
    id,
    at: z.string().datetime(),
    action: name,
    revision: z.number().int(),
    before: z.string().max(200000),
    after: z.string().max(200000),
  })
  .strict();
export const recurringSchema = z
  .object({
    id,
    name,
    category: name,
    expected: nonnegative,
    minimum: nonnegative.optional(),
    maximum: nonnegative.optional(),
    kind: z.enum(["fixed", "variable"]),
    frequency: z.enum(frequencies),
    customDays: z.number().int().min(1).max(730),
    start: dateSchema,
    firstDue: dateSchema,
    end: dateSchema.optional(),
    accountId: id,
    essential: z.boolean(),
    autoBudget: z.boolean(),
    reminderDays: z.number().int().min(0).max(365),
    status: z.enum(["active", "paused", "cancelled"]),
    notes: text,
  })
  .strict();
export const occurrenceSchema = z
  .object({
    id,
    recurringId: id,
    scheduledDate: dateSchema,
    due: dateSchema,
    amount: nonnegative,
    status: z.enum(["scheduled", "skipped"]),
    notes: text,
  })
  .strict();
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const occasionalSchema = z
  .object({
    id,
    name,
    category: name,
    estimated: nonnegative,
    month: monthSchema,
    due: dateSchema.optional(),
    pattern: text,
    priority: z.number().int().min(1).max(100),
    maximum: nonnegative,
    savingsTarget: nonnegative,
    reserveId: id.optional(),
    notes: text,
  })
  .strict();
export const prepaidPeriodSchema = z
  .object({
    start: dateSchema,
    end: dateSchema,
    amount: nonnegative,
    normal: nonnegative,
  })
  .strict();
export const prepaidSchema = z
  .object({
    id,
    name,
    category: name,
    recurringId: id.optional(),
    accountId: id,
    amount: nonnegative,
    paymentDate: dateSchema,
    coverageStart: dateSchema,
    coverageEnd: dateSchema,
    normalPrice: nonnegative,
    frequency: z.enum([
      "weekly",
      "fortnightly",
      "monthly",
      "quarterly",
      "semiannual",
      "annual",
      "custom",
    ]),
    customDays: z.number().int().min(1).max(730),
    count: z.number().int().min(1).max(240),
    recognition: z.enum(["actual", "normal"]),
    periods: z.array(prepaidPeriodSchema).min(1).max(240),
    terminatedOn: dateSchema.optional(),
    notes: text,
  })
  .strict();
export const captureActionSchema = z
  .object({
    kind: z.enum(["transfer", "reserve", "available", "carry", "unallocated"]),
    amount: nonnegative,
    accountId: id.optional(),
    reserveId: id.optional(),
    targetBudgetId: id.optional(),
  })
  .strict();
export const captureSchema = z
  .object({
    id,
    budgetId: id,
    category: name,
    date: dateSchema,
    accountId: id,
    actions: z.array(captureActionSchema).min(1).max(20),
    notes: text,
  })
  .strict();
export const reviewSnapshotSchema = z
  .object({
    planned: nonnegative,
    actual: moneySchema,
    unspent: nonnegative,
    saved: nonnegative,
    carried: nonnegative,
    available: moneySchema,
  })
  .strict();
export const reviewSchema = z
  .object({
    id,
    budgetId: id,
    month: monthSchema,
    finalizedAt: z.string().datetime(),
    revision: z.number().int(),
    snapshot: reviewSnapshotSchema,
  })
  .strict();
export const stateSchema = z
  .object({
    version: z.literal(3),
    revision: z.number().int().nonnegative(),
    settings: z
      .object({
        currency: z.enum(["KES", "USD", "EUR", "GBP"]),
        theme: z.enum(["light", "dark"]),
        setup: z.boolean(),
        demo: z.boolean(),
        activeBudgetId: z.string(),
        allowanceDays: z.number().int().min(1).max(730),
        backupDays: z.number().int().min(1).max(365),
        backupTransactions: z.number().int().min(1).max(10000),
        lastBackupAt: z.string().datetime().optional(),
        lastBackupTransactionCount: z.number().int().nonnegative(),
        lastBackupAppVersion: z.string(),
      })
      .strict(),
    accounts: z.array(accountSchema).max(500),
    transactions: z.array(transactionSchema).max(50000),
    incomes: z.array(incomeSchema).max(500),
    liabilities: z.array(liabilitySchema).max(500),
    receivables: z.array(receivableSchema).max(500),
    bonds: z.array(bondSchema).max(500),
    events: z.array(eventSchema).max(10000),
    budgets: z.array(budgetSchema).max(100),
    necessities: z.array(necessitySchema).max(1000),
    reserves: z.array(reserveSchema).max(500),
    rules: z.array(ruleSchema).max(100),
    scenarios: z.array(scenarioSchema).max(100),
    recurring: z.array(recurringSchema).max(1000),
    occurrences: z.array(occurrenceSchema).max(20000),
    occasional: z.array(occasionalSchema).max(1000),
    prepaids: z.array(prepaidSchema).max(1000),
    captures: z.array(captureSchema).max(10000),
    reviews: z.array(reviewSchema).max(1000),
    audit: z.array(auditSchema).max(100000),
  })
  .strict();
export type Account = z.infer<typeof accountSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Income = z.infer<typeof incomeSchema>;
export type Liability = z.infer<typeof liabilitySchema>;
export type Receivable = z.infer<typeof receivableSchema>;
export type Bond = z.infer<typeof bondSchema>;
export type PaymentEvent = z.infer<typeof eventSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type Necessity = z.infer<typeof necessitySchema>;
export type Reserve = z.infer<typeof reserveSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Recurring = z.infer<typeof recurringSchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type Occasional = z.infer<typeof occasionalSchema>;
export type Prepaid = z.infer<typeof prepaidSchema>;
export type SavingsCapture = z.infer<typeof captureSchema>;
export type MonthlyReview = z.infer<typeof reviewSchema>;
export type State = z.infer<typeof stateSchema>;
export const uid = () => crypto.randomUUID();
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}
export function initialState(): State {
  const start = today().slice(0, 7) + "-01";
  const end = new Date(
    Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const budgets: Budget[] = [
    "SURVIVAL MODE",
    "PENNY-PINCHING MODE",
    "NORMAL MODE",
    "COMFORTABLE MODE",
  ].map((name) => {
    const id = uid();
    return {
      id,
      profileId: id,
      name,
      start,
      end,
      frequency: "monthly",
      allocations: [],
      rollover: false,
      archived: false,
      notes:
        "Starting template. Enter your own allocations; no income assumptions.",
    };
  });
  return {
    version: 3,
    revision: 0,
    settings: {
      currency: "KES",
      theme: "light",
      setup: false,
      demo: false,
      activeBudgetId: budgets[0].id,
      allowanceDays: 30,
      backupDays: 7,
      backupTransactions: 25,
      lastBackupTransactionCount: 0,
      lastBackupAppVersion: "",
    },
    accounts: [],
    transactions: [],
    incomes: [],
    liabilities: [],
    receivables: [],
    bonds: [],
    events: [],
    budgets,
    necessities: [],
    reserves: [],
    rules: [],
    scenarios: [],
    recurring: [],
    occurrences: [],
    occasional: [],
    prepaids: [],
    captures: [],
    reviews: [],
    audit: [],
  };
}

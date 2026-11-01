import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { uid, type SavingsCapture } from "../src/domain";
import {
  summary,
  budgetActual,
  budgetStats,
  validateState,
  forecast,
  reserveBalance,
} from "../src/engine";
import { baseScenario } from "../src/forms";
import {
  generateOccurrences,
  occurrenceStatus,
  occurrenceRemaining,
  payOccurrence,
  effectiveAllocations,
  recordPrepaid,
  prepaidBalance,
  prepaidRecognition,
  prepaidSavings,
  prepaidPeriods,
  terminatePrepaid,
  commitCapture,
  categoryRollover,
  monthlyReview,
  finalizeReview,
  undoCapture,
  savingsCaptureCapacity,
  backupReminder,
  correctTermination,
  recurringReminders,
} from "../src/expense-engine";
import {
  cash,
  fixture,
  tx,
  budget,
  reserve,
  recurring,
  prepaid,
} from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("recurring and occasional planning", () => {
  it("uses configured reminder lead time and excludes already-covered obligations", () => {
    const s = fixture();
    const r = recurring(s, { firstDue: "2026-11-04", reminderDays: 3 });
    generateOccurrences(s, "2026-11-04");
    expect(recurringReminders(s)).toHaveLength(1);
    r.reminderDays = 2;
    expect(recurringReminders(s)).toHaveLength(0);
    r.reminderDays = 3;
    recordPrepaid(s, prepaid());
    expect(recurringReminders(s)).toHaveLength(0);
  });
  it("generates unique monthly obligations without changing actual cash", () => {
    const s = fixture();
    recurring(s);
    expect(generateOccurrences(s, "2027-01-01")).toBe(3);
    expect(generateOccurrences(s, "2027-01-01")).toBe(0);
    expect(s.transactions).toHaveLength(0);
    expect(summary(validateState(s)).liquid).toBe(cash("100000"));
    expect(effectiveAllocations(s, s.budgets[0])[0].amount).toBe(cash("3000"));
  });
  it.each([
    ["weekly", 5],
    ["fortnightly", 3],
    ["quarterly", 1],
    ["semiannual", 1],
    ["annual", 1],
    ["custom", 3],
  ] as const)("supports %s schedules", (frequency, expectedCount) => {
    const s = fixture();
    recurring(s, { frequency, customDays: 10 });
    generateOccurrences(s, "2026-11-30");
    expect(s.occurrences).toHaveLength(expectedCount);
  });
  it("anchors month-end schedules across February", () => {
    const s = fixture();
    recurring(s, { start: "2026-01-31", firstDue: "2026-01-31" });
    generateOccurrences(s, "2026-03-31");
    expect(s.occurrences.map((o) => o.due)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
  it("stops generation at end dates and while paused/cancelled", () => {
    const s = fixture();
    const r = recurring(s, { end: "2026-12-01" });
    generateOccurrences(s, "2027-03-01");
    expect(s.occurrences).toHaveLength(2);
    r.end = undefined;
    r.status = "paused";
    expect(generateOccurrences(s, "2027-03-01")).toBe(0);
    r.status = "cancelled";
    expect(generateOccurrences(s, "2027-03-01")).toBe(0);
  });
  it("retains original occurrence identity through variable amount changes and postponement", () => {
    const s = fixture();
    recurring(s, { kind: "variable" });
    generateOccurrences(s, "2026-11-01");
    const o = s.occurrences[0];
    o.amount = cash("3200");
    o.due = "2026-11-10";
    generateOccurrences(s, "2026-11-01");
    expect(s.occurrences).toHaveLength(1);
    expect(o.scheduledDate).toBe("2026-11-01");
    payOccurrence(s, o.id, cash("1000"), "2026-11-01");
    expect(occurrenceStatus(validateState(s), o)).toBe("partially paid");
    expect(occurrenceRemaining(s, o)).toBe(cash("2200"));
  });
  it("skips rather than deletes occurrence history", () => {
    const s = fixture();
    recurring(s);
    generateOccurrences(s, "2026-11-01");
    s.occurrences[0].status = "skipped";
    expect(occurrenceRemaining(s, s.occurrences[0])).toBe(0);
    expect(effectiveAllocations(s, s.budgets[0])).toHaveLength(0);
    expect(() =>
      payOccurrence(s, s.occurrences[0].id, cash("1"), "2026-11-01"),
    ).toThrow(/skipped/);
    expect(s.occurrences).toHaveLength(1);
  });
  it("merges manual and automatic category budgets without counting the same service twice", () => {
    const s = fixture();
    budget(s, "3000", "Internet");
    recurring(s);
    generateOccurrences(s, "2026-11-01");
    expect(budgetStats(s, s.budgets[0]).planned).toBe(cash("3000"));
  });
  it("rejects duplicate occurrence records and missing parent definitions", () => {
    const s = fixture();
    recurring(s);
    generateOccurrences(s, "2026-11-01");
    s.occurrences.push({ ...s.occurrences[0], id: uid() });
    expect(() => validateState(s)).toThrow(/Duplicate recurring/);
    s.occurrences.pop();
    s.recurring = [];
    expect(() => validateState(s)).toThrow(/missing recurring/);
  });
  it("keeps occasional plans out of mandatory budgets and rejects inconsistent moved dates", () => {
    const s = fixture();
    s.occasional.push({
      id: "hair",
      name: "TEST hair",
      category: "Personal care",
      estimated: cash("2000"),
      month: "2026-12",
      due: "2026-12-10",
      pattern: "Every few months",
      priority: 3,
      maximum: cash("2500"),
      savingsTarget: 0,
      notes: "",
    });
    expect(budgetStats(validateState(s), s.budgets[0]).planned).toBe(0);
    expect(summary(s).expenses).toBe(0);
    s.occasional[0].month = "2027-01";
    expect(() => validateState(s)).toThrow(/expected month/);
  });
});
describe("prepaid cash and recognition", () => {
  it("corrects a historical termination and refund without duplicate cash recovery", () => {
    const s = fixture();
    recurring(s);
    recordPrepaid(s, prepaid());
    terminatePrepaid(s, "advance", "2026-11-01", cash("15000"));
    correctTermination(s, "advance", "2026-11-01", cash("10000"));
    expect(
      s.transactions.filter((t) => t.type === "prepaid_refund"),
    ).toHaveLength(1);
    expect(summary(validateState(s)).liquid).toBe(cash("95000"));
    expect(prepaidRecognition(s, "2026-11-01", "2026-11-30")).toBe(
      cash("5000"),
    );
  });
  it("records KES 15,000 cash, KES 2,500 each period and KES 3,000 savings", () => {
    const s = fixture();
    recurring(s);
    recordPrepaid(s, prepaid());
    validateState(s);
    expect(summary(s).liquid).toBe(cash("85000"));
    expect(s.prepaids[0].periods.map((p) => p.amount)).toEqual(
      Array(6).fill(cash("2500")),
    );
    expect(prepaidSavings(s.prepaids[0])).toBe(cash("3000"));
    expect(prepaidRecognition(s, "2026-11-01", "2026-11-30")).toBe(
      cash("2500"),
    );
    expect(
      prepaidRecognition(s, "2026-11-01", "2026-11-30", undefined, true),
    ).toBe(cash("3000"));
    expect(prepaidBalance(s, s.prepaids[0], "2026-11-30")).toBe(cash("12500"));
  });
  it("uses normal comparison only in planning, never as actual cash expense", () => {
    const s = fixture();
    recurring(s);
    recordPrepaid(s, prepaid({ recognition: "normal" }));
    expect(effectiveAllocations(s, s.budgets[0])[0].amount).toBe(cash("3000"));
    expect(summary(s).expenses).toBe(cash("15000"));
    expect(budgetActual(s, s.budgets[0])).toBe(8333);
    expect(summary(s).assets).toBe(cash("100000") - 8333);
  });
  it("does not charge prepaid recurring obligations twice in cash forecast", () => {
    const s = fixture();
    recurring(s);
    generateOccurrences(s, "2027-06-01");
    recordPrepaid(s, prepaid());
    const result = forecast(s, { ...baseScenario(), days: 30 });
    expect(result.lines.at(-1)!.confirmed).toBe(cash("85000"));
    expect(occurrenceStatus(s, s.occurrences[0])).toBe("prepaid");
  });
  it("blocks ordinary covered payments but permits explicitly confirmed additions", () => {
    const s = fixture();
    recurring(s);
    generateOccurrences(s, "2026-11-01");
    recordPrepaid(s, prepaid());
    const o = s.occurrences[0];
    expect(() => payOccurrence(s, o.id, cash("100"), "2026-11-01")).toThrow(
      /prepaid/,
    );
    payOccurrence(s, o.id, cash("100"), "2026-11-01", true);
    expect(summary(validateState(s)).expenses).toBe(cash("15100"));
  });
  it("rejects overlap and prepayment of an already-paid occurrence", () => {
    const s = fixture();
    recurring(s);
    recordPrepaid(s, prepaid());
    expect(() => recordPrepaid(s, prepaid({ id: "otheradvance" }))).toThrow(
      /overlaps/,
    );
    const other = fixture();
    recurring(other);
    generateOccurrences(other, "2026-11-01");
    payOccurrence(other, other.occurrences[0].id, cash("3000"), "2026-11-01");
    expect(() => recordPrepaid(other, prepaid())).toThrow(/already has/);
  });
  it("keeps rounding exact and supports partial final coverage", () => {
    const periods = prepaidPeriods(
      prepaid({ amount: 100, coverageEnd: "2027-04-15" }),
    );
    expect(periods.reduce((n, p) => n + p.amount, 0)).toBe(100);
    expect(periods.map((p) => p.amount)).toEqual([17, 17, 17, 17, 16, 16]);
    expect(periods.at(-1)!.end).toBe("2027-04-15");
  });
  it("returns zero budget recognition for a future budget not yet started", () => {
    const s = fixture();
    recurring(s);
    recordPrepaid(s, prepaid());
    const b = { ...s.budgets[0], start: "2026-12-01", end: "2026-12-31" };
    expect(budgetActual(s, b)).toBe(0);
  });
  it("records termination refund as cash recovery, not earned income", () => {
    const s = fixture();
    recurring(s);
    recordPrepaid(s, prepaid());
    terminatePrepaid(s, "advance", "2026-11-01", cash("15000"));
    expect(summary(validateState(s)).liquid).toBe(cash("100000"));
    expect(summary(s).income).toBe(0);
    expect(prepaidBalance(s, s.prepaids[0])).toBe(0);
    expect(prepaidRecognition(s, "2026-11-01", "2026-11-30")).toBe(0);
  });
  it("rejects excessive refunds and inconsistent upfront ledger correction", () => {
    const s = fixture();
    recurring(s);
    recordPrepaid(s, prepaid());
    expect(() =>
      terminatePrepaid(s, "advance", "2026-11-01", cash("15001")),
    ).toThrow(/exceeds/);
    s.transactions[0].amount = cash("100");
    expect(() => validateState(s)).toThrow(/inconsistent/);
  });
});
describe("monthly capture and rollover", () => {
  function setupCapture() {
    const s = fixture();
    const b = budget(s);
    reserve(s);
    s.transactions.push(tx("expense", "8000"));
    const capture: SavingsCapture = {
      id: "capture",
      budgetId: b.id,
      category: "Food",
      date: "2026-11-01",
      accountId: "cash",
      actions: [],
      notes: "",
    };
    return { s, b, capture };
  }
  it("identifies unspent allocation without assuming it is saved", () => {
    const { s, b } = setupCapture();
    expect(monthlyReview(s, b).snapshot.unspent).toBe(cash("2000"));
    expect(monthlyReview(s, b).snapshot.saved).toBe(0);
    expect(s.transactions).toHaveLength(1);
  });
  it("splits unspent cash across actual savings transfer, reserve and available pool", () => {
    const { s, b, capture } = setupCapture();
    capture.actions = [
      { kind: "transfer", accountId: "savings", amount: cash("1000") },
      { kind: "reserve", reserveId: "emergency", amount: cash("500") },
      { kind: "available", amount: cash("500") },
    ];
    commitCapture(s, capture);
    validateState(s);
    expect(monthlyReview(s, b).snapshot.saved).toBe(cash("1500"));
    expect(reserveBalance(s, "emergency")).toBe(cash("500"));
    expect(summary(s).income).toBe(0);
    expect(summary(s).expenses).toBe(cash("8000"));
    expect(summary(s).available).toBe(cash("90500"));
    expect(savingsCaptureCapacity(s, b, "Food")).toBe(0);
  });
  it("caps savings capture at actual cash even when a large budget is unspent", () => {
    const { s, b, capture } = setupCapture();
    s.accounts[0].opening = cash("8500");
    expect(savingsCaptureCapacity(s, b, "Food")).toBe(cash("500"));
    capture.actions = [
      { kind: "reserve", reserveId: "emergency", amount: cash("1000") },
    ];
    expect(() => commitCapture(s, capture)).toThrow(/exceeds/);
  });
  it("leaves decisions unallocated without moving cash and supports undo/reallocation", () => {
    const { s, b, capture } = setupCapture();
    capture.actions = [{ kind: "unallocated", amount: cash("2000") }];
    commitCapture(s, capture);
    expect(s.transactions).toHaveLength(1);
    expect(monthlyReview(s, b).snapshot.saved).toBe(0);
    undoCapture(s, capture.id);
    expect(s.captures).toHaveLength(0);
    expect(savingsCaptureCapacity(s, b, "Food")).toBe(cash("2000"));
  });
  it("does not treat a planned savings allocation as unspent expense savings", () => {
    const { s, b } = setupCapture();
    b.allocations[0].purpose = "savings";
    expect(savingsCaptureCapacity(s, b, "Food")).toBe(0);
  });
  it("applies independent none/full/partial/manual/savings rollover without fictitious money", () => {
    const s = fixture();
    const old = budget(s);
    old.start = "2026-10-01";
    old.end = "2026-10-31";
    s.transactions.push(tx("expense", "8000", { date: "2026-10-10" }));
    const next = {
      ...structuredClone(old),
      id: uid(),
      start: "2026-11-01",
      end: "2026-11-30",
    };
    s.budgets.push(next);
    old.allocations[0].rolloverRule = "full";
    expect(categoryRollover(s, next, "Food")).toBe(cash("2000"));
    old.allocations[0].rolloverRule = "partial";
    old.allocations[0].rolloverAmount = cash("700");
    expect(categoryRollover(s, next, "Food")).toBe(cash("700"));
    for (const rule of ["none", "manual", "savings"] as const) {
      old.allocations[0].rolloverRule = rule;
      expect(categoryRollover(s, next, "Food")).toBe(0);
    }
    expect(summary(validateState(s)).liquid).toBe(cash("92000"));
  });
  it("explicit carry is protected until its future target and not also rolled over automatically", () => {
    const { s, b, capture } = setupCapture();
    b.allocations[0].rolloverRule = "full";
    const next = {
      ...structuredClone(b),
      id: uid(),
      start: "2026-12-01",
      end: "2026-12-31",
    };
    s.budgets.push(next);
    capture.actions = [
      { kind: "carry", targetBudgetId: next.id, amount: cash("2000") },
    ];
    commitCapture(s, capture);
    validateState(s);
    expect(categoryRollover(s, next, "Food")).toBe(cash("2000"));
    expect(summary(s).available).toBe(cash("90000"));
    expect(summary(s, "2026-12-01").available).toBe(cash("92000"));
  });
  it("shows overspending deficit instead of silently carrying it", () => {
    const { s, b } = setupCapture();
    s.transactions.push(tx("expense", "3000"));
    expect(monthlyReview(s, b).overspending).toBe(cash("1000"));
    expect(monthlyReview(s, b).snapshot.unspent).toBe(0);
  });
  it("retains finalized review snapshots after historical transaction corrections", () => {
    const { s, b } = setupCapture();
    finalizeReview(s, b);
    const snapshot = structuredClone(s.reviews[0]);
    s.transactions[0].amount = cash("7000");
    finalizeReview(s, b);
    expect(s.reviews).toHaveLength(2);
    expect(s.reviews[0]).toEqual(snapshot);
    expect(s.reviews[1].snapshot.actual).toBe(cash("7000"));
  });
  it("reminds on application open after days, transactions and version changes", () => {
    const s = fixture();
    expect(backupReminder(s)).toContain("Your full backup is due");
    s.settings.lastBackupAt = "2026-10-31T09:00:00Z";
    s.settings.lastBackupAppVersion = "1.0.0";
    s.settings.backupTransactions = 1;
    s.transactions.push(tx("income", "1"));
    expect(backupReminder(s)).toHaveLength(2);
  });
});

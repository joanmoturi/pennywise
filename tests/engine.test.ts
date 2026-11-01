import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { addDays, uid } from "../src/domain";
import { parseMoney, sum, ratio, decimal, formatMoney } from "../src/money";
import {
  summary,
  accountBalance,
  outstanding,
  reserveBalance,
  coupon,
  scheduleDates,
  validateState,
  receiveEvent,
  eventRemaining,
  eventStatus,
  budgetStats,
  dailyAllowance,
  necessitiesFunding,
  decision,
  allocateWindfall,
  commitWindfall,
  forecast,
} from "../src/engine";
import { baseScenario } from "../src/forms";
import { reports } from "../src/reports";
import {
  cash,
  fixture,
  tx,
  liability,
  receivable,
  reserve,
  budget,
} from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("minor-unit money", () => {
  it("parses exact decimals including amounts unsafe in binary floating point", () => {
    expect(sum([parseMoney("0.10"), parseMoney("0.20")])).toBe(30);
    expect(parseMoney("1,234.01")).toBe(123401);
    expect(decimal(-1)).toBe("-0.01");
    expect(formatMoney(cash("1234.01"))).toBe("KES 1,234.01");
  });
  it.each(["1.001", "NaN", "1e3", "", "Infinity", "9007199254740991"])(
    "rejects invalid/unsafe input %s",
    (input) => {
      expect(() => parseMoney(input)).toThrow();
    },
  );
  it("rejects aggregate overflow", () =>
    expect(() => sum([Number.MAX_SAFE_INTEGER, 1])).toThrow());
  it("rounds percentages half-up at the minor unit", () => {
    expect(ratio(101, 5000)).toBe(51);
    expect(ratio(-101, 5000)).toBe(-51);
  });
});
describe("ledger distinctions", () => {
  it("separates actual income and expense from transfers, borrowing, recovery and adjustments", () => {
    const s = fixture();
    liability(s);
    receivable(s);
    s.transactions.push(
      tx("income", "1000"),
      tx("expense", "500"),
      tx("transfer", "400", { destinationId: "other" }),
      tx("liability_draw", "2000", { relatedId: "business" }),
      tx("loan_recovery", "3000", { relatedId: "borrower" }),
      tx("adjustment", "-1"),
    );
    const result = summary(validateState(s));
    expect(result.income).toBe(cash("1000"));
    expect(result.expenses).toBe(cash("500"));
    expect(result.liquid).toBe(cash("105499"));
    expect(accountBalance(s, "other")).toBe(cash("400"));
    expect(result.receivables).toBe(cash("7000"));
  });
  it("reduces liability on a partial repayment without reducing earned income", () => {
    const s = fixture();
    liability(s);
    s.transactions.push(
      tx("liability_repayment", "5000", { relatedId: "business" }),
    );
    expect(outstanding(validateState(s), "business", "liability")).toBe(
      cash("15000"),
    );
    expect(summary(s).available).toBe(cash("80000"));
  });
  it("handles legacy debt repayment as liability reduction", () => {
    const s = fixture();
    liability(s);
    s.transactions.push(
      tx("debt_repayment", "5000", { relatedId: "business" }),
    );
    expect(outstanding(validateState(s), "business", "liability")).toBe(
      cash("15000"),
    );
  });
  it("does not permit liability over-repayment", () => {
    const s = fixture();
    liability(s);
    s.transactions.push(
      tx("liability_repayment", "20000.01", { relatedId: "business" }),
    );
    expect(() => validateState(s)).toThrow(/exceeds/);
  });
  it("loan disbursement exchanges cash for receivable, not an expense", () => {
    const s = fixture();
    receivable(s);
    s.transactions.push(
      tx("loan_disbursement", "10000", { relatedId: "borrower" }),
    );
    expect(summary(validateState(s)).expenses).toBe(0);
    expect(summary(s).receivables).toBe(cash("10000"));
  });
  it("recovery cannot exceed receivable principal", () => {
    const s = fixture();
    receivable(s);
    s.transactions.push(
      tx("loan_recovery", "10000.01", { relatedId: "borrower" }),
    );
    expect(() => validateState(s)).toThrow(/exceeds/);
  });
  it("retains historical partial repayment on write-off", () => {
    const s = fixture();
    const r = receivable(s);
    s.transactions.push(tx("loan_recovery", "2000", { relatedId: r.id }));
    r.writtenOff = true;
    expect(summary(validateState(s)).receivables).toBe(0);
    expect(s.transactions).toHaveLength(1);
  });
  it("protects restricted, savings, reserve and borrowed money without duplicate counting", () => {
    const s = fixture();
    liability(s);
    reserve(s);
    s.accounts[0].restricted = cash("1000");
    s.transactions.push(
      tx("reserve_transfer", "5000", { reserveId: "emergency" }),
      tx("transfer", "3000", { destinationId: "savings" }),
    );
    expect(summary(validateState(s)).available).toBe(cash("71000"));
    expect(summary(s).liquid).toBe(cash("100000"));
    expect(summary(s).reserves).toBe(cash("8000"));
  });
  it("reserve release restores availability without fictitious income", () => {
    const s = fixture();
    reserve(s);
    s.transactions.push(
      tx("reserve_transfer", "1000", { reserveId: "emergency" }),
      tx("reserve_transfer", "-200", { reserveId: "emergency" }),
    );
    expect(reserveBalance(validateState(s), "emergency")).toBe(cash("800"));
    expect(summary(s).income).toBe(0);
  });
  it("rejects reserve overspending and mismatched accounts", () => {
    const s = fixture();
    reserve(s);
    s.transactions.push(
      tx("reserve_transfer", "-1", { reserveId: "emergency" }),
    );
    expect(() => validateState(s)).toThrow(/withdrawal/);
    s.transactions = [
      tx("reserve_transfer", "1", {
        reserveId: "emergency",
        accountId: "other",
      }),
    ];
    expect(() => validateState(s)).toThrow(/mismatch/);
  });
  it("rejects future actual transactions", () => {
    const s = fixture();
    s.transactions.push(tx("income", "1000", { date: "2026-11-02" }));
    expect(() => validateState(s)).toThrow(/Future/);
  });
  it("rejects missing accounts, duplicate IDs and same-account transfers", () => {
    const s = fixture();
    s.transactions.push(tx("transfer", "1", { destinationId: "cash" }));
    expect(() => validateState(s)).toThrow(/different/);
    s.transactions = [tx("expense", "1", { accountId: "missing" })];
    expect(() => validateState(s)).toThrow(/missing/);
    s.transactions = [];
    s.accounts.push({ ...s.accounts[0] });
    expect(() => validateState(s)).toThrow(/Duplicate/);
  });
});
describe("bond schedules and projected receipts", () => {
  it("rejects duplicate expected payment dates for the same source", () => {
    const s = fixture();
    receivable(s);
    const e = {
      id: "a",
      sourceId: "borrower",
      kind: "receivable" as const,
      due: "2026-12-01",
      amount: cash("1000"),
      status: "expected" as const,
      reliability: "reliable" as const,
      notes: "",
    };
    s.events.push(e, { ...e, id: "b" });
    expect(() => validateState(s)).toThrow(/Duplicate expected/);
  });
  it("calculates net semiannual coupon using configurable tax", () => {
    const b = {
      id: uid(),
      name: "TEST",
      identifier: "TEST",
      issuer: "Fictional",
      principal: cash("1000000"),
      couponBps: 1200,
      taxBps: 1000,
      paymentsPerYear: 2,
      maturity: "2030-01-01",
      maturityValue: cash("1000000"),
      accountId: "cash",
      notes: "",
    };
    expect(coupon(b)).toEqual({
      gross: cash("60000"),
      tax: cash("6000"),
      net: cash("54000"),
    });
    expect(scheduleDates("2026-01-31", "semiannual", 3)).toEqual([
      "2026-01-31",
      "2026-07-31",
      "2027-01-31",
    ]);
    expect(scheduleDates("2026-01-31", "monthly", 3)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
  it("accepts six independently scheduled bonds with overlapping dates and missing payout months", () => {
    const s = fixture();
    for (let i = 0; i < 6; i++) {
      s.bonds.push({
        id: `bond${i}`,
        name: `TEST bond ${i}`,
        identifier: `TEST${i}`,
        issuer: "Fictional",
        principal: cash("100000"),
        couponBps: 1000,
        taxBps: 0,
        paymentsPerYear: 2,
        maturity: "2030-01-01",
        maturityValue: cash("100000"),
        accountId: "cash",
        notes: "",
      });
      s.events.push({
        id: `event${i}`,
        sourceId: `bond${i}`,
        kind: "bond",
        due: i < 4 ? "2026-12-15" : "2027-02-15",
        amount: cash("5000"),
        reliability: "reliable",
        status: "expected",
        notes: "",
      });
    }
    expect(summary(validateState(s)).income).toBe(0);
    expect(summary(s).liquid).toBe(cash("100000"));
    expect(s.events.filter((e) => e.due.startsWith("2027-01"))).toHaveLength(0);
    expect(s.events.filter((e) => e.due === "2026-12-15")).toHaveLength(4);
  });
  it("handles partial then reconciled actual income without projected double-counting", () => {
    const s = fixture();
    s.incomes.push({
      id: "contract",
      name: "TEST consulting",
      type: "Consulting",
      description: "",
      amount: cash("10000"),
      frequency: "irregular",
      reliability: "reliable",
      taxBps: 0,
      accountId: "cash",
      active: true,
      notes: "",
    });
    s.events.push({
      id: "expected",
      sourceId: "contract",
      kind: "income",
      due: "2026-11-15",
      amount: cash("10000"),
      status: "expected",
      reliability: "reliable",
      notes: "",
    });
    expect(summary(s).income).toBe(0);
    s.transactions.push(
      receiveEvent(s, "expected", cash("4000"), "2026-11-01"),
    );
    expect(eventStatus(s, s.events[0])).toBe("partially received");
    expect(eventRemaining(s, s.events[0])).toBe(cash("6000"));
    s.transactions.push(
      receiveEvent(s, "expected", cash("6100"), "2026-11-01"),
    );
    expect(eventStatus(s, s.events[0])).toBe("received");
    expect(summary(validateState(s)).income).toBe(cash("10100"));
  });
});
describe("budget, spending and forecasting", () => {
  it("keeps profiles independent and detects zero-based over-allocation", () => {
    const s = fixture();
    const b = budget(s, "100001");
    expect(budgetStats(s, b).unallocated).toBe(-100);
    s.settings.activeBudgetId = s.budgets[1].id;
    expect(s.budgets[1].allocations).toHaveLength(0);
    expect(b.allocations[0].amount).toBe(cash("100001"));
  });
  it("funds necessities once in priority order", () => {
    const s = fixture();
    s.accounts[0].opening = cash("150");
    for (let i = 0; i < 3; i++)
      s.necessities.push({
        id: `need${i}`,
        name: `TEST${i}`,
        category: "Food",
        amount: cash("100"),
        due: "2026-11-02",
        priority: i + 1,
        essential: true,
        notes: "",
      });
    expect(necessitiesFunding(s).map((n) => n.funded)).toEqual([
      cash("100"),
      cash("50"),
      0,
    ]);
  });
  it("uses actual cash and category-specific essential protection for allowance", () => {
    const s = fixture();
    budget(s, "10000", "Food");
    budget(s, "30000", "Dining", false);
    s.necessities.push({
      id: "medical",
      name: "TEST medical",
      category: "Medical",
      amount: cash("20000"),
      due: "2026-11-03",
      priority: 1,
      essential: true,
      notes: "",
    });
    expect(dailyAllowance(s).protectedEssentials).toBe(cash("30000"));
    expect(dailyAllowance(s).daily).toBe(cash("1000"));
    expect(decision(s, cash("80000")).outcome).toBe("Financially unsafe");
    expect(decision(s, cash("40000")).outcome).toBe("Not recommended");
    expect(decision(s, cash("2000")).outcome).toBe(
      "Affordable with adjustments",
    );
    expect(decision(s, cash("1000")).outcome).toBe("Affordable");
  });
  it("does not assume a discretionary budget", () =>
    expect(dailyAllowance(fixture()).daily).toBe(0));
  it("forecasts negative runway, exact prorating and preserves scenario isolation", () => {
    const s = fixture();
    s.accounts[0].opening = cash("1000");
    budget(s, "3000");
    const before = JSON.stringify(s);
    const result = forecast(s, { ...baseScenario(), days: 30 });
    expect(result.lines.at(-1)!.confirmed).toBe(cash("-2000"));
    expect(result.runwayDays).toBe(11);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("caps overlapping receivable projections independently for each borrower", () => {
    const s = fixture();
    receivable(s, "1000", "a");
    receivable(s, "2000", "b");
    for (const [i, sourceId] of ["a", "a", "b"].entries())
      s.events.push({
        id: `pay${i}`,
        sourceId,
        kind: "receivable",
        due: addDays("2026-11-01", i + 1),
        amount: cash("2000"),
        status: "expected",
        reliability: "reliable",
        notes: "",
      });
    const result = forecast(s, { ...baseScenario(), days: 3 });
    expect(result.lines.at(-1)!.expected).toBe(cash("103000"));
    expect(result.lines.at(-1)!.confirmed).toBe(cash("100000"));
  });
  it("does not double-charge budgeted necessities, but protects excess", () => {
    const s = fixture();
    budget(s, "3000");
    s.necessities.push({
      id: "food",
      name: "TEST food",
      category: "Food",
      amount: cash("4000"),
      due: "2026-11-02",
      priority: 1,
      essential: true,
      notes: "",
    });
    expect(
      forecast(s, { ...baseScenario(), days: 30 }).lines.at(-1)!.confirmed,
    ).toBe(cash("96000"));
  });
  it("actual reports exclude projected money and loan recovery from earned income", () => {
    const s = fixture();
    receivable(s);
    s.transactions.push(
      tx("loan_recovery", "1000", { relatedId: "borrower" }),
      tx("income", "200"),
      tx("expense", "100"),
    );
    const report = reports(s, "2026-11-01", "2026-11-30");
    expect(report.income).toBe(cash("200"));
    expect(report.recoveries).toBe(cash("1000"));
    expect(report.expense).toBe(cash("100"));
  });
});
describe("windfall workflow", () => {
  it("previews then atomically allocates liability, necessity and reserve without automatic investment", () => {
    const s = fixture();
    liability(s, "1000");
    reserve(s, "1000");
    s.necessities.push({
      id: "rent",
      name: "TEST rent",
      category: "Housing",
      amount: cash("1000"),
      due: "2026-11-01",
      priority: 1,
      essential: true,
      notes: "",
    });
    const receipt = tx("income", "3000");
    s.transactions.push(receipt);
    for (const [target, targetId] of [
      ["liability", "business"],
      ["necessity", "rent"],
      ["reserve", "emergency"],
    ] as const)
      s.rules.push({
        id: uid(),
        name: `TEST ${target}`,
        target,
        targetId,
        mode: "fixed",
        value: cash("1000"),
        cap: 0,
        minimumCash: 0,
      });
    const before = JSON.stringify(s);
    expect(allocateWindfall(s, receipt.id).remaining).toBe(0);
    expect(JSON.stringify(s)).toBe(before);
    commitWindfall(s, receipt.id);
    validateState(s);
    expect(outstanding(s, "business", "liability")).toBe(0);
    expect(reserveBalance(s, "emergency")).toBe(cash("1000"));
    expect(() => commitWindfall(s, receipt.id)).toThrow(/already/);
  });
  it("caps rounded percentages at receipt amount and does not accept borrowing", () => {
    const s = fixture();
    reserve(s);
    const receipt = tx("income", "0.03");
    s.transactions.push(receipt);
    for (let i = 0; i < 3; i++)
      s.rules.push({
        id: uid(),
        name: `TEST${i}`,
        target: "reserve",
        targetId: "emergency",
        mode: "percent",
        value: 5000,
        cap: 0,
        minimumCash: 0,
      });
    const p = allocateWindfall(s, receipt.id);
    expect(sum(p.allocations.map((a) => a.amount))).toBe(3);
    expect(p.remaining).toBe(0);
    s.transactions.push(
      tx("liability_draw", "1", { relatedId: "business", id: "draw" }),
    );
    expect(() => allocateWindfall(s, "draw")).toThrow(/actual/);
  });
});

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { uid, type State, type BudgetChange } from "../src/domain";
import {
  accountBalances,
  budgetActual,
  budgetStats,
  forecast,
  receiveEvent,
  eventRemaining,
  summary,
  validateState,
} from "../src/engine";
import {
  businessStats,
  recordDistribution,
  reallocateBudget,
  returnAllowanceSavings,
} from "../src/connected-finance";
import {
  effectiveAllocations,
  monthlyReview,
  undoCapture,
} from "../src/expense-engine";
import { baseScenario } from "../src/forms";
import { reports } from "../src/reports";
import { connectedExample, untouchedWorkspace } from "../src/connected-example";
import { initialState } from "../src/domain";
import {
  cash,
  fixture,
  tx,
  budget,
  liability,
  receivable,
  reserve,
} from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
function businessFixture() {
  const s = fixture();
  s.businesses.push({
    id: "business",
    name: "TEST partnership",
    ownershipBps: 5000,
    partners: [{ name: "TEST partner", ownershipBps: 5000 }],
    openingRetainedProfit: 0,
    notes: "",
  });
  s.accounts.push({
    id: "business-cash",
    businessId: "business",
    name: "TEST business cash",
    kind: "bank",
    opening: 0,
    restricted: 0,
    notes: "",
  });
  s.transactions.push(
    tx("income", "100000", { category: "Salary" }),
    tx("income", "200000", {
      accountId: "business-cash",
      category: "Business revenue",
    }),
    tx("expense", "40000", {
      accountId: "business-cash",
      category: "Operating costs",
    }),
  );
  return s;
}
describe("business ownership and linked distributions", () => {
  it("keeps business revenue, costs, ownership share and actual personal payouts distinct", () => {
    const s = businessFixture();
    expect(summary(validateState(s)).income).toBe(cash("100000"));
    expect(summary(s).businessCash).toBe(cash("160000"));
    const before = sumBalances(s);
    recordDistribution(s, {
      id: uid(),
      businessId: "business",
      accountId: "business-cash",
      destinationId: "cash",
      amount: cash("60000"),
      date: "2026-11-06",
    });
    recordDistribution(s, {
      id: uid(),
      businessId: "business",
      accountId: "business-cash",
      partnerName: "TEST partner",
      amount: cash("20000"),
      date: "2026-11-06",
    });
    const totals = summary(validateState(s));
    const business = businessStats(s, "business");
    expect(totals.income).toBe(cash("160000"));
    expect(totals.expenses).toBe(0);
    expect(totals.liquid).toBe(cash("260000"));
    expect(business).toMatchObject({
      revenue: cash("200000"),
      expenses: cash("40000"),
      profit: cash("160000"),
      indicativeShare: cash("80000"),
      retained: cash("80000"),
      cash: cash("80000"),
    });
    expect(sumBalances(s)).toBe(before - cash("20000"));
    expect(reports(s, "2026-11-01", "2026-11-30").income).toBe(cash("160000"));
    expect(reports(s, "2026-11-01", "2026-11-30").expense).toBe(0);
    expect(budgetActual(s, s.budgets[0])).toBe(0);
  });
  it("refuses profit/cash over-distribution and duplicate posting without partial writes", () => {
    const s = businessFixture();
    const before = JSON.stringify(s);
    expect(() =>
      recordDistribution(s, {
        id: uid(),
        businessId: "business",
        accountId: "business-cash",
        destinationId: "cash",
        amount: cash("170000"),
        date: "2026-11-06",
      }),
    ).toThrow(/retained profit/);
    expect(JSON.stringify(s)).toBe(before);
    const id = uid();
    const input = {
      id,
      businessId: "business",
      accountId: "business-cash",
      destinationId: "cash",
      amount: cash("10000"),
      date: "2026-11-06",
    };
    recordDistribution(s, input);
    expect(() => recordDistribution(s, input)).toThrow(/already recorded/);
    expect(s.transactions.filter((t) => t.id === id)).toHaveLength(1);
  });
  it.each(["debt", "reserve", "savings"] as const)(
    "protects business %s before allowing a profit distribution",
    (protection) => {
      const s = businessFixture();
      if (protection === "debt") {
        liability(s, "100000", "company-creditor").accountId = "business-cash";
      } else if (protection === "reserve") {
        reserve(s, "100000").accountId = "business-cash";
        s.transactions.push(
          tx("reserve_transfer", "100000", {
            accountId: "business-cash",
            reserveId: "emergency",
          }),
        );
      } else {
        s.accounts.push({
          id: "company-savings",
          businessId: "business",
          name: "TEST protected business savings",
          kind: "savings",
          opening: 0,
          restricted: 0,
          notes: "",
        });
        s.transactions.push(
          tx("transfer", "100000", {
            accountId: "business-cash",
            destinationId: "company-savings",
          }),
        );
      }
      expect(businessStats(s, "business").availableCash).toBe(cash("60000"));
      expect(() =>
        recordDistribution(s, {
          id: uid(),
          businessId: "business",
          accountId: "business-cash",
          destinationId: "cash",
          amount: cash("70000"),
          date: "2026-11-06",
        }),
      ).toThrow(/unrestricted/);
      s.transactions.push(
        tx("transfer", "70000", {
          accountId: "business-cash",
          destinationId: "cash",
          businessMovement: "owner_distribution",
          date: "2026-11-06",
        }),
      );
      expect(() => validateState(s)).toThrow(
        protection === "reserve" ? /reserved money/ : /Distribution/,
      );
      s.transactions.pop();
      recordDistribution(s, {
        id: uid(),
        businessId: "business",
        accountId: "business-cash",
        destinationId: "cash",
        amount: cash("60000"),
        date: "2026-11-06",
      });
      validateState(s);
      expect(businessStats(s, "business").availableCash).toBe(0);
      expect(summary(s).liabilities).toBe(0);
    },
  );
  it("receives an expected distribution as one transfer, not manufactured new revenue", () => {
    const s = businessFixture();
    s.incomes.push({
      id: "planned-distribution",
      businessId: "business",
      sourceAccountId: "business-cash",
      accountId: "cash",
      name: "TEST expected distribution",
      type: "Investment distribution",
      amount: cash("10000"),
      frequency: "one-off",
      reliability: "uncertain",
      active: true,
      description: "",
      notes: "",
      taxBps: 0,
    });
    s.events.push({
      id: "distribution-event",
      sourceId: "planned-distribution",
      kind: "income",
      due: "2026-11-20",
      amount: cash("10000"),
      status: "expected",
      reliability: "uncertain",
      notes: "",
    });
    const before = sumBalances(s);
    expect(
      forecast(s, baseScenario()).lines.at(-1)!.optimistic,
    ).toBeGreaterThan(forecast(s, baseScenario()).lines.at(-1)!.confirmed);
    expect(summary(s).income).toBe(cash("100000"));
    const receipt = receiveEvent(
      s,
      "distribution-event",
      cash("10000"),
      "2026-11-06",
    );
    expect(receipt.type).toBe("transfer");
    s.transactions.push(receipt);
    validateState(s);
    expect(eventRemaining(s, s.events[0])).toBe(0);
    expect(sumBalances(s)).toBe(before);
    expect(summary(s).income).toBe(cash("110000"));
    expect(businessStats(s, "business").revenue).toBe(cash("200000"));
  });
  it("reverses a distribution while preserving its original and rejects a second reversal", () => {
    const s = businessFixture();
    const t = recordDistribution(s, {
      id: uid(),
      businessId: "business",
      accountId: "business-cash",
      destinationId: "cash",
      amount: cash("10000"),
      date: "2026-11-06",
    });
    s.transactions.push({
      ...t,
      id: uid(),
      amount: -t.amount,
      reversalOf: t.id,
    });
    validateState(s);
    expect(summary(s).income).toBe(cash("100000"));
    expect(businessStats(s, "business").retained).toBe(cash("160000"));
    s.transactions.push({
      ...t,
      id: uid(),
      amount: -t.amount,
      reversalOf: t.id,
    });
    expect(() => validateState(s)).toThrow(/reversal/);
  });
  it("rejects cross-ownership transfers and debt repayments without explicit classification", () => {
    const s = businessFixture();
    s.transactions.push(
      tx("transfer", "100", { destinationId: "business-cash" }),
    );
    expect(() => validateState(s)).toThrow(/ownership/);
    s.transactions.at(-1)!.businessMovement = "capital";
    validateState(s);
    liability(s, "1000", "personal-debt");
    s.transactions.push(
      tx("liability_repayment", "100", {
        relatedId: "personal-debt",
        accountId: "business-cash",
      }),
    );
    expect(() => validateState(s)).toThrow(/ownership/);
  });
});
function sumBalances(s: State) {
  return [...accountBalances(s).values()].reduce((a, b) => a + b, 0);
}
it("loads fictional preview data only into an untouched workspace and reconciles its example", () => {
  expect(untouchedWorkspace(initialState())).toBe(true);
  expect(untouchedWorkspace(fixture())).toBe(false);
  const s = validateState(connectedExample());
  expect(untouchedWorkspace(s)).toBe(false);
  expect(summary(s)).toMatchObject({
    liquid: cash("1152000"),
    businessCash: cash("80000"),
    available: cash("1083000"),
  });
});
describe("budget funding and honest category consumption", () => {
  it("funds an unexpected expense from two categories without changing cash, history or original limits", () => {
    const s = fixture();
    const b = budget(s, "15000", "Groceries");
    b.allocations.push(
      { ...b.allocations[0], category: "Miscellaneous", amount: cash("10000") },
      { ...b.allocations[0], category: "Transport", amount: cash("10000") },
    );
    s.transactions.push(
      tx("expense", "17000", { category: "Groceries" }),
      tx("expense", "3000", { category: "Unexpected repair" }),
    );
    const balances = [...accountBalances(s)];
    const original = JSON.stringify(b.allocations);
    const txs = JSON.stringify(s.transactions);
    const change: BudgetChange = {
      id: uid(),
      budgetId: b.id,
      date: "2026-11-06",
      reason: "TEST split funding",
      moves: [
        {
          from: "Miscellaneous",
          to: "Unexpected repair",
          amount: cash("1000"),
        },
        { from: "Transport", to: "Unexpected repair", amount: cash("2000") },
      ],
    };
    reallocateBudget(s, change);
    reallocateBudget(s, {
      id: uid(),
      budgetId: b.id,
      date: "2026-11-06",
      reason: "TEST overspend funding",
      moves: [{ from: "Miscellaneous", to: "Groceries", amount: cash("2000") }],
    });
    validateState(s);
    expect(
      effectiveAllocations(s, b).find((a) => a.category === "Groceries")!
        .amount,
    ).toBe(cash("17000"));
    expect(
      effectiveAllocations(s, b).find(
        (a) => a.category === "Unexpected repair",
      )!.amount,
    ).toBe(cash("3000"));
    expect(JSON.stringify(b.allocations)).toBe(original);
    expect(JSON.stringify(s.transactions)).toBe(txs);
    expect([...accountBalances(s)]).toEqual(balances);
    reallocateBudget(s, {
      id: uid(),
      budgetId: b.id,
      date: "2026-11-06",
      reason: "Undo TEST split",
      reversalOf: change.id,
      moves: change.moves.map((m) => ({
        from: m.to,
        to: m.from,
        amount: m.amount,
      })),
    });
    expect(
      effectiveAllocations(s, b).find(
        (a) => a.category === "Unexpected repair",
      )!.amount,
    ).toBe(0);
    validateState(s);
  });
  it("shows unbudgeted spending in monthly overspending and refuses funding from spent money", () => {
    const s = fixture();
    const b = budget(s, "1000", "Miscellaneous");
    s.transactions.push(
      tx("expense", "900", { category: "Miscellaneous" }),
      tx("expense", "3000", { category: "Unexpected repair" }),
    );
    expect(monthlyReview(s, b).overspending).toBe(cash("3000"));
    expect(() =>
      reallocateBudget(s, {
        id: uid(),
        budgetId: b.id,
        date: "2026-11-06",
        reason: "Too much",
        moves: [
          {
            from: "Miscellaneous",
            to: "Unexpected repair",
            amount: cash("200"),
          },
        ],
      }),
    ).toThrow(/unused/);
    expect(s.budgetChanges).toHaveLength(0);
  });
});
describe("allowance plans and actual savings returns", () => {
  it("reduces the plan once, credits savings once and can undo the complete linked return", () => {
    const s = fixture();
    const b = budget(s, "10000", "Personal");
    s.allowances.push({
      id: "allowance",
      name: "TEST monthly allowance",
      budgetId: b.id,
      accountId: "cash",
      amount: cash("10000"),
      notes: "",
    });
    s.transactions.push(tx("expense", "6000", { category: "Personal" }));
    const input = {
      id: uid(),
      allowanceId: "allowance",
      category: "Personal",
      amount: cash("4000"),
      destinationId: "savings",
      date: "2026-11-06",
    };
    returnAllowanceSavings(s, input);
    validateState(s);
    expect(budgetStats(s, b)).toMatchObject({
      planned: cash("6000"),
      actual: cash("6000"),
      remaining: 0,
    });
    expect(accountBalances(s).get("savings")).toBe(cash("4000"));
    expect(summary(s).income).toBe(0);
    expect(monthlyReview(s, b).snapshot.saved).toBe(cash("4000"));
    expect(() => returnAllowanceSavings(s, input)).toThrow(/already recorded/);
    undoCapture(s, input.id);
    validateState(s);
    expect(accountBalances(s).get("savings")).toBe(0);
    expect(budgetStats(s, b).remaining).toBe(cash("4000"));
  });
  it("counts a linked savings allocation as funded without inventing spending or income", () => {
    const s = fixture();
    const b = budget(s, "30000", "Savings");
    b.allocations[0].purpose = "savings";
    s.allowances.push({
      id: "plan",
      name: "TEST allowance",
      budgetId: b.id,
      accountId: "cash",
      amount: cash("30000"),
      notes: "",
    });
    s.transactions.push(
      tx("transfer", "30000", {
        category: "Savings",
        destinationId: "savings",
        allowanceId: "plan",
      }),
    );
    validateState(s);
    expect(budgetStats(s, b)).toMatchObject({
      actual: 0,
      funding: cash("30000"),
      remaining: 0,
    });
    expect(summary(s).income).toBe(0);
    expect(monthlyReview(s, b).snapshot.saved).toBe(cash("30000"));
  });
  it("forecasts future allowance periods once and leaves the actual ledger untouched", () => {
    const s = fixture();
    const b = {
      ...s.budgets[0],
      id: uid(),
      profileId: uid(),
      start: "2026-12-01",
      end: "2026-12-31",
      allocations: [
        {
          category: "December",
          amount: cash("31000"),
          essential: true,
          priority: 1,
          purpose: "spending" as const,
          rolloverRule: "none" as const,
          rolloverAmount: 0,
        },
      ],
    };
    s.budgets.push(b);
    s.allowances.push({
      id: uid(),
      name: "TEST future period",
      accountId: "cash",
      budgetId: b.id,
      amount: cash("31000"),
      notes: "",
    });
    const before = JSON.stringify(s);
    const result = forecast(s, { ...baseScenario(), days: 60 });
    expect(result.lines.find((l) => l.date === "2026-12-31")!.confirmed).toBe(
      cash("69000"),
    );
    expect(JSON.stringify(s)).toBe(before);
    validateState(s);
  });
  it("keeps pre-existing debt and receivables distinct from available cash", () => {
    const s = fixture();
    liability(s, "20000");
    receivable(s, "10000");
    const before = summary(s);
    expect(before.available).toBe(cash("80000"));
    expect(before.netWorth).toBe(cash("90000"));
    s.transactions.push(
      tx("liability_repayment", "5000", { relatedId: "business" }),
      tx("loan_recovery", "3000", { relatedId: "borrower" }),
    );
    validateState(s);
    expect(summary(s)).toMatchObject({
      liquid: cash("98000"),
      liabilities: cash("15000"),
      receivables: cash("7000"),
      available: cash("83000"),
      income: 0,
      expenses: 0,
    });
  });
});

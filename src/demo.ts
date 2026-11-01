import { addDays, initialState, today, uid, type State } from "./domain";
import { coupon } from "./engine";

export function demoState(): State {
  const s = initialState();
  s.settings.demo = true;
  s.settings.setup = true;
  const account = {
    id: uid(),
    name: "DEMO everyday account",
    kind: "bank" as const,
    opening: 45000000,
    restricted: 1000000,
    notes: "Fictional demonstration only",
  };
  s.accounts.push(account);
  const income = {
    id: uid(),
    name: "DEMO consulting",
    type: "Consulting" as const,
    description: "Fictional contract",
    amount: 8000000,
    frequency: "irregular" as const,
    reliability: "uncertain" as const,
    taxBps: 0,
    accountId: account.id,
    active: true,
    notes: "",
  };
  s.incomes.push(income);
  s.events.push({
    id: uid(),
    sourceId: income.id,
    kind: "income",
    due: addDays(today(), 14),
    amount: income.amount,
    status: "expected",
    reliability: "uncertain",
    notes: "DEMO projected consulting",
  });
  s.liabilities.push({
    id: uid(),
    name: "DEMO business funds",
    principal: 5000000,
    date: today(),
    due: addDays(today(), 30),
    priority: 1,
    accountId: account.id,
    source: "DEMO entity",
    notes: "Already included in opening balance, not earned income",
  });
  s.receivables.push({
    id: uid(),
    name: "DEMO borrower",
    principal: 2000000,
    date: today(),
    due: addDays(today(), 50),
    priority: 1,
    accountId: account.id,
    source: "",
    interestBps: 0,
    writtenOff: false,
    notes: "Fictional pre-existing loan",
  });
  const b = {
    id: uid(),
    identifier: "DEMO-NOT-A-REAL-BOND",
    name: "DEMO infrastructure bond",
    issuer: "Fictional issuer",
    principal: 10000000,
    couponBps: 1000,
    taxBps: 0,
    paymentsPerYear: 2,
    maturity: addDays(today(), 730),
    maturityValue: 10000000,
    accountId: account.id,
    notes: "Illustrative rate only; not a real security or tax assumption",
  };
  s.bonds.push(b);
  s.events.push({
    id: uid(),
    sourceId: b.id,
    kind: "bond",
    due: addDays(today(), 45),
    amount: coupon(b).net,
    status: "expected",
    reliability: "reliable",
    notes: "DEMO coupon",
  });
  s.necessities.push({
    id: uid(),
    name: "DEMO housing",
    category: "Housing",
    amount: 3000000,
    due: addDays(today(), 7),
    priority: 1,
    essential: true,
    notes: "",
  });
  s.reserves.push({
    id: uid(),
    name: "DEMO emergency fund",
    target: 15000000,
    due: addDays(today(), 180),
    accountId: account.id,
    priority: 1,
    contribution: 500000,
    frequency: "monthly",
    emergency: true,
    notes: "",
  });
  s.transactions.push({
    id: uid(),
    type: "reserve_transfer",
    amount: 10000000,
    date: today(),
    description: "DEMO reserve earmark",
    category: "Reserve",
    subcategory: "",
    accountId: account.id,
    reserveId: s.reserves[0].id,
    notes: "",
    paymentMethod: "",
    recurringReference: "",
  });
  const categories = [
    ["Housing", 3000000, true],
    ["Food", 1500000, true],
    ["Transport", 600000, true],
    ["Dining", 400000, false],
  ] as const;
  s.budgets.forEach((budget, i) => {
    budget.allocations = categories.map(([category, amount, essential]) => ({
      category,
      amount: amount * (i + 1),
      essential,
      priority: essential ? 1 : 5,
      purpose: "spending",
      rolloverRule: "none",
      rolloverAmount: 0,
    }));
  });
  s.rules.push({
    id: uid(),
    name: "Repay business first",
    target: "liability",
    targetId: s.liabilities[0].id,
    mode: "percent",
    value: 5000,
    cap: 0,
    minimumCash: 0,
  });
  return s;
}

import {
  initialState,
  uid,
  type State,
  type Transaction,
  type Recurring,
  type Prepaid,
} from "../src/domain";
import { parseMoney } from "../src/money";

export const cash = parseMoney;
export function fixture(): State {
  const s = initialState();
  s.accounts.push(
    {
      id: "cash",
      name: "TEST everyday",
      kind: "bank",
      opening: cash("100000"),
      restricted: 0,
      notes: "",
    },
    {
      id: "other",
      name: "TEST mobile",
      kind: "mobile",
      opening: 0,
      restricted: 0,
      notes: "",
    },
    {
      id: "savings",
      name: "TEST savings",
      kind: "savings",
      opening: 0,
      restricted: 0,
      notes: "",
    },
  );
  s.settings.setup = true;
  return s;
}
export function tx(
  type: Transaction["type"],
  amount: string,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id: uid(),
    type,
    amount: cash(amount),
    date: "2026-11-01",
    description: "TEST transaction",
    category: "Food",
    subcategory: "",
    accountId: "cash",
    paymentMethod: "",
    notes: "",
    recurringReference: "",
    ...extra,
  };
}
export function liability(s: State, principal = "20000", id = "business") {
  const r = {
    id,
    name: "TEST business",
    principal: cash(principal),
    date: "2026-10-01",
    due: "2026-12-01",
    priority: 1,
    accountId: "cash",
    source: "TEST entity",
    notes: "",
  };
  s.liabilities.push(r);
  return r;
}
export function receivable(s: State, principal = "10000", id = "borrower") {
  const r = {
    id,
    name: "TEST borrower",
    principal: cash(principal),
    date: "2026-10-01",
    due: "2026-12-01",
    priority: 1,
    accountId: "cash",
    source: "",
    notes: "",
    interestBps: 0,
    writtenOff: false,
  };
  s.receivables.push(r);
  return r;
}
export function reserve(s: State, target = "20000") {
  const r = {
    id: "emergency",
    name: "TEST reserve",
    target: cash(target),
    due: "2027-05-01",
    accountId: "cash",
    priority: 1,
    contribution: 0,
    frequency: "monthly" as const,
    emergency: true,
    notes: "",
  };
  s.reserves.push(r);
  return r;
}
export function budget(
  s: State,
  amount = "10000",
  category = "Food",
  essential = true,
) {
  const b = s.budgets[0];
  b.start = "2026-11-01";
  b.end = "2026-11-30";
  b.allocations.push({
    category,
    amount: cash(amount),
    essential,
    priority: 1,
    purpose: "spending",
    rolloverRule: "none",
    rolloverAmount: 0,
  });
  return b;
}
export function recurring(s: State, extra: Partial<Recurring> = {}): Recurring {
  const r: Recurring = {
    id: "wifi",
    name: "TEST Wi-Fi",
    category: "Internet",
    expected: cash("3000"),
    kind: "fixed",
    frequency: "monthly",
    customDays: 30,
    start: "2026-11-01",
    firstDue: "2026-11-01",
    accountId: "cash",
    essential: true,
    autoBudget: true,
    reminderDays: 3,
    status: "active",
    notes: "",
    ...extra,
  };
  s.recurring.push(r);
  return r;
}
export function prepaid(
  extra: Partial<Omit<Prepaid, "periods">> = {},
): Omit<Prepaid, "periods"> {
  return {
    id: "advance",
    name: "TEST Wi-Fi",
    category: "Internet",
    recurringId: "wifi",
    accountId: "cash",
    amount: cash("15000"),
    paymentDate: "2026-11-01",
    coverageStart: "2026-11-01",
    coverageEnd: "2027-04-30",
    normalPrice: cash("3000"),
    frequency: "monthly",
    customDays: 30,
    count: 6,
    recognition: "actual",
    notes: "",
    ...extra,
  };
}

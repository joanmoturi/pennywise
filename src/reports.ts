import type { State } from "./domain";
import { sum } from "./money";
import { accountBalance, outstanding, reserveBalance } from "./engine";

export function reports(s: State, start: string, end: string) {
  const txs = s.transactions.filter((t) => t.date >= start && t.date <= end);
  const groups = (type: string, field: "category" | "relatedId") => {
    const map = new Map<string, number>();
    for (const t of txs.filter((t) => t.type === type)) {
      const key = t[field] || "Unlinked";
      map.set(key, sum([map.get(key) ?? 0, t.amount]));
    }
    return [...map]
      .map(([name, amount]) => ({
        name:
          s.incomes.find((i) => i.id === name)?.name ||
          s.bonds.find((b) => b.id === name)?.name ||
          name,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  };
  const monthly = [...new Set(txs.map((t) => t.date.slice(0, 7)))]
    .sort()
    .map((month) => ({
      month,
      income: sum(
        txs
          .filter((t) => t.date.startsWith(month) && t.type === "income")
          .map((t) => t.amount),
      ),
      expense: sum(
        txs
          .filter((t) => t.date.startsWith(month) && t.type === "expense")
          .map((t) => t.amount),
      ),
      cash: sum(
        s.accounts
          .filter((a) => a.kind !== "investment")
          .map((a) => accountBalance(s, a.id, `${month}-31`)),
      ),
    }));
  return {
    transactions: txs,
    spending: groups("expense", "category"),
    incomeSources: groups("income", "relatedId"),
    monthly,
    income: sum(txs.filter((t) => t.type === "income").map((t) => t.amount)),
    expense: sum(txs.filter((t) => t.type === "expense").map((t) => t.amount)),
    recoveries: sum(
      txs.filter((t) => t.type === "loan_recovery").map((t) => t.amount),
    ),
    repayments: sum(
      txs
        .filter((t) =>
          ["liability_repayment", "debt_repayment"].includes(t.type),
        )
        .map((t) => t.amount),
    ),
    coupons: sum(
      txs
        .filter(
          (t) =>
            t.type === "income" && s.bonds.some((b) => b.id === t.relatedId),
        )
        .map((t) => t.amount),
    ),
    reserves: s.reserves.map((r) => ({
      name: r.name,
      amount: reserveBalance(s, r.id),
      target: r.target,
    })),
    liabilities: s.liabilities.map((l) => ({
      name: l.name,
      amount: outstanding(s, l.id, "liability"),
    })),
  };
}

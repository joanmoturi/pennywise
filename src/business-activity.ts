import type { State, Transaction } from "./domain";

export interface BusinessActivityEntry {
  transaction: Transaction;
  accountId: string;
  amount: number;
  kind: string;
  counterpartId?: string;
}
export interface BusinessActivity {
  expenses: BusinessActivityEntry[];
  inflows: BusinessActivityEntry[];
}

function cashMovement(transaction: Transaction): number {
  switch (transaction.type) {
    case "expense":
    case "debt_repayment":
    case "loan_disbursement":
    case "liability_repayment":
      return -transaction.amount;
    case "income":
    case "loan_recovery":
    case "liability_draw":
    case "adjustment":
    case "bond_maturity":
    case "prepaid_refund":
      return transaction.amount;
    case "reserve_transfer":
    case "transfer":
      return 0;
  }
}
function inflowKind(transaction: Transaction): string {
  if (transaction.businessMovement === "owner_distribution")
    return "Returned owner distribution";
  if (transaction.businessMovement === "partner_distribution")
    return "Returned partner distribution";
  if (transaction.businessMovement === "capital") return "Capital / funding";
  switch (transaction.type) {
    case "income":
      return "Revenue";
    case "transfer":
      return transaction.reversalOf ? "Transfer reversal" : "Transfer in";
    case "loan_recovery":
      return "Loan principal recovered";
    case "liability_draw":
      return "Borrowed funds";
    case "bond_maturity":
      return "Bond principal returned";
    case "prepaid_refund":
      return "Expense refund";
    case "adjustment":
      return "Positive adjustment";
    case "expense":
      return "Expense reversal";
    case "loan_disbursement":
      return "Loan disbursement reversal";
    case "debt_repayment":
    case "liability_repayment":
      return "Repayment reversal";
    case "reserve_transfer":
      return "Reserve earmark";
  }
}

export function businessActivity(
  state: State,
  businessId: string,
): BusinessActivity {
  const owned = new Set(
    state.accounts
      .filter((account) => account.businessId === businessId)
      .map((account) => account.id),
  );
  const result: BusinessActivity = { expenses: [], inflows: [] };
  for (const transaction of state.transactions) {
    const sourceOwned = owned.has(transaction.accountId);
    if (
      sourceOwned &&
      transaction.type === "expense" &&
      !transaction.businessMovement
    )
      result.expenses.push({
        transaction,
        accountId: transaction.accountId,
        amount: transaction.amount,
        kind: transaction.amount < 0 ? "Expense reversal" : "Operating expense",
      });
    if (transaction.type === "transfer") {
      const destinationOwned = Boolean(
        transaction.destinationId && owned.has(transaction.destinationId),
      );
      if (sourceOwned === destinationOwned) continue;
      const amount = sourceOwned ? -transaction.amount : transaction.amount;
      if (amount > 0)
        result.inflows.push({
          transaction,
          accountId: sourceOwned
            ? transaction.accountId
            : transaction.destinationId!,
          counterpartId: sourceOwned
            ? transaction.destinationId
            : transaction.accountId,
          amount,
          kind: inflowKind(transaction),
        });
    } else if (sourceOwned) {
      const amount = cashMovement(transaction);
      if (amount > 0)
        result.inflows.push({
          transaction,
          accountId: transaction.accountId,
          amount,
          kind: inflowKind(transaction),
        });
    }
  }
  const newest = (left: BusinessActivityEntry, right: BusinessActivityEntry) =>
    right.transaction.date.localeCompare(left.transaction.date) ||
    right.transaction.id.localeCompare(left.transaction.id);
  result.expenses.sort(newest);
  result.inflows.sort(newest);
  return result;
}

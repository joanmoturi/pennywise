import { useMemo, useState } from "react";
import { useApp } from "./context";
import { addDays, today, type Business } from "./domain";
import { businessActivity } from "./business-activity";
import { formatMoney, sum } from "./money";
import { Badge, Button, Table } from "./ui";

export function BusinessActivityHistory({ business }: { business: Business }) {
  const { state } = useApp();
  const [view, setView] = useState<"expenses" | "inflows">("expenses");
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const accounts = state.accounts.filter(
    (account) => account.businessId === business.id,
  );
  const selectedAccount = accounts.some((account) => account.id === accountId)
    ? accountId
    : "";
  const activity = useMemo(
    () => businessActivity(state, business.id),
    [state, business.id],
  );
  const entries = activity[view];
  const invalidRange = Boolean(from && to && from > to);
  const query = search.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    const transaction = entry.transaction;
    return (
      !invalidRange &&
      (!selectedAccount || entry.accountId === selectedAccount) &&
      (!from || transaction.date >= from) &&
      (!to || transaction.date <= to) &&
      `${transaction.description} ${transaction.category} ${transaction.subcategory} ${transaction.notes} ${entry.kind}`
        .toLowerCase()
        .includes(query)
    );
  });
  const pageSize = 25;
  const pageOffset = Math.min(
    offset,
    Math.max(0, Math.ceil(filtered.length / pageSize) - 1) * pageSize,
  );
  const visible = filtered.slice(pageOffset, pageOffset + pageSize);
  const money = (amount: number) =>
    formatMoney(amount, state.settings.currency);
  let total: string;
  try {
    total = money(sum(filtered.map((entry) => entry.amount)));
  } catch {
    total = "Total exceeds the supported monetary range";
  }
  const accountName = (id: string) =>
    state.accounts.find((account) => account.id === id)?.name ??
    "Unknown account";
  return (
    <section aria-label={`${business.name} transaction history`}>
      <h3>Business transaction history</h3>
      <div className="actions">
        <button
          className={view === "expenses" ? "button" : "button secondary"}
          aria-pressed={view === "expenses"}
          onClick={() => {
            setView("expenses");
            setOffset(0);
          }}
        >
          Expenses ({activity.expenses.length})
        </button>
        <button
          className={view === "inflows" ? "button" : "button secondary"}
          aria-pressed={view === "inflows"}
          onClick={() => {
            setView("inflows");
            setOffset(0);
          }}
        >
          Inflows ({activity.inflows.length})
        </button>
      </div>
      <p className="notice">
        {view === "expenses"
          ? "Operating expenses paid from this business's accounts, including pasted expenses. Profit distributions remain in Distribution history."
          : "All recorded money entering this business, labelled by type. Funding, borrowing, refunds and transfers are not revenue or profit. Opening balances, reserve earmarks and transfers within this business are not new inflows."}
      </p>
      <div className="toolbar" onChange={() => setOffset(0)}>
        <input
          aria-label="Business history search"
          placeholder="Search description, category, notes or type"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Business history account"
          value={selectedAccount}
          onChange={(event) => setAccountId(event.target.value)}
        >
          <option value="">All business accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <label>
          From
          <input
            aria-label="Business history from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Business history to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <Button
          secondary
          onClick={() => {
            const yesterday = addDays(today(), -1);
            setFrom(yesterday);
            setTo(yesterday);
            setOffset(0);
          }}
        >
          Yesterday
        </Button>
        <Button
          secondary
          onClick={() => {
            setSearch("");
            setAccountId("");
            setFrom("");
            setTo("");
            setOffset(0);
          }}
        >
          Reset filters
        </Button>
      </div>
      {invalidRange && (
        <p className="notice warning" role="alert">
          The From date must not be after the To date.
        </p>
      )}
      <p role="status">
        {filtered.length} {view === "expenses" ? "expenses" : "inflows"} /{" "}
        {view === "expenses" ? "Expenses total" : "Inflows total"} (filtered):{" "}
        {total}. Newest dates first.
      </p>
      {!filtered.length ? (
        <p>
          No matching {view}. Reset the filters to see all saved history. If an
          entry is missing, check its paying or receiving account in
          Transactions; only this business's accounts appear here. No records
          are automatically reassigned.
        </p>
      ) : (
        <Table
          headers={[
            "Date",
            "Description / category",
            "Business account",
            "Type",
            "Amount",
          ]}
        >
          {visible.map((entry) => {
            const transaction = entry.transaction;
            return (
              <tr key={transaction.id}>
                <td>{transaction.date}</td>
                <td>
                  <strong>{transaction.description}</strong>
                  <small>
                    {transaction.category}
                    {transaction.subcategory && ` / ${transaction.subcategory}`}
                  </small>
                  {transaction.notes.startsWith(
                    "Reviewed pasted expenses [",
                  ) && <small>Source: Pasted expenses</small>}
                  <details>
                    <summary>Entry details</summary>
                    <p>{transaction.notes || "No notes recorded."}</p>
                    <p>
                      Reference:{" "}
                      {transaction.notification?.reference ||
                        transaction.recurringReference ||
                        transaction.id}
                    </p>
                    {transaction.paymentMethod && (
                      <p>Payment method: {transaction.paymentMethod}</p>
                    )}
                    {transaction.receipt && (
                      <p>
                        Receipt attached: {transaction.receipt.name}. Open
                        Transactions to download it.
                      </p>
                    )}
                    {transaction.eventId && (
                      <p>Linked to a payment-calendar receipt.</p>
                    )}
                    {transaction.reversalOf && (
                      <p>Reverses entry: {transaction.reversalOf}</p>
                    )}
                  </details>
                </td>
                <td>
                  {accountName(entry.accountId)}
                  {entry.counterpartId && (
                    <small>From: {accountName(entry.counterpartId)}</small>
                  )}
                </td>
                <td>
                  <Badge>{entry.kind}</Badge>
                </td>
                <td className="amount">{money(entry.amount)}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {filtered.length > pageSize && (
        <nav className="pagination" aria-label="Business history pages">
          <Button
            secondary
            disabled={pageOffset === 0}
            onClick={() => setOffset(Math.max(0, pageOffset - pageSize))}
          >
            Previous
          </Button>
          <span role="status">
            {pageOffset + 1}-{Math.min(pageOffset + pageSize, filtered.length)}{" "}
            of {filtered.length} entries
          </span>
          <Button
            secondary
            disabled={pageOffset + pageSize >= filtered.length}
            onClick={() => setOffset(pageOffset + pageSize)}
          >
            Next
          </Button>
        </nav>
      )}
    </section>
  );
}

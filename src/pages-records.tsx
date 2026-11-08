import { useMemo, useState } from "react";
import { CalendarDays, Copy, Check, Archive, Paperclip } from "lucide-react";
import { useApp } from "./context";
import {
  uid,
  today,
  addDays,
  type Budget,
  type PaymentEvent,
  type Transaction,
} from "./domain";
import { sum, formatMoney } from "./money";
import {
  accountBalances,
  outstanding,
  reserveBalance,
  necessitiesFunding,
  coupon,
  eventRemaining,
  eventStatus,
  budgetStats,
} from "./engine";
import {
  editRecord,
  deleteRecord,
  editTransaction,
  deleteTransaction,
  addSchedule,
  receive,
  transferReserve,
  type Collection,
} from "./forms";
import {
  PageHead,
  Card,
  Metric,
  Empty,
  AddButton,
  Button,
  Badge,
  Actions,
  Table,
  Progress,
  errorMessage,
  HelpNote,
} from "./ui";
import { download } from "./storage";
import { effectiveAllocations } from "./expense-engine";
import { BudgetActivity, allocationDialog } from "./connected-ui";
import { summary } from "./engine";
import { MmfWorkspace } from "./mmf-ui";
import { mmfEventEnabled } from "./mmf";
import { CurrencyWorkspace } from "./currency-ui";
import {
  accountCurrency,
  nativeBalances,
  nativeEventRemaining,
} from "./currency";

export function AccountsPage() {
  const app = useApp();
  const { state: s } = app;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const balances = useMemo(() => accountBalances(s), [s]);
  const originals = useMemo(() => nativeBalances(s), [s]);
  const position = summary(s);
  return (
    <>
      <PageHead
        title="Your accounts"
        subtitle="Opening balances are existing funds, not new income."
        action={
          <AddButton onClick={() => editRecord(app, "accounts")}>
            Add account
          </AddButton>
        }
      />
      <div className="metrics">
        <Metric label="Personal cash" value={fmt(position.liquid)} />
        <Metric
          label="Personal liabilities"
          value={fmt(position.liabilities)}
        />
        <Metric
          label="Owed to me (not cash)"
          value={fmt(position.receivables)}
        />
        <Metric
          label="Personal net position"
          value={fmt(position.netWorth)}
          supporting={`Business cash: ${fmt(position.businessCash)}`}
        />
      </div>
      {!s.accounts.length ? (
        <Empty title="Give your money a home">
          Add bank, cash or mobile-money accounts. Track investments separately
          from liquid cash.
        </Empty>
      ) : (
        <div className="grid cards">
          {s.accounts.map((a) => (
            <Card key={a.id}>
              <div className="card-head">
                <Badge>{a.kind}</Badge>
                <Actions
                  label={a.name}
                  edit={() => editRecord(app, "accounts", a)}
                  remove={() => deleteRecord(app, "accounts", a)}
                />
              </div>
              <h3>{a.name}</h3>
              <Badge>
                {a.businessId
                  ? `Business: ${s.businesses.find((b) => b.id === a.businessId)?.name}`
                  : "Personal / legacy account"}
              </Badge>
              <div className="big-number">
                {formatMoney(originals.get(a.id)!, accountCurrency(s, a.id))}
              </div>
              {accountCurrency(s, a.id) !== s.settings.currency && (
                <small>Estimated base value: {fmt(balances.get(a.id)!)}</small>
              )}
              <p>
                Restricted:{" "}
                {formatMoney(
                  a.nativeRestricted ?? a.restricted,
                  accountCurrency(s, a.id),
                )}
              </p>
              <small>{a.notes}</small>
            </Card>
          ))}
        </div>
      )}
      <CurrencyWorkspace />
      <p className="notice">
        Avoid counting a bond holding in both an investment account and the
        Bonds module. Record only non-bond assets in investment account
        balances.
      </p>
    </>
  );
}
export function TransactionsPage() {
  const app = useApp();
  const { state: s } = app;
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [ascending, setAscending] = useState(false);
  const [account, setAccount] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 50;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const txs = useMemo(
    () =>
      (ascending ? s.transactions : [...s.transactions].reverse())
        .filter(
          (t) =>
            (!type || t.type === type) &&
            (!account || t.accountId === account) &&
            (!start || t.date >= start) &&
            (!end || t.date <= end) &&
            `${t.description} ${t.category} ${t.subcategory} ${t.notes}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => (ascending ? 1 : -1) * a.date.localeCompare(b.date)),
    [s.transactions, type, account, start, end, search, ascending],
  );
  const pageOffset = Math.min(
    offset,
    Math.max(0, Math.ceil(txs.length / pageSize) - 1) * pageSize,
  );
  const visible = txs.slice(pageOffset, pageOffset + pageSize);
  async function attach(t: Transaction, file: File) {
    try {
      if (
        !["image/png", "image/jpeg", "application/pdf"].includes(file.type) ||
        file.size > 2_000_000
      )
        throw new Error("Use PNG, JPEG or PDF receipts up to 2 MB");
      const reader = new FileReader();
      const data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await app.mutate("Attach local receipt", (s) => {
        s.transactions.find((r) => r.id === t.id)!.receipt = {
          name: file.name,
          mime: file.type as "image/png" | "image/jpeg" | "application/pdf",
          data,
        };
      });
    } catch (error) {
      app.notify(errorMessage(error));
    }
  }
  return (
    <>
      <PageHead
        title="Transactions"
        subtitle="A traceable ledger. Transfers, borrowing and recoveries never inflate earned income."
        action={
          <AddButton onClick={() => editTransaction(app)}>
            Add transaction
          </AddButton>
        }
      />
      <div className="toolbar" onChange={() => setOffset(0)}>
        <input
          aria-label="Search transactions"
          placeholder="Search description, category or notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter transaction type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>
          {[...new Set(s.transactions.map((t) => t.type))].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          aria-label="Filter account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="">All accounts</option>
          {s.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label>
          From
          <input
            aria-label="Transactions from"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Transactions to"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <Button
          secondary
          onClick={() => {
            setAscending(!ascending);
            setOffset(0);
          }}
        >
          {ascending ? "Oldest first" : "Newest first"}
        </Button>
      </div>
      <Card>
        <div className="card-head">
          <h3>{txs.length} ledger entries</h3>
          <span>Actual records only</span>
        </div>
        {!txs.length ? (
          <Empty title="A clean slate">
            Record your first expense, receipt or transfer.
          </Empty>
        ) : (
          <Table
            headers={[
              "Date",
              "Description",
              "Account",
              "Type",
              "Amount",
              "Actions",
            ]}
          >
            {visible.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>
                  <strong>{t.description}</strong>
                  <small>
                    {t.category}
                    {t.subcategory && ` / ${t.subcategory}`}
                  </small>
                  {t.receipt && (
                    <button
                      className="text-button"
                      onClick={() => {
                        const data = t.receipt!.data.split(",")[1];
                        const bytes = Uint8Array.from(atob(data), (c) =>
                          c.charCodeAt(0),
                        );
                        download(
                          t.receipt!.name,
                          new Blob([bytes], { type: t.receipt!.mime }),
                        );
                      }}
                    >
                      Download receipt
                    </button>
                  )}
                </td>
                <td>{s.accounts.find((a) => a.id === t.accountId)?.name}</td>
                <td>
                  <Badge>{t.type.replaceAll("_", " ")}</Badge>
                </td>
                <td className="amount">
                  {formatMoney(
                    t.type === "reserve_transfer"
                      ? t.amount
                      : (t.nativeAmount ?? t.amount),
                    t.type === "reserve_transfer"
                      ? s.settings.currency
                      : accountCurrency(s, t.accountId),
                  )}
                  {t.nativeDestinationAmount !== undefined &&
                    t.destinationId && (
                      <small>
                        Received:{" "}
                        {formatMoney(
                          t.nativeDestinationAmount,
                          accountCurrency(s, t.destinationId),
                        )}
                      </small>
                    )}
                  {t.type !== "reserve_transfer" &&
                    accountCurrency(s, t.accountId) !== s.settings.currency && (
                      <small>Saved base value: {fmt(t.amount)}</small>
                    )}
                </td>
                <td>
                  <div className="actions">
                    <Actions
                      label={t.description}
                      edit={() => editTransaction(app, t)}
                      remove={() => deleteTransaction(app, t)}
                    />
                    <label
                      className="icon-button"
                      aria-label={`Attach receipt to ${t.description}`}
                    >
                      <Paperclip size={16} />
                      <input
                        type="file"
                        className="visually-hidden"
                        accept="image/png,image/jpeg,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void attach(t, file);
                        }}
                      />
                    </label>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
        {txs.length > pageSize && (
          <nav className="pagination" aria-label="Transaction pages">
            <Button
              secondary
              disabled={pageOffset === 0}
              onClick={() => setOffset(Math.max(0, pageOffset - pageSize))}
            >
              Previous
            </Button>
            <span role="status">
              {pageOffset + 1}-{Math.min(pageOffset + pageSize, txs.length)} of{" "}
              {txs.length} entries
            </span>
            <Button
              secondary
              disabled={pageOffset + pageSize >= txs.length}
              onClick={() => setOffset(pageOffset + pageSize)}
            >
              Next
            </Button>
          </nav>
        )}
      </Card>
    </>
  );
}
export function PaymentCalendar({
  sourceId,
  kinds,
}: {
  sourceId?: string;
  kinds?: readonly PaymentEvent["kind"][];
}) {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const events = s.events
    .filter(
      (e) =>
        (!sourceId || e.sourceId === sourceId) &&
        (!kinds || kinds.includes(e.kind)) &&
        mmfEventEnabled(s, e.sourceId),
    )
    .sort((a, b) => a.due.localeCompare(b.due));
  function edit(e: PaymentEvent) {
    app.dialog({
      title: "Edit expected payment",
      fields: [
        { key: "due", label: "Expected date", type: "date" },
        { key: "amount", label: "Expected net amount", type: "money" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["expected", "delayed", "cancelled"].map((value) => ({
            value,
            label: value,
          })),
        },
        {
          key: "reliability",
          label: "Reliability",
          type: "select",
          options: ["confirmed", "reliable", "uncertain"].map((value) => ({
            value,
            label: value,
          })),
        },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
      values: { ...e },
      submit: async (v) =>
        app.mutate("Correct expected payment", (s) => {
          s.events[s.events.findIndex((r) => r.id === e.id)] =
            v as PaymentEvent;
        }),
    });
  }
  return (
    <Card>
      <div className="card-head">
        <h3>
          <CalendarDays size={18} />
          Payment calendar
        </h3>
        <Badge>Projections, not cash</Badge>
      </div>
      {!events.length ? (
        <p>
          Add explicitly configured dates. Months without payment dates have no
          assumed payouts.
        </p>
      ) : (
        <Table
          headers={[
            "Expected date",
            "Source",
            "Expected / remaining",
            "Status",
            "Actions",
          ]}
        >
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.due}</td>
              <td>
                {
                  [...s.incomes, ...s.bonds, ...s.receivables].find(
                    (r) => r.id === e.sourceId,
                  )?.name
                }
                <small>
                  {e.kind === "bond" && "Bond coupon / "}
                  {e.reliability}
                </small>
              </td>
              <td>
                {e.currency
                  ? formatMoney(e.nativeAmount ?? e.amount, e.currency)
                  : fmt(e.amount)}
                <small>
                  Remaining:{" "}
                  {e.currency && e.currency !== s.settings.currency
                    ? `${formatMoney(nativeEventRemaining(s, e), e.currency)} / ${fmt(eventRemaining(s, e))} estimated`
                    : fmt(eventRemaining(s, e))}
                </small>
              </td>
              <td>
                <Badge warning={eventStatus(s, e) === "delayed"}>
                  {eventStatus(s, e)}
                </Badge>
              </td>
              <td>
                <div className="actions">
                  {e.status !== "cancelled" && eventRemaining(s, e) > 0 && (
                    <Button secondary onClick={() => receive(app, e.id)}>
                      Receive
                    </Button>
                  )}
                  <button className="text-button" onClick={() => edit(e)}>
                    Edit
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
export function IncomePage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  return (
    <>
      <PageHead
        title="Income streams"
        subtitle="Plan around irregular income. Confirm each receipt before it becomes cash."
        action={
          <AddButton onClick={() => editRecord(app, "incomes")}>
            Add income
          </AddButton>
        }
      />
      {!s.incomes.length && !s.bonds.length && (
        <Empty title="Build your income picture">
          Add work, consulting, rent, distributions or other receipts. Bonds
          added in Bonds appear here automatically. Loan repayment schedules
          belong in Receivables.
        </Empty>
      )}
      <div className="notice">
        Personal income received this month:{" "}
        <strong>{fmt(summary(s).income)}</strong>. Expected payments are not
        cash.
        <button
          className="text-button"
          onClick={() => app.navigate("businesses")}
        >
          Business revenue & distributions
        </button>
      </div>
      <MmfWorkspace />
      {s.incomes.some((income) => !income.mmfStudio) && (
        <div className="grid cards">
          {s.incomes
            .filter((income) => !income.mmfStudio)
            .map((i) => (
              <Card key={i.id}>
                <Badge>
                  {i.businessId
                    ? "Projected business distribution"
                    : s.accounts.find((a) => a.id === i.accountId)?.businessId
                      ? "Business revenue, not personal income"
                      : "Personal / legacy income source"}
                </Badge>
                <div className="card-head">
                  <Badge warning={i.reliability === "uncertain"}>
                    {i.active ? i.reliability : "inactive"}
                  </Badge>
                  <Actions
                    label={i.name}
                    edit={() => editRecord(app, "incomes", i)}
                    remove={() => deleteRecord(app, "incomes", i)}
                  />
                </div>
                <h3>{i.name}</h3>
                <div className="big-number">
                  {i.currency
                    ? formatMoney(i.nativeAmount ?? i.amount, i.currency)
                    : fmt(i.amount)}
                </div>
                {i.currency && i.currency !== s.settings.currency && (
                  <small>Saved base amount: {fmt(i.amount)}</small>
                )}
                <p>
                  {i.type} / {i.frequency}
                </p>
                <small>
                  Actual received:{" "}
                  {fmt(
                    sum(
                      s.transactions
                        .filter(
                          (t) => t.relatedId === i.id && t.type === "income",
                        )
                        .map((t) => t.amount),
                    ),
                  )}
                </small>
                <Button
                  secondary
                  onClick={() => addSchedule(app, "income", i.id)}
                >
                  Add payment dates
                </Button>
              </Card>
            ))}
        </div>
      )}
      {s.bonds.length > 0 && (
        <section aria-labelledby="bond-income-heading">
          <h2 id="bond-income-heading">Bond coupon income</h2>
          <p>
            Linked to your existing bonds, not separate income records. Only
            confirmed coupon receipts count as income; principal repayments do
            not.
          </p>
          <div className="grid cards">
            {s.bonds.map((b) => {
              const receipts = s.transactions
                .filter((t) => t.relatedId === b.id && t.type === "income")
                .sort((a, b) => b.date.localeCompare(a.date));
              const next = s.events
                .filter(
                  (e) =>
                    e.kind === "bond" &&
                    e.sourceId === b.id &&
                    e.status !== "cancelled",
                )
                .sort((a, b) => a.due.localeCompare(b.due))
                .find((e) => eventRemaining(s, e) > 0);
              return (
                <Card key={b.id}>
                  <div className="card-head">
                    <Badge>Linked bond</Badge>
                    <button
                      className="text-button"
                      onClick={() => app.navigate("bonds")}
                    >
                      Manage bond
                    </button>
                  </div>
                  <h3>{b.name}</h3>
                  <p>
                    {b.identifier} / {b.issuer}
                  </p>
                  <div className="big-number">{fmt(coupon(b).net)}</div>
                  <small>
                    Estimated net coupon per payment ({b.paymentsPerYear} per
                    year). Your configured dates determine expected payouts.
                  </small>
                  <dl>
                    <dt>Actual received</dt>
                    <dd>{fmt(sum(receipts.map((t) => t.amount)))}</dd>
                    <dt>Next unpaid coupon</dt>
                    <dd>{next?.due ?? "No unpaid dates configured"}</dd>
                    {next && (
                      <>
                        <dt>Still expected</dt>
                        <dd>
                          {fmt(eventRemaining(s, next))} /{" "}
                          {eventStatus(s, next)}
                        </dd>
                      </>
                    )}
                    <dt>Receiving account</dt>
                    <dd>
                      {s.accounts.find((a) => a.id === b.accountId)?.name}
                    </dd>
                  </dl>
                  <Button
                    secondary
                    onClick={() => addSchedule(app, "bond", b.id)}
                  >
                    Add payment dates
                  </Button>
                  <details>
                    <summary>
                      Recent coupon receipts ({receipts.length})
                    </summary>
                    {receipts.length ? (
                      <>
                        <p>
                          Showing the latest {Math.min(5, receipts.length)}.
                        </p>
                        <Table headers={["Date received", "Amount", "Account"]}>
                          {receipts.slice(0, 5).map((t) => (
                            <tr key={t.id}>
                              <td>{t.date}</td>
                              <td>{fmt(t.amount)}</td>
                              <td>
                                {
                                  s.accounts.find((a) => a.id === t.accountId)
                                    ?.name
                                }
                              </td>
                            </tr>
                          ))}
                        </Table>
                      </>
                    ) : (
                      <p>No coupon receipts recorded yet.</p>
                    )}
                  </details>
                </Card>
              );
            })}
          </div>
        </section>
      )}
      <PaymentCalendar kinds={["income", "bond"]} />
    </>
  );
}
export function BondsPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  return (
    <>
      <PageHead
        title="Infrastructure bonds"
        subtitle="Independent holdings, explicit schedules. Principal is an asset, never coupon income."
        action={
          <AddButton onClick={() => editRecord(app, "bonds")}>
            Add bond
          </AddButton>
        }
      />
      {!s.bonds.length ? (
        <Empty title="Add a bond from your records">
          Enter the documented principal, coupon rate, tax assumption and
          maturity. This app supplies no real security rates or dates.
        </Empty>
      ) : (
        <div className="grid cards">
          {s.bonds.map((b) => (
            <Card key={b.id}>
              <div className="card-head">
                <Badge>{b.identifier}</Badge>
                <Actions
                  label={b.name}
                  edit={() => editRecord(app, "bonds", b)}
                  remove={() => deleteRecord(app, "bonds", b)}
                />
              </div>
              <h3>{b.name}</h3>
              <p>{b.issuer}</p>
              <div className="big-number">{fmt(coupon(b).net)}</div>
              <small>
                Expected net coupon / payment ({b.paymentsPerYear} per year)
              </small>
              <dl>
                <dt>Principal</dt>
                <dd>{fmt(b.principal)}</dd>
                <dt>Gross coupon</dt>
                <dd>{fmt(coupon(b).gross)}</dd>
                <dt>Tax assumption</dt>
                <dd>{fmt(coupon(b).tax)}</dd>
                <dt>Maturity</dt>
                <dd>{b.maturity}</dd>
              </dl>
              <Button secondary onClick={() => addSchedule(app, "bond", b.id)}>
                Configure payment dates
              </Button>
              <button
                className="text-button"
                onClick={() =>
                  editTransaction(app, undefined, {
                    type: "bond_maturity",
                    relatedId: b.id,
                    accountId: b.accountId,
                    category: "Principal recovery",
                    description: `Maturity: ${b.name}`,
                  })
                }
              >
                Record principal recovery
              </button>
            </Card>
          ))}
        </div>
      )}
      <PaymentCalendar kinds={["bond"]} />
    </>
  );
}
export function ObligationsPage({
  receivables = false,
}: {
  receivables?: boolean;
}) {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const kind: Collection = receivables ? "receivables" : "liabilities";
  const records = receivables ? s.receivables : s.liabilities;
  const changeDebtView = (section: string) => {
    app.navigate(section);
    requestAnimationFrame(() =>
      document.getElementById(`debt-tab-${section}`)?.focus(),
    );
  };
  return (
    <>
      <PageHead
        title={
          receivables ? "Money owed to you" : "Obligations & business funds"
        }
        subtitle={
          receivables
            ? "Receivables are assets, not spendable cash. Principal repayments are recoveries, not earned income."
            : "Repayable business funds are liabilities. Protect them before discretionary spending."
        }
        action={
          <AddButton onClick={() => editRecord(app, kind)}>
            {receivables ? "Add receivable" : "Add liability"}
          </AddButton>
        }
      />
      <div
        className="actions"
        role="tablist"
        aria-label="Debts"
        onKeyDown={(event) => {
          const section =
            event.key === "ArrowRight" || event.key === "ArrowLeft"
              ? receivables
                ? "obligations"
                : "receivables"
              : event.key === "Home"
                ? "obligations"
                : event.key === "End"
                  ? "receivables"
                  : "";
          if (section) {
            event.preventDefault();
            changeDebtView(section);
          }
        }}
      >
        <button
          role="tab"
          id="debt-tab-obligations"
          tabIndex={receivables ? -1 : 0}
          aria-selected={!receivables}
          className="button secondary"
          onClick={() => changeDebtView("obligations")}
        >
          I owe
        </button>
        <button
          role="tab"
          id="debt-tab-receivables"
          tabIndex={receivables ? 0 : -1}
          aria-selected={receivables}
          className="button secondary"
          onClick={() => changeDebtView("receivables")}
        >
          Owed to me
        </button>
      </div>
      {!records.length ? (
        <Empty
          title={
            receivables
              ? "Track lending clearly"
              : "Keep borrowed money visible"
          }
        />
      ) : (
        <div className="grid cards">
          {records.map((r) => {
            const left = outstanding(
              s,
              r.id,
              receivables ? "receivable" : "liability",
            );
            const written =
              receivables &&
              s.receivables.find((a) => a.id === r.id)?.writtenOff;
            return (
              <Card key={r.id}>
                <div className="card-head">
                  <Badge warning={left > 0 && r.due < today()}>
                    {written
                      ? "written off"
                      : left === 0
                        ? "fully repaid"
                        : r.due < today()
                          ? "overdue"
                          : left < r.principal
                            ? "partially repaid"
                            : "outstanding"}
                  </Badge>
                  <Actions
                    label={r.name}
                    edit={() => editRecord(app, kind, r)}
                    remove={() => deleteRecord(app, kind, r)}
                  />
                </div>
                <h3>{r.name}</h3>
                <div className="big-number">{fmt(left)}</div>
                <p>
                  Due {r.due} / priority {r.priority}
                </p>
                <Progress value={r.principal - left} total={r.principal} />
                <small>Original principal: {fmt(r.principal)}</small>
                <p>
                  Already {receivables ? "received" : "paid"}:{" "}
                  {fmt(r.principal - left)} / originated {r.date}
                </p>
                <Button
                  secondary
                  onClick={() =>
                    editTransaction(app, undefined, {
                      type: receivables
                        ? "loan_recovery"
                        : "liability_repayment",
                      relatedId: r.id,
                      accountId: r.accountId,
                      amount: left,
                      category: receivables
                        ? "Loan recovery"
                        : "Business repayment",
                      description: `Repayment: ${r.name}`,
                    })
                  }
                  disabled={left === 0}
                >
                  Record repayment
                </Button>
                <button
                  className="text-button"
                  onClick={() =>
                    editTransaction(app, undefined, {
                      type: receivables
                        ? "loan_disbursement"
                        : "liability_draw",
                      relatedId: r.id,
                      amount: r.principal,
                      accountId: r.accountId,
                      category: receivables
                        ? "Loan disbursement"
                        : "Borrowed business funds",
                      description: `${receivables ? "Lend" : "Draw"}: ${r.name}`,
                    })
                  }
                >
                  Record new {receivables ? "disbursement" : "draw"} (not
                  opening funds)
                </button>
                {receivables && (
                  <>
                    <button
                      className="text-button"
                      onClick={() => addSchedule(app, "receivable", r.id)}
                    >
                      Add repayment schedule
                    </button>
                    {!written && (
                      <button
                        className="text-button danger"
                        onClick={() =>
                          app.confirm(
                            "Write off this loan?",
                            "The outstanding receivable will be removed from asset totals, but its historical transactions are preserved.",
                            async () =>
                              app.mutate("Write off receivable", (s) => {
                                s.receivables.find(
                                  (a) => a.id === r.id,
                                )!.writtenOff = true;
                              }),
                          )
                        }
                      >
                        Write off balance
                      </button>
                    )}
                  </>
                )}
                <details>
                  <summary>Repayment history</summary>
                  {s.transactions
                    .filter((t) => t.relatedId === r.id)
                    .map((t) => (
                      <p key={t.id}>
                        {t.date} / {t.type.replaceAll("_", " ")} /{" "}
                        {fmt(t.amount)}
                      </p>
                    ))}
                </details>
              </Card>
            );
          })}
        </div>
      )}
      {receivables ? (
        <PaymentCalendar kinds={["receivable"]} />
      ) : (
        <Necessities />
      )}
    </>
  );
}
export function Necessities() {
  const app = useApp();
  const fmt = (n: number) => formatMoney(n, app.state.settings.currency);
  const funded = necessitiesFunding(app.state);
  return (
    <Card>
      <div className="card-head">
        <div>
          <h3>Necessities first</h3>
          <p>
            Essential first, then priority and due date. Each cash unit is
            assigned at most once.
          </p>
        </div>
        <AddButton onClick={() => editRecord(app, "necessities")}>
          Add necessity
        </AddButton>
      </div>
      {!funded.length ? (
        <p>List unavoidable bills and their real due dates.</p>
      ) : (
        <Table
          headers={[
            "Necessity",
            "Due",
            "Outstanding / funded",
            "Status",
            "Actions",
          ]}
        >
          {funded.map((n) => (
            <tr key={n.id}>
              <td>
                {n.name}
                <small>
                  {n.category} / {n.essential ? "essential" : "discretionary"}
                </small>
              </td>
              <td>{n.due}</td>
              <td>
                {fmt(n.outstanding)}
                <small>Funded: {fmt(n.funded)}</small>
              </td>
              <td>
                <Badge
                  warning={
                    n.status === "unfunded" ||
                    (n.due < today() && n.outstanding > 0)
                  }
                >
                  {n.status}
                  {n.due < today() && n.outstanding > 0 ? " / overdue" : ""}
                </Badge>
              </td>
              <td>
                <div className="actions">
                  <Button
                    secondary
                    disabled={n.outstanding === 0}
                    onClick={() =>
                      editTransaction(app, undefined, {
                        type: "expense",
                        amount: n.outstanding,
                        relatedId: n.id,
                        description: n.name,
                        category: n.category,
                      })
                    }
                  >
                    Pay
                  </Button>
                  <Actions
                    label={n.name}
                    edit={() =>
                      editRecord(
                        app,
                        "necessities",
                        app.state.necessities.find((r) => r.id === n.id)!,
                      )
                    }
                    remove={() =>
                      deleteRecord(
                        app,
                        "necessities",
                        app.state.necessities.find((r) => r.id === n.id)!,
                      )
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
export function ReservesPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  return (
    <>
      <PageHead
        title="Reserves & sinking funds"
        subtitle="Earmark existing cash. Reserved funds are removed from freely available spending."
        action={
          <AddButton onClick={() => editRecord(app, "reserves")}>
            Add reserve
          </AddButton>
        }
      />
      {!s.reserves.length ? (
        <Empty title="Give future expenses a funding plan">
          Create emergency, medical, annual insurance or other savings pots.
        </Empty>
      ) : (
        <div className="grid cards">
          {s.reserves.map((r) => (
            <Card key={r.id}>
              <div className="card-head">
                <Badge>{r.emergency ? "emergency" : r.frequency}</Badge>
                <Actions
                  label={r.name}
                  edit={() => editRecord(app, "reserves", r)}
                  remove={() => deleteRecord(app, "reserves", r)}
                />
              </div>
              <h3>{r.name}</h3>
              <div className="big-number">{fmt(reserveBalance(s, r.id))}</div>
              <Progress value={reserveBalance(s, r.id)} total={r.target} />
              <p>
                Target {fmt(r.target)} by {r.due}
              </p>
              <small>
                Planned contribution: {fmt(r.contribution)} / {r.frequency}
              </small>
              <small>
                {s.accounts.find((a) => a.id === r.accountId)?.name}
              </small>
              <div className="actions">
                <Button onClick={() => transferReserve(app, r.id)}>
                  Contribute
                </Button>
                <Button
                  secondary
                  onClick={() => transferReserve(app, r.id, true)}
                >
                  Release
                </Button>
              </div>
              <details>
                <summary>Contribution history</summary>
                {s.transactions
                  .filter((t) => t.reserveId === r.id)
                  .map((t) => (
                    <p key={t.id}>
                      {t.date}: {fmt(t.amount)}
                    </p>
                  ))}
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
export function BudgetsPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const [selected, setSelected] = useState(s.settings.activeBudgetId);
  const [archived, setArchived] = useState(false);
  const b = s.budgets.find((b) => b.id === selected) || s.budgets[0];
  function allocation(
    b: Budget,
    index?: number,
    automatic?: Budget["allocations"][number],
  ) {
    const current =
      automatic ??
      (index === undefined
        ? {
            category: "Housing",
            amount: 0,
            essential: true,
            priority: 1,
            purpose: "spending",
            rolloverRule: "none",
            rolloverAmount: 0,
          }
        : b.allocations[index]);
    app.dialog({
      title: "Budget category allocation",
      description:
        "Choose your own category. Savings, reserve and debt allocations are plans; actual funding requires a ledger action.",
      fields: [
        { key: "category", label: "Category" },
        { key: "amount", label: "Allocation", type: "money" },
        { key: "essential", label: "Essential", type: "checkbox" },
        { key: "priority", label: "Priority", type: "number" },
        {
          key: "purpose",
          label: "Allocation purpose",
          type: "select",
          options: ["spending", "savings", "reserve", "debt"].map((value) => ({
            value,
            label: value,
          })),
        },
        {
          key: "rolloverRule",
          label: "Category rollover rule",
          type: "select",
          options: ["none", "full", "savings", "partial", "manual"].map(
            (value) => ({ value, label: value }),
          ),
        },
        {
          key: "rolloverAmount",
          label: "Partial rollover maximum",
          type: "money",
        },
      ],
      values: { ...current },
      submit: async (v) =>
        app.mutate("Save independent budget allocation", (s) => {
          const target = s.budgets.find((a) => a.id === b.id)!;
          const item = v as Budget["allocations"][number];
          if (index === undefined) target.allocations.push(item);
          else target.allocations[index] = item;
        }),
    });
  }
  const stats = budgetStats(s, b);
  return (
    <>
      <PageHead
        title="Budgets that adapt"
        subtitle="Four independent starting modes. Make every allocation intentional, using actual available funds."
        action={
          <AddButton onClick={() => editRecord(app, "budgets")}>
            New profile
          </AddButton>
        }
      />
      <div className="profile-grid">
        {s.budgets
          .filter((b) => archived || !b.archived)
          .map((profile) => (
            <button
              key={profile.id}
              className={`profile ${profile.id === selected ? "selected" : ""}`}
              onClick={() => setSelected(profile.id)}
            >
              <span>
                {profile.id === s.settings.activeBudgetId
                  ? "ACTIVE PROFILE"
                  : profile.archived
                    ? "ARCHIVED"
                    : "BUDGET PROFILE"}
              </span>
              <strong>{profile.name}</strong>
              <small>{fmt(budgetStats(s, profile).planned)} planned</small>
            </button>
          ))}
      </div>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        Show archived profiles
      </label>
      <div className="metrics">
        <Metric label="Planned allocation" value={fmt(stats.planned)} />
        <Metric label="Actual spending" value={fmt(stats.actual)} />
        <Metric label="Remaining plan" value={fmt(stats.remaining)} />
        <Metric
          label="Zero-based difference"
          value={fmt(stats.unallocated)}
          supporting={
            stats.unallocated < 0
              ? "Overallocated: reduce remaining plans"
              : undefined
          }
          hint="Available cash minus remaining plan"
        />
      </div>
      <Card>
        <div className="card-head">
          <div>
            <h2>{b.name}</h2>
            <p>
              {b.start} - {b.end} / {b.frequency}
            </p>
          </div>
          <div className="actions">
            <Button
              secondary
              disabled={b.archived}
              onClick={() =>
                void app.mutate(
                  "Activate budget without altering other profiles",
                  (s) => {
                    s.settings.activeBudgetId = b.id;
                  },
                )
              }
            >
              <Check size={16} />
              Activate
            </Button>
            <button
              className="icon-button"
              aria-label="Edit budget profile"
              onClick={() => editRecord(app, "budgets", b)}
            >
              <CalendarDays size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Duplicate budget profile"
              onClick={() =>
                void app.mutate("Duplicate independent budget", (s) => {
                  const copy = structuredClone(b);
                  copy.id = uid();
                  copy.profileId = copy.id;
                  copy.name += " (copy)";
                  copy.archived = false;
                  s.budgets.push(copy);
                })
              }
            >
              <Copy size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Archive budget profile"
              onClick={() =>
                void app.mutate("Archive budget", (s) => {
                  if (s.settings.activeBudgetId === b.id)
                    throw new Error(
                      "Activate another profile before archiving",
                    );
                  s.budgets.find((a) => a.id === b.id)!.archived = !b.archived;
                })
              }
            >
              <Archive size={17} />
            </button>
          </div>
        </div>
        <Button
          secondary
          onClick={() =>
            void app.mutate(
              "Create next budget period with retained history",
              (s) => {
                const next = structuredClone(b);
                next.id = uid();
                next.start = addDays(b.end, 1);
                next.end =
                  b.frequency === "monthly"
                    ? new Date(
                        Date.UTC(
                          Number(next.start.slice(0, 4)),
                          Number(next.start.slice(5, 7)),
                          0,
                        ),
                      )
                        .toISOString()
                        .slice(0, 10)
                    : addDays(
                        next.start,
                        Math.round(
                          (Date.parse(b.end) - Date.parse(b.start)) / 86400000,
                        ),
                      );
                next.archived = false;
                s.budgets.push(next);
              },
            )
          }
        >
          Create next period
        </Button>
        <AddButton onClick={() => allocation(b)}>
          Add category allocation
        </AddButton>
        <BudgetActivity
          budget={b}
          edit={(category) => {
            const index = b.allocations.findIndex(
              (a) => a.category === category,
            );
            if (
              index < 0 &&
              !effectiveAllocations(s, b).some((a) => a.category === category)
            ) {
              allocationDialog(app, b, category);
              return;
            }
            allocation(
              b,
              index >= 0 ? index : undefined,
              index < 0
                ? effectiveAllocations(s, b).find(
                    (a) => a.category === category,
                  )
                : undefined,
            );
          }}
        />
        <HelpNote label="How zero-based budgeting works">
          The zero-based difference should be zero when all currently available
          cash has a purpose. Expected receipts are not allocation funding.
          Plans do not automatically move or reserve money.
        </HelpNote>
        <HelpNote label="Rollover rules">
          Rollover is configured independently per category. Full/partial
          rollover adds a traceable prior-period allocation, not new cash.
          Savings/manual rules require a confirmed decision in Savings Capture.
          Overspending is shown as a deficit, never silently carried. Create a
          next period to preserve budget history.
        </HelpNote>
      </Card>
      <Card>
        <h3>Profile comparison</h3>
        <Table headers={["Profile", "Planned", "Actual", "Remaining"]}>
          {s.budgets
            .filter((b) => !b.archived)
            .map((b) => {
              const stats = budgetStats(s, b);
              return (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{fmt(stats.planned)}</td>
                  <td>{fmt(stats.actual)}</td>
                  <td>{fmt(stats.remaining)}</td>
                </tr>
              );
            })}
        </Table>
      </Card>
    </>
  );
}

import { useState } from "react";
import { useApp, type AppContext, type Field } from "./context";
import {
  today,
  uid,
  addDays,
  type Prepaid,
  type Occurrence,
  type Budget,
  type SavingsCapture,
} from "./domain";
import { sum, formatMoney } from "./money";
import { editRecord, deleteRecord } from "./forms";
import { summary, scheduleDates } from "./engine";
import {
  generateOccurrences,
  occurrenceStatus,
  occurrenceRemaining,
  nextOccurrence,
  payOccurrence,
  recordPrepaid,
  prepaidPeriods,
  prepaidBalance,
  prepaidSavings,
  prepaidRecognition,
  terminatePrepaid,
  monthlyReview,
  commitCapture,
  undoCapture,
  finalizeReview,
  reserveFunding,
  correctTermination,
  prepaidRefunds,
} from "./expense-engine";
import {
  PageHead,
  Card,
  Metric,
  AddButton,
  Button,
  Badge,
  Table,
  Actions,
  Empty,
} from "./ui";

const money = (key: string, label: string): Field => ({
  key,
  label,
  type: "money",
});
export function prepaidDialog(
  app: AppContext,
  recurringId?: string,
  existing?: Prepaid,
) {
  const r = app.state.recurring.find((r) => r.id === recurringId);
  const start = today();
  const count = 6;
  const defaults = existing
    ? { ...existing }
    : {
        id: uid(),
        name: r?.name ?? "",
        category: r?.category ?? "Internet",
        recurringId: recurringId ?? "",
        accountId: r?.accountId ?? app.state.accounts[0]?.id ?? "",
        amount: 0,
        paymentDate: today(),
        coverageStart: start,
        coverageEnd: "",
        normalPrice: r?.expected ?? 0,
        frequency: "monthly",
        customDays: 30,
        count,
        recognition: "actual",
        notes: "",
      };
  app.dialog({
    title: existing ? "Correct prepaid expense" : "Pay in advance",
    description:
      "Confirm only an actual payment. Cash is debited once. Monthly budget cost is allocated across coverage periods, separately from the normal-price comparison. Leave coverage end blank to derive it from the period count.",
    fields: [
      { key: "name", label: "Expense name" },
      { key: "category", label: "Category" },
      {
        key: "recurringId",
        label: "Recurring service (optional)",
        type: "select",
        required: false,
        options: app.state.recurring.map((r) => ({
          value: r.id,
          label: r.name,
        })),
      },
      money("amount", "Actual advance payment"),
      { key: "paymentDate", label: "Actual payment date", type: "date" },
      { key: "coverageStart", label: "Coverage start", type: "date" },
      {
        key: "coverageEnd",
        label: "Coverage end (optional)",
        type: "date",
        required: false,
      },
      {
        key: "frequency",
        label: "Normal pricing period",
        type: "select",
        options: [
          "weekly",
          "fortnightly",
          "monthly",
          "quarterly",
          "semiannual",
          "annual",
          "custom",
        ].map((value) => ({ value, label: value })),
      },
      { key: "count", label: "Covered periods (1-240)", type: "number" },
      {
        key: "customDays",
        label: "Custom period length (days)",
        type: "number",
      },
      money("normalPrice", "Normal price per period"),
      {
        key: "recognition",
        label: "Planned budget recognition",
        type: "select",
        options: [
          { value: "actual", label: "Discounted actual cost" },
          { value: "normal", label: "Normal-price comparison" },
        ],
      },
      {
        key: "accountId",
        label: "Payment account",
        type: "select",
        options: app.state.accounts.map((a) => ({
          value: a.id,
          label: a.name,
        })),
      },
      { key: "notes", label: "Discount / coverage notes", type: "textarea" },
    ],
    values: defaults,
    submitLabel: existing
      ? "Confirm correction"
      : "Confirm actual advance payment",
    submit: async (v) =>
      app.mutate(
        existing
          ? "Correct prepaid payment and coverage"
          : "Confirm prepaid cash payment",
        (s) => {
          if (!v.recurringId) delete v.recurringId;
          if (!v.coverageEnd) {
            const end =
              v.frequency === "custom"
                ? addDays(
                    String(v.coverageStart),
                    Number(v.count) * Number(v.customDays),
                  )
                : scheduleDates(
                    String(v.coverageStart),
                    String(v.frequency),
                    Math.min(240, Number(v.count) + 1),
                  ).at(-1)!;
            v.coverageEnd = addDays(end, -1);
          }
          delete v.periods;
          const input = v as Omit<Prepaid, "periods">;
          if (existing) {
            const current = s.prepaids.find((p) => p.id === existing.id)!;
            if (current.terminatedOn)
              throw new Error(
                "Correct the termination/refund first; retain terminated coverage history",
              );
            const next = { ...input, periods: prepaidPeriods(input) };
            s.prepaids[s.prepaids.findIndex((p) => p.id === existing.id)] =
              next;
            const tx = s.transactions.find(
              (t) => t.prepaidId === existing.id && t.type === "expense",
            )!;
            tx.amount = next.amount;
            tx.date = next.paymentDate;
            tx.category = next.category;
            tx.accountId = next.accountId;
          } else recordPrepaid(s, input);
        },
      ),
  });
}
function payDialog(app: AppContext, o: Occurrence) {
  app.dialog({
    title: "Confirm recurring expense payment",
    description:
      "Only confirmed payments affect actual cash. For a variable expense, adjust its occurrence amount first. A covered prepaid service requires explicit additional-payment approval.",
    fields: [
      money("amount", "Actual amount paid"),
      { key: "date", label: "Actual payment date", type: "date" },
      {
        key: "additional",
        label:
          "Explicitly approve an additional payment (including already prepaid periods)",
        type: "checkbox",
      },
    ],
    values: {
      amount: occurrenceRemaining(app.state, o),
      date: today(),
      additional: false,
    },
    submitLabel: "Confirm actual payment",
    submit: async (v) =>
      app.mutate("Pay scheduled recurring occurrence", (s) =>
        payOccurrence(
          s,
          o.id,
          Number(v.amount),
          String(v.date),
          Boolean(v.additional),
        ),
      ),
  });
}
export function RecurringPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(addDays(today(), 60));
  function adjust(o: Occurrence) {
    app.dialog({
      title: "Adjust, postpone or skip occurrence",
      description:
        "The original schedule identity remains unchanged. Existing actual payments stay in the ledger.",
      fields: [
        money("amount", "This period's expected amount"),
        { key: "due", label: "Revised due date", type: "date" },
        {
          key: "status",
          label: "Occurrence status",
          type: "select",
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "skipped", label: "Skipped" },
          ],
        },
        { key: "notes", label: "Reason / notes", type: "textarea" },
      ],
      values: { ...o },
      submit: async (v) =>
        app.mutate(
          "Adjust recurring occurrence without losing history",
          (s) => {
            s.occurrences[s.occurrences.findIndex((r) => r.id === o.id)] =
              v as Occurrence;
          },
        ),
    });
  }
  return (
    <>
      <PageHead
        title="Recurring expenses"
        subtitle="Fixed and variable obligations are scheduled, never silently paid."
        action={
          <AddButton onClick={() => editRecord(app, "recurring")}>
            Add recurring expense
          </AddButton>
        }
      />
      <div className="toolbar">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            aria-label="Recurring horizon"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button
          secondary
          onClick={() =>
            void app.mutate("Generate unique recurring schedule", (s) => {
              generateOccurrences(s, to);
            })
          }
        >
          Generate through horizon
        </Button>
      </div>
      {!s.recurring.length ? (
        <Empty title="Plan obligations once">
          Add rent, subscriptions, utilities or a variable grocery plan. Active
          schedules generate up to two years ahead; extend the horizon at any
          time.
        </Empty>
      ) : (
        <div className="grid cards">
          {s.recurring.map((r) => (
            <Card key={r.id}>
              <div className="card-head">
                <Badge>
                  {r.status} / {r.kind}
                </Badge>
                <Actions
                  label={r.name}
                  edit={() => editRecord(app, "recurring", r)}
                  remove={() => deleteRecord(app, "recurring", r)}
                />
              </div>
              <h3>{r.name}</h3>
              <div className="big-number">{fmt(r.expected)}</div>
              <p>
                {r.category} / {r.frequency} /{" "}
                {r.essential ? "essential" : "discretionary"}
              </p>
              <small>
                Next unpaid occurrence:{" "}
                {nextOccurrence(s, r) || "None in generated horizon"}
              </small>
              <small>
                Remind {r.reminderDays} days before due /{" "}
                {r.autoBudget
                  ? "included in budgets"
                  : "not automatically budgeted"}
              </small>
              <Button secondary onClick={() => prepaidDialog(app, r.id)}>
                Pay in Advance
              </Button>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <h3>Scheduled occurrences</h3>
        <Table
          headers={[
            "Expense",
            "Due / original date",
            "Expected / unpaid",
            "Status",
            "Actions",
          ]}
        >
          {s.occurrences
            .filter((o) => o.due >= from && o.due <= to)
            .sort((a, b) => a.due.localeCompare(b.due))
            .map((o) => (
              <tr key={o.id}>
                <td>{s.recurring.find((r) => r.id === o.recurringId)?.name}</td>
                <td>
                  {o.due}
                  <small>Original: {o.scheduledDate}</small>
                </td>
                <td>
                  {fmt(o.amount)}
                  <small>Unpaid: {fmt(occurrenceRemaining(s, o))}</small>
                </td>
                <td>
                  <Badge warning={occurrenceStatus(s, o) === "overdue"}>
                    {occurrenceStatus(s, o)}
                  </Badge>
                </td>
                <td>
                  <div className="actions">
                    <Button secondary onClick={() => payDialog(app, o)}>
                      Pay / additional
                    </Button>
                    <button className="text-button" onClick={() => adjust(o)}>
                      Adjust / skip
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        app.confirm(
                          "Undo actual payments for this occurrence?",
                          "Scheduled history is preserved. Its payment transactions will be deleted and balances recalculated.",
                          async () =>
                            app.mutate(
                              "Undo recurring occurrence payment",
                              (s) => {
                                s.transactions = s.transactions.filter(
                                  (t) => t.occurrenceId !== o.id,
                                );
                              },
                            ),
                        )
                      }
                    >
                      Undo payment
                    </button>
                  </div>
                </td>
              </tr>
            ))}
        </Table>
      </Card>
    </>
  );
}
export function OccasionalPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  return (
    <>
      <PageHead
        title="Occasional expense planner"
        subtitle="Plan wants and irregular needs without making them mandatory monthly obligations."
        action={
          <AddButton onClick={() => editRecord(app, "occasional")}>
            Plan occasional expense
          </AddButton>
        }
      />
      {!s.occasional.length ? (
        <Empty title="Make room for life's occasional costs">
          Plan skincare, hair appointments, gifts, annual subscriptions or
          household purchases.
        </Empty>
      ) : (
        <div className="grid cards">
          {[...s.occasional]
            .sort(
              (a, b) =>
                a.month.localeCompare(b.month) || a.priority - b.priority,
            )
            .map((o) => {
              const paid = sum(
                s.transactions
                  .filter((t) => t.occasionalId === o.id)
                  .map((t) => t.amount),
              );
              const funded = Math.min(
                Math.max(0, o.estimated - paid),
                reserveFunding(s, o.reserveId),
              );
              return (
                <Card key={o.id}>
                  <div className="card-head">
                    <Badge>
                      {paid >= o.estimated
                        ? "paid"
                        : funded >= o.estimated - paid
                          ? "funded"
                          : funded
                            ? "partially funded"
                            : "unfunded plan"}
                    </Badge>
                    <Actions
                      label={o.name}
                      edit={() => editRecord(app, "occasional", o)}
                      remove={() => deleteRecord(app, "occasional", o)}
                    />
                  </div>
                  <h3>{o.name}</h3>
                  <div className="big-number">{fmt(o.estimated)}</div>
                  <p>
                    {o.due || o.month} / priority {o.priority}
                  </p>
                  <small>
                    {o.category} / {o.pattern || "one-off plan"}
                  </small>
                  <small>
                    Funding reserve: {fmt(funded)}. Paid: {fmt(paid)}. Maximum:{" "}
                    {o.maximum ? fmt(o.maximum) : "not set"}
                  </small>
                  <Button
                    secondary
                    onClick={() =>
                      app.dialog({
                        title: "Confirm occasional expense",
                        description:
                          "Release linked reserve funds first if needed. This creates an actual cash expense, not a monthly recurring obligation.",
                        fields: [
                          money("amount", "Actual amount"),
                          { key: "date", label: "Actual date", type: "date" },
                          {
                            key: "accountId",
                            label: "Payment account",
                            type: "select",
                            options: s.accounts.map((a) => ({
                              value: a.id,
                              label: a.name,
                            })),
                          },
                        ],
                        values: {
                          amount: Math.max(0, o.estimated - paid),
                          date: today(),
                          accountId: s.accounts[0]?.id ?? "",
                        },
                        submit: async (v) =>
                          app.mutate(
                            "Record actual occasional expense",
                            (s) => {
                              if (
                                Number(v.amount) <= 0 ||
                                (o.maximum > 0 &&
                                  sum([paid, Number(v.amount)]) > o.maximum)
                              )
                                throw new Error(
                                  "Payment must be positive and within the plan's maximum",
                                );
                              s.transactions.push({
                                id: uid(),
                                type: "expense",
                                amount: Number(v.amount),
                                date: String(v.date),
                                accountId: String(v.accountId),
                                description: o.name,
                                category: o.category,
                                subcategory: "",
                                occasionalId: o.id,
                                paymentMethod: "",
                                notes: "",
                                recurringReference: "",
                              });
                            },
                          ),
                      })
                    }
                  >
                    Record payment
                  </Button>
                </Card>
              );
            })}
        </div>
      )}
    </>
  );
}
export function PrepaidPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  return (
    <>
      <PageHead
        title="Prepaid expenses"
        subtitle="One actual cash payment. Separate coverage, recognition and normal-price savings."
        action={
          <AddButton onClick={() => prepaidDialog(app)}>
            Pay in advance
          </AddButton>
        }
      />
      {!s.prepaids.length ? (
        <Empty title="Track the value of advance payments">
          Record documented Wi-Fi, insurance or subscription coverage without
          paying twice in monthly budgets.
        </Empty>
      ) : (
        <div className="grid cards">
          {s.prepaids.map((p) => (
            <Card key={p.id}>
              <div className="card-head">
                <Badge warning={p.coverageEnd <= addDays(today(), 30)}>
                  {p.terminatedOn
                    ? "terminated"
                    : p.coverageEnd < today()
                      ? "expired"
                      : "covered"}
                </Badge>
                <button
                  className="text-button"
                  onClick={() => prepaidDialog(app, p.recurringId, p)}
                >
                  Correct
                </button>
              </div>
              <h3>{p.name}</h3>
              <div className="big-number">{fmt(prepaidBalance(s, p))}</div>
              <small>Current prepaid asset balance (daily allocation)</small>
              <dl>
                <dt>Actual cash paid</dt>
                <dd>
                  {fmt(p.amount)} / {p.paymentDate}
                </dd>
                <dt>Coverage</dt>
                <dd>
                  {p.coverageStart} - {p.coverageEnd}
                </dd>
                <dt>Normal-price saving</dt>
                <dd>{fmt(prepaidSavings(p))}</dd>
                <dt>Next renewal</dt>
                <dd>{p.terminatedOn || addDays(p.coverageEnd, 1)}</dd>
                <dt>Budget display</dt>
                <dd>
                  {p.recognition === "actual"
                    ? "Discounted cost"
                    : "Normal-price comparison"}
                </dd>
              </dl>
              <details>
                <summary>Period cost recognition</summary>
                <Table
                  headers={[
                    "Coverage period",
                    "Actual allocated",
                    "Normal comparison",
                  ]}
                >
                  {p.periods.map((period) => (
                    <tr key={period.start}>
                      <td>
                        {period.start} - {period.end}
                      </td>
                      <td>{fmt(period.amount)}</td>
                      <td>{fmt(period.normal)}</td>
                    </tr>
                  ))}
                </Table>
              </details>
              <Button
                secondary
                disabled={Boolean(p.terminatedOn)}
                onClick={() =>
                  app.dialog({
                    title: "Terminate / refund prepaid coverage",
                    description:
                      "Enter only a refund actually received. Unrefunded unconsumed cost is recognized on termination; remaining coverage is released.",
                    fields: [
                      {
                        key: "date",
                        label: "Actual termination date",
                        type: "date",
                      },
                      money("refund", "Actual refund received"),
                    ],
                    values: { date: today(), refund: 0 },
                    submit: async (v) =>
                      app.mutate(
                        "Terminate prepaid coverage and record actual refund",
                        (s) =>
                          terminatePrepaid(
                            s,
                            p.id,
                            String(v.date),
                            Number(v.refund),
                          ),
                      ),
                  })
                }
              >
                Early termination / refund
              </Button>
              {p.terminatedOn && (
                <Button
                  secondary
                  onClick={() =>
                    app.dialog({
                      title: "Correct prepaid termination / refund",
                      description:
                        "Correct actual historical facts only. The refund ledger and coverage termination are updated together with an audit trail.",
                      fields: [
                        {
                          key: "date",
                          label: "Correct termination date",
                          type: "date",
                        },
                        money("refund", "Correct actual refund"),
                      ],
                      values: {
                        date: p.terminatedOn,
                        refund: prepaidRefunds(s, p),
                      },
                      submit: async (v) =>
                        app.mutate(
                          "Correct prepaid termination and refund",
                          (s) =>
                            correctTermination(
                              s,
                              p.id,
                              String(v.date),
                              Number(v.refund),
                            ),
                        ),
                    })
                  }
                >
                  Correct termination / refund
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
      <p className="notice">
        Actual discounted cost is recognized daily within each evenly allocated
        period. Cash reports show the full payment on its payment date; budget
        reports show consumed cost, never both. Coverage blocks ordinary
        recurring payments unless explicitly approved as additional.
      </p>
    </>
  );
}
export function captureDialog(app: AppContext, b: Budget, category?: string) {
  const review = monthlyReview(app.state, b);
  const capacity = category
    ? (review.rows.find((r) => r.category === category)?.capturable ?? 0)
    : Math.min(
        sum(review.rows.map((r) => r.capturable)),
        Math.max(0, summary(app.state).available),
      );
  const choices = [
    ...app.state.accounts
      .filter((a) => a.kind === "savings")
      .map((a) => ({ value: a.id, label: `Savings account: ${a.name}` })),
    ...app.state.reserves.map((r) => ({
      value: r.id,
      label: `Reserve: ${r.name}`,
    })),
    ...app.state.budgets
      .filter((other) => other.start > b.end)
      .map((other) => ({
        value: other.id,
        label: `Later budget: ${other.name} (${other.start})`,
      })),
  ];
  const fields: Field[] = [
    {
      key: "accountId",
      label: "Source cash account",
      type: "select",
      options: app.state.accounts
        .filter((a) => a.kind !== "investment" && a.kind !== "savings")
        .map((a) => ({ value: a.id, label: a.name })),
    },
    { key: "date", label: "Decision / actual transfer date", type: "date" },
  ];
  const values: Record<string, unknown> = {
    accountId:
      app.state.accounts.find(
        (a) => a.kind !== "investment" && a.kind !== "savings",
      )?.id ?? "",
    date: today(),
  };
  for (let i = 0; i < 3; i++) {
    fields.push(
      {
        key: `kind${i}`,
        label: `Destination ${i + 1} action`,
        type: "select",
        options: [
          "transfer",
          "reserve",
          "available",
          "carry",
          "unallocated",
        ].map((value) => ({ value, label: value })),
      },
      money(`amount${i}`, `Destination ${i + 1} amount`),
      {
        key: `target${i}`,
        label: `Destination ${i + 1} record (if needed)`,
        type: "select",
        required: false,
        options: choices,
      },
    );
    values[`kind${i}`] = "unallocated";
    values[`amount${i}`] = i === 0 ? capacity : 0;
    values[`target${i}`] = "";
  }
  fields.push({
    key: "movementConfirmed",
    label: "I have actually made any account transfers selected above",
    type: "checkbox",
  });
  values.movementConfirmed = false;
  app.dialog({
    title: category
      ? `Capture savings: ${category}`
      : "Capture monthly savings",
    description: `Up to ${formatMoney(capacity, app.state.settings.currency)} is both unspent and backed by available cash. Split across up to three destinations. Available/unallocated decisions create no money movement. Carry-forward earmarks are protected until the target period begins.`,
    fields,
    values,
    submitLabel: "Confirm savings decisions",
    submit: async (v) =>
      app.mutate("Confirm monthly / category savings capture", (s) => {
        const actions: SavingsCapture["actions"] = [];
        for (let i = 0; i < 3; i++) {
          const amount = Number(v[`amount${i}`]);
          const kind = v[
            `kind${i}`
          ] as SavingsCapture["actions"][number]["kind"];
          if (!amount) continue;
          if (kind === "transfer" && !v.movementConfirmed)
            throw new Error(
              "Confirm actual account movement before recording a transfer",
            );
          actions.push({
            kind,
            amount,
            ...(kind === "transfer"
              ? { accountId: String(v[`target${i}`]) }
              : kind === "reserve"
                ? { reserveId: String(v[`target${i}`]) }
                : kind === "carry"
                  ? { targetBudgetId: String(v[`target${i}`]) }
                  : {}),
          });
        }
        if (!actions.length || sum(actions.map((a) => a.amount)) > capacity)
          throw new Error("Choose a positive amount within available savings");
        if (category)
          commitCapture(s, {
            id: uid(),
            budgetId: b.id,
            category,
            date: String(v.date),
            accountId: String(v.accountId),
            actions,
            notes: "",
          });
        else {
          const pending = structuredClone(actions);
          for (const row of review.rows.filter((r) => r.capturable > 0)) {
            let remaining = row.capturable;
            const part: SavingsCapture["actions"] = [];
            for (const action of pending) {
              const amount = Math.min(remaining, action.amount);
              if (amount > 0) {
                part.push({ ...action, amount });
                action.amount -= amount;
                remaining -= amount;
              }
            }
            if (part.length)
              commitCapture(s, {
                id: uid(),
                budgetId: b.id,
                category: row.category,
                date: String(v.date),
                accountId: String(v.accountId),
                actions: part,
                notes: "Monthly savings split",
              });
          }
          if (pending.some((a) => a.amount > 0))
            throw new Error("Not enough uncaptured category allocation");
        }
      }),
  });
}
export function MonthlyReviewPage({
  captureOnly = false,
}: {
  captureOnly?: boolean;
}) {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const [id, setId] = useState(s.settings.activeBudgetId);
  const b = s.budgets.find((b) => b.id === id)!;
  const review = monthlyReview(s, b);
  const finalized = s.reviews.filter((r) => r.budgetId === b.id).at(-1);
  return (
    <>
      <PageHead
        title={captureOnly ? "Monthly Savings Capture" : "Monthly review"}
        subtitle="Under-budget is not the same as saved. Decide what your remaining allocations should do."
        action={
          <Button onClick={() => captureDialog(app, b)}>
            Capture monthly savings
          </Button>
        }
      />
      <label>
        Budget period
        <select
          aria-label="Review budget period"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {s.budgets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} / {b.start} - {b.end}
            </option>
          ))}
        </select>
      </label>
      <div className="metrics">
        <Metric label="Planned budget" value={fmt(review.snapshot.planned)} />
        <Metric
          label="Actual budget recognition"
          value={fmt(review.snapshot.actual)}
        />
        <Metric
          label="Under-budget allocation"
          value={fmt(review.snapshot.unspent)}
          hint="Not automatically saved"
        />
        <Metric
          label="Actually saved / earmarked"
          value={fmt(review.snapshot.saved)}
        />
      </div>
      <div className="metrics">
        <Metric
          label="Carried forward (explicit)"
          value={fmt(review.snapshot.carried)}
        />
        <Metric
          label="Still awaiting decisions"
          value={fmt(review.remainingDecision)}
        />
        <Metric label="Overspent categories" value={fmt(review.overspending)} />
        <Metric
          label="Current available to spend"
          value={fmt(review.snapshot.available)}
        />
      </div>
      <Card>
        <h3>Category decisions</h3>
        <Table
          headers={[
            "Category / rollover rule",
            "Planned",
            "Actual",
            "Unspent / deficit",
            "Captured",
            "Action",
          ]}
        >
          {review.rows.map((r) => (
            <tr key={r.category}>
              <td>
                {r.category}
                <small>
                  {r.rolloverRule} / {r.purpose}
                </small>
              </td>
              <td>{fmt(r.planned)}</td>
              <td>{fmt(r.actual)}</td>
              <td>
                <Badge warning={r.overspent > 0}>
                  {r.overspent ? `Deficit ${fmt(r.overspent)}` : fmt(r.unspent)}
                </Badge>
              </td>
              <td>{fmt(r.captured)}</td>
              <td>
                <Button
                  secondary
                  disabled={r.capturable === 0}
                  onClick={() => captureDialog(app, b, r.category)}
                >
                  Capture / decide
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {!captureOnly && (
        <>
          <Metric
            label="Starting available funds (reconstructed)"
            value={fmt(review.startingAvailable)}
            hint="Recorded opening balances plus prior transactions and original dated obligations"
          />
          <div className="metrics">
            <Metric
              label="Income actually received"
              value={fmt(review.incomeReceived)}
            />
            <Metric
              label="Expenses actually paid (cash)"
              value={fmt(review.cashPaid)}
              hint="Includes upfront prepayments once"
            />
            <Metric
              label="Prepaid cost recognized"
              value={fmt(
                prepaidRecognition(
                  s,
                  b.start,
                  b.end < today() ? b.end : today(),
                ),
              )}
            />
            <Metric
              label="Current outstanding liabilities"
              value={fmt(summary(s).liabilities)}
            />
          </div>
          <Card>
            <h3>Scheduled and occasional expenses</h3>
            <Table headers={["Expense", "Due / month", "Type", "Status"]}>
              {s.occurrences
                .filter((o) => o.due >= b.start && o.due <= b.end)
                .map((o) => (
                  <tr key={o.id}>
                    <td>
                      {s.recurring.find((r) => r.id === o.recurringId)?.name}
                    </td>
                    <td>{o.due}</td>
                    <td>Recurring</td>
                    <td>{occurrenceStatus(s, o)}</td>
                  </tr>
                ))}
              {s.occasional
                .filter((o) => o.month === b.start.slice(0, 7))
                .map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{o.due || o.month}</td>
                    <td>Occasional plan</td>
                    <td>Not mandatory</td>
                  </tr>
                ))}
            </Table>
          </Card>
          <Card>
            <h3>Finalize with a retained snapshot</h3>
            {finalized && (
              <p>
                Last finalized {finalized.finalizedAt}.{" "}
                {JSON.stringify(finalized.snapshot) !==
                JSON.stringify(review.snapshot)
                  ? "Records have changed since finalization. Review the correction and finalize a new snapshot; previous versions remain."
                  : "Current figures match the retained snapshot."}
              </p>
            )}
            <Button
              onClick={() =>
                app.confirm(
                  "Finalize this budget-period review?",
                  "This keeps a snapshot without locking or deleting historical records. Later corrections remain audited and can be reviewed again.",
                  async () =>
                    app.mutate("Finalize monthly review snapshot", (s) =>
                      finalizeReview(s, b),
                    ),
                )
              }
            >
              Finalize monthly review
            </Button>
            <details>
              <summary>Historical review snapshots</summary>
              {s.reviews
                .filter((r) => r.budgetId === b.id)
                .map((r) => (
                  <p key={r.id}>
                    {r.finalizedAt} / planned {fmt(r.snapshot.planned)} / actual{" "}
                    {fmt(r.snapshot.actual)} / saved {fmt(r.snapshot.saved)}
                  </p>
                ))}
            </details>
          </Card>
        </>
      )}
      <Card>
        <h3>Savings decisions and movements</h3>
        {s.captures
          .filter((c) => c.budgetId === b.id)
          .map((c) => (
            <div key={c.id} className="card-head">
              <span>
                {c.date} / {c.category} /{" "}
                {c.actions.map((a) => `${a.kind}: ${fmt(a.amount)}`).join(", ")}
              </span>
              <Button
                secondary
                onClick={() =>
                  app.confirm(
                    "Undo savings capture?",
                    "This reverses its account-transfer and reserve ledger entries and removes its carry-forward decision. Do this only when correcting recordkeeping, not to pretend a real bank transfer was reversed.",
                    async () =>
                      app.mutate("Undo complete savings capture", (s) =>
                        undoCapture(s, c.id),
                      ),
                  )
                }
              >
                Undo decision
              </Button>
            </div>
          ))}
      </Card>
    </>
  );
}

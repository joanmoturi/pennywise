import { useState } from "react";
import { ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { useApp } from "./context";
import { today, scenarioSchema, type Scenario } from "./domain";
import { formatMoney, sum } from "./money";
import {
  summary,
  dailyAllowance,
  forecast,
  decision,
  allocateWindfall,
  eventRemaining,
  budgetStats,
  budgetActual,
} from "./engine";
import { reports } from "./reports";
import {
  editRecord,
  deleteRecord,
  baseScenario,
  confirmWindfall,
} from "./forms";
import {
  PageHead,
  Card,
  Metric,
  Empty,
  AddButton,
  Button,
  Badge,
  Table,
  BarChart,
  LineChart,
  Actions,
  errorMessage,
  Progress,
} from "./ui";
import {
  effectiveAllocations,
  monthlyReview,
  occurrenceRemaining,
  coveringPrepaid,
  prepaidSavings,
  recurringReminders,
} from "./expense-engine";

export function OverviewPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const totals = summary(s);
  const allowance = dailyAllowance(s);
  const projection = forecast(s, baseScenario());
  const report = reports(s, today().slice(0, 4) + "-01-01", today());
  const next = s.events
    .filter(
      (e) =>
        e.due >= today() && e.status === "expected" && eventRemaining(s, e) > 0,
    )
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  const b = s.budgets.find((b) => b.id === s.settings.activeBudgetId)!;
  const budget = budgetStats(s, b);
  const expected = sum(
    s.events
      .filter((e) => e.due >= today() && e.status !== "cancelled")
      .map((e) => eventRemaining(s, e)),
  );
  return (
    <>
      <PageHead
        title="A clearer picture. A calmer plan."
        subtitle={`Your money, with every commitment accounted for. ${today()} / Nairobi`}
        action={
          <Button secondary onClick={() => app.navigate("accounts")}>
            Manage accounts
            <ArrowRight size={16} />
          </Button>
        }
      />
      <div className="hero">
        <div>
          <span className="eyebrow">AVAILABLE AFTER COMMITMENTS</span>
          <div className="hero-amount">{fmt(totals.available)}</div>
          <p>
            Liquid cash minus restrictions, reserves and all outstanding
            liabilities.
          </p>
          <Badge>{b.name}</Badge>
        </div>
        <div className="hero-aside">
          <span>Safe discretionary allowance</span>
          <strong>
            {fmt(allowance.daily)}
            <small>/ day</small>
          </strong>
          <p>{allowance.days} day planning horizon</p>
        </div>
      </div>
      <div className="metrics">
        <Metric
          label="Liquid cash"
          value={fmt(totals.liquid)}
          hint="Actual account balances"
        />
        <Metric
          label="Total recorded assets"
          value={fmt(totals.assets)}
          hint={`Net worth: ${fmt(totals.netWorth)}`}
        />
        <Metric
          label="Restricted + reserved"
          value={fmt(sum([totals.restricted, totals.reserves]))}
          hint={`Restricted: ${fmt(totals.restricted)}`}
        />
        <Metric
          label="Outstanding liabilities"
          value={fmt(totals.liabilities)}
          hint="Not personal earned income"
        />
      </div>
      <div className="metrics">
        <Metric
          label="Recurring expenses due this month"
          value={fmt(
            sum(
              s.occurrences
                .filter((o) => o.due.startsWith(today().slice(0, 7)))
                .map((o) => occurrenceRemaining(s, o)),
            ),
          )}
        />
        <Metric
          label="Under-budget, not yet saved"
          value={fmt(monthlyReview(s, b).remainingDecision)}
        />
        <Metric
          label="Captured savings / earmarks"
          value={fmt(monthlyReview(s, b).snapshot.saved)}
        />
        <Metric
          label="Advance-payment savings"
          value={fmt(sum(s.prepaids.map(prepaidSavings)))}
        />
      </div>
      <Card>
        <div className="card-head">
          <h3>Planned expenses & coverage</h3>
          <button
            className="text-button"
            onClick={() => app.navigate("review")}
          >
            Monthly review
          </button>
        </div>
        {recurringReminders(s)
          .slice(0, 5)
          .map((o) => (
            <p key={o.id} className="notice warning">
              <strong>Recurring reminder:</strong>{" "}
              {s.recurring.find((r) => r.id === o.recurringId)?.name} / due{" "}
              {o.due} / unpaid {fmt(occurrenceRemaining(s, o))}.
            </p>
          ))}
        <p>
          {s.occasional.filter((o) => o.month >= today().slice(0, 7)).length}{" "}
          upcoming occasional plans /{" "}
          {
            s.occurrences.filter(
              (o) =>
                coveringPrepaid(s, o) && o.due.startsWith(today().slice(0, 7)),
            ).length
          }{" "}
          recurring periods already prepaid / remaining budget{" "}
          {fmt(budget.remaining)}.
        </p>
        {s.prepaids
          .filter(
            (p) =>
              !p.terminatedOn &&
              p.coverageEnd >= today() &&
              p.coverageEnd <=
                new Date(Date.parse(today()) + 30 * 86400000)
                  .toISOString()
                  .slice(0, 10),
          )
          .map((p) => (
            <p key={p.id}>
              {p.name} renews after {p.coverageEnd}.
            </p>
          ))}
      </Card>
      <div className="grid two">
        <Card>
          <div className="card-head">
            <h3>This month's rhythm</h3>
            <Badge>Actual only</Badge>
          </div>
          <div className="mini-metrics">
            <div>
              <span>Earned / distributed income</span>
              <strong>{fmt(totals.income)}</strong>
            </div>
            <div>
              <span>Expenses</span>
              <strong>{fmt(totals.expenses)}</strong>
            </div>
          </div>
          <h4>Active budget consumption</h4>
          <Progress value={budget.actual} total={budget.planned} />
          <p>
            {fmt(budget.actual)} spent of {fmt(budget.planned)} planned
          </p>
          <button
            className="text-button"
            onClick={() => app.navigate("budgets")}
          >
            Review category allocations <ArrowRight size={15} />
          </button>
        </Card>
        <Card>
          <h3>On the horizon</h3>
          <dl>
            <dt>Next expected receipt</dt>
            <dd>
              {next
                ? `${next.due} / ${fmt(eventRemaining(s, next))}`
                : "None configured"}
            </dd>
            <dt>All upcoming projections</dt>
            <dd>{fmt(expected)}</dd>
            <dt>Receivables outstanding</dt>
            <dd>{fmt(totals.receivables)}</dd>
            <dt>Emergency reserve</dt>
            <dd>{fmt(totals.emergency)}</dd>
            <dt>Forecast runway</dt>
            <dd>
              {projection.runwayDays === null
                ? `Beyond ${baseScenario().days} days under assumptions`
                : `${projection.runwayDays} days`}
            </dd>
          </dl>
          <p className="notice">
            Expected receipts are not available money. Forecasts are
            assumptions, not guarantees.
          </p>
        </Card>
      </div>
      {(totals.available < 0 ||
        allowance.safeAmount === 0 ||
        s.necessities.some((n) => n.due < today())) && (
        <div className="notice warning">
          <strong>Protect the essentials.</strong>{" "}
          {totals.available < 0
            ? "Your recorded commitments exceed available liquid cash."
            : "Review essential bills and discretionary allocations before spending."}
        </div>
      )}
      <div className="grid two">
        <BarChart
          title="Income versus expenses"
          data={report.monthly.map((m) => ({
            name: m.month,
            amount: m.income,
            secondary: m.expense,
          }))}
          format={fmt}
        />
        <BarChart
          title="Spending by category"
          data={report.spending}
          format={fmt}
        />
      </div>
      <div className="grid two">
        <LineChart
          title="Actual liquid cash over time"
          lines={[
            {
              name: "Recorded cash",
              values: report.monthly.map((m) => m.cash),
              color: "#159f83",
            },
          ]}
        />
        <BarChart
          title="Actual versus category budget"
          data={effectiveAllocations(s, b)
            .filter((a) => a.purpose === "spending")
            .map((a) => ({
              name: a.category,
              amount: budgetActual(s, b, a.category),
              secondary: a.amount,
            }))}
          format={fmt}
        />
      </div>
      <DecisionPanel />
    </>
  );
}
export function DecisionPanel() {
  const app = useApp();
  const s = app.state;
  const [result, setResult] = useState<{ outcome: string; reason: string }>();
  const allowance = dailyAllowance(s);
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  return (
    <Card>
      <div className="card-head">
        <div>
          <h3>Before you spend</h3>
          <p>
            Offline, deterministic decision support. No financial data is sent
            to an AI service.
          </p>
        </div>
        <Button
          secondary
          onClick={() =>
            app.dialog({
              title: "Assess a purchase",
              fields: [
                { key: "amount", label: "Proposed purchase", type: "money" },
              ],
              values: { amount: 0 },
              submitLabel: "Assess without changing ledger",
              submit: async (v) => {
                setResult(decision(s, Number(v.amount)));
              },
            })
          }
        >
          Assess a purchase
        </Button>
      </div>
      <div className="mini-metrics">
        <div>
          <span>Safe today</span>
          <strong>{fmt(allowance.daily)}</strong>
        </div>
        <div>
          <span>Weekly allowance</span>
          <strong>{fmt(allowance.weekly)}</strong>
        </div>
        <div>
          <span>Remaining discretionary pool</span>
          <strong>{fmt(allowance.safeAmount)}</strong>
        </div>
      </div>
      <small>
        Available cash less essential commitments (per category, the larger of
        known bills or remaining essential budget), capped by the remaining
        discretionary budget, divided over {allowance.days} days. No budget
        means no assumed discretionary allowance.
      </small>
      {result && (
        <div className="notice">
          <strong>{result.outcome}</strong>
          <p>{result.reason}</p>
        </div>
      )}
    </Card>
  );
}
export function ForecastPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const [assumptions, setAssumptions] = useState<Scenario>(baseScenario());
  const result = forecast(s, assumptions);
  function configure() {
    app.dialog({
      title: "Forecast assumptions",
      description:
        "These are local hypothetical inputs. No account balance or transaction is changed.",
      fields: [
        { key: "days", label: "Days (1-730)", type: "number" },
        { key: "income", label: "Scenario-only one-off income", type: "money" },
        { key: "expense", label: "Scenario-only expense", type: "money" },
        {
          key: "monthlyIncome",
          label: "Scenario-only monthly net income",
          type: "money",
        },
        {
          key: "spendingBps",
          label: "Budget spending multiplier (%)",
          type: "rate",
        },
        {
          key: "delayDays",
          label: "Delay expected payments (days)",
          type: "number",
        },
        {
          key: "includeExpected",
          label: "Show expected / optimistic receipts",
          type: "checkbox",
        },
      ],
      values: { ...assumptions },
      submit: async (v) => {
        setAssumptions(scenarioSchema.parse(v));
      },
    });
  }
  return (
    <>
      <PageHead
        title="Plan beyond this month"
        subtitle="Live cash, explicit commitments and scenario-only assumptions remain separate."
        action={<Button onClick={configure}>Adjust assumptions</Button>}
      />
      <div className="toolbar">
        <label>
          Forecast horizon
          <select
            aria-label="Forecast horizon"
            value={assumptions.days}
            onChange={(e) =>
              setAssumptions({ ...assumptions, days: Number(e.target.value) })
            }
          >
            {[30, 60, 90, 180, 365, 730].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
            {![30, 60, 90, 180, 365, 730].includes(assumptions.days) && (
              <option value={assumptions.days}>
                {assumptions.days} days (custom)
              </option>
            )}
          </select>
        </label>
        <Button secondary onClick={() => setAssumptions(baseScenario())}>
          Reset assumptions
        </Button>
        <AddButton onClick={() => editRecord(app, "scenarios")}>
          Save custom scenario
        </AddButton>
      </div>
      <div className="metrics">
        <Metric
          label="Minimum survival / planning month"
          value={fmt(result.monthlySurvival)}
          hint="Active budget essential spending"
        />
        <Metric
          label="Monthly deficit / (surplus)"
          value={fmt(result.monthlyDeficit)}
        />
        <Metric label="Lowest conservative balance" value={fmt(result.low)} />
        <Metric
          label="Funds become insufficient"
          value={result.insufficient || `Beyond ${assumptions.days} days`}
          hint="Under displayed assumptions only"
        />
      </div>
      <LineChart
        title="Projected cash flow (not a guarantee)"
        lines={[
          {
            name: "Conservative / confirmed receipts",
            values: result.lines.map((l) => l.confirmed),
            color: "#159f83",
          },
          {
            name: "Expected / reliable receipts",
            values: result.lines.map((l) => l.expected),
            color: "#5c84ce",
          },
          {
            name: "Optimistic / all scheduled receipts",
            values: result.lines.map((l) => l.optimistic),
            color: "#d6a354",
          },
        ]}
      />
      <p className="notice">
        Starting cash excludes all liabilities, restrictions and reserves.
        Budget spending is prorated over 30-day planning months; separately
        listed bills in a budgeted category are not charged twice. Delayed
        events are excluded until rescheduled. Scenario-only one-off income,
        expenses and salary affect all three lines, not your live ledger.
      </p>
      <Card>
        <h3>Exact projected balances</h3>
        <Table headers={["Date", "Conservative", "Expected", "Optimistic"]}>
          {result.lines
            .filter((_, i) => i % 7 === 0 || i === result.lines.length - 1)
            .map((l) => (
              <tr key={l.date}>
                <td>{l.date}</td>
                <td>{fmt(l.confirmed)}</td>
                <td>{fmt(l.expected)}</td>
                <td>{fmt(l.optimistic)}</td>
              </tr>
            ))}
        </Table>
      </Card>
      <Card>
        <div className="card-head">
          <h3>What-if scenario comparison</h3>
          <AddButton onClick={() => editRecord(app, "scenarios")}>
            New scenario
          </AddButton>
        </div>
        {!s.scenarios.length ? (
          <p>
            Try no employment, a new salary, delayed coupons, an emergency cost
            or a 20% spending reduction. Saved scenarios never mutate actual
            balances.
          </p>
        ) : (
          <Table
            headers={[
              "Scenario",
              "Days",
              "Conservative final",
              "Lowest cash",
              "Insufficient date",
              "Actions",
            ]}
          >
            {s.scenarios.map((scenario) => {
              const projection = forecast(s, scenario);
              return (
                <tr key={scenario.id}>
                  <td>{scenario.name}</td>
                  <td>{scenario.days}</td>
                  <td>{fmt(projection.lines.at(-1)!.confirmed)}</td>
                  <td>{fmt(projection.low)}</td>
                  <td>{projection.insufficient || "Beyond horizon"}</td>
                  <td>
                    <Actions
                      label={scenario.name}
                      edit={() => editRecord(app, "scenarios", scenario)}
                      remove={() => deleteRecord(app, "scenarios", scenario)}
                    />
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <DecisionPanel />
    </>
  );
}
export function WindfallsPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const receipts = s.transactions.filter(
    (t) =>
      ["income", "loan_recovery", "bond_maturity"].includes(t.type) &&
      !t.windfallId &&
      !s.transactions.some((a) => a.windfallId === t.id),
  );
  const [receiptId, setReceiptId] = useState("");
  let preview: ReturnType<typeof allocateWindfall> | undefined;
  let error = "";
  if (receiptId && receipts.some((t) => t.id === receiptId)) {
    try {
      preview = allocateWindfall(s, receiptId);
    } catch (e) {
      error = errorMessage(e);
    }
  }
  async function reorder(index: number, direction: number) {
    await app.mutate("Reorder allocation priorities", (s) => {
      const swap = index + direction;
      if (swap < 0 || swap >= s.rules.length) return;
      [s.rules[index], s.rules[swap]] = [s.rules[swap], s.rules[index]];
    });
  }
  return (
    <>
      <PageHead
        title="Make a windfall work harder"
        subtitle="Choose an actual receipt, preview your waterfall, then explicitly confirm the real allocations."
        action={
          <AddButton onClick={() => editRecord(app, "rules")}>
            Add allocation rule
          </AddButton>
        }
      />
      <Card>
        <h3>Your allocation waterfall</h3>
        <p>
          Rules run in displayed order. Liabilities and necessities cap at their
          outstanding amount; reserves cap at their targets. Percentage rounding
          uses integer minor units.
        </p>
        {!s.rules.length ? (
          <Empty title="Set your priorities">
            Start with business repayments, immediate essentials and emergency
            reserves. Discretionary allocations become protected envelopes, not
            fake expenses.
          </Empty>
        ) : (
          <Table headers={["Priority", "Rule", "Target", "Value", "Actions"]}>
            {s.rules.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <div className="actions">
                    <span>{i + 1}</span>
                    <button
                      aria-label={`Move ${r.name} up`}
                      className="icon-button"
                      onClick={() => void reorder(i, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      aria-label={`Move ${r.name} down`}
                      className="icon-button"
                      onClick={() => void reorder(i, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                </td>
                <td>
                  {r.name}
                  <small>Apply above {fmt(r.minimumCash)} remaining</small>
                </td>
                <td>{r.target}</td>
                <td>
                  {r.mode === "percent" ? `${r.value / 100}%` : fmt(r.value)}
                  <small>
                    {r.mode} / cap {r.cap ? fmt(r.cap) : "none"}
                  </small>
                </td>
                <td>
                  <Actions
                    label={r.name}
                    edit={() => editRecord(app, "rules", r)}
                    remove={() => deleteRecord(app, "rules", r)}
                  />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card>
        <h3>Preview an actual windfall</h3>
        <label>
          Select received transaction
          <select
            aria-label="Windfall receipt"
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
          >
            <option value="">Choose a receipt</option>
            {receipts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description} / {fmt(t.amount)}
              </option>
            ))}
          </select>
        </label>
        {!receipts.length && (
          <p>
            Record an actual income, gift, asset sale or loan recovery first.
            Borrowed funds cannot be allocated as a windfall.
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {preview && (
          <>
            <div className="mini-metrics">
              <div>
                <span>Recorded receipt</span>
                <strong>{fmt(preview.receipt.amount)}</strong>
              </div>
              <div>
                <span>Cash available to allocate</span>
                <strong>{fmt(preview.initial)}</strong>
              </div>
              <div>
                <span>Unallocated balance</span>
                <strong>{fmt(preview.remaining)}</strong>
              </div>
            </div>
            <Table headers={["Priority allocation", "Target", "Amount"]}>
              {preview.allocations.map((a) => (
                <tr key={a.ruleId}>
                  <td>{a.name}</td>
                  <td>{a.target}</td>
                  <td>{fmt(a.amount)}</td>
                </tr>
              ))}
            </Table>
            <Button
              disabled={!preview.allocations.length}
              onClick={() => confirmWindfall(app, receiptId)}
            >
              Confirm allocations
            </Button>
            <p className="notice">
              This is a recordkeeping workflow, not a bank action. Cash is never
              automatically transferred or invested. Confirm only after making
              the actual payments. Undo the full allocation from Transactions if
              entered in error.
            </p>
          </>
        )}
      </Card>
      <Card>
        <h3>Allocated windfall history</h3>
        {s.transactions
          .filter(
            (t) =>
              !t.windfallId &&
              s.transactions.some((r) => r.windfallId === t.id),
          )
          .map((t) => (
            <p key={t.id}>
              {t.date} / {t.description} /{" "}
              <Badge>
                {fmt(
                  sum(
                    s.transactions
                      .filter((r) => r.windfallId === t.id)
                      .map((r) => r.amount),
                  ),
                )}
              </Badge>
            </p>
          ))}
      </Card>
    </>
  );
}

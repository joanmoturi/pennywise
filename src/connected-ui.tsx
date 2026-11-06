import { useMemo } from "react";
import { useApp, type AppContext, type Field } from "./context";
import { today, uid, type Budget } from "./domain";
import { formatMoney, sum } from "./money";
import { budgetActual, budgetFunding, rolloverAmount, summary } from "./engine";
import { effectiveAllocations, captured } from "./expense-engine";
import { personalExpense, reallocateBudget } from "./connected-finance";
import { editTransaction } from "./forms";
import { Table, Button, Badge, Progress, Actions } from "./ui";

export function allocationDialog(
  app: AppContext,
  budget: Budget,
  category?: string,
) {
  const before = budget.allocations.find((a) => a.category === category);
  app.dialog({
    title: "Budget category allocation",
    fields: [
      { key: "category", label: "Category" },
      { key: "amount", label: "Allocation", type: "money" },
      {
        key: "purpose",
        label: "Allocation purpose",
        type: "select",
        options: ["spending", "savings", "reserve", "debt"].map((value) => ({
          value,
          label: value,
        })),
      },
      { key: "essential", label: "Essential", type: "checkbox" },
      { key: "priority", label: "Priority", type: "number", advanced: true },
      {
        key: "rolloverRule",
        label: "Category rollover rule",
        type: "select",
        advanced: true,
        options: ["none", "full", "savings", "partial", "manual"].map(
          (value) => ({ value, label: value }),
        ),
      },
      {
        key: "rolloverAmount",
        label: "Partial rollover maximum",
        type: "money",
        advanced: true,
      },
    ],
    values: before
      ? { ...before }
      : {
          category: category ?? "",
          amount: 0,
          purpose: "spending",
          essential: false,
          priority: 5,
          rolloverRule: "none",
          rolloverAmount: 0,
        },
    submit: async (v) =>
      app.mutate("Save linked budget category", (s) => {
        const current = s.budgets.find(
          (b) => b.id === budget.id && !b.archived,
        );
        if (!current || JSON.stringify(current) !== JSON.stringify(budget))
          throw new Error(
            "Budget changed. Reopen this category before saving.",
          );
        const index = current.allocations.findIndex(
          (a) => a.category === category,
        );
        if (before && index >= 0)
          current.allocations[index] = v as Budget["allocations"][number];
        else current.allocations.push(v as Budget["allocations"][number]);
      }),
  });
}
export function fundingDialog(app: AppContext, b: Budget, category = "") {
  const categories = effectiveAllocations(app.state, b).filter(
    (a) => a.purpose === "spending",
  );
  const options = categories.map((a) => ({
    value: a.category,
    label: a.category,
  }));
  const fields: Field[] = [
    { key: "to", label: "Fund this category" },
    { key: "from0", label: "Funding category 1", type: "select", options },
    { key: "amount0", label: "Funding amount 1", type: "money" },
    {
      key: "from1",
      label: "Funding category 2 (optional)",
      type: "select",
      options,
      required: false,
    },
    {
      key: "amount1",
      label: "Funding amount 2 (optional)",
      type: "money",
      required: false,
    },
    { key: "reason", label: "Reason for reallocation" },
  ];
  app.dialog({
    title: "Reallocate budget funding",
    description:
      "Move unused planned limits, not cash. The original allocation and the expense remain unchanged. Review the sources, then save.",
    fields,
    values: {
      id: uid(),
      to: category,
      from0:
        categories.find((a) => /misc/i.test(a.category))?.category ??
        options[0]?.value ??
        "",
      from1: "",
      amount0: 0,
      amount1: 0,
      reason: "",
    },
    submit: async (v) =>
      app.mutate("Confirm cash-neutral budget reallocation", (s) => {
        const moves = [0, 1]
          .filter((i) => Number(v[`amount${i}`]) !== 0)
          .map((i) => ({
            from: String(v[`from${i}`]),
            to: String(v.to).trim(),
            amount: Number(v[`amount${i}`]),
          }));
        reallocateBudget(s, {
          id: String(v.id),
          budgetId: b.id,
          date: today(),
          reason: String(v.reason).trim(),
          moves,
        });
      }),
  });
}
export function BudgetActivity({
  budget: b,
  edit,
}: {
  budget: Budget;
  edit?: (category: string) => void;
}) {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const allowance = s.allowances.find((p) => p.budgetId === b.id);
  const model = useMemo(() => {
    const plan = s.allowances.find((p) => p.budgetId === b.id);
    const allocations = effectiveAllocations(s, b);
    const transactions = s.transactions.filter(
      (t) =>
        personalExpense(s, t) &&
        (!plan || t.accountId === plan.accountId) &&
        t.date >= b.start &&
        t.date <= b.end,
    );
    const byCategory = new Map<string, typeof transactions>();
    for (const t of transactions)
      byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
    const categories = [
      ...new Set([...allocations.map((a) => a.category), ...byCategory.keys()]),
    ];
    const original = effectiveAllocations(
      { ...s, budgetChanges: [], captures: [] },
      b,
    );
    return {
      byCategory,
      rows: categories.map((category) => {
        const a = allocations.find((a) => a.category === category);
        const planned = sum([a?.amount ?? 0, rolloverAmount(s, b, category)]);
        const funding = budgetFunding(s, b, category);
        const actual = sum([budgetActual(s, b, category), funding]);
        const decided = captured(s, b.id, category);
        const originallyPlanned = original.some((a) => a.category === category);
        const status = !a
          ? "Unbudgeted"
          : !originallyPlanned
            ? actual > planned
              ? "Unexpected / partly funded"
              : "Unexpected / funded"
            : actual > planned
              ? "Over budget"
              : planned > 0 && actual >= planned * 0.8
                ? "Nearing limit"
                : "On track";
        return {
          category,
          a,
          planned,
          actual,
          remaining: sum([planned, -actual, -decided]),
          status,
          original: sum([
            original.find((a) => a.category === category)?.amount ?? 0,
            rolloverAmount(s, b, category),
          ]),
        };
      }),
    };
  }, [s, b]);
  return (
    <>
      <p className="notice">
        Actual personal cash after protected money and liabilities:{" "}
        <strong>{fmt(summary(s).available)}</strong>. A budget limit is a plan,
        not another account balance.
      </p>
      <div className="actions">
        <Button
          secondary
          disabled={b.archived || b.start > today() || b.end < today()}
          onClick={() => fundingDialog(app, b)}
        >
          Reallocate funding
        </Button>
        <Button secondary onClick={() => app.navigate("transactions")}>
          All transactions
        </Button>
      </div>
      {!model.rows.length ? (
        <p className="notice">
          Add planned categories or record an expense. Unexpected spending will
          appear here too.
        </p>
      ) : (
        <Table
          headers={[
            "Category",
            "Purpose",
            "Original budget",
            "Current limit",
            "Spent / funded",
            "Remaining",
            "Status",
            "Actions",
          ]}
        >
          {model.rows.map((row) => (
            <tr key={row.category}>
              <td>
                <strong>{row.category}</strong>
                <details>
                  <summary>View transactions</summary>
                  {(model.byCategory.get(row.category) ?? [])
                    .slice(-10)
                    .map((t) => (
                      <p key={t.id}>
                        {t.date} / {t.description} / {fmt(t.amount)}
                      </p>
                    ))}
                  <small>
                    Latest 10 period cash entries. Prepaid recognition is
                    included in spent, not recorded as a second cash expense.
                  </small>
                </details>
              </td>
              <td>{row.a?.purpose ?? "spending"}</td>
              <td>{fmt(row.original)}</td>
              <td>{fmt(row.planned)}</td>
              <td>{fmt(row.actual)}</td>
              <td>
                <Badge warning={row.remaining < 0}>{fmt(row.remaining)}</Badge>
              </td>
              <td>
                <Badge
                  warning={["Over budget", "Unbudgeted"].includes(row.status)}
                >
                  {row.status}
                </Badge>
                <Progress value={row.actual} total={row.planned} />
              </td>
              <td>
                <div className="actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      row.a?.purpose === "reserve"
                        ? app.navigate("reserves")
                        : editTransaction(app, undefined, {
                            category: row.category,
                            type:
                              row.a?.purpose === "savings"
                                ? "transfer"
                                : row.a?.purpose === "debt"
                                  ? "liability_repayment"
                                  : "expense",
                            ...(allowance
                              ? {
                                  accountId: allowance.accountId,
                                  allowanceId: allowance.id,
                                }
                              : {}),
                            ...(row.a?.purpose === "savings"
                              ? {
                                  destinationId: s.accounts.find(
                                    (a) =>
                                      a.kind === "savings" && !a.businessId,
                                  )?.id,
                                }
                              : {}),
                          })
                    }
                  >
                    {row.a && row.a.purpose !== "spending"
                      ? "Fund commitment"
                      : "Add expense"}
                  </button>
                  {(!row.a || row.remaining < 0) && (
                    <button
                      className="text-button"
                      onClick={() => fundingDialog(app, b, row.category)}
                    >
                      Fund expense
                    </button>
                  )}
                  <Actions
                    label={row.category}
                    edit={() =>
                      edit
                        ? edit(row.category)
                        : allocationDialog(app, b, row.category)
                    }
                    remove={() =>
                      app.confirm(
                        "Remove category allocation?",
                        "The expense history stays intact. Reallocations and savings returns must remain valid.",
                        async () =>
                          app.mutate(
                            "Remove original budget allocation",
                            (draft) => {
                              const current = draft.budgets.find(
                                (x) => x.id === b.id,
                              )!;
                              current.allocations = current.allocations.filter(
                                (a) => a.category !== row.category,
                              );
                            },
                          ),
                      )
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {s.budgetChanges.some((c) => c.budgetId === b.id) && (
        <details>
          <summary>Funding history</summary>
          {s.budgetChanges
            .filter((c) => c.budgetId === b.id)
            .map((c) => (
              <div key={c.id} className="notice">
                <strong>
                  {c.date} / {c.reason}
                </strong>
                {c.moves.map((m, i) => (
                  <p key={i}>
                    {m.from} to {m.to}: {fmt(m.amount)}
                  </p>
                ))}
                {!c.reversalOf &&
                  !s.budgetChanges.some((r) => r.reversalOf === c.id) && (
                    <Button
                      secondary
                      onClick={() =>
                        app.confirm(
                          "Undo this reallocation?",
                          "This restores planned limits only. Spending remains recorded and may become over budget again.",
                          async () =>
                            app.mutate("Reverse budget reallocation", (draft) =>
                              reallocateBudget(draft, {
                                id: uid(),
                                budgetId: b.id,
                                date: today(),
                                reason: `Undo: ${c.reason}`.slice(0, 160),
                                reversalOf: c.id,
                                moves: c.moves.map((m) => ({
                                  from: m.to,
                                  to: m.from,
                                  amount: m.amount,
                                })),
                              }),
                            ),
                        )
                      }
                    >
                      Undo reallocation
                    </Button>
                  )}
              </div>
            ))}
        </details>
      )}
    </>
  );
}

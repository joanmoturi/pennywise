import { useApp } from "./context";
import { today, uid, addDays, type Business } from "./domain";
import { formatMoney, decimal, parseMoney, sum } from "./money";
import {
  accountBalances,
  budgetStats,
  eventRemaining,
  summary,
} from "./engine";
import {
  businessStats,
  recordDistribution,
  returnAllowanceSavings,
} from "./connected-finance";
import { editRecord, editTransaction } from "./forms";
import { effectiveAllocations, undoCapture } from "./expense-engine";
import { BudgetActivity, allocationDialog } from "./connected-ui";
import { PageHead, Card, Button, AddButton, Metric, Empty } from "./ui";

export function BusinessesPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  function businessDialog(record?: Business) {
    app.dialog({
      title: record ? "Edit business" : "Add business",
      description:
        "Ownership share is indicative, not a payout. Opening retained profit is a historical profit reference, not new cash.",
      fields: [
        { key: "name", label: "Business name" },
        { key: "ownershipBps", label: "My ownership (%)", type: "rate" },
        {
          key: "partnersText",
          label: "Other partners: name | percentage, one per line",
          type: "textarea",
          required: false,
        },
        {
          key: "openingRetainedProfit",
          label: "Opening undistributed profit",
          type: "money",
        },
        { key: "notes", label: "Notes", type: "textarea", required: false },
      ],
      values: record
        ? {
            ...record,
            partnersText: record.partners
              .map((p) => `${p.name} | ${decimal(p.ownershipBps)}`)
              .join("\n"),
          }
        : {
            id: uid(),
            name: "",
            ownershipBps: 10000,
            partnersText: "",
            openingRetainedProfit: 0,
            notes: "",
          },
      submit: async (v) =>
        app.mutate("Save explicit business ownership", (draft) => {
          const partners = String(v.partnersText)
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => {
              const parts = line.split("|").map((v) => v.trim());
              if (parts.length !== 2 || !parts[0])
                throw new Error("Use one partner per line: Name | percentage.");
              return { name: parts[0], ownershipBps: parseMoney(parts[1]) };
            });
          const item: Business = {
            id: String(v.id),
            name: String(v.name),
            ownershipBps: Number(v.ownershipBps),
            partners,
            openingRetainedProfit: Number(v.openingRetainedProfit),
            notes: String(v.notes),
          };
          const index = draft.businesses.findIndex((b) => b.id === item.id);
          if (
            record &&
            (index < 0 ||
              JSON.stringify(draft.businesses[index]) !==
                JSON.stringify(record))
          )
            throw new Error("Business changed. Reopen this form.");
          if (index >= 0) draft.businesses[index] = item;
          else draft.businesses.push(item);
        }),
    });
  }
  function addBusinessAccount(b: Business) {
    app.dialog({
      title: `Add account for ${b.name}`,
      fields: [
        { key: "name", label: "Account name" },
        { key: "opening", label: "Opening business cash", type: "money" },
      ],
      values: { id: uid(), name: "", opening: 0 },
      submit: async (v) =>
        app.mutate("Create separately owned business account", (draft) => {
          draft.accounts.push({
            id: String(v.id),
            name: String(v.name),
            opening: Number(v.opening),
            kind: "bank",
            businessId: b.id,
            restricted: 0,
            notes: "",
          });
        }),
    });
  }
  function distribute(b: Business) {
    const accounts = s.accounts.filter(
      (a) =>
        a.businessId === b.id &&
        a.kind !== "investment" &&
        a.kind !== "savings",
    );
    app.dialog({
      title: `Distribute profit: ${b.name}`,
      description:
        "Record an actual agreed payout. Ownership percentages do not automatically determine it. A payout to you is one transfer, not a second business receipt.",
      fields: [
        {
          key: "accountId",
          label: "Business cash account",
          type: "select",
          options: accounts.map((a) => ({ value: a.id, label: a.name })),
        },
        {
          key: "recipient",
          label: "Recipient",
          type: "select",
          options: [
            { value: "me", label: "Me (personal account)" },
            ...b.partners.map((p) => ({
              value: `partner:${p.name}`,
              label: p.name,
            })),
          ],
        },
        {
          key: "destinationId",
          label: "My receiving account (if paid to me)",
          type: "select",
          required: false,
          options: s.accounts
            .filter((a) => !a.businessId && a.kind !== "investment")
            .map((a) => ({ value: a.id, label: a.name })),
        },
        { key: "amount", label: "Actual distribution", type: "money" },
        { key: "date", label: "Distribution date", type: "date" },
        {
          key: "eventId",
          label: "Apply to expected payment (optional)",
          type: "select",
          required: false,
          options: s.events
            .filter(
              (e) =>
                e.kind === "income" &&
                e.status !== "cancelled" &&
                s.incomes.find((i) => i.id === e.sourceId)?.businessId ===
                  b.id &&
                eventRemaining(s, e) > 0,
            )
            .map((e) => ({
              value: e.id,
              label: `${e.due} / ${fmt(eventRemaining(s, e))} remaining`,
            })),
          help: "Link an already planned payout so the forecast does not keep expecting the same money.",
        },
      ],
      values: {
        id: uid(),
        accountId: accounts[0]?.id ?? "",
        recipient: "me",
        destinationId: s.accounts.find((a) => !a.businessId)?.id ?? "",
        amount: 0,
        date: today(),
        eventId: "",
      },
      submit: async (v) =>
        app.mutate("Record one linked business distribution", (draft) => {
          const event = draft.events.find((e) => e.id === v.eventId);
          if (
            v.eventId &&
            (!event ||
              event.status === "cancelled" ||
              v.recipient !== "me" ||
              draft.incomes.find((i) => i.id === event.sourceId)?.businessId !==
                b.id ||
              Number(v.amount) > eventRemaining(draft, event))
          )
            throw new Error(
              "Choose this business's outstanding personal payment and an amount within its remaining estimate.",
            );
          recordDistribution(draft, {
            id: String(v.id),
            businessId: b.id,
            accountId: String(v.accountId),
            destinationId: String(v.destinationId),
            amount: Number(v.amount),
            date: String(v.date),
            ...(event ? { eventId: event.id, relatedId: event.sourceId } : {}),
            ...(v.recipient === "me"
              ? {}
              : { partnerName: String(v.recipient).slice("partner:".length) }),
          });
        }),
    });
  }
  function expectedDistribution(b: Business) {
    app.dialog({
      title: `Plan distribution: ${b.name}`,
      description:
        "An estimate only. Receiving it later will require actual retained profit and business cash, and will use the shared Income payment calendar.",
      fields: [
        {
          key: "sourceAccountId",
          label: "Business source account",
          type: "select",
          options: s.accounts
            .filter((a) => a.businessId === b.id)
            .map((a) => ({ value: a.id, label: a.name })),
        },
        {
          key: "accountId",
          label: "Personal receiving account",
          type: "select",
          options: s.accounts
            .filter((a) => !a.businessId && a.kind !== "investment")
            .map((a) => ({ value: a.id, label: a.name })),
        },
        { key: "amount", label: "Projected distribution", type: "money" },
        { key: "due", label: "Expected date", type: "date" },
      ],
      values: {
        id: uid(),
        sourceAccountId:
          s.accounts.find((a) => a.businessId === b.id)?.id ?? "",
        accountId: s.accounts.find((a) => !a.businessId)?.id ?? "",
        amount: 0,
        due: addDays(today(), 7),
      },
      submit: async (v) =>
        app.mutate(
          "Plan business distribution without posting cash",
          (draft) => {
            const id = String(v.id);
            if (draft.incomes.some((i) => i.id === id))
              throw new Error("This projection already exists.");
            draft.incomes.push({
              id,
              name: `Distribution: ${b.name}`.slice(0, 160),
              type: "Investment distribution",
              amount: Number(v.amount),
              description: "Projected business payout, not actual cash",
              businessId: b.id,
              sourceAccountId: String(v.sourceAccountId),
              accountId: String(v.accountId),
              frequency: "one-off",
              reliability: "uncertain",
              active: true,
              taxBps: 0,
              notes: "",
            });
            draft.events.push({
              id: uid(),
              sourceId: id,
              kind: "income",
              due: String(v.due),
              amount: Number(v.amount),
              status: "expected",
              reliability: "uncertain",
              notes: `Projected distribution: ${b.name}`,
            });
          },
        ),
    });
  }
  return (
    <>
      <PageHead
        title="Businesses & distributions"
        subtitle="Business-owned cash is separate from your personal money. Profit shares are estimates until actually distributed."
        action={
          <AddButton onClick={() => businessDialog()}>Add business</AddButton>
        }
      />
      {!s.businesses.length && (
        <Empty title="Keep business money separate">
          Add the business and ownership, then its cash account. Existing
          records are not automatically reclassified.
        </Empty>
      )}
      {s.incomes.some(
        (i) =>
          i.type === "Business income" &&
          !i.businessId &&
          !s.accounts.find((a) => a.id === i.accountId)?.businessId,
      ) && (
        <p className="notice warning">
          Legacy Business income sources remain unchanged. Review their linked
          accounts before explicitly assigning business ownership; the app will
          not guess.
        </p>
      )}
      {s.businesses.map((b) => {
        const stats = businessStats(s, b.id);
        const account = s.accounts.find((a) => a.businessId === b.id);
        return (
          <Card key={b.id}>
            <div className="card-head">
              <div>
                <h2>{b.name}</h2>
                <p>
                  My ownership: {decimal(b.ownershipBps)}% /{" "}
                  {b.partners
                    .map((p) => `${p.name}: ${decimal(p.ownershipBps)}%`)
                    .join(", ") || "No other partners recorded"}
                </p>
              </div>
              <Button secondary onClick={() => businessDialog(b)}>
                Edit ownership
              </Button>
            </div>
            <div className="metrics">
              <Metric
                label="Business cash"
                value={fmt(stats.cash)}
                hint={`Available for distribution: ${fmt(stats.availableCash)} / liabilities: ${fmt(stats.liabilities)}`}
              />
              <Metric label="Business revenue" value={fmt(stats.revenue)} />
              <Metric label="Operating expenses" value={fmt(stats.expenses)} />
              <Metric
                label="Profit incl. opening retained"
                value={fmt(stats.profit)}
              />
            </div>
            <div className="metrics">
              <Metric
                label="Indicative ownership profit share"
                value={fmt(stats.indicativeShare)}
                hint="Not a distribution or personal available cash"
              />
              <Metric label="Retained profit" value={fmt(stats.retained)} />
              <Metric
                label="Distributed to me"
                value={fmt(stats.ownerDistributions)}
              />
              <Metric
                label="Distributed to partners"
                value={fmt(stats.partnerDistributions)}
              />
            </div>
            <div className="actions">
              <Button secondary onClick={() => addBusinessAccount(b)}>
                Add business account
              </Button>
              <Button
                disabled={!account}
                onClick={() =>
                  editTransaction(app, undefined, {
                    type: "income",
                    accountId: account!.id,
                    category: "Business revenue",
                  })
                }
              >
                Record business revenue
              </Button>
              <Button
                secondary
                disabled={!account}
                onClick={() =>
                  editTransaction(app, undefined, {
                    type: "expense",
                    accountId: account!.id,
                    category: "Business operating costs",
                  })
                }
              >
                Record business expense
              </Button>
              <Button
                secondary
                disabled={!account}
                onClick={() => distribute(b)}
              >
                Distribute profit
              </Button>
              <Button
                secondary
                disabled={!account}
                onClick={() => expectedDistribution(b)}
              >
                Plan distribution
              </Button>
              <Button secondary onClick={() => app.navigate("income")}>
                Income & receipts
              </Button>
            </div>
            <details>
              <summary>Distribution history</summary>
              {s.transactions
                .filter(
                  (t) =>
                    s.accounts.find((a) => a.id === t.accountId)?.businessId ===
                      b.id &&
                    ["owner_distribution", "partner_distribution"].includes(
                      t.businessMovement ?? "",
                    ),
                )
                .map((t) => (
                  <p key={t.id}>
                    {t.date} / {t.description} / {fmt(t.amount)}{" "}
                    <button
                      className="text-button"
                      onClick={() => app.navigate("transactions")}
                    >
                      View ledger
                    </button>
                    {!t.reversalOf &&
                      !s.transactions.some((r) => r.reversalOf === t.id) && (
                        <button
                          className="text-button"
                          onClick={() =>
                            app.confirm(
                              "Reverse actual distribution?",
                              "Confirm the money was actually returned. This posts one opposite cash movement and restores retained profit; it does not erase the original.",
                              async () =>
                                app.mutate(
                                  "Reverse linked business distribution",
                                  (draft) => {
                                    const original = draft.transactions.find(
                                      (r) => r.id === t.id,
                                    );
                                    if (
                                      !original ||
                                      draft.transactions.some(
                                        (r) => r.reversalOf === t.id,
                                      )
                                    )
                                      throw new Error(
                                        "Distribution changed or was already reversed.",
                                      );
                                    draft.transactions.push({
                                      ...original,
                                      id: uid(),
                                      amount: -original.amount,
                                      date: today(),
                                      reversalOf: original.id,
                                      description:
                                        `Reversal: ${original.description}`.slice(
                                          0,
                                          160,
                                        ),
                                    });
                                  },
                                ),
                            )
                          }
                        >
                          Reverse distribution
                        </button>
                      )}
                  </p>
                ))}
            </details>
          </Card>
        );
      })}
      <p className="notice">
        Business figures use recorded cash receipts and operating costs, plus
        any explicitly entered opening retained profit. Ownership does not
        override partnership agreements, taxes or unrecorded obligations.
        Account transfers and partner payouts are not operating revenue or
        expenses.
      </p>
    </>
  );
}

export function AllowanceWorkspace() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  function create() {
    const personal = s.accounts.filter(
      (a) => !a.businessId && a.kind !== "investment",
    );
    app.dialog({
      title: "Plan an allowance",
      description:
        "A plan is not a cash receipt. Use existing personal cash or link an expected payment; the ledger changes only when you record an actual receipt, expense or savings movement.",
      fields: [
        { key: "name", label: "Allowance name" },
        { key: "amount", label: "Allowance envelope", type: "money" },
        { key: "start", label: "Period start", type: "date" },
        { key: "end", label: "Period end", type: "date" },
        {
          key: "accountId",
          label: "Personal spending account",
          type: "select",
          options: personal.map((a) => ({ value: a.id, label: a.name })),
        },
        {
          key: "fundingEventId",
          label: "Expected funding payment (optional)",
          type: "select",
          required: false,
          options: s.events
            .filter((e) => e.kind === "income" && e.status !== "cancelled")
            .map((e) => ({
              value: e.id,
              label: `${e.due}: ${s.incomes.find((i) => i.id === e.sourceId)?.name} / ${fmt(e.amount)}`,
            })),
        },
      ],
      values: {
        id: uid(),
        budgetId: uid(),
        name: "",
        amount: 0,
        start: today().slice(0, 7) + "-01",
        end: s.budgets[0].end,
        accountId: personal[0]?.id ?? "",
        fundingEventId: "",
      },
      submit: async (v) =>
        app.mutate(
          "Create linked allowance and period budget without cash",
          (draft) => {
            const id = String(v.id),
              budgetId = String(v.budgetId);
            if (draft.allowances.some((p) => p.id === id))
              throw new Error("This allowance was already created.");
            draft.budgets.push({
              id: budgetId,
              profileId: budgetId,
              name: `Allowance: ${String(v.name)}`.slice(0, 160),
              start: String(v.start),
              end: String(v.end),
              frequency: "custom",
              allocations: [],
              rollover: false,
              archived: false,
              notes: "Linked allowance plan",
            });
            draft.allowances.push({
              id,
              budgetId,
              name: String(v.name),
              accountId: String(v.accountId),
              amount: Number(v.amount),
              notes: "",
              ...(v.fundingEventId
                ? { fundingEventId: String(v.fundingEventId) }
                : {}),
            });
          },
        ),
    });
  }
  function returnSavings(allowanceId: string) {
    const p = s.allowances.find((p) => p.id === allowanceId)!;
    const b = s.budgets.find((b) => b.id === p.budgetId)!;
    app.dialog({
      title: "Return unspent allowance to savings",
      description:
        "Confirm an actual transfer. The category limit decreases by the returned amount, and exactly one linked transfer credits savings. No income or expense is added.",
      fields: [
        {
          key: "category",
          label: "Unspent category",
          type: "select",
          options: effectiveAllocations(s, b)
            .filter((a) => a.purpose === "spending")
            .map((a) => ({ value: a.category, label: a.category })),
        },
        { key: "amount", label: "Amount to return", type: "money" },
        {
          key: "destinationId",
          label: "Savings destination",
          type: "select",
          options: s.accounts
            .filter(
              (a) =>
                a.kind === "savings" && !a.businessId && a.id !== p.accountId,
            )
            .map((a) => ({ value: a.id, label: a.name })),
        },
        {
          key: "confirmed",
          label: "I have actually transferred this money",
          type: "checkbox",
        },
      ],
      values: {
        id: uid(),
        category: "",
        amount: 0,
        destinationId:
          s.accounts.find((a) => a.kind === "savings" && !a.businessId)?.id ??
          "",
        confirmed: false,
      },
      submit: async (v) =>
        app.mutate("Return unspent allowance to savings once", (draft) => {
          if (!v.confirmed)
            throw new Error("Confirm the actual transfer before recording it.");
          returnAllowanceSavings(draft, {
            id: String(v.id),
            allowanceId: p.id,
            category: String(v.category),
            amount: Number(v.amount),
            destinationId: String(v.destinationId),
            date: today(),
          });
        }),
    });
  }
  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>Allowances & allocation plans</h2>
          <p>
            Keep advanced planning alongside the forecast. Each allowance uses
            one linked budget, not a second expense ledger.
          </p>
        </div>
        <AddButton onClick={create}>Plan an allowance</AddButton>
      </div>
      {!s.allowances.length && (
        <p>
          For example, plan 100,000 across rent, groceries, transport, savings
          and miscellaneous. Record actual income separately.
        </p>
      )}
      {s.allowances.map((p) => {
        const b = s.budgets.find((b) => b.id === p.budgetId)!;
        const stats = budgetStats(s, b);
        const backing = Math.max(
          0,
          Math.min(
            p.amount,
            accountBalances(s).get(p.accountId)!,
            summary(s).available,
            p.fundingEventId
              ? sum(
                  s.transactions
                    .filter((t) => t.eventId === p.fundingEventId)
                    .map((t) => t.amount),
                )
              : p.amount,
          ),
        );
        return (
          <details key={p.id} open className="allowance-plan">
            <summary>
              {p.name} / {b.start} - {b.end}
            </summary>
            <div className="metrics">
              <Metric label="Allowance envelope" value={fmt(p.amount)} />
              <Metric
                label="Planned allocations"
                value={fmt(stats.planned)}
                hint={`Unassigned / overallocated: ${fmt(p.amount - stats.planned)}`}
              />
              <Metric
                label="Actual spending"
                value={fmt(stats.actual)}
                hint={`Actually funded savings/commitments: ${fmt(stats.funding)}`}
              />
              <Metric
                label="Current cash backing"
                value={fmt(backing)}
                hint="Projected receipts are not available money"
              />
            </div>
            <div className="actions">
              <Button secondary onClick={() => allocationDialog(app, b)}>
                Add allowance category
              </Button>
              <Button
                secondary
                onClick={() =>
                  editTransaction(app, undefined, {
                    accountId: p.accountId,
                    type: "expense",
                  })
                }
              >
                Record allowance expense
              </Button>
              <Button secondary onClick={() => returnSavings(p.id)}>
                Return unspent to savings
              </Button>
              <Button secondary onClick={() => app.navigate("review")}>
                Monthly review & decisions
              </Button>
            </div>
            <BudgetActivity budget={b} />
            {s.captures
              .filter((c) => c.allowanceId === p.id)
              .map((c) => (
                <p key={c.id}>
                  Returned {fmt(sum(c.actions.map((a) => a.amount)))} from{" "}
                  {c.category} on {c.date}.{" "}
                  <button
                    className="text-button"
                    onClick={() =>
                      app.confirm(
                        "Undo allowance savings return?",
                        "This removes the linked transfer and restores the planned category limit. Use only to correct a movement that did not occur.",
                        async () =>
                          app.mutate(
                            "Undo complete allowance savings return",
                            (draft) => undoCapture(draft, c.id),
                          ),
                      )
                    }
                  >
                    Undo savings return
                  </button>
                </p>
              ))}
          </details>
        );
      })}
      {!s.accounts.length && (
        <Button secondary onClick={() => editRecord(app, "accounts")}>
          Add a funding account
        </Button>
      )}
    </Card>
  );
}

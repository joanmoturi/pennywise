import {
  uid,
  today,
  addDays,
  incomeTypes,
  frequencies,
  transactionTypes,
  type State,
  type Transaction,
  type Scenario,
} from "./domain";
import type { AppContext, Field } from "./context";
import { commitWindfall, coupon, receiveEvent, scheduleDates } from "./engine";
import { generateOccurrences } from "./expense-engine";
import { accountBalances } from "./engine";
import { categoryPosition } from "./connected-finance";
import { formatMoney } from "./money";

export type Collection =
  | "accounts"
  | "incomes"
  | "liabilities"
  | "receivables"
  | "bonds"
  | "necessities"
  | "reserves"
  | "budgets"
  | "scenarios"
  | "rules"
  | "recurring"
  | "occasional";
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });
export function recordFields(s: State, kind: Collection): Field[] {
  const account = f("accountId", "Account", "select", {
    options: s.accounts.map((a) => ({ value: a.id, label: a.name })),
  });
  const common = [f("name", "Name"), f("notes", "Notes", "textarea")];
  const schedule = f("frequency", "Frequency", "select", {
    options: options(frequencies),
  });
  const priority = f("priority", "Priority (1 is highest)", "number");
  if (kind === "accounts")
    return [
      common[0],
      f("kind", "Account type", "select", {
        options: options(["cash", "bank", "mobile", "investment", "savings"]),
      }),
      f("opening", "Opening balance", "money", {
        help: "Existing balance, not income. Record liabilities separately.",
      }),
      f("restricted", "Restricted portion", "money"),
      f("businessId", "Business ownership (optional)", "select", {
        required: false,
        options: s.businesses.map((b) => ({ value: b.id, label: b.name })),
        help: "Blank preserves the existing personal/legacy classification. Assigning a business reclassifies this account's entire history, not its cash.",
      }),
      f(
        "reclassificationConfirmed",
        "I reviewed this account's history and confirm changing its ownership",
        "checkbox",
      ),
      common[1],
    ];
  if (kind === "incomes")
    return [
      common[0],
      f("type", "Income type", "select", { options: options(incomeTypes) }),
      f("description", "Description", "textarea"),
      f("amount", "Expected net amount", "money"),
      schedule,
      f("reliability", "Reliability", "select", {
        options: options(["confirmed", "reliable", "uncertain"]),
      }),
      f("taxBps", "Tax assumption (%)", "rate", {
        help: "Reference only. Expected amounts are net; actual receipts are entered explicitly.",
      }),
      account,
      f("active", "Active", "checkbox"),
      f(
        "businessId",
        "Expected distribution from business (optional)",
        "select",
        {
          required: false,
          options: s.businesses.map((b) => ({ value: b.id, label: b.name })),
        },
      ),
      f(
        "sourceAccountId",
        "Business source account (distributions only)",
        "select",
        {
          required: false,
          options: s.accounts
            .filter((a) => a.businessId)
            .map((a) => ({ value: a.id, label: a.name })),
        },
      ),
      common[1],
    ];
  if (kind === "liabilities" || kind === "receivables")
    return [
      f("name", kind === "liabilities" ? "Business / creditor" : "Borrower"),
      f("principal", "Original principal", "money", {
        help: "Pre-existing obligation: no cash is created. Use a ledger draw/disbursement for new funds.",
      }),
      f("date", "Date originated", "date"),
      f("due", "Repayment due", "date"),
      priority,
      account,
      f("source", "Source / entity", "text", { required: false }),
      ...(kind === "receivables"
        ? [
            f("interestBps", "Interest assumption (%)", "rate", {
              help: "Principal recovery is not earned income. Record actual interest separately.",
            }),
          ]
        : []),
      common[1],
    ];
  if (kind === "bonds")
    return [
      common[0],
      f("identifier", "Bond identifier"),
      f("issuer", "Issuer"),
      f("principal", "Principal held", "money"),
      f("exactCouponPercent", "Annual coupon rate (%)", "number", {
        help: "Coupon rate, not market yield. Retains fractional basis points from official terms.",
      }),
      f("taxBps", "Applicable tax assumption (%)", "rate"),
      f("paymentsPerYear", "Coupon payments per year", "number"),
      f("maturity", "Maturity date", "date"),
      f("maturityValue", "Expected principal maturity value", "money"),
      f(
        "principalAsOf",
        "Outstanding balance verification date (optional)",
        "date",
        { required: false },
      ),
      f(
        "couponPrincipal",
        "Verified outstanding balance for coupon estimates (optional)",
        "money",
        {
          required: false,
          help: "Estimate basis only. Do not reduce Principal held for historical repayments: the existing asset ledger already subtracts actual principal-recovery transactions.",
        },
      ),
      f("redemptionEstimate", "Future amortisation estimate", "select", {
        required: false,
        options: options(["manual", "standard", "full-at-first"]),
        help: "Default manual. Standard uses published outstanding-principal percentages only after the verified principal date. Full-at-first is for confirmed full redemption. Review all CSD holdings, pledge and small-holding conditions first; estimates never post repayments.",
      }),
      account,
      common[1],
    ];
  if (kind === "necessities")
    return [
      common[0],
      f("category", "Category"),
      f("amount", "Amount due", "money"),
      f("due", "Due date", "date"),
      priority,
      f("essential", "Essential", "checkbox"),
      common[1],
    ];
  if (kind === "reserves")
    return [
      common[0],
      f("target", "Target amount", "money"),
      f("due", "Target date", "date"),
      account,
      priority,
      f("contribution", "Planned contribution", "money"),
      schedule,
      f("emergency", "Emergency reserve", "checkbox"),
      common[1],
    ];
  if (kind === "budgets")
    return [
      common[0],
      f("start", "Effective start", "date"),
      f("end", "Period end", "date"),
      f("frequency", "Budget period", "select", {
        options: options(["weekly", "monthly", "custom"]),
      }),
      common[1],
    ];
  if (kind === "scenarios")
    return [
      common[0],
      f("days", "Forecast days (1-730)", "number"),
      f("income", "Hypothetical one-off income", "money"),
      f("expense", "Hypothetical emergency expense", "money"),
      f("monthlyIncome", "Hypothetical monthly net salary", "money"),
      f("spendingBps", "Spending multiplier (%)", "rate"),
      f("delayDays", "Delay expected receipts (days)", "number"),
      f(
        "includeExpected",
        "Include speculative receipts in expected / optimistic lines",
        "checkbox",
      ),
    ];
  if (kind === "recurring")
    return [
      common[0],
      f("category", "Category"),
      f("kind", "Expense type", "select", {
        options: options(["fixed", "variable"]),
      }),
      f("expected", "Expected amount", "money"),
      f("minimum", "Minimum estimate (optional)", "money", { required: false }),
      f("maximum", "Maximum estimate (optional)", "money", { required: false }),
      schedule,
      f("customDays", "Custom frequency interval (days)", "number"),
      f("start", "Start date", "date"),
      f("firstDue", "First due date", "date"),
      f("end", "End date (optional)", "date", { required: false }),
      account,
      f("essential", "Essential", "checkbox"),
      f("autoBudget", "Include scheduled occurrences in budgets", "checkbox"),
      f("reminderDays", "Remind this many days before due", "number"),
      f("status", "Status", "select", {
        options: options(["active", "paused", "cancelled"]),
      }),
      common[1],
    ];
  if (kind === "occasional")
    return [
      common[0],
      f("category", "Category"),
      f("estimated", "Estimated amount", "money"),
      f("month", "Expected month (YYYY-MM)"),
      f("due", "Expected date (optional)", "date", { required: false }),
      f("pattern", "Recurrence pattern / planning note", "text", {
        required: false,
      }),
      priority,
      f("maximum", "Maximum spend (0 = no limit)", "money"),
      f("savingsTarget", "Optional savings target", "money"),
      f("reserveId", "Funding reserve (optional)", "select", {
        required: false,
        options: s.reserves.map((r) => ({ value: r.id, label: r.name })),
      }),
      common[1],
    ];
  const targets = [
    ...s.liabilities.map((r) => ({
      value: r.id,
      label: `Liability: ${r.name}`,
    })),
    ...s.necessities.map((r) => ({
      value: r.id,
      label: `Necessity: ${r.name}`,
    })),
    ...s.reserves.map((r) => ({ value: r.id, label: `Reserve: ${r.name}` })),
    { value: "discretionary", label: "Discretionary envelope" },
  ];
  return [
    common[0],
    f("target", "Allocation target type", "select", {
      options: options(["liability", "necessity", "reserve", "discretionary"]),
    }),
    f("targetId", "Target record", "select", { options: targets }),
    f("mode", "Rule mode", "select", {
      options: options(["fixed", "percent", "threshold"]),
    }),
    f("value", "Fixed amount / percentage / reserve threshold", "money", {
      help: "For percent mode enter e.g. 25.00 for 25%. Percentages apply to the original receipt.",
    }),
    f("cap", "Maximum allocation (0 = no cap)", "money"),
    f("minimumCash", "Only apply if remaining cash reaches", "money"),
  ];
}
export function defaultRecord(
  s: State,
  kind: Collection,
): Record<string, unknown> {
  const base = {
    id: uid(),
    name: "",
    notes: "",
    accountId:
      s.accounts.find((a) => !a.businessId && a.kind !== "investment")?.id ??
      s.accounts[0]?.id ??
      "",
  };
  if (kind === "accounts")
    return {
      id: base.id,
      name: "",
      kind: "bank",
      opening: 0,
      restricted: 0,
      notes: "",
    };
  if (kind === "incomes")
    return {
      ...base,
      type: "Employment",
      description: "",
      amount: 0,
      frequency: "irregular",
      reliability: "uncertain",
      taxBps: 0,
      active: true,
    };
  if (kind === "liabilities" || kind === "receivables")
    return {
      ...base,
      principal: 0,
      date: today(),
      due: addDays(today(), 30),
      priority: 1,
      source: "",
      ...(kind === "receivables" ? { interestBps: 0, writtenOff: false } : {}),
    };
  if (kind === "bonds")
    return {
      ...base,
      identifier: "",
      issuer: "",
      principal: 0,
      couponBps: 0,
      exactCouponPercent: 0,
      taxBps: 0,
      paymentsPerYear: 2,
      maturity: addDays(today(), 365),
      maturityValue: 0,
    };
  if (kind === "necessities")
    return {
      id: base.id,
      name: "",
      category: "Housing",
      amount: 0,
      due: addDays(today(), 7),
      priority: 1,
      essential: true,
      notes: "",
    };
  if (kind === "reserves")
    return {
      ...base,
      target: 0,
      due: addDays(today(), 180),
      priority: 1,
      contribution: 0,
      frequency: "monthly",
      emergency: false,
    };
  if (kind === "budgets")
    return {
      id: base.id,
      profileId: base.id,
      name: "",
      start: today(),
      end: addDays(today(), 29),
      frequency: "monthly",
      allocations: [],
      rollover: false,
      archived: false,
      notes: "",
    };
  if (kind === "scenarios")
    return {
      id: base.id,
      name: "",
      days: 90,
      income: 0,
      expense: 0,
      monthlyIncome: 0,
      spendingBps: 10000,
      delayDays: 0,
      includeExpected: true,
    };
  if (kind === "recurring")
    return {
      ...base,
      category: "Housing",
      kind: "fixed",
      expected: 0,
      frequency: "monthly",
      customDays: 30,
      start: today(),
      firstDue: today(),
      essential: true,
      autoBudget: true,
      reminderDays: 3,
      status: "active",
    };
  if (kind === "occasional")
    return {
      id: base.id,
      name: "",
      category: "Personal care",
      estimated: 0,
      month: today().slice(0, 7),
      pattern: "",
      priority: 5,
      maximum: 0,
      savingsTarget: 0,
      notes: "",
    };
  return {
    id: base.id,
    name: "",
    target: "discretionary",
    targetId: "discretionary",
    mode: "fixed",
    value: 0,
    cap: 0,
    minimumCash: 0,
  };
}
export function editRecord(
  app: AppContext,
  kind: Collection,
  record?: State[Collection][number],
  draftPanel?: import("./context").DialogSpec["draftPanel"],
) {
  app.dialog({
    title: `${record ? "Edit" : "Add"} ${kind === "liabilities" ? "liability" : kind === "necessities" ? "necessity" : kind === "recurring" ? "recurring expense" : kind === "occasional" ? "occasional expense" : kind.slice(0, -1)}`,
    description:
      kind === "bonds"
        ? "Use your bond documents. No rates or payment schedules are inferred. Add explicit payment dates after saving."
        : undefined,
    fields: recordFields(app.state, kind).map((field) => ({
      ...field,
      advanced:
        kind === "accounts"
          ? [
              "restricted",
              "notes",
              "businessId",
              "reclassificationConfirmed",
            ].includes(field.key)
          : kind === "recurring"
            ? [
                "minimum",
                "maximum",
                "customDays",
                "end",
                "reminderDays",
                "notes",
              ].includes(field.key)
            : false,
    })),
    values: record
      ? {
          ...record,
          ...(kind === "bonds" && "couponBps" in record
            ? {
                exactCouponPercent:
                  "exactCouponPercent" in record
                    ? record.exactCouponPercent
                    : record.couponBps / 100,
              }
            : {}),
        }
      : defaultRecord(app.state, kind),
    draftPanel,
    submit: async (values) =>
      app.mutate(`Save ${kind}`, (s) => {
        for (const key of [
          "end",
          "due",
          "reserveId",
          "businessId",
          "sourceAccountId",
          "principalAsOf",
          "redemptionEstimate",
        ])
          if (values[key] === "") delete values[key];
        if (kind === "bonds") {
          if (!values.principalAsOf) delete values.couponPrincipal;
          if (
            values.principalAsOf &&
            typeof values.couponPrincipal !== "number"
          )
            throw new Error(
              "Enter the separately verified outstanding balance for coupon estimates, or clear its verification date",
            );
          if (values.principalAsOf && String(values.principalAsOf) > today())
            throw new Error(
              "Outstanding balance verification date cannot be in the future",
            );
          values.couponBps = Math.round(
            Number(values.exactCouponPercent) * 100,
          );
          if (
            values.redemptionEstimate &&
            values.redemptionEstimate !== "manual" &&
            !values.principalAsOf
          )
            throw new Error(
              "Verify the outstanding principal and its date before enabling redemption estimates",
            );
        }
        if (kind === "accounts") {
          if (
            record &&
            "businessId" in values &&
            ("businessId" in record ? record.businessId : undefined) !==
              values.businessId &&
            (("opening" in record && record.opening !== 0) ||
              s.transactions.some(
                (t) =>
                  t.accountId === record.id || t.destinationId === record.id,
              )) &&
            !values.reclassificationConfirmed
          )
            throw new Error(
              "Review and confirm this account's full history before changing its ownership.",
            );
          if (
            record &&
            !values.businessId &&
            "businessId" in record &&
            record.businessId &&
            (s.transactions.some(
              (t) => t.accountId === record.id || t.destinationId === record.id,
            ) ||
              ("opening" in record && record.opening !== 0)) &&
            !values.reclassificationConfirmed
          )
            throw new Error(
              "Review and confirm this account's full history before changing its ownership.",
            );
          delete values.reclassificationConfirmed;
        }
        if (kind === "recurring") {
          for (const key of ["minimum", "maximum"])
            if (values[key] === 0) delete values[key];
        }
        const list = s[kind] as { id: string }[];
        const index = list.findIndex((r) => r.id === values.id);
        if (
          record &&
          (index < 0 || JSON.stringify(list[index]) !== JSON.stringify(record))
        )
          throw new Error(
            "This record changed in another tab. Keep your entries, close this form and reopen the latest record before saving.",
          );
        if (index >= 0) list[index] = values as { id: string };
        else list.push(values as { id: string });
        if (kind === "recurring") {
          if (values.status !== "active")
            for (const occurrence of s.occurrences.filter(
              (o) =>
                o.recurringId === values.id &&
                o.due >= today() &&
                !s.transactions.some((t) => t.occurrenceId === o.id),
            )) {
              occurrence.status = "skipped";
              occurrence.notes = `Definition ${values.status}; resume this occurrence manually if needed`;
            }
          generateOccurrences(s, addDays(today(), 730));
        }
      }),
  });
}
export function deleteRecord(
  app: AppContext,
  kind: Collection,
  record: State[Collection][number],
) {
  app.confirm(
    `Delete ${record.name}?`,
    "Linked records block deletion. Archive or deactivate records you need to retain. This cannot be undone without a backup.",
    async () => {
      await app.mutate(`Delete ${kind}`, (s) => {
        const list = s[kind] as { id: string }[];
        const index = list.findIndex((r) => r.id === record.id);
        if (index < 0)
          throw new Error(
            "This record was already removed. No other records were deleted.",
          );
        list.splice(index, 1);
      });
    },
  );
}
export function transactionFields(s: State): Field[] {
  const related = [
    ...s.incomes,
    ...s.liabilities,
    ...s.receivables,
    ...s.bonds,
    ...s.necessities,
  ].map((r) => ({ value: r.id, label: r.name }));
  return [
    f("type", "Transaction type", "select", {
      options: options(
        transactionTypes.filter((t) => t !== "reserve_transfer"),
      ),
      help: "Choose expense for spending or income for earned money. Transfers and loan repayments have their own types so they are not counted twice.",
    }),
    f("amount", "Amount", "money"),
    f("date", "Transaction date", "date"),
    f("description", "Description"),
    f("category", "Category"),
    f("subcategory", "Subcategory", "text", { required: false }),
    f("accountId", "Account", "select", {
      options: s.accounts.map((a) => ({ value: a.id, label: a.name })),
    }),
    f("destinationId", "Destination (transfers only)", "select", {
      options: s.accounts.map((a) => ({ value: a.id, label: a.name })),
      required: false,
    }),
    f("relatedId", "Related source / obligation", "select", {
      options: related,
      required: false,
    }),
    f(
      "businessMovement",
      "Business movement (cross-ownership transfers only)",
      "select",
      {
        required: false,
        options: options(["capital", "owner_distribution"]),
        help: "Capital is not business revenue. An owner distribution uses existing retained profit, not new consolidated income.",
      },
    ),
    f("paymentMethod", "Payment method", "text", { required: false }),
    f("recurringReference", "Recurring reference", "text", { required: false }),
    f("notes", "Notes", "textarea"),
  ].map((field) => ({
    ...field,
    advanced: [
      "subcategory",
      "destinationId",
      "relatedId",
      "paymentMethod",
      "recurringReference",
      "notes",
      "businessMovement",
    ].includes(field.key),
  }));
}
export function editTransaction(
  app: AppContext,
  record?: Transaction,
  defaults: Partial<Transaction> = {},
) {
  if (!app.state.accounts.length) {
    app.notify(
      "Add an account first so this transaction has somewhere to be saved.",
    );
    editRecord(app, "accounts");
    return;
  }
  if (record?.prepaidId || record?.captureId || record?.occurrenceId) {
    app.notify(
      "Use the prepaid, savings capture or recurring expense workflow to correct this linked transaction.",
    );
    return;
  }
  if (record?.windfallId || record?.type === "reserve_transfer") {
    app.notify(
      "Use the reserve workflow or undo the complete windfall allocation to change this transaction.",
    );
    return;
  }
  if (
    record &&
    app.state.transactions.some((t) => t.windfallId === record.id)
  ) {
    app.notify("Undo this receipt's windfall allocation before editing it.");
    return;
  }
  const contextBalances = accountBalances(app.state);
  const contextBudget = app.state.budgets.find(
    (b) => b.id === app.state.settings.activeBudgetId,
  );
  const knownCategories = new Set([
    ...app.state.transactions.map((t) => t.category),
    ...(contextBudget?.allocations.map((a) => a.category) ?? []),
  ]);
  const positions = new Map<string, ReturnType<typeof categoryPosition>>();
  app.dialog({
    title: record ? "Edit transaction" : "Add transaction",
    description:
      "Income is earned or distributed money only. Draws, transfers and loan recoveries have distinct ledger types. Expected payments belong in Income or Bonds.",
    fields: transactionFields(app.state),
    context: (values) => {
      const accountId = String(values.accountId ?? "");
      const category = String(values.category ?? "");
      const balance = contextBalances.get(accountId) ?? 0;
      if (app.state.accounts.find((a) => a.id === accountId)?.businessId)
        return `Business account balance: ${formatMoney(balance, app.state.settings.currency)}. Business receipts and expenses stay separate from personal income and budgets.`;
      if (
        contextBudget &&
        knownCategories.has(category) &&
        !positions.has(category)
      )
        positions.set(
          category,
          categoryPosition(app.state, contextBudget, category),
        );
      const position = positions.get(category) ?? {
        planned: 0,
        spent: 0,
        remaining: 0,
        status: "Unbudgeted",
      };
      return `Account balance: ${formatMoney(balance, app.state.settings.currency)}. ${values.type === "expense" && position ? `${category}: ${position.status}; budget ${formatMoney(position.planned, app.state.settings.currency)}, spent ${formatMoney(position.spent, app.state.settings.currency)}, remaining ${formatMoney(position.remaining, app.state.settings.currency)}. Spending is allowed even above this limit.` : "Transfers and borrowing are not new earned income."}`;
    },
    values: record
      ? { ...record }
      : {
          id: uid(),
          type: "expense",
          amount: 0,
          date: today(),
          description: "",
          category: "Food",
          subcategory: "",
          accountId:
            app.state.accounts.find(
              (a) => !a.businessId && a.kind !== "investment",
            )?.id ??
            app.state.accounts[0]?.id ??
            "",
          paymentMethod: "",
          notes: "",
          recurringReference: "",
          ...defaults,
        },
    submit: async (values) => {
      for (const key of ["destinationId", "relatedId", "businessMovement"])
        if (!values[key]) delete values[key];
      if (values.type === "debt_repayment") values.type = "liability_repayment";
      let budgetNotice = "";
      await app.mutate(
        record ? "Edit ledger transaction" : "Add ledger transaction",
        (s) => {
          const t = values as Transaction;
          if (
            ["loan_recovery", "loan_disbursement"].includes(t.type) &&
            s.receivables.find((r) => r.id === t.relatedId)?.writtenOff
          )
            throw new Error(
              "Cannot record payments against a written-off loan",
            );
          const index = s.transactions.findIndex((r) => r.id === t.id);
          if (
            record &&
            (index < 0 ||
              JSON.stringify(s.transactions[index]) !== JSON.stringify(record))
          )
            throw new Error(
              "This transaction changed in another tab. Keep your entries, close this form and reopen the latest transaction before saving.",
            );
          if (index >= 0) s.transactions[index] = t;
          else s.transactions.push(t);
          const b = s.budgets.find((b) => b.id === s.settings.activeBudgetId);
          const allowance = s.allowances.find((p) => p.budgetId === b?.id);
          if (
            t.type === "expense" &&
            !s.accounts.find((a) => a.id === t.accountId)?.businessId &&
            b &&
            t.date >= b.start &&
            t.date <= b.end &&
            (!allowance || allowance.accountId === t.accountId)
          ) {
            const position = categoryPosition(s, b, t.category);
            if (position.status === "Unbudgeted")
              budgetNotice = `Saved on this device. ${t.category} is unexpected / unbudgeted. Fund it from Budgets without changing your actual spending.`;
            else if (position.remaining < 0)
              budgetNotice = `Saved on this device. ${t.category} is ${formatMoney(-position.remaining, s.settings.currency)} over budget. Review funding in Budgets.`;
          }
        },
      );
      if (budgetNotice) app.notify(budgetNotice);
    },
  });
}
export function deleteTransaction(app: AppContext, t: Transaction) {
  if (t.prepaidId || t.captureId) {
    app.notify(
      "Use the linked prepaid correction or savings capture undo action to keep all records consistent.",
    );
    return;
  }
  const group = t.groupId
    ? app.state.transactions.filter((r) => r.groupId === t.groupId)
    : [t];
  app.confirm(
    group.length > 1
      ? "Undo entire windfall allocation?"
      : "Delete transaction?",
    "Balances and linked payments will be recalculated. A receipt with allocations cannot be deleted until those allocations are undone.",
    async () =>
      app.mutate("Delete ledger transaction / allocation", (s) => {
        if (s.transactions.some((r) => r.windfallId === t.id))
          throw new Error("Undo linked windfall allocations first");
        s.transactions = s.transactions.filter(
          (r) => !group.some((g) => g.id === r.id),
        );
      }),
  );
}
export function addSchedule(
  app: AppContext,
  kind: "income" | "bond" | "receivable",
  sourceId: string,
) {
  const source = (
    kind === "income"
      ? app.state.incomes
      : kind === "bond"
        ? app.state.bonds
        : app.state.receivables
  ).find((r) => r.id === sourceId)!;
  const amount =
    kind === "bond"
      ? coupon(app.state.bonds.find((b) => b.id === sourceId)!).net
      : kind === "income"
        ? app.state.incomes.find((i) => i.id === sourceId)!.amount
        : app.state.receivables.find((r) => r.id === sourceId)!.principal;
  app.dialog({
    title: "Add expected payment schedule",
    description:
      "Dates are projections, never actual cash. Start with a date from your documents; review generated dates before use. Custom and irregular schedules add one explicit date at a time.",
    fields: [
      f("first", "First payment date", "date"),
      f("frequency", "Schedule frequency", "select", {
        options: options(frequencies),
      }),
      f("count", "Number of dates", "number"),
      f("amount", "Net expected amount per date", "money"),
      f("reliability", "Reliability", "select", {
        options: options(["confirmed", "reliable", "uncertain"]),
      }),
      f("notes", "Notes", "textarea"),
    ],
    values: {
      first: "",
      frequency: kind === "bond" ? "semiannual" : "one-off",
      count: 1,
      amount,
      reliability:
        kind === "income"
          ? app.state.incomes.find((i) => i.id === sourceId)!.reliability
          : "uncertain",
      notes: source.name,
    },
    submit: async (v) =>
      app.mutate("Add manually configured expected schedule", (s) => {
        const dates = scheduleDates(
          String(v.first),
          String(v.frequency),
          Number(v.count),
        );
        if (
          kind === "bond" &&
          dates.some(
            (due) => due > s.bonds.find((b) => b.id === sourceId)!.maturity,
          )
        )
          throw new Error("Coupon schedule extends beyond maturity");
        for (const due of dates) {
          if (
            s.events.some(
              (e) =>
                e.sourceId === sourceId &&
                e.due === due &&
                e.status !== "cancelled",
            )
          )
            throw new Error("Payment date already exists for this source");
          s.events.push({
            id: uid(),
            sourceId,
            kind,
            due,
            amount: Number(v.amount),
            status: "expected",
            reliability: v.reliability as
              "confirmed" | "reliable" | "uncertain",
            notes: String(v.notes),
          });
        }
      }),
  });
}
export function receive(app: AppContext, eventId: string) {
  const e = app.state.events.find((e) => e.id === eventId)!;
  const received = app.state.transactions
    .filter((t) => t.eventId === e.id)
    .reduce((sum, t) => sum + t.amount, 0);
  app.dialog({
    title: "Confirm actual receipt",
    description:
      "Enter only money actually received. Partial receipts remain outstanding; differing receipts reconcile to the ledger.",
    fields: [
      f("amount", "Actual amount received", "money"),
      f("date", "Actual receipt date", "date"),
    ],
    values: { amount: Math.max(0, e.amount - received), date: today() },
    submit: async (v) =>
      app.mutate("Confirm actual expected-payment receipt", (s) =>
        s.transactions.push(
          receiveEvent(s, e.id, Number(v.amount), String(v.date)),
        ),
      ),
  });
}
export function transferReserve(
  app: AppContext,
  reserveId: string,
  withdraw = false,
) {
  const reserve = app.state.reserves.find((r) => r.id === reserveId)!;
  app.dialog({
    title: withdraw ? "Release reserved funds" : "Fund reserve",
    description:
      "This earmarks cash already in the linked account, not an external transfer or an expense. Releasing makes it available for a separately recorded expense.",
    fields: [
      f("amount", "Amount", "money"),
      f("date", "Date", "date"),
      f("notes", "Notes", "textarea"),
    ],
    values: { amount: 0, date: today(), notes: "" },
    submit: async (v) =>
      app.mutate("Transfer reserve earmark", (s) => {
        if (Number(v.amount) <= 0) throw new Error("Amount must be positive");
        s.transactions.push({
          id: uid(),
          type: "reserve_transfer",
          amount: Number(v.amount) * (withdraw ? -1 : 1),
          date: String(v.date),
          description: `${withdraw ? "Release" : "Fund"} ${reserve.name}`,
          category: "Reserve",
          subcategory: "",
          accountId: reserve.accountId,
          reserveId,
          notes: String(v.notes),
          paymentMethod: "",
          recurringReference: "",
        });
      }),
  });
}
export function confirmWindfall(app: AppContext, receiptId: string) {
  app.confirm(
    "Commit this windfall allocation?",
    "This records actual liability / necessity payments and reserve earmarks. Only confirm payments you have made. No bank transfers or investments are executed by the app.",
    async () =>
      app.mutate("Commit approved windfall waterfall", (s) =>
        commitWindfall(s, receiptId),
      ),
  );
}
export const baseScenario = (): Scenario => ({
  id: "live",
  name: "Live forecast assumptions",
  days: 90,
  income: 0,
  expense: 0,
  monthlyIncome: 0,
  spendingBps: 10000,
  delayDays: 0,
  includeExpected: true,
});

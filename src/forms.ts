import {
  uid,
  today,
  addDays,
  incomeTypes,
  frequencies,
  transactionTypes,
  currencies,
  type State,
  type Transaction,
  type Scenario,
} from "./domain";
import type { AppContext, Field } from "./context";
import {
  commitWindfall,
  coupon,
  receiveEvent,
  scheduleDates,
  sourceAccount,
  eventRemaining,
} from "./engine";
import { generateOccurrences } from "./expense-engine";
import { categoryPosition } from "./connected-finance";
import { formatMoney } from "./money";
import {
  accountCurrency,
  nativeBalances,
  nativeEventRemaining,
  toBase,
  rateFor,
  fromBase,
} from "./currency";

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
      f("currency", "Account currency", "select", {
        options: options(currencies),
        help: "Opening balance and restrictions use this currency. Existing accounts cannot be relabeled; use an exchange. Configure rates under Accounts before adding foreign balances.",
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
      f("couponBps", "Annual coupon rate (%)", "rate"),
      f("taxBps", "Applicable tax assumption (%)", "rate"),
      f("paymentsPerYear", "Coupon payments per year", "number"),
      f("maturity", "Maturity date", "date"),
      f("maturityValue", "Expected principal maturity value", "money"),
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
      currency: s.settings.currency,
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
) {
  const fields = recordFields(app.state, kind);
  app.dialog({
    title: `${record ? "Edit" : "Add"} ${kind === "liabilities" ? "liability" : kind === "necessities" ? "necessity" : kind === "recurring" ? "recurring expense" : kind === "occasional" ? "occasional expense" : kind.slice(0, -1)}`,
    context:
      kind === "incomes"
        ? (values) => {
            const account = app.state.accounts.find(
              (a) => a.id === values.accountId,
            );
            return `Expected amount currency: ${account?.currency ?? app.state.settings.currency}. Cash is recorded only when actually received.`;
          }
        : kind !== "accounts" && fields.some((field) => field.type === "money")
          ? () => `Amounts in ${app.state.settings.currency} (base currency).`
          : undefined,
    description:
      kind === "bonds"
        ? "Use your bond documents. No rates or payment schedules are inferred. Add explicit payment dates after saving."
        : undefined,
    fields: fields.map((field) => ({
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
          ...(kind === "accounts" && "opening" in record
            ? {
                currency: record.currency ?? app.state.settings.currency,
                opening: record.nativeOpening ?? record.opening,
                restricted: record.nativeRestricted ?? record.restricted,
              }
            : {}),
          ...(kind === "incomes" && "nativeAmount" in record
            ? { amount: record.nativeAmount ?? record.amount }
            : {}),
        }
      : defaultRecord(app.state, kind),
    submit: async (values) =>
      app.mutate(`Save ${kind}`, (s) => {
        for (const key of [
          "end",
          "due",
          "reserveId",
          "businessId",
          "sourceAccountId",
        ])
          if (values[key] === "") delete values[key];
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
          const currency = String(values.currency);
          const opening = Number(values.opening),
            restricted = Number(values.restricted);
          const unchanged =
            record &&
            "opening" in record &&
            opening === (record.nativeOpening ?? record.opening) &&
            currency === (record.currency ?? s.settings.currency);
          const rate =
            unchanged && record && "openingRate" in record && record.openingRate
              ? record.openingRate
              : currency === s.settings.currency
                ? "1"
                : rateFor(s, currency);
          values.nativeOpening = opening;
          values.nativeRestricted = restricted;
          values.openingRate = rate;
          values.opening = toBase(s, opening, currency, rate);
          values.restricted = toBase(s, restricted, currency, rate);
        }
        if (kind === "recurring") {
          for (const key of ["minimum", "maximum"])
            if (values[key] === 0) delete values[key];
        }
        if (kind === "incomes") {
          const currency = accountCurrency(s, String(values.accountId));
          if (currency !== s.settings.currency) {
            values.nativeAmount = Number(values.amount);
            values.currency = currency;
            values.amount = toBase(s, Number(values.nativeAmount), currency);
          } else {
            delete values.nativeAmount;
            delete values.currency;
          }
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
  if (
    record?.nativeDestinationAmount !== undefined &&
    record.destinationAmount !== undefined
  ) {
    app.notify(
      "Undo this exchange from the ledger and record a replacement to preserve both currencies and any fee.",
    );
    return;
  }
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
      "Income is earned or distributed money only. Draws, transfers and loan recoveries have distinct ledger types. Expected payments belong in Income or Bonds. Business receipts and expenses stay separate from personal income and budgets. Budget limits do not block actual spending, even when a category is over budget.",
    fields: transactionFields(app.state).map((field) =>
      field.key === "amount"
        ? {
            ...field,
            help: "Enter the amount in the selected account's currency. Saved base-currency reporting values do not change when rates refresh.",
          }
        : field,
    ),
    context: (values) => {
      const accountId = String(values.accountId ?? "");
      const category = String(values.category ?? "");
      if (app.state.accounts.find((a) => a.id === accountId)?.businessId)
        return `Amount currency: ${accountCurrency(app.state, accountId)} / Business account balance: ${formatMoney(nativeBalances(app.state).get(accountId) ?? 0, accountCurrency(app.state, accountId))}`;
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
      const currency = accountCurrency(app.state, accountId);
      return `Amount currency: ${currency} / Account balance: ${formatMoney(nativeBalances(app.state).get(accountId) ?? 0, currency)}${values.type === "expense" && position ? ` / ${category}: ${position.status}; budget ${formatMoney(position.planned, app.state.settings.currency)}, spent ${formatMoney(position.spent, app.state.settings.currency)}, remaining ${formatMoney(position.remaining, app.state.settings.currency)}` : ""}`;
    },
    values: record
      ? { ...record, amount: record.nativeAmount ?? record.amount }
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
          const currency = accountCurrency(s, t.accountId);
          if (
            t.type === "transfer" &&
            t.destinationId &&
            accountCurrency(s, t.destinationId) !== currency
          )
            throw new Error(
              "Use Exchange currency under Accounts to confirm the actual amount received and exchange fee.",
            );
          if (currency !== s.settings.currency) {
            const rate =
              record &&
              record.nativeAmount === t.amount &&
              record.accountId === t.accountId
                ? (record.exchangeRate ?? rateFor(s, currency))
                : rateFor(s, currency);
            t.nativeAmount = t.amount;
            t.exchangeRate = rate;
            t.amount = toBase(s, t.nativeAmount, currency, rate);
            if (t.type === "transfer") {
              t.nativeDestinationAmount = t.nativeAmount;
              t.destinationRate = rate;
            } else {
              delete t.nativeDestinationAmount;
              delete t.destinationRate;
              delete t.destinationAmount;
            }
          } else {
            delete t.nativeAmount;
            delete t.exchangeRate;
            delete t.nativeDestinationAmount;
            delete t.destinationAmount;
            delete t.destinationRate;
          }
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
      ? group.some((r) => r.destinationAmount !== undefined)
        ? "Undo entire currency exchange?"
        : "Undo entire windfall allocation?"
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
        ? (app.state.incomes.find((i) => i.id === sourceId)!.nativeAmount ??
          app.state.incomes.find((i) => i.id === sourceId)!.amount)
        : app.state.receivables.find((r) => r.id === sourceId)!.principal;
  const currency =
    kind === "income"
      ? (app.state.incomes.find((i) => i.id === sourceId)!.currency ??
        app.state.settings.currency)
      : app.state.settings.currency;
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
      f("amount", "Net expected amount per date", "money", {
        help: `Enter ${currency}. Forecasts convert unpaid amounts using current cached/manual rates.`,
      }),
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
            amount: toBase(s, Number(v.amount), currency),
            ...(currency !== s.settings.currency
              ? { currency, nativeAmount: Number(v.amount) }
              : {}),
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
  const receivingCurrency = accountCurrency(
    app.state,
    sourceAccount(app.state, e),
  );
  let amount: number;
  try {
    amount = e.currency
      ? nativeEventRemaining(app.state, e)
      : fromBase(app.state, eventRemaining(app.state, e), receivingCurrency);
  } catch (error) {
    app.notify(
      error instanceof Error
        ? error.message
        : "Refresh exchange rates before recording this receipt.",
    );
    return;
  }
  app.dialog({
    title: "Confirm actual receipt",
    description:
      "Enter only money actually received. Partial receipts remain outstanding; differing receipts reconcile to the ledger.",
    fields: [
      f("amount", "Actual amount received", "money", {
        help:
          receivingCurrency !== app.state.settings.currency
            ? `Enter ${receivingCurrency}. Historical base-currency reporting records the rate used when this receipt is saved.`
            : undefined,
      }),
      f("date", "Actual receipt date", "date"),
    ],
    values: { amount, date: today() },
    submit: async (v) =>
      app.mutate("Confirm actual expected-payment receipt", (s) => {
        const amount = Number(v.amount);
        const currency = accountCurrency(s, sourceAccount(s, e));
        const income = s.incomes.find((i) => i.id === e.sourceId);
        if (
          income?.businessId &&
          income.sourceAccountId &&
          accountCurrency(s, income.sourceAccountId) !== currency
        )
          throw new Error(
            "Use Exchange currency and link this expected business payout, confirming the source and receiving amounts.",
          );
        const rate = rateFor(s, currency);
        const transaction = receiveEvent(
          s,
          e.id,
          toBase(s, amount, currency, rate),
          String(v.date),
        );
        if (currency !== s.settings.currency || e.currency) {
          transaction.nativeAmount = amount;
          transaction.exchangeRate = rate;
        }
        s.transactions.push(transaction);
      }),
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

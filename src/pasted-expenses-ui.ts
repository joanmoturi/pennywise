import type { AppContext, Field } from "./context";
import { today, uid } from "./domain";
import { accountBalances } from "./engine";
import { formatMoney, parseMoney, sum } from "./money";
import { parseExpenseNote, type ParsedExpenseNote } from "./pasted-expenses";

function field(
  key: string,
  label: string,
  type: Field["type"],
  extra: Partial<Field> = {},
): Field {
  return { key, label, type, ...extra };
}
function accountField(app: AppContext): Field {
  return field("accountId", "Paying account", "select", {
    options: [
      { value: "", label: "Choose the paying account" },
      ...app.state.accounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    ],
    help: "Choose the account that actually paid. Business spending needs a business-owned account.",
  });
}

export function pasteExpenses(app: AppContext) {
  app.dialog({
    title: "Paste expenses",
    description:
      "Parsed only on this device. One expense per line; 10k means 10,000. Nothing is saved until you review and confirm. A reported balance never creates a transaction or overwrites an account.",
    fields: [
      accountField(app),
      field("date", "Expense date", "date"),
      field("text", "Expense note", "textarea", {
        // Preserve an over-limit character so oversized pastes cannot save partially.
        maxLength: 10001,
        help: "Up to 50 expenses and 10,000 characters. Correct unsupported or ambiguous lines before reviewing.",
      }),
    ],
    values: { accountId: "", date: today(), text: "" },
    submitLabel: "Review expenses",
    submit: async (values) => {
      const parsed = parseExpenseNote(String(values.text));
      if (parsed.issues.length) throw new Error(parsed.issues.join(" "));
      await reviewExpenses(
        app,
        parsed,
        String(values.accountId),
        String(values.date),
      );
    },
  });
}

async function reviewExpenses(
  app: AppContext,
  parsed: ParsedExpenseNote,
  accountId: string,
  date: string,
) {
  const snapshot = await app.repo.read();
  const chosen = snapshot.accounts.find((account) => account.id === accountId);
  if (!chosen || (parsed.business && !chosen.businessId))
    throw new Error(
      "Choose a business-owned paying account for a business expense note.",
    );
  const rows = parsed.expenses.map((expense) => ({ ...expense, id: uid() }));
  const reviewed = (values: Record<string, unknown>) =>
    rows
      .filter(
        (row) =>
          values[`include-${row.id}`] === true ||
          values[`include-${row.id}`] === "on",
      )
      .map((row) => {
        const value = values[`amount-${row.id}`];
        const amount =
          typeof value === "number" ? value : parseMoney(String(value));
        const description = String(
          values[`description-${row.id}`] ?? "",
        ).trim();
        const category = String(values[`category-${row.id}`] ?? "").trim();
        if (amount <= 0 || !description || !category)
          throw new Error(
            "Included expenses need a description, category and positive amount.",
          );
        return { id: row.id, description, category, amount };
      });
  const money = (value: number) =>
    formatMoney(value, snapshot.settings.currency);
  app.dialog({
    title: "Review pasted expenses",
    description:
      "Edit each expense or uncheck it to exclude it. Saving records only the included expenses, together. Balance differences are warnings, never automatic adjustments.",
    context: (values) => {
      try {
        const total = sum(reviewed(values).map((row) => row.amount));
        const balance = accountBalances(snapshot, String(values.date)).get(
          String(values.accountId),
        );
        if (balance === undefined) return "Choose the paying account.";
        const after = sum([balance, -total]);
        return `Expenses total: ${money(total)}. Calculated balance after expenses: ${money(after)}.${parsed.reportedBalance === undefined ? "" : ` Reported balance: ${money(parsed.reportedBalance)}. ${after === parsed.reportedBalance ? "Balances match." : `Difference: ${money(sum([after, -parsed.reportedBalance]))}. Review and acknowledge the difference before saving.`} No balance will be overwritten.`}`;
      } catch {
        return "Enter valid positive amounts for all included expenses.";
      }
    },
    fields: [
      accountField(app),
      field("date", "Expense date", "date"),
      ...rows.flatMap((row, index) => [
        field(`include-${row.id}`, `Include expense ${index + 1}`, "checkbox", {
          required: false,
        }),
        field(
          `description-${row.id}`,
          `Expense ${index + 1} description`,
          "text",
          { required: false },
        ),
        field(`category-${row.id}`, `Expense ${index + 1} category`, "text", {
          required: false,
        }),
        field(`amount-${row.id}`, `Expense ${index + 1} amount`, "money", {
          required: false,
        }),
      ]),
      ...(parsed.reportedBalance === undefined
        ? []
        : [
            field(
              "balanceConfirmed",
              "I reviewed any difference from the reported balance",
              "checkbox",
              { required: false },
            ),
          ]),
    ],
    values: {
      accountId,
      date,
      balanceConfirmed: false,
      ...Object.fromEntries(
        rows.flatMap((row) => [
          [`include-${row.id}`, true],
          [`description-${row.id}`, row.description],
          [
            `category-${row.id}`,
            row.description.charAt(0).toUpperCase() + row.description.slice(1),
          ],
          [`amount-${row.id}`, row.amount],
        ]),
      ),
    },
    submitLabel: "Save reviewed expenses",
    submit: async (values) => {
      const expenses = reviewed(values);
      if (!expenses.length)
        throw new Error("Include at least one expense to save.");
      const selectedAccount = String(values.accountId);
      const selectedDate = String(values.date);
      const canonical = JSON.stringify([
        selectedAccount,
        selectedDate,
        expenses
          .map(({ description, category, amount }) =>
            JSON.stringify([
              description.toLowerCase(),
              category.toLowerCase(),
              amount,
            ]),
          )
          .sort(),
      ]);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonical),
      );
      const marker = `Reviewed pasted expenses [${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}]`;
      await app.mutate("Save reviewed pasted expenses", (state) => {
        if (
          state.transactions.some((transaction) => transaction.notes === marker)
        )
          throw new Error("This exact expense batch is already recorded.");
        const account = state.accounts.find(
          (account) => account.id === selectedAccount,
        );
        if (
          !account ||
          (parsed.business && !account.businessId) ||
          account.businessId !==
            snapshot.accounts.find((account) => account.id === selectedAccount)
              ?.businessId
        )
          throw new Error(
            "Choose the correct paying account; its ownership may have changed.",
          );
        const before = accountBalances(state, selectedDate).get(
          selectedAccount,
        )!;
        if (
          before !==
          accountBalances(snapshot, selectedDate).get(selectedAccount)
        )
          throw new Error(
            "The account balance changed. Close this review and paste again using the latest records.",
          );
        const after = sum([
          before,
          -sum(expenses.map((expense) => expense.amount)),
        ]);
        if (
          parsed.reportedBalance !== undefined &&
          after !== parsed.reportedBalance &&
          !values.balanceConfirmed
        )
          throw new Error(
            "The reported balance differs from the calculated balance. Review the difference and acknowledge it; the account balance will not be overwritten.",
          );
        for (const expense of expenses)
          state.transactions.push({
            ...expense,
            type: "expense",
            accountId: selectedAccount,
            date: selectedDate,
            subcategory: "",
            paymentMethod: "",
            recurringReference: "",
            notes: marker,
          });
      });
    },
  });
}

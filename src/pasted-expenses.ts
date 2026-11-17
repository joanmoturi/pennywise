import { parseMoney, safe, sum } from "./money";

export interface PastedExpense {
  description: string;
  amount: number;
}
export interface ParsedExpenseNote {
  expenses: PastedExpense[];
  reportedBalance?: number;
  business: boolean;
  issues: string[];
}

const amountPattern =
  "((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)\\s*([kK]?)";
const currency = "(?:(?:KES|KSHS?\\.?)\\s*)?";
const expensePattern = new RegExp(
  `^(.+?)(?:\\s*[-:=]\\s*|\\s+)${currency}${amountPattern}$`,
  "i",
);
const balancePattern = new RegExp(
  `^(?:(?:new|closing|remaining|current)\\s+)?(?:balance|balace|bal)\\s*[:=]?\\s*${currency}(-?)${amountPattern}$`,
  "i",
);

function amount(value: string, suffix: string): number {
  return safe(BigInt(parseMoney(value)) * (suffix ? 1000n : 1n));
}

export function parseExpenseNote(text: string): ParsedExpenseNote {
  const result: ParsedExpenseNote = {
    expenses: [],
    business: false,
    issues: [],
  };
  if (text.length > 10000) {
    result.issues.push("Use at most 10,000 characters per expense note.");
    return result;
  }
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim().replace(/^[\u2022*]\s*/, "");
    if (!line) continue;
    const fail = (message: string) =>
      result.issues.push(`Line ${index + 1}: ${message}`);
    if (
      /^(?:(?:business|personal)\s+)?(?:spending(?:\s+expenses?)?|expenses?)(?:\s+(?:for\s+)?today)?\s*:?$/i.test(
        line,
      )
    ) {
      result.business ||= /^business\b/i.test(line);
      continue;
    }
    try {
      const balance = line.match(balancePattern);
      if (balance) {
        if (result.reportedBalance !== undefined)
          fail("keep only one reported balance.");
        else
          result.reportedBalance =
            amount(balance[2], balance[3]) * (balance[1] ? -1 : 1);
        continue;
      }
      const match = line.match(expensePattern);
      if (
        !match ||
        /^(?:total|subtotal|balance|balace|income|received|refund|transfer|opening|closing|loan)\b/i.test(
          match[1],
        )
      ) {
        fail(
          "use one expense and amount, such as Materials - 10k. Balances are checks, not expenses; remove unsupported totals or other notes.",
        );
        continue;
      }
      const description = match[1].trim();
      const value = amount(match[2], match[3]);
      if (
        !description ||
        description.length > 160 ||
        /[-:=]\s*$/.test(description) ||
        value <= 0 ||
        /\b\d[\d,]*(?:\.\d+)?(?:\s*k)?\b/i.test(description)
      ) {
        fail(
          "use a description of up to 160 characters and one positive amount.",
        );
        continue;
      }
      result.expenses.push({ description, amount: value });
    } catch {
      fail("the amount is invalid or exceeds the supported monetary range.");
    }
  }
  if (!result.expenses.length)
    result.issues.push("Add at least one expense to review.");
  if (result.expenses.length > 50)
    result.issues.push("Review at most 50 expenses at a time.");
  try {
    sum(result.expenses.map((expense) => expense.amount));
  } catch {
    result.issues.push(
      "The expense total exceeds the supported monetary range.",
    );
  }
  return result;
}

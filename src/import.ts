import { dateSchema, today, uid, type Transaction, type State } from "./domain";
import { parseMoney, decimal } from "./money";

export function parseCsv(text: string): string[][] {
  if (text.length > 10_000_000)
    throw new Error("CSV import is limited to 10 MB");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && !field) quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length > 20001) throw new Error("Import is limited to 20,000 rows");
  return rows;
}
export interface ColumnMapping {
  date: number;
  description: number;
  debit: number;
  credit: number;
  balance: number;
  category: string;
  dateFormat: "ISO" | "DMY" | "MDY";
}
export interface ImportRow {
  row: number;
  transaction?: Transaction;
  error?: string;
  duplicate: boolean;
  uncertain: boolean;
  balance?: number;
  selected: boolean;
}
export function fingerprint(t: Transaction): string {
  return [
    t.accountId,
    t.date,
    t.type,
    t.amount,
    t.description.trim().toLowerCase(),
  ].join("|");
}
export function previewStatement(
  s: State,
  rows: string[][],
  mapping: ColumnMapping,
  accountId: string,
): ImportRow[] {
  if (!s.accounts.some((a) => a.id === accountId))
    throw new Error("Choose an existing account");
  const seen = new Set(s.transactions.map(fingerprint));
  return rows.slice(1).map((r, i) => {
    try {
      let date = r[mapping.date]?.trim();
      if (mapping.dateFormat !== "ISO") {
        const parts = date?.split(/[/-]/);
        if (!parts || parts.length !== 3) throw new Error("Invalid date");
        date = `${parts[2]}-${parts[mapping.dateFormat === "DMY" ? 1 : 0].padStart(2, "0")}-${parts[mapping.dateFormat === "DMY" ? 0 : 1].padStart(2, "0")}`;
      }
      dateSchema.parse(date);
      if (date > today())
        throw new Error("Future date; use an expected payment instead");
      const debit = r[mapping.debit]?.trim() ? parseMoney(r[mapping.debit]) : 0;
      const credit = r[mapping.credit]?.trim()
        ? parseMoney(r[mapping.credit])
        : 0;
      if (debit < 0 || credit < 0 || debit > 0 === credit > 0)
        throw new Error("Exactly one positive debit or credit is required");
      const description = r[mapping.description]?.trim();
      if (!description) throw new Error("Missing description");
      const transaction: Transaction = {
        id: uid(),
        type: debit ? "expense" : "income",
        amount: debit || credit,
        date,
        description,
        category: mapping.category,
        subcategory: "",
        accountId,
        paymentMethod: "Statement",
        notes: "Imported after manual review",
        recurringReference: "",
      };
      const fp = fingerprint(transaction);
      const duplicate = seen.has(fp);
      seen.add(fp);
      const uncertain =
        credit > 0 || /transfer|loan|repay|business|borrow/i.test(description);
      const balance =
        mapping.balance >= 0 && r[mapping.balance]?.trim()
          ? parseMoney(r[mapping.balance])
          : undefined;
      return {
        row: i + 2,
        transaction,
        duplicate,
        uncertain,
        balance,
        selected: !duplicate && !uncertain,
      };
    } catch (e) {
      return {
        row: i + 2,
        error: e instanceof Error ? e.message : "Invalid row",
        duplicate: false,
        uncertain: false,
        selected: false,
      };
    }
  });
}
export function commitStatement(s: State, rows: ImportRow[]) {
  const seen = new Set(s.transactions.map(fingerprint));
  for (const r of rows.filter((r) => r.selected)) {
    if (!r.transaction || r.error) throw new Error("Selected row is invalid");
    const fp = fingerprint(r.transaction);
    if (seen.has(fp))
      throw new Error("Duplicate transaction; nothing imported");
    seen.add(fp);
    s.transactions.push(r.transaction);
  }
}
export function csvCell(value: string | number): string {
  const s = String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function transactionsCsv(s: State, start: string, end: string): string {
  return [
    [
      "id",
      "date",
      "type",
      "amount",
      "currency",
      "account",
      "category",
      "description",
      "related_record",
      "expected_event",
    ]
      .map(csvCell)
      .join(","),
    ...s.transactions
      .filter((t) => t.date >= start && t.date <= end)
      .map((t) =>
        [
          t.id,
          t.date,
          t.type,
          decimal(t.amount),
          s.settings.currency,
          s.accounts.find((a) => a.id === t.accountId)?.name ?? "",
          t.category,
          t.description,
          t.relatedId ?? "",
          t.eventId ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
  ].join("\r\n");
}

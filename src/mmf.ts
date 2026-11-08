import {
  dateSchema,
  mmfProjectionSchema,
  today,
  type State,
  type Income,
} from "./domain";
import { parseCsv } from "./import";
import { safe } from "./money";

export type MmfProjection = NonNullable<Income["mmfStudio"]>;
const sourceId = "mmf-studio-income";

function roundedAmount(input: string): number {
  const value = input.trim();
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match || value.length > 100)
    throw new Error("MMF amounts must be non-negative decimal numbers");
  const exponent = Number(match[3] ?? 0);
  if (Math.abs(exponent) > 50)
    throw new Error("MMF amount exponent is out of range");
  const fraction = match[2] ?? "";
  const digits = BigInt(match[1] + fraction);
  const shift = 2 + exponent - fraction.length;
  if (shift >= 0) return safe(digits * 10n ** BigInt(shift));
  const divisor = 10n ** BigInt(-shift);
  return safe((digits + divisor / 2n) / divisor);
}

export function inspectMmfCsv(text: string, filename: string): MmfProjection {
  if (text.length > 1_000_000) throw new Error("MMF CSV is limited to 1 MB");
  const [headers, ...rows] = parseCsv(text);
  if (!headers || !rows.length || rows.length > 600)
    throw new Error("Import between 1 and 600 months from MMF Studio");
  const columns = [
    "Month",
    "Net interest earned",
    "Net interest credited",
    "Reinvested interest",
    "Interest paid out",
    "Separate fees",
    "Total assets",
    "Unfunded amount",
  ];
  const indexes = columns.map((column) => headers.indexOf(column));
  if (
    new Set(headers).size !== headers.length ||
    indexes.some((index) => index < 0)
  )
    throw new Error(
      "Use MMF Studio's Export monthly CSV, not a transaction or baseline file",
    );
  const projection = rows.map((row, index) => {
    if (row.length !== headers.length)
      throw new Error(`MMF row ${index + 2} has missing or extra columns`);
    const month = row[indexes[0]].trim();
    dateSchema.parse(`${month}-01`);
    if (Number(month.slice(0, 4)) < 1900 || Number(month.slice(0, 4)) > 2200)
      throw new Error("MMF projection years must be between 1900 and 2200");
    const date = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
    const values = indexes.slice(1).map((column) => roundedAmount(row[column]));
    if (values[6] !== 0)
      throw new Error(
        "Resolve unfunded amounts in MMF Studio before importing",
      );
    return {
      date,
      interest: values[0],
      credited: values[1],
      reinvested: values[2],
      payout: values[3],
      fees: values[4],
      assets: values[5],
    };
  });
  return mmfProjectionSchema.parse({
    version: 1,
    filename,
    importedAt: new Date().toISOString(),
    rows: projection.sort((a, b) => a.date.localeCompare(b.date)),
  });
}

export function mmfIncome(s: State): Income | undefined {
  return s.incomes.find((income) => income.id === sourceId && income.mmfStudio);
}

export function mmfEventEnabled(s: State, source: string): boolean {
  if (source !== sourceId) return true;
  const income = s.incomes.find((income) => income.id === source);
  return !income?.mmfStudio || income.active;
}

export function importMmf(
  s: State,
  input: MmfProjection,
  accountId: string,
  asOf = today(),
): void {
  const projection = mmfProjectionSchema.parse(input);
  const account = s.accounts.find((account) => account.id === accountId);
  if (!account || account.businessId || account.kind === "investment")
    throw new Error(
      "Choose a personal cash, bank, mobile-money or savings account for actual payouts",
    );
  const existing = s.incomes.find((income) => income.id === sourceId);
  if (existing && !existing.mmfStudio)
    throw new Error("The MMF income identifier is already in use");
  for (const event of s.events)
    if (
      event.sourceId === sourceId &&
      event.due >= asOf &&
      s.transactions.some((transaction) => transaction.eventId === event.id) &&
      projection.rows.find((row) => row.date === event.due)?.payout !==
        event.amount
    )
      throw new Error(
        "An MMF payment already has actual receipts. Keep that month's payout unchanged and review corrections separately.",
      );
  const income: Income = {
    id: sourceId,
    name: "MMF Studio interest",
    type: "Investment distribution",
    description:
      "Imported monthly projection snapshot. Only configured interest payouts enter the cash forecast; reinvested interest stays in the fund.",
    amount:
      projection.rows.find((row) => row.date >= asOf && row.payout > 0)
        ?.payout ?? 0,
    frequency: "irregular",
    reliability: "reliable",
    taxBps: 0,
    accountId,
    active: existing?.active ?? false,
    notes: existing?.notes ?? "",
    mmfStudio: projection,
  };
  const hasReceipt = (id: string) =>
    s.transactions.some((transaction) => transaction.eventId === id);
  for (const event of s.events)
    if (
      event.sourceId === sourceId &&
      event.kind === "income" &&
      event.due >= asOf &&
      !hasReceipt(event.id)
    )
      event.status = "cancelled";
  for (const row of projection.rows) {
    if (row.date < asOf || row.payout === 0) continue;
    const id = `${sourceId}:${row.date}`;
    const event = s.events.find((event) => event.id === id);
    if (event && hasReceipt(event.id)) continue;
    const updated = {
      id,
      sourceId,
      kind: "income" as const,
      due: row.date,
      amount: row.payout,
      status: "expected" as const,
      reliability: "reliable" as const,
      notes: "MMF Studio projected interest payout, not a confirmed receipt.",
    };
    if (event) Object.assign(event, updated);
    else s.events.push(updated);
  }
  if (existing) Object.assign(existing, income);
  else s.incomes.push(income);
}

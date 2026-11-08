import {
  currencies,
  today,
  type State,
  type Account,
  type Transaction,
} from "./domain";
import { safe, sum } from "./money";

export function accountCurrency(s: State, id: string): string {
  const account = s.accounts.find((a) => a.id === id);
  if (!account) throw new Error("Account not found");
  return account.currency ?? s.settings.currency;
}
export function quote(s: State, currency: string) {
  const matches =
    s.settings.exchange?.quotes.filter((q) => q.currency === currency) ?? [];
  return (
    matches.find((q) => q.source === "manual") ??
    matches.find((q) => q.source === "automatic")
  );
}
export function rateFor(s: State, currency: string): string {
  if (currency === s.settings.currency) return "1";
  const rate = quote(s, currency)?.rate;
  if (!rate)
    throw new Error(
      `No ${currency}/${s.settings.currency} rate is available. Refresh rates or enter a manual rate under Accounts.`,
    );
  return rate;
}
function fraction(rate: string): [bigint, bigint] {
  if (!/^\d+(\.\d{1,12})?$/.test(rate) || rate.length > 40)
    throw new Error("Invalid exchange rate");
  const [whole, decimal = ""] = rate.split(".");
  const numerator = BigInt(whole + decimal);
  if (numerator <= 0n) throw new Error("Exchange rate must be positive");
  return [numerator, 10n ** BigInt(decimal.length)];
}
function rounded(
  amount: number,
  numerator: bigint,
  denominator: bigint,
): number {
  const product = BigInt(amount) * numerator;
  const sign = product < 0n ? -1n : 1n;
  const absolute = product < 0n ? -product : product;
  return safe(sign * ((absolute + denominator / 2n) / denominator));
}
export function toBase(
  s: State,
  amount: number,
  currency: string,
  rate?: string,
): number {
  if (amount === 0) return 0;
  const [n, d] = fraction(rate ?? rateFor(s, currency));
  return rounded(amount, n, d);
}
export function fromBase(
  s: State,
  amount: number,
  currency: string,
  rate?: string,
): number {
  if (amount === 0) return 0;
  const [n, d] = fraction(rate ?? rateFor(s, currency));
  return rounded(amount, d, n);
}
export function nativeBalances(
  s: State,
  until = "9999-12-31",
): Map<string, number> {
  const amounts = new Map(
    s.accounts.map((a) => [a.id, BigInt(a.nativeOpening ?? a.opening)]),
  );
  const add = (id: string | undefined, value: number) => {
    if (id && amounts.has(id))
      amounts.set(id, amounts.get(id)! + BigInt(value));
  };
  for (const t of s.transactions) {
    if (t.date > until || t.type === "reserve_transfer") continue;
    const amount = t.nativeAmount ?? t.amount;
    if (t.type === "transfer") {
      add(t.accountId, -amount);
      add(
        t.destinationId,
        t.nativeDestinationAmount ?? t.destinationAmount ?? t.amount,
      );
    } else {
      add(
        t.accountId,
        [
          "expense",
          "debt_repayment",
          "loan_disbursement",
          "liability_repayment",
        ].includes(t.type)
          ? -amount
          : amount,
      );
    }
  }
  return new Map([...amounts].map(([id, amount]) => [id, safe(amount)]));
}
export function restrictedValue(s: State, account: Account): number {
  return toBase(
    s,
    account.nativeRestricted ?? account.restricted,
    account.currency ?? s.settings.currency,
  );
}
export function nativeEventRemaining(
  s: State,
  event: State["events"][number],
): number {
  return Math.max(
    0,
    sum([
      event.nativeAmount ?? event.amount,
      -sum(
        s.transactions
          .filter((t) => t.eventId === event.id)
          .map((t) =>
            event.currency
              ? t.businessMovement === "owner_distribution"
                ? (t.nativeDestinationAmount ?? t.amount)
                : (t.nativeAmount ?? t.amount)
              : incomeValue(t),
          ),
      ),
    ]),
  );
}
export function incomeValue(t: Transaction): number {
  return t.businessMovement === "owner_distribution"
    ? (t.destinationAmount ?? t.amount)
    : t.amount;
}
export function workspaceHasMoney(s: State): boolean {
  return (
    s.transactions.length > 0 ||
    s.accounts.some((a) => a.opening !== 0 || a.restricted !== 0) ||
    s.incomes.length > 0 ||
    s.bonds.length > 0 ||
    s.liabilities.length > 0 ||
    s.receivables.length > 0 ||
    s.recurring.length > 0 ||
    s.prepaids.length > 0 ||
    s.reserves.length > 0 ||
    s.necessities.length > 0 ||
    s.budgets.some((b) => b.allocations.some((a) => a.amount !== 0))
  );
}
export function stampCurrency(s: State, previous: State) {
  const priorTransactions = new Map(
    previous.transactions.map((t) => [t.id, t]),
  );
  for (const account of s.accounts) {
    const old = previous.accounts.find((a) => a.id === account.id);
    if (
      old &&
      (old.currency ?? previous.settings.currency) !==
        (account.currency ?? s.settings.currency)
    )
      throw new Error(
        "An account's currency cannot be relabeled. Create a separate account and record an exchange instead.",
      );
  }
  for (const t of s.transactions) {
    if (t.type === "reserve_transfer") continue;
    const currency = accountCurrency(s, t.accountId);
    const old = priorTransactions.get(t.id);
    if (
      old &&
      old.amount === t.amount &&
      old.accountId === t.accountId &&
      old.destinationId === t.destinationId &&
      old.nativeAmount === t.nativeAmount &&
      old.nativeDestinationAmount === t.nativeDestinationAmount
    )
      continue;
    if (
      t.type === "transfer" &&
      t.destinationId &&
      currency !== accountCurrency(s, t.destinationId) &&
      t.nativeDestinationAmount === undefined
    )
      throw new Error(
        "Cross-currency transfers require actual received amounts. Use Exchange currency under Accounts.",
      );
    if (currency !== s.settings.currency && t.nativeAmount === undefined) {
      t.exchangeRate = rateFor(s, currency);
      t.nativeAmount = fromBase(s, t.amount, currency, t.exchangeRate);
    }
    if (
      t.type === "transfer" &&
      t.destinationId &&
      accountCurrency(s, t.destinationId) !== s.settings.currency &&
      t.nativeDestinationAmount === undefined
    ) {
      t.destinationRate = rateFor(s, accountCurrency(s, t.destinationId));
      t.nativeDestinationAmount = fromBase(
        s,
        t.destinationAmount ?? t.amount,
        accountCurrency(s, t.destinationId),
        t.destinationRate,
      );
    }
  }
}
export function validateCurrencies(s: State) {
  const base = s.settings.currency;
  const keys =
    s.settings.exchange?.quotes.map((q) => `${q.currency}:${q.source}`) ?? [];
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate exchange-rate quotes");
  if (s.settings.exchange?.quotes.some((q) => q.asOf > today()))
    throw new Error("Exchange rates cannot be future-dated.");
  for (const a of s.accounts) {
    if (
      (a.currency ?? base) !== base &&
      (a.nativeOpening === undefined ||
        a.nativeRestricted === undefined ||
        !a.openingRate)
    )
      throw new Error(
        "Foreign accounts must retain their original balances and opening rate.",
      );
    if (
      a.openingRate &&
      Math.abs(
        toBase(
          s,
          a.nativeOpening ?? a.opening,
          a.currency ?? base,
          a.openingRate,
        ) - a.opening,
      ) > 1
    )
      throw new Error("Account opening currency amounts do not reconcile.");
    if (
      a.openingRate &&
      a.nativeRestricted !== undefined &&
      Math.abs(
        toBase(s, a.nativeRestricted, a.currency ?? base, a.openingRate) -
          a.restricted,
      ) > 1
    )
      throw new Error("Account restricted currency amounts do not reconcile.");
  }
  for (const t of s.transactions) {
    if (t.type === "reserve_transfer") continue;
    const currency = accountCurrency(s, t.accountId);
    if (currency !== base && (t.nativeAmount === undefined || !t.exchangeRate))
      throw new Error(
        "Foreign transactions must retain their original amount and rate.",
      );
    if (t.nativeAmount !== undefined) {
      if (
        t.nativeAmount === 0 ||
        Math.abs(
          toBase(s, t.nativeAmount, currency, t.exchangeRate ?? "1") - t.amount,
        ) > 1
      )
        throw new Error("Transaction currency amounts do not reconcile.");
    }
    if (t.type === "transfer" && t.destinationId) {
      const destination = accountCurrency(s, t.destinationId);
      if (
        destination !== base &&
        (t.nativeDestinationAmount === undefined || !t.destinationRate)
      )
        throw new Error(
          "Foreign transfer destinations must retain the actual amount received.",
        );
      if (
        t.nativeDestinationAmount !== undefined &&
        (t.nativeDestinationAmount <= 0 ||
          Math.abs(
            toBase(
              s,
              t.nativeDestinationAmount,
              destination,
              t.destinationRate ?? "1",
            ) - (t.destinationAmount ?? t.amount),
          ) > 1)
      )
        throw new Error(
          "Transfer destination currency amounts do not reconcile.",
        );
    } else if (
      t.nativeDestinationAmount !== undefined ||
      t.destinationAmount !== undefined ||
      t.destinationRate !== undefined
    )
      throw new Error("Only transfers have destination currency amounts.");
  }
  for (const [id, value] of nativeBalances(s))
    toBase(s, value, accountCurrency(s, id));
  for (const income of s.incomes)
    if (
      income.currency &&
      income.currency !== accountCurrency(s, income.accountId)
    )
      throw new Error("Income currency must match its receiving account.");
  for (const e of s.events)
    if (
      e.currency &&
      e.nativeAmount !== undefined &&
      e.status !== "cancelled"
    ) {
      if (
        e.currency !==
        accountCurrency(
          s,
          (e.kind === "income"
            ? s.incomes
            : e.kind === "bond"
              ? s.bonds
              : s.receivables
          ).find((i) => i.id === e.sourceId)?.accountId ?? "",
        )
      )
        throw new Error("Payment currency must match its receiving account.");
      toBase(s, e.nativeAmount, e.currency);
    }
}
export function postExchange(
  s: State,
  input: {
    id: string;
    accountId: string;
    destinationId: string;
    sent: number;
    received: number;
    fee: number;
    date: string;
    businessMovement?: "capital" | "owner_distribution";
    eventId?: string;
  },
) {
  if (input.date > today())
    throw new Error(
      "Record only exchanges that have actually occurred; future cash belongs in forecasts.",
    );
  if (
    input.accountId === input.destinationId ||
    input.sent <= 0 ||
    input.received <= 0 ||
    input.fee < 0 ||
    ![input.sent, input.received, input.fee].every(Number.isSafeInteger)
  )
    throw new Error(
      "Choose different accounts and positive sent/received amounts; fees cannot be negative.",
    );
  if (
    s.transactions.some((t) => t.id === input.id || t.id === `${input.id}:fee`)
  )
    throw new Error("Exchange was already recorded.");
  const event = input.eventId
    ? s.events.find(
        (e) =>
          e.id === input.eventId &&
          e.kind === "income" &&
          e.status !== "cancelled",
      )
    : undefined;
  if (input.eventId) {
    const income = s.incomes.find((i) => i.id === event?.sourceId);
    if (
      !income ||
      income.accountId !== input.destinationId ||
      income.sourceAccountId !== input.accountId ||
      !income.businessId ||
      input.businessMovement !== "owner_distribution"
    )
      throw new Error(
        "Choose the matching expected business payout and owner distribution.",
      );
  }
  const currency = accountCurrency(s, input.accountId);
  const destination = accountCurrency(s, input.destinationId);
  if (
    nativeBalances(s).get(input.accountId)! -
      (s.accounts.find((a) => a.id === input.accountId)!.nativeRestricted ??
        s.accounts.find((a) => a.id === input.accountId)!.restricted) <
    sum([input.sent, input.fee])
  )
    throw new Error(
      "Exchange exceeds the source account's unrestricted balance.",
    );
  const exchangeRate = rateFor(s, currency),
    destinationRate = rateFor(s, destination);
  const base: Transaction = {
    id: input.id,
    type: "transfer",
    date: input.date,
    accountId: input.accountId,
    destinationId: input.destinationId,
    amount: toBase(s, input.sent, currency, exchangeRate),
    nativeAmount: input.sent,
    nativeDestinationAmount: input.received,
    destinationAmount: toBase(s, input.received, destination, destinationRate),
    exchangeRate,
    destinationRate,
    groupId: input.id,
    ...(input.businessMovement
      ? { businessMovement: input.businessMovement }
      : {}),
    ...(input.businessMovement &&
    s.accounts.find((a) => a.id === input.accountId)?.businessId
      ? {
          relatedId: s.accounts.find((a) => a.id === input.accountId)!
            .businessId,
        }
      : {}),
    ...(event ? { eventId: event.id, relatedId: event.sourceId } : {}),
    description: `Currency exchange: ${currency} to ${destination}`,
    category: "Currency exchange",
    subcategory: "",
    paymentMethod: "",
    recurringReference: "",
    notes: "",
  };
  if (base.amount === 0 || base.destinationAmount === 0)
    throw new Error("Exchange is below the supported monetary precision.");
  s.transactions.push(base);
  if (input.fee > 0)
    s.transactions.push({
      id: `${input.id}:fee`,
      type: "expense",
      date: input.date,
      accountId: input.accountId,
      amount: toBase(s, input.fee, currency, exchangeRate),
      nativeAmount: input.fee,
      exchangeRate,
      groupId: input.id,
      description: "Currency exchange fee",
      category: "Exchange fees",
      subcategory: "",
      paymentMethod: "",
      recurringReference: "",
      notes: "",
    });
}
interface RateResponse {
  result: string;
  base_code: string;
  time_last_update_unix: number;
  rates: Record<string, number>;
}
export async function fetchRates(
  base: State["settings"]["currency"],
): Promise<NonNullable<State["settings"]["exchange"]>["quotes"]> {
  const response = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      "Exchange-rate service unavailable. Cached/manual rates remain in use.",
    );
  const data = (await response.json()) as RateResponse;
  if (
    data.result !== "success" ||
    data.base_code !== base ||
    !Number.isFinite(data.time_last_update_unix) ||
    !data.rates ||
    data.rates[base] !== 1
  )
    throw new Error("Invalid exchange-rate response.");
  const asOf = new Date(data.time_last_update_unix * 1000)
    .toISOString()
    .slice(0, 10);
  if (asOf > today())
    throw new Error("Exchange-rate response is future-dated.");
  return currencies
    .filter((c) => c !== base)
    .map((currency) => {
      const value = data.rates[currency];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        throw new Error(`Invalid ${currency} exchange rate.`);
      const rate = (1 / value)
        .toFixed(12)
        .replace(/0+$/, "")
        .replace(/\.$/, "");
      fraction(rate);
      return { currency, rate, asOf, source: "automatic" as const };
    });
}

import { useEffect, useState } from "react";
import { useApp } from "./context";
import { currencies, currencySchema, today, uid } from "./domain";
import { formatMoney } from "./money";
import {
  accountCurrency,
  fetchRates,
  nativeBalances,
  postExchange,
  quote,
  rateFor,
  toBase,
} from "./currency";
import { Button, Card, InfoHelp, Table, errorMessage } from "./ui";

async function refresh(app: ReturnType<typeof useApp>) {
  const base = app.state.settings.currency;
  const quotes = await fetchRates(base);
  await app.mutate("Refresh public exchange rates", (s) => {
    if (s.settings.currency !== base)
      throw new Error("Base currency changed. Refresh rates again.");
    const current = s.settings.exchange ?? { automatic: false, quotes: [] };
    s.settings.exchange = {
      ...current,
      lastAttemptAt: new Date().toISOString(),
      quotes: [
        ...current.quotes.filter((q) => q.source === "manual"),
        ...quotes,
      ],
    };
  });
}
export function ExchangeRateSync() {
  const app = useApp();
  const [onlineRevision, setOnlineRevision] = useState(0);
  useEffect(() => {
    const online = () => setOnlineRevision((n) => n + 1);
    window.addEventListener("online", online);
    window.addEventListener("focus", online);
    const timer = window.setInterval(online, 60 * 60 * 1000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("focus", online);
      window.clearInterval(timer);
    };
  }, []);
  const enabled = app.state.settings.exchange?.automatic;
  const attempted = app.state.settings.exchange?.lastAttemptAt;
  const base = app.state.settings.currency;
  const { mutate, notify } = app;
  useEffect(() => {
    if (
      !enabled ||
      !navigator.onLine ||
      (attempted && Date.now() - Date.parse(attempted) < 24 * 60 * 60 * 1000)
    )
      return;
    let cancelled = false;
    const at = new Date().toISOString();
    void fetchRates(base)
      .then(async (quotes) => {
        if (cancelled) return;
        await mutate("Refresh automatic exchange rates", (s) => {
          if (s.settings.currency !== base || !s.settings.exchange?.automatic)
            return;
          s.settings.exchange = {
            ...s.settings.exchange,
            lastAttemptAt: at,
            quotes: [
              ...s.settings.exchange.quotes.filter(
                (q) => q.source === "manual",
              ),
              ...quotes,
            ],
          };
        });
      })
      .catch(async (error) => {
        if (cancelled) return;
        notify(errorMessage(error));
        await mutate(
          "Retain cached exchange rates after refresh failure",
          (s) => {
            if (s.settings.exchange?.automatic)
              s.settings.exchange.lastAttemptAt = at;
          },
        );
      })
      .catch((error) => {
        if (!cancelled) notify(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, onlineRevision, base, attempted, mutate, notify]);
  return null;
}
export function CurrencyRateNotice() {
  const s = useApp().state;
  const foreign = s.accounts.filter(
    (a) => (a.currency ?? s.settings.currency) !== s.settings.currency,
  );
  if (!foreign.length) return null;
  const stale = foreign.some((a) => {
    const current = quote(s, a.currency!);
    return (
      current && Date.parse(today()) - Date.parse(current.asOf) > 3 * 86400000
    );
  });
  return (
    <div>
      {stale && (
        <p className="notice warning">
          Exchange rates are over 3 days old. Valuations and forecasts use
          cached estimates; saved transactions are unchanged.
        </p>
      )}
      <small>
        Totals in {s.settings.currency}.
        <InfoHelp label="Currency valuation">
          Accounts retain their original currency. Totals use the latest
          cached/manual quotes; budgets, commitments and historical ledger
          reporting use the fixed base currency. These are indicative rates, not
          a bank execution quote. Actual exchanged amounts and fees are recorded
          separately.
        </InfoHelp>
        {s.settings.exchange?.quotes.some((q) => q.source === "automatic") && (
          <>
            {" "}
            /{" "}
            <a
              href="https://www.exchangerate-api.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Rates By Exchange Rate API
            </a>
          </>
        )}
      </small>
    </div>
  );
}
export function CurrencyWorkspace() {
  const app = useApp();
  const s = app.state;
  const [currency, setCurrency] = useState<(typeof currencies)[number]>(
    currencies.find((c) => c !== s.settings.currency)!,
  );
  const [rate, setRate] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const storedAutomatic = s.settings.exchange?.automatic ?? false;
  const [automatic, setAutomatic] = useState(storedAutomatic);
  useEffect(() => setAutomatic(storedAutomatic), [storedAutomatic]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function exchange() {
    const options = s.accounts.map((a) => ({
      value: a.id,
      label: `${a.name} (${a.currency ?? s.settings.currency})`,
    }));
    app.dialog({
      title: "Exchange currency",
      description:
        "Enter the amounts your provider actually sent and delivered, plus the fee charged to the source account. Quotes are for base-currency valuation, not a promised execution rate. No income is created by an exchange.",
      fields: [
        { key: "accountId", label: "Source account", type: "select", options },
        { key: "sent", label: "Amount sent (source currency)", type: "money" },
        {
          key: "destinationId",
          label: "Receiving account",
          type: "select",
          options,
        },
        {
          key: "received",
          label: "Amount received (receiving currency)",
          type: "money",
        },
        { key: "fee", label: "Exchange fee (source currency)", type: "money" },
        { key: "date", label: "Exchange date", type: "date" },
        {
          key: "businessMovement",
          label: "Cross-ownership movement (if applicable)",
          type: "select",
          required: false,
          options: [
            { value: "capital", label: "Business capital" },
            { value: "owner_distribution", label: "Owner distribution" },
          ],
        },
        {
          key: "eventId",
          label: "Expected business payout (optional)",
          type: "select",
          required: false,
          options: s.events
            .filter(
              (e) =>
                e.kind === "income" &&
                e.status !== "cancelled" &&
                s.incomes.find((i) => i.id === e.sourceId)?.businessId,
            )
            .map((e) => ({
              value: e.id,
              label: `${s.incomes.find((i) => i.id === e.sourceId)!.name} / ${e.due}`,
            })),
        },
      ],
      values: {
        id: uid(),
        accountId: s.accounts[0]?.id,
        destinationId: s.accounts[1]?.id ?? s.accounts[0]?.id,
        sent: 0,
        received: 0,
        fee: 0,
        date: today(),
      },
      context: (values) => {
        try {
          const source = String(values.accountId),
            destination = String(values.destinationId);
          return `Sent / fee: ${accountCurrency(s, source)}. Received: ${accountCurrency(s, destination)}. Available account balance: ${formatMoney(nativeBalances(s).get(source) ?? 0, accountCurrency(s, source))}. Quotes value the ledger in ${s.settings.currency}.`;
        } catch {
          return "Choose your source and receiving accounts.";
        }
      },
      submit: async (values) =>
        app.mutate("Record actual currency exchange", (state) =>
          postExchange(state, {
            id: String(values.id),
            accountId: String(values.accountId),
            destinationId: String(values.destinationId),
            sent: Number(values.sent),
            received: Number(values.received),
            fee: Number(values.fee),
            date: String(values.date),
            ...(values.businessMovement
              ? {
                  businessMovement: values.businessMovement as
                    "capital" | "owner_distribution",
                }
              : {}),
            ...(values.eventId ? { eventId: String(values.eventId) } : {}),
          }),
        ),
    });
  }
  return (
    <Card>
      <div className="card-head">
        <h3>
          Currencies & exchange
          <InfoHelp label="Currencies & exchange">
            Choose a currency on each account. Enter balances, ledger
            transactions and personal income expectations in that account's
            currency. Budgets and debt/bond planning forms use{" "}
            {s.settings.currency}. Automatic quotes request only your base
            currency from ExchangeRate-API—never balances, accounts or
            transactions. Daily cached quotes work offline. Manual quotes
            override automatic ones until cleared.
          </InfoHelp>
        </h3>
        <Button disabled={s.accounts.length < 2} onClick={exchange}>
          Exchange currency
        </Button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={automatic}
          disabled={busy}
          onChange={(e) => {
            const automatic = e.target.checked;
            setAutomatic(automatic);
            void run(() =>
              app
                .mutate("Set automatic exchange rates", (state) => {
                  state.settings.exchange = {
                    ...(state.settings.exchange ?? { quotes: [] }),
                    automatic,
                  };
                })
                .catch((error) => {
                  setAutomatic(storedAutomatic);
                  throw error;
                }),
            );
          }}
        />{" "}
        Enable automatic exchange rates
      </label>
      <Button
        secondary
        disabled={busy}
        onClick={() => void run(() => refresh(app))}
      >
        Refresh exchange rates
      </Button>
      <details>
        <summary>Manual / offline rate</summary>
        <label>
          Foreign currency
          <select
            aria-label="Manual rate currency"
            value={currency}
            onChange={(e) => setCurrency(currencySchema.parse(e.target.value))}
          >
            {currencies
              .filter((c) => c !== s.settings.currency)
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
        </label>
        <label>
          1 {currency} in {s.settings.currency}
          <input
            aria-label="Manual exchange rate"
            value={rate}
            inputMode="decimal"
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <label>
          Rate date
          <input
            aria-label="Exchange rate date"
            type="date"
            value={asOf}
            max={today()}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        <Button
          disabled={busy || !rate}
          onClick={() =>
            void run(() =>
              app.mutate("Set manual exchange rate", (state) => {
                if (asOf > today())
                  throw new Error("Rate date cannot be in the future.");
                toBase(state, 100, currency, rate);
                const current = state.settings.exchange ?? {
                  automatic: false,
                  quotes: [],
                };
                state.settings.exchange = {
                  ...current,
                  quotes: [
                    ...current.quotes.filter(
                      (q) =>
                        !(q.currency === currency && q.source === "manual"),
                    ),
                    {
                      currency,
                      rate,
                      asOf,
                      source: "manual",
                    },
                  ],
                };
              }),
            )
          }
        >
          Save manual rate
        </Button>
        <Button
          secondary
          disabled={
            busy ||
            !quote(s, currency) ||
            quote(s, currency)?.source !== "manual"
          }
          onClick={() =>
            void run(() =>
              app.mutate("Clear manual exchange-rate override", (state) => {
                state.settings.exchange!.quotes =
                  state.settings.exchange!.quotes.filter(
                    (q) => !(q.currency === currency && q.source === "manual"),
                  );
              }),
            )
          }
        >
          Use automatic quote instead
        </Button>
      </details>
      {(s.settings.exchange?.quotes.length ?? 0) > 0 && (
        <details>
          <summary>Saved exchange rates</summary>
          <Table
            headers={[
              "Currency",
              `1 unit in ${s.settings.currency}`,
              "As of",
              "Source",
            ]}
          >
            {currencies
              .filter((c) => c !== s.settings.currency && quote(s, c))
              .map((c) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{rateFor(s, c)}</td>
                  <td>{quote(s, c)!.asOf}</td>
                  <td>{quote(s, c)!.source}</td>
                </tr>
              ))}
          </Table>
          <small>
            Amounts and fees entered on exchanges are actuals. These quotes only
            determine base-currency valuation.
          </small>
          {s.settings.exchange?.quotes.some(
            (q) => q.source === "automatic",
          ) && (
            <small>
              <a
                href="https://www.exchangerate-api.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Rates By Exchange Rate API
              </a>
            </small>
          )}
        </details>
      )}
      {busy && <p role="status">Updating exchange rates...</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

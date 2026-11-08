import { useState } from "react";
import { useApp } from "./context";
import { today } from "./domain";
import { sum, formatMoney } from "./money";
import { inspectMmfCsv, importMmf, mmfIncome, type MmfProjection } from "./mmf";
import { Card, Metric, Button, InfoHelp, Table, errorMessage } from "./ui";
import { nativeEventRemaining } from "./currency";

export function MmfWorkspace({ forecastEnd }: { forecastEnd?: string }) {
  const app = useApp();
  const s = app.state;
  const income = mmfIncome(s);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<MmfProjection>();
  const [accountId, setAccountId] = useState(income?.accountId ?? "");
  const [currencyConfirmed, setCurrencyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const importCurrency =
    s.accounts.find((a) => a.id === accountId)?.currency ?? s.settings.currency;
  const currency = income?.mmfStudio?.currency ?? s.settings.currency;
  const fmt = (amount: number) => formatMoney(amount, currency);
  const rows = (income?.mmfStudio?.rows ?? []).filter(
    (row) => row.date >= today() && (!forecastEnd || row.date <= forecastEnd),
  );
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await app.mutate("Toggle projected MMF income", (s) => {
        const current = mmfIncome(s);
        if (!current) throw new Error("Import an MMF Studio projection first");
        current.active = !current.active;
      });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function load(file: File) {
    setBusy(true);
    setPreview(undefined);
    setCurrencyConfirmed(false);
    setError("");
    try {
      if (file.size > 1_000_000) throw new Error("MMF CSV is limited to 1 MB");
      setPreview(inspectMmfCsv(await file.text(), file.name));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || !currencyConfirmed) return;
    setBusy(true);
    setError("");
    try {
      await app.mutate("Import MMF Studio projection", (s) =>
        importMmf(s, preview, accountId),
      );
      setPreview(undefined);
      setImporting(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (forecastEnd && !income) return null;
  return (
    <Card>
      <div className="card-head">
        <h3>
          MMF Studio
          <InfoHelp label="MMF Studio">
            Use MMF Studio's Export monthly CSV. This imports its calculated
            net-interest figures, not accounts or transactions. No tax is
            deducted again. Only configured interest payouts affect the
            expected/optimistic cash forecast, never confirmed cash. Reinvested
            interest and projected assets stay separate. Re-export after
            changing rates or assumptions in MMF Studio.
          </InfoHelp>
        </h3>
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            aria-pressed={Boolean(income?.active)}
            disabled={busy || !income}
            onClick={() => void toggle()}
          >
            {income?.active ? "Disable MMF income" : "Enable MMF income"}
          </button>
          {!forecastEnd && (
            <Button
              secondary
              disabled={busy}
              onClick={() => setImporting(!importing)}
            >
              Import MMF Studio CSV
            </Button>
          )}
        </div>
      </div>
      <p>
        {income
          ? income.active
            ? "Projected MMF income enabled"
            : "Projected MMF income disabled"
          : "Import a monthly projection to get started."}
      </p>
      {income && (
        <>
          <small>
            Actual MMF receipts:{" "}
            {fmt(
              sum(
                s.transactions
                  .filter(
                    (t) => t.relatedId === income.id && t.type === "income",
                  )
                  .map((t) => t.nativeAmount ?? t.amount),
              ),
            )}
          </small>
          {income.active && (
            <>
              <div className="metrics">
                <Metric
                  label="Projected net interest earned"
                  value={fmt(sum(rows.map((row) => row.interest)))}
                  hint="Snapshot interest already net of configured tax; not available cash."
                />
                <Metric
                  label="Projected interest payouts"
                  value={fmt(
                    sum(
                      s.events
                        .filter(
                          (e) =>
                            e.sourceId === income.id &&
                            e.status === "expected" &&
                            e.due >= today() &&
                            (!forecastEnd || e.due <= forecastEnd),
                        )
                        .map((e) => nativeEventRemaining(s, e)),
                    ),
                  )}
                  hint="Only unpaid configured payouts enter the cash forecast; receipts are recorded separately."
                />
                <Metric
                  label="Projected reinvested interest"
                  value={fmt(sum(rows.map((row) => row.reinvested)))}
                  hint="Investment growth, not spendable income or external deposits."
                />
                <Metric
                  label="Projected fund assets (not cash)"
                  value={fmt(rows.at(-1)?.assets ?? 0)}
                  hint="From MMF Studio, not added to Pennywise accounts or available balances."
                />
              </div>
              <small>
                {rows.length
                  ? `${rows[0].date} - ${rows.at(-1)!.date}`
                  : "No imported projections in this period."}
              </small>
              {!forecastEnd && (
                <details>
                  <summary>Imported MMF projections</summary>
                  <p>
                    {income.mmfStudio!.filename} / imported{" "}
                    {income.mmfStudio!.importedAt}
                  </p>
                  <Table
                    headers={[
                      "Month",
                      "Net interest",
                      "Credited",
                      "Paid out",
                      "Reinvested",
                      "Fees",
                    ]}
                  >
                    {income.mmfStudio!.rows.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{fmt(row.interest)}</td>
                        <td>{fmt(row.credited)}</td>
                        <td>{fmt(row.payout)}</td>
                        <td>{fmt(row.reinvested)}</td>
                        <td>{fmt(row.fees)}</td>
                      </tr>
                    ))}
                  </Table>
                </details>
              )}
            </>
          )}
        </>
      )}
      {importing && !forecastEnd && (
        <>
          <label>
            MMF Studio monthly CSV
            <input
              aria-label="MMF Studio monthly CSV"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void load(file);
              }}
            />
          </label>
          {preview && (
            <>
              <p>
                {preview.rows.length} months / {preview.rows[0].date} -{" "}
                {preview.rows.at(-1)!.date}
              </p>
              <p className="notice warning">
                This replaces the previous MMF projection, not your ledger.
                Confirmed receipts and their payment events are preserved. CSV
                exports do not identify their currency.
              </p>
              <label>
                Receiving account for actual payouts
                <select
                  aria-label="MMF receiving account"
                  value={accountId}
                  disabled={busy}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setCurrencyConfirmed(false);
                  }}
                >
                  <option value="">Choose an account</option>
                  {s.accounts
                    .filter(
                      (account) =>
                        !account.businessId && account.kind !== "investment",
                    )
                    .map((account) => (
                      <option value={account.id} key={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={currencyConfirmed}
                  disabled={busy}
                  onChange={(event) =>
                    setCurrencyConfirmed(event.target.checked)
                  }
                />
                I confirm these MMF amounts are in {importCurrency}
              </label>
              <Button
                disabled={busy || !accountId || !currencyConfirmed}
                onClick={() => void confirm()}
              >
                Confirm MMF import
              </Button>
            </>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Working locally...</p>}
    </Card>
  );
}

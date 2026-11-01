import { useState } from "react";
import { Download, Upload, ShieldCheck, Database } from "lucide-react";
import { useApp } from "./context";
import {
  today,
  initialState,
  transactionTypes,
  type State,
  type Transaction,
} from "./domain";
import { formatMoney, sum } from "./money";
import { reports } from "./reports";
import { summary, accountBalance } from "./engine";
import { editRecord } from "./forms";
import { download } from "./storage";
import { decodeBackup, encryptBackup, fullBackup } from "./backup";
import { backupFilename } from "./pages-backup";
import { demoState } from "./demo";
import {
  parseCsv,
  previewStatement,
  commitStatement,
  transactionsCsv,
  type ColumnMapping,
  type ImportRow,
} from "./import";
import { AccountsPage } from "./pages-records";
import {
  PageHead,
  Card,
  Metric,
  Button,
  AddButton,
  Badge,
  Table,
  BarChart,
  LineChart,
  errorMessage,
} from "./ui";

export function ReportsPage() {
  const app = useApp();
  const s = app.state;
  const fmt = (n: number) => formatMoney(n, s.settings.currency);
  const [start, setStart] = useState(today().slice(0, 4) + "-01-01");
  const [end, setEnd] = useState(today());
  const report = reports(s, start, end);
  const actual = summary(s);
  return (
    <>
      <PageHead
        title="Reports & insight"
        subtitle="Actual ledger records in your selected period. Current balance snapshots are labeled separately."
        action={
          <Button secondary onClick={() => window.print()}>
            Print / save PDF
          </Button>
        }
      />
      <div className="toolbar no-print">
        <label>
          From
          <input
            aria-label="Reports from"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Reports to"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <Button
          secondary
          onClick={() =>
            download(
              `pennywise-transactions-${start}-${end}.csv`,
              transactionsCsv(s, start, end),
              "text/csv;charset=utf-8",
            )
          }
        >
          <Download size={16} />
          Export CSV
        </Button>
      </div>
      {start > end && (
        <p className="error">Start date must precede end date.</p>
      )}
      <p>
        Actual period: {start} - {end}
      </p>
      <div className="metrics">
        <Metric
          label="Earned / distributed income"
          value={fmt(report.income)}
        />
        <Metric label="Expenses" value={fmt(report.expense)} />
        <Metric
          label="Loan principal recoveries"
          value={fmt(report.recoveries)}
          hint="Not new earned income"
        />
        <Metric
          label="Business / debt repayments"
          value={fmt(report.repayments)}
        />
      </div>
      <div className="grid two">
        <BarChart
          title="Expense categories"
          data={report.spending}
          format={fmt}
        />
        <BarChart
          title="Income sources"
          data={report.incomeSources}
          format={fmt}
        />
      </div>
      <div className="grid two">
        <BarChart
          title="Monthly financial trends"
          data={report.monthly.map((m) => ({
            name: m.month,
            amount: m.income,
            secondary: m.expense,
          }))}
          format={fmt}
        />
        <LineChart
          title="Actual month-end liquid cash"
          lines={[
            {
              name: "Liquid cash",
              values: report.monthly.map((m) => m.cash),
              color: "#159f83",
            },
          ]}
        />
      </div>
      <div className="metrics">
        <Metric
          label="Bond coupon receipts (period)"
          value={fmt(report.coupons)}
        />
        <Metric
          label="Emergency reserves (current)"
          value={fmt(actual.emergency)}
        />
        <Metric label="Liabilities (current)" value={fmt(actual.liabilities)} />
        <Metric label="Receivables (current)" value={fmt(actual.receivables)} />
      </div>
      <Card>
        <h3>Reserve progress / current balances</h3>
        <Table headers={["Reserve", "Funded", "Target"]}>
          {report.reserves.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{fmt(r.amount)}</td>
              <td>{fmt(r.target)}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <LineChart
        title="Actual reserve contribution trend"
        lines={[
          {
            name: "Recorded reserve balance",
            values: report.monthly.map((m) =>
              sum(
                s.transactions
                  .filter(
                    (t) =>
                      t.type === "reserve_transfer" &&
                      t.date <= `${m.month}-31`,
                  )
                  .map((t) => t.amount),
              ),
            ),
            color: "#5c84ce",
          },
        ]}
      />
      <Card>
        <h3>Ledger supporting this report</h3>
        <Table headers={["Date", "Description", "Type", "Amount"]}>
          {report.transactions.map((t) => (
            <tr key={t.id}>
              <td>{t.date}</td>
              <td>{t.description}</td>
              <td>{t.type}</td>
              <td>{fmt(t.amount)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
export function StatementImport() {
  const app = useApp();
  const s = app.state;
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: 0,
    description: 1,
    debit: 2,
    credit: 3,
    balance: -1,
    category: "Uncategorised",
    dateFormat: "ISO",
  });
  const [account, setAccount] = useState(s.accounts[0]?.id || "");
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  async function load(file: File) {
    try {
      if (file.size > 10_000_000) throw new Error("CSV limit is 10 MB");
      setRows(parseCsv(await file.text()));
      setPreview([]);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function generate() {
    try {
      setPreview(previewStatement(s, rows, mapping, account));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function change(index: number, apply: (row: ImportRow) => void) {
    setPreview((previous) =>
      previous.map((r, i) => {
        if (i !== index) return r;
        const copy = structuredClone(r);
        apply(copy);
        return copy;
      }),
    );
  }
  const selected = preview.filter((r) => r.selected && r.transaction);
  const projected =
    account && s.accounts.some((a) => a.id === account)
      ? sum([
          accountBalance(s, account),
          ...selected.map((r) =>
            r.transaction!.type === "expense" ||
            [
              "loan_disbursement",
              "liability_repayment",
              "transfer",
              "debt_repayment",
            ].includes(r.transaction!.type)
              ? -r.transaction!.amount
              : r.transaction!.amount,
          ),
        ])
      : 0;
  return (
    <Card className="no-print">
      <div className="card-head">
        <h3>
          <Upload size={19} />
          Bank statement import
        </h3>
        <Badge>Local CSV only</Badge>
      </div>
      <p>
        Preview, map columns, classify ambiguous credits, then approve.
        Transfers, borrowed business money and loan recoveries must not be
        imported as earned income. Matching is conservative: exact duplicates
        are blocked.
      </p>
      <label>
        Statement CSV
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
          }}
        />
      </label>
      {rows.length > 0 && (
        <>
          <div className="form-grid">
            <label>
              Receiving / statement account
              <select
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setPreview([]);
                }}
              >
                {s.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              ["date", "description", "debit", "credit", "balance"] as const
            ).map((key) => (
              <label key={key}>
                {key} column
                <select
                  aria-label={`${key} column`}
                  value={mapping[key]}
                  onChange={(e) => {
                    setMapping({ ...mapping, [key]: Number(e.target.value) });
                    setPreview([]);
                  }}
                >
                  <option value={-1}>Not present</option>
                  {rows[0].map((name, i) => (
                    <option key={i} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Date format
              <select
                value={mapping.dateFormat}
                onChange={(e) => {
                  setMapping({
                    ...mapping,
                    dateFormat: e.target.value as ColumnMapping["dateFormat"],
                  });
                  setPreview([]);
                }}
              >
                <option>ISO</option>
                <option>DMY</option>
                <option>MDY</option>
              </select>
            </label>
            <label>
              Default category
              <input
                value={mapping.category}
                onChange={(e) => {
                  setMapping({ ...mapping, category: e.target.value });
                  setPreview([]);
                }}
              />
            </label>
          </div>
          <Button secondary onClick={generate}>
            Preview import
          </Button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview.length > 0 && (
        <>
          <Table
            headers={[
              "Include",
              "Date / description",
              "Amount / balance",
              "Review",
              "Classification",
              "Related / destination",
            ]}
          >
            {preview.map((r, i) => (
              <tr key={r.row}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Include row ${r.row}`}
                    checked={r.selected}
                    disabled={Boolean(r.error || r.duplicate)}
                    onChange={(e) =>
                      change(i, (r) => {
                        r.selected = e.target.checked;
                      })
                    }
                  />
                </td>
                <td>
                  {r.transaction?.date}
                  <small>{r.transaction?.description || `Row ${r.row}`}</small>
                </td>
                <td>
                  {r.transaction &&
                    formatMoney(r.transaction.amount, s.settings.currency)}
                  {r.balance !== undefined && (
                    <small>
                      Statement balance:{" "}
                      {formatMoney(r.balance, s.settings.currency)}
                    </small>
                  )}
                </td>
                <td>
                  {r.error ? (
                    <span className="error">{r.error}</span>
                  ) : (
                    <Badge warning={r.uncertain}>
                      {r.duplicate
                        ? "duplicate"
                        : r.uncertain
                          ? "manual review required"
                          : "ready"}
                    </Badge>
                  )}
                </td>
                <td>
                  {r.transaction && (
                    <>
                      <select
                        aria-label={`Classify row ${r.row}`}
                        value={r.transaction.type}
                        onChange={(e) =>
                          change(i, (r) => {
                            r.transaction!.type = e.target
                              .value as Transaction["type"];
                            delete r.transaction!.relatedId;
                          })
                        }
                      >
                        {transactionTypes
                          .filter(
                            (t) =>
                              ![
                                "reserve_transfer",
                                "bond_maturity",
                                "adjustment",
                              ].includes(t),
                          )
                          .map((t) => (
                            <option key={t} value={t}>
                              {t.replaceAll("_", " ")}
                            </option>
                          ))}
                      </select>
                      <input
                        aria-label={`Category row ${r.row}`}
                        value={r.transaction.category}
                        onChange={(e) =>
                          change(i, (r) => {
                            r.transaction!.category = e.target.value;
                          })
                        }
                      />
                    </>
                  )}
                </td>
                <td>
                  {r.transaction &&
                    (r.transaction.type === "transfer" ? (
                      <select
                        aria-label={`Destination row ${r.row}`}
                        value={r.transaction.destinationId || ""}
                        onChange={(e) =>
                          change(i, (r) => {
                            r.transaction!.destinationId = e.target.value;
                          })
                        }
                      >
                        <option value="">Choose destination</option>
                        {s.accounts
                          .filter((a) => a.id !== account)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <select
                        aria-label={`Related record row ${r.row}`}
                        value={r.transaction.relatedId || ""}
                        onChange={(e) =>
                          change(i, (r) => {
                            if (e.target.value)
                              r.transaction!.relatedId = e.target.value;
                            else delete r.transaction!.relatedId;
                          })
                        }
                      >
                        <option value="">No linked record</option>
                        {[
                          ...s.incomes,
                          ...s.liabilities,
                          ...s.receivables,
                          ...s.necessities,
                        ].map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ))}
                </td>
              </tr>
            ))}
          </Table>
          <p>
            Selected: {selected.length}. Projected statement-account balance
            after selected entries:{" "}
            <strong>{formatMoney(projected, s.settings.currency)}</strong>.
          </p>
          <p className="notice">
            Compare this balance with the bank statement, including opening
            balances and omitted rows. Same-date / same-amount entries with
            different descriptions may still be duplicates; reconcile them
            manually. Link repayments to obligations. Future dates and invalid
            debit/credit combinations are rejected.
          </p>
          <Button
            disabled={!selected.length}
            onClick={() =>
              app.confirm(
                "Import approved statement rows?",
                "Only checked rows will be imported. Duplicate detection runs again inside the database transaction; all rows save together or none do.",
                async () => {
                  await app.mutate("Import reviewed CSV statement", (s) =>
                    commitStatement(s, preview),
                  );
                  setPreview([]);
                  setRows([]);
                },
              )
            }
          >
            Import selected rows
          </Button>
        </>
      )}
    </Card>
  );
}
export function SettingsPage() {
  const app = useApp();
  const s = app.state;
  const [password, setPassword] = useState("");
  const [restore, setRestore] = useState<State>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function backup(encrypted: boolean) {
    setBusy(true);
    setError("");
    try {
      const snapshot = await app.repo.read();
      download(
        backupFilename().replace(
          ".json",
          encrypted ? ".encrypted.json" : ".json",
        ),
        encrypted
          ? await encryptBackup(snapshot, password)
          : await fullBackup(snapshot),
      );
      setPassword("");
      app.notify("Backup exported. Keep it in a private, safe location.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function importBackup(file: File) {
    setError("");
    setBusy(true);
    setRestore(undefined);
    try {
      if (file.size > 50_000_000) throw new Error("Backup limit is 50 MB");
      setRestore(await decodeBackup(await file.text(), password));
      setPassword("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Private by design"
        subtitle="Your financial data stays on this device. Keep independent backups before resetting or changing browsers."
      />
      <Card>
        <div className="card-head">
          <h3>
            <ShieldCheck size={19} />
            Privacy & local storage
          </h3>
          <Badge>Offline-first</Badge>
        </div>
        <p>
          No bank credentials, analytics, cloud sync, external AI or
          financial-data network requests. Core data lives in IndexedDB in this
          browser profile. Local data is not application-encrypted at rest:
          protect your device and browser profile. Private browsing, clearing
          site data or storage eviction can erase records.
        </p>
        <Button
          secondary
          onClick={() => {
            void (async () => {
              try {
                const granted = await navigator.storage?.persist?.();
                app.notify(
                  granted
                    ? "Persistent storage granted by your browser"
                    : "Persistence was not granted. Continue making backups.",
                );
              } catch {
                app.notify(
                  "Storage persistence is unavailable in this browser",
                );
              }
            })();
          }}
        >
          <Database size={16} />
          Request persistent storage
        </Button>
      </Card>
      <div className="grid two">
        <Card>
          <h3>Preferences</h3>
          <label>
            Currency
            <select
              aria-label="Currency"
              value={s.settings.currency}
              onChange={(e) =>
                void app.mutate("Set currency", (s) => {
                  if (
                    s.accounts.length ||
                    s.transactions.length ||
                    s.bonds.length
                  )
                    throw new Error(
                      "Currency cannot change after financial records exist; no exchange conversion is implemented",
                    );
                  s.settings.currency = e.target
                    .value as State["settings"]["currency"];
                })
              }
            >
              {["KES", "USD", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Theme
            <select
              aria-label="Theme"
              value={s.settings.theme}
              onChange={(e) =>
                void app.mutate("Change theme", (s) => {
                  s.settings.theme = e.target.value as "light" | "dark";
                })
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Allowance horizon when no confirmed payment is scheduled
            <input
              type="number"
              min={1}
              max={730}
              defaultValue={s.settings.allowanceDays}
              onBlur={(e) => {
                const days = Number(e.target.value);
                if (days !== s.settings.allowanceDays)
                  void app.mutate("Set allowance horizon", (s) => {
                    s.settings.allowanceDays = days;
                  });
              }}
            />
          </label>
          <p>
            Locale en-KE / timezone Africa/Nairobi. All accounts use one
            configured currency; no implicit currency conversion.
          </p>
        </Card>
        <Card>
          <h3>Backup & restore</h3>
          <p>
            JSON includes all records and receipts. Unencrypted exports contain
            private financial information. Encrypted backups use
            password-derived AES-256-GCM through browser Web Crypto; passphrases
            are never persisted.
          </p>
          <label>
            Backup / restore passphrase (12+ characters)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="actions">
            <Button
              secondary
              disabled={busy}
              onClick={() => void backup(false)}
            >
              <Download size={16} />
              Export JSON
            </Button>
            <Button disabled={busy} onClick={() => void backup(true)}>
              Encrypted backup
            </Button>
          </div>
          <label>
            Restore JSON backup
            <input
              aria-label="Restore backup"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
                e.target.value = "";
              }}
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {restore && (
            <div className="notice">
              <strong>Validated restore preview</strong>
              <p>
                {restore.accounts.length} accounts /{" "}
                {restore.transactions.length} transactions /{" "}
                {restore.bonds.length} bonds. Currency{" "}
                {restore.settings.currency}.{" "}
                {restore.settings.demo ? "DEMONSTRATION DATA" : "Personal data"}
              </p>
              <Button
                onClick={() =>
                  app.confirm(
                    "Replace current financial records?",
                    "Export a backup first. This replaces, not merges, current records. IDs, amounts and references have been validated.",
                    async () => {
                      const data = restore;
                      download(
                        backupFilename(true),
                        await fullBackup(await app.repo.read()),
                      );
                      await app.mutate("Restore validated backup", (s) => {
                        const audit = s.audit;
                        Object.assign(s, structuredClone(data));
                        s.audit = [
                          ...audit,
                          ...data.audit.filter(
                            (r) => !audit.some((a) => a.id === r.id),
                          ),
                        ];
                      });
                      setRestore(undefined);
                    },
                  )
                }
              >
                Confirm restore
              </Button>
            </div>
          )}
          <small>
            Lost passphrases cannot be recovered. Test a backup before relying
            on it.
          </small>
        </Card>
      </div>
      <AccountsPage />
      <StatementImport />
      <Card>
        <h3>Progressive setup</h3>
        <p>
          Configure accounts and opening balances, then obligations,
          receivables, bonds, essential bills and budget limits at your own
          pace.
        </p>
        <div className="actions">
          <AddButton onClick={() => editRecord(app, "accounts")}>
            Add account
          </AddButton>
          <Button secondary onClick={() => app.navigate("income")}>
            Income
          </Button>
          <Button secondary onClick={() => app.navigate("obligations")}>
            Commitments
          </Button>
          <Button secondary onClick={() => app.navigate("budgets")}>
            Budget modes
          </Button>
        </div>
      </Card>
      <Card>
        <h3>Install & updates</h3>
        <p>
          Open the HTTPS deployment in Android Chrome, then use the browser
          menu's Install app / Add to Home screen option. Visit once online and
          wait for the offline-ready notice. Updates are offered with a reload
          button; no financial records are erased by application-shell updates.
        </p>
        <small>
          localhost works for development. Production service workers require
          HTTPS. Clearing site data removes both offline cache and financial
          records.
        </small>
      </Card>
      <Card>
        <h3>Local change history</h3>
        <p>
          Revision history is for traceability, not a tamper-proof accounting
          audit or an undo system. Restore backups to recover old records.
        </p>
        <Table headers={["Revision", "Time", "Action", "Changed records"]}>
          {s.audit
            .slice(-30)
            .reverse()
            .map((a) => (
              <tr key={a.id}>
                <td>{a.revision}</td>
                <td>{a.at}</td>
                <td>{a.action}</td>
                <td>
                  <details>
                    <summary>Inspect changes</summary>
                    <pre>{a.before}</pre>
                    <pre>{a.after}</pre>
                  </details>
                </td>
              </tr>
            ))}
        </Table>
      </Card>
      <Card className="danger-zone">
        <h3>Demonstration & reset</h3>
        <p>
          Demonstration amounts, rates and dates are fictional and visibly
          labeled. Never mix demonstration data with personal records.
        </p>
        <div className="actions">
          <Button
            secondary
            disabled={s.accounts.length > 0 || s.transactions.length > 0}
            onClick={() =>
              app.confirm(
                "Load fictional demonstration data?",
                "Use this only in an empty database. Reset and remove the demo before recording personal information.",
                async () =>
                  app.mutate("Load labeled fictional demonstration", (s) =>
                    Object.assign(s, demoState()),
                  ),
              )
            }
          >
            Load demonstration
          </Button>
          <Button
            secondary
            onClick={() =>
              app.dialog({
                title: s.settings.demo
                  ? "Remove all demonstration data"
                  : "Reset all financial data",
                description:
                  "Export a backup first. This deletes all records in this app's database. Type RESET to confirm.",
                fields: [{ key: "confirmation", label: "Type RESET" }],
                values: { confirmation: "" },
                submitLabel: "Reset permanently",
                submit: async (v) => {
                  if (v.confirmation !== "RESET")
                    throw new Error("Type RESET exactly");
                  download(
                    backupFilename(true),
                    await fullBackup(await app.repo.read()),
                  );
                  await app.mutate("Reset confirmed by user", (s) =>
                    Object.assign(s, initialState()),
                  );
                },
              })
            }
          >
            {s.settings.demo ? "Remove demo data" : "Reset data"}
          </Button>
        </div>
      </Card>
    </>
  );
}

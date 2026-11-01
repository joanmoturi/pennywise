import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { useApp } from "./context";
import { today } from "./domain";
import {
  fullBackup,
  encryptBackup,
  inspectBackup,
  APP_VERSION,
  type BackupPreview,
} from "./backup";
import { download } from "./storage";
import { backupReminder } from "./expense-engine";
import { csvCell, transactionsCsv } from "./import";
import { reports } from "./reports";
import { monthlyReview } from "./expense-engine";
import { outstanding } from "./engine";
import { decimal } from "./money";
import { PageHead, Card, Button, Badge, Table, errorMessage } from "./ui";

export function backupFilename(safety = false): string {
  return `Pennywise-${safety ? "SAFETY-" : "Full-Backup-"}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}
export function BackupCentre() {
  const app = useApp();
  const s = app.state;
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<BackupPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasons = backupReminder(s);
  async function save(encrypted = false) {
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
      await app.mutate("Record full backup download initiation", (s) => {
        s.settings.lastBackupAt = new Date().toISOString();
        s.settings.lastBackupTransactionCount = s.transactions.length;
        s.settings.lastBackupAppVersion = APP_VERSION;
      });
      app.notify(
        "Full backup download initiated. Verify the file exists and keep it off this device.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function load(file: File) {
    setBusy(true);
    setError("");
    setPreview(undefined);
    try {
      if (file.size > 50_000_000) throw new Error("Backup limit is 50 MB");
      setPreview(await inspectBackup(await file.text(), password));
      setPassword("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function restore() {
    if (!preview) return;
    app.confirm(
      "Replace the entire database with this backup?",
      "A safety backup of your current data will be downloaded first and retained transactionally on this device. Keep the downloaded file. All restored records are validated and saved atomically; failure leaves your current database unchanged.",
      async () => {
        const current = await app.repo.read();
        download(backupFilename(true), await fullBackup(current));
        await app.mutate(
          "Restore full validated backup with safety snapshot",
          (s) => {
            const audit = s.audit;
            Object.assign(s, structuredClone(preview.state));
            s.audit = [
              ...audit,
              ...preview.state.audit.filter(
                (r) => !audit.some((a) => a.id === r.id),
              ),
            ];
          },
        );
        setPreview(undefined);
      },
    );
  }
  function exportCsv(kind: string) {
    const start = "0001-01-01";
    const end = today();
    if (["transactions", "income", "expenses"].includes(kind)) {
      const filtered =
        kind === "transactions"
          ? s
          : {
              ...s,
              transactions: s.transactions.filter(
                (t) => t.type === (kind === "income" ? "income" : "expense"),
              ),
            };
      download(
        `Pennywise-${kind}-${today()}.csv`,
        transactionsCsv(filtered, start, end),
        "text/csv",
      );
    } else {
      const rows =
        kind === "budgets"
          ? [
              [
                "profile",
                "start",
                "end",
                "planned",
                "recognized_expenses",
                "saved",
                "carried",
              ],
              ...s.budgets.map((b) => {
                const r = monthlyReview(s, b).snapshot;
                return [
                  b.name,
                  b.start,
                  b.end,
                  decimal(r.planned),
                  decimal(r.actual),
                  decimal(r.saved),
                  decimal(r.carried),
                ];
              }),
            ]
          : [
              ["creditor", "original_principal", "outstanding", "due"],
              ...s.liabilities.map((l) => [
                l.name,
                decimal(l.principal),
                decimal(outstanding(s, l.id, "liability")),
                l.due,
              ]),
            ];
      download(
        `Pennywise-${kind}-${today()}.csv`,
        rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
        "text/csv",
      );
    }
  }
  return (
    <>
      <PageHead
        title="Backup Centre"
        subtitle="A portable copy of your entire financial workspace, not just the current dashboard."
        action={
          <Button disabled={busy} onClick={() => void save()}>
            <Download size={17} />
            Download Full Backup
          </Button>
        }
      />
      <Card>
        <div className="card-head">
          <h3>
            <ShieldCheck size={19} />
            Backup status
          </h3>
          <Badge warning={reasons.length > 0}>
            {reasons.length ? "Backup recommended" : "Recent export initiated"}
          </Badge>
        </div>
        <p>
          Last full backup export initiated:{" "}
          {s.settings.lastBackupAt || "Never"}. Verify downloads yourself;
          browsers cannot prove that a file was saved safely. App version{" "}
          {APP_VERSION} / financial schema v{s.version}.
        </p>
        {reasons.map((reason) => (
          <p key={reason} className="notice warning">
            {reason}
          </p>
        ))}
        <p>
          Backups preserve accounts, transactions, receipts, income histories,
          all budgets and review snapshots, savings decisions, recurring
          definitions and occurrences, occasional plans, prepaids, bonds and
          coupons, liabilities, receivables, reserves, windfalls, scenarios,
          settings, IDs and relationships.
        </p>
        <p>
          Reminders run when the app is opened or data changes. There are no
          claimed unattended background backups. Move a downloaded backup to a
          separate device or private storage; IndexedDB alone cannot survive
          clearing site data or device loss.
        </p>
      </Card>
      <div className="grid two">
        <Card>
          <h3>Portable full backup</h3>
          <label>
            Optional encryption passphrase (12+ characters)
            <input
              aria-label="Backup passphrase"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="actions">
            <Button disabled={busy} onClick={() => void save()}>
              Download Full Backup
            </Button>
            <Button secondary disabled={busy} onClick={() => void save(true)}>
              Download Encrypted Backup
            </Button>
          </div>
          <p>
            Unencrypted JSON contains sensitive financial records and Base64
            receipts. Encrypted backups use PBKDF2-SHA-256 (600,000 iterations),
            a fresh salt and AES-256-GCM with a fresh IV. No passwords are
            stored. Losing the password may make the backup unrecoverable.
          </p>
          <small>
            Full backup envelopes include schema/app versions, timestamp and a
            SHA-256 digest over canonical metadata and data. The digest detects
            corruption, not malicious alteration by someone who can recompute
            it. Encrypted files additionally provide authenticated encryption.
          </small>
        </Card>
        <Card>
          <h3>Restore on this or another device</h3>
          <label>
            Full backup file
            <input
              aria-label="Full backup file"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void load(file);
                e.target.value = "";
              }}
            />
          </label>
          <p>
            For encrypted files, enter the passphrase before choosing the file.
            Compatible legacy v1/v2 raw backups can be migrated; they lack
            integrity metadata and are explicitly labeled.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {preview && (
            <>
              <h4>Restore preview</h4>
              <p>
                Backup date: {preview.createdAt}
                <br />
                Application: {preview.appVersion}
                <br />
                Integrity:{" "}
                {preview.integrityVerified
                  ? "verified"
                  : "legacy / unavailable"}
              </p>
              <Table headers={["Record type", "Count"]}>
                {[
                  ["Accounts", preview.state.accounts.length],
                  [
                    "Transactions / income history",
                    preview.state.transactions.length,
                  ],
                  ["Budget profiles and periods", preview.state.budgets.length],
                  ["Income sources", preview.state.incomes.length],
                  ["Recurring definitions", preview.state.recurring.length],
                  ["Generated occurrences", preview.state.occurrences.length],
                  ["Bonds", preview.state.bonds.length],
                  ["Liabilities", preview.state.liabilities.length],
                  [
                    "Other financial records",
                    preview.state.receivables.length +
                      preview.state.reserves.length +
                      preview.state.prepaids.length +
                      preview.state.occasional.length +
                      preview.state.captures.length +
                      preview.state.reviews.length +
                      preview.state.events.length +
                      preview.state.rules.length +
                      preview.state.scenarios.length,
                  ],
                  [
                    "Stored receipts",
                    preview.state.transactions.filter((t) => t.receipt).length,
                  ],
                ].map(([label, count]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </Table>
              <p>
                {preview.state.settings.demo
                  ? "DEMONSTRATION DATA"
                  : "Personal financial records"}{" "}
                / currency {preview.state.settings.currency}
              </p>
              <Button onClick={restore}>Restore Entire Database</Button>
            </>
          )}
          <Button
            secondary
            onClick={() => {
              void (async () => {
                try {
                  const safety = await app.repo.safetyBackup();
                  if (!safety)
                    throw new Error("No local safety snapshot exists yet");
                  setPreview({
                    state: safety,
                    createdAt: "Local pre-destructive safety snapshot",
                    appVersion: APP_VERSION,
                    integrityVerified: false,
                  });
                } catch (e) {
                  setError(errorMessage(e));
                }
              })();
            }}
          >
            Preview local safety snapshot
          </Button>
        </Card>
      </div>
      <Card>
        <h3>Reminder preferences</h3>
        <div className="form-grid">
          <label>
            Days without a full backup
            <input
              type="number"
              min={1}
              max={365}
              defaultValue={s.settings.backupDays}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (n !== s.settings.backupDays)
                  void app.mutate("Change backup reminder days", (s) => {
                    s.settings.backupDays = n;
                  });
              }}
            />
          </label>
          <label>
            New ledger entries before reminder
            <input
              type="number"
              min={1}
              max={10000}
              defaultValue={s.settings.backupTransactions}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (n !== s.settings.backupTransactions)
                  void app.mutate("Change backup transaction reminder", (s) => {
                    s.settings.backupTransactions = n;
                  });
              }}
            />
          </label>
        </div>
      </Card>
      <Card>
        <h3>CSV reporting exports / not restorable backups</h3>
        <div className="actions">
          {["transactions", "income", "expenses", "budgets", "liabilities"].map(
            (kind) => (
              <Button secondary key={kind} onClick={() => exportCsv(kind)}>
                Export {kind} CSV
              </Button>
            ),
          )}
        </div>
        <p>
          CSV is for reporting and manual statement workflows. Only full JSON or
          encrypted JSON can restore the entire application.
        </p>
        <small>
          Actual report rows:{" "}
          {reports(s, "0001-01-01", today()).transactions.length}
        </small>
      </Card>
    </>
  );
}

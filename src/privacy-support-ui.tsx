import { useState } from "react";
import { useApp } from "./context";
import { collectSupportReport, type SupportReport } from "./support-report";
import { download } from "./storage";
import { Button, Card } from "./ui";

export function PrivacySupportPanel() {
  const app = useApp();
  const [report, setReport] = useState<SupportReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function prepare() {
    if (busy) return;
    setBusy(true);
    setError("");
    setReport(undefined);
    try {
      setReport(await collectSupportReport());
    } catch {
      setError(
        "The technical report could not be prepared. Your records are unchanged. You can describe the problem without sharing a backup, passphrase or account details.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Privacy and support">
      <Card>
        <h3>Privacy & support</h3>
        <p>
          Core financial records stay in this browser profile unless you export
          them or explicitly enable encrypted cloud features. Google Drive
          backups and cross-device sync are separate, optional services.
          Encrypted snapshots are sent to the chosen service only after you
          connect and authorize it. Google receives authentication and service
          metadata; encryption does not hide all service usage.
        </p>
        <p>
          Pasted expense notes are parsed on this device without AI or SMS
          access. The website does not read SMS. Optional bond lookup requests
          public issue details, not your personal holding amounts or account
          notes. Pennywise does not add advertising or analytics trackers.
        </p>
        <details>
          <summary>Recovery, sign-out and deletion</summary>
          <p>
            Local records are not application-encrypted at rest. Lock Sync
            protects its in-memory encryption session, not this device's
            readable local ledger. Sign-out, disconnect and uninstall are not
            safe ways to erase or recover records. Protect your device and use
            separate browser profiles on shared devices.
          </p>
          <p>
            Keep a full backup away from this device and test restoring it in a
            separate browser profile. A download starting does not prove a file
            was saved. Keep passphrases separately: Google account recovery
            cannot reset your sync passphrase. Drive's separate recovery key
            works only for backups created with that key.
          </p>
          <p>
            Pausing sync does not delete cloud snapshots or Drive backups. Drive
            backup history has an explicit per-version delete action.
            Customer-controlled cloud sync deletion is not available yet.
            Settings reset affects local records; it does not delete cloud
            copies. Do not reset, clear site data or uninstall to troubleshoot.
          </p>
        </details>
        <details>
          <summary>Connection and saving help</summary>
          <p>
            If Google cannot open, allow Pennywise popups and try again. If
            needed, use the same Pennywise address in a normal browser without
            clearing data; installed-app and browser storage can differ, so an
            empty workspace is not proof your records were deleted. Reconnect
            the same Google account used for that cloud feature.
          </p>
          <p>
            Sync runs while the app is open, online, connected and unlocked.
            Quota errors need a pause before retrying, not repeated sign-ins or
            enabling billing. Before resolving a conflict, keep the safety
            copies and review which version will replace the other.
          </p>
          <p>
            If a save fails, keep the form open and read the error; don't
            repeatedly submit or reset storage. For support, describe the steps
            and use the exact error code if shown. Never send a financial
            backup, tokens, passphrases or unredacted financial screenshots.
            This app has no automatic support upload.
          </p>
        </details>
        <Button secondary onClick={() => app.navigate("backup")}>
          Open Backup Centre
        </Button>
        <h4>Technical support report</h4>
        <p>
          Create a preview on this device, then download it only if you choose.
          It contains app/build identification, browser capabilities and limited
          backup/sync status flags, not financial records or account identities.
          Review it before sharing through your own trusted support channel. It
          is not a backup or proof that cloud features work.
        </p>
        <Button secondary disabled={busy} onClick={() => void prepare()}>
          {busy ? "Preparing technical report..." : "Prepare technical report"}
        </Button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {report && (
          <>
            {(report.optionalFeatures.statusRead === "unavailable" ||
              report.browser.persistentStorage === "unavailable") && (
              <p className="notice warning" role="status">
                Some browser or optional-feature status is unavailable. The
                report marks it unavailable rather than assuming success.
                Financial records were not inspected.
              </p>
            )}
            <details open>
              <summary>Technical report preview</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(report, null, 2)}
              </pre>
            </details>
            <Button
              secondary
              onClick={() => {
                setError("");
                try {
                  download(
                    "Pennywise-technical-support.json",
                    JSON.stringify(report, null, 2),
                  );
                } catch {
                  setError(
                    "The technical report download could not start. No report was uploaded and your records are unchanged.",
                  );
                }
              }}
            >
              Download technical report
            </Button>
          </>
        )}
      </Card>
    </section>
  );
}

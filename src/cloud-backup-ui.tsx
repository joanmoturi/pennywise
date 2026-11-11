import { useEffect, useRef, useState } from "react";
import { useApp } from "./context";
import {
  cloudBackup,
  cloudConfig,
  configureCloud,
  backupQueue,
  type CloudConfig,
  type BackupQueue,
} from "./cloud-backup";
import {
  GOOGLE_CLIENT_ID,
  GoogleDriveRepository,
  type DriveFile,
} from "./google-services";
import {
  inspectCloudBackup,
  newRecoveryKey,
  rewrapCloudBackup,
  cloudEnvelopeSchema,
} from "./cloud-crypto";
import { fullBackup, type BackupPreview } from "./backup";
import { download } from "./storage";
import { Card, Button, errorMessage } from "./ui";
import { backupFilename } from "./pages-backup";

export function CloudBackupMonitor() {
  const { repo, state } = useApp();
  useEffect(() => {
    const timer = setTimeout(() => {
      void cloudBackup.run(repo).catch(() => undefined);
    }, 10000);
    return () => clearTimeout(timer);
  }, [repo, state.revision]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible")
        void cloudBackup.run(repo).catch(() => undefined);
    };
    const interval = setInterval(tick, 60000);
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [repo]);
  return null;
}
export function CloudBackupPanel() {
  const app = useApp();
  const signIn = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<CloudConfig>();
  const [queue, setQueue] = useState<BackupQueue>();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [nextPassword, setNextPassword] = useState("");
  const [nextConfirmation, setNextConfirmation] = useState("");
  const [preview, setPreview] = useState<BackupPreview>();
  const [previewRevision, setPreviewRevision] = useState<number>();
  const [previewSource, setPreviewSource] = useState<{
    deviceId: string;
    backupId: string;
    revision: number;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, refreshIdentity] = useState(0);
  const [signInEpoch, setSignInEpoch] = useState(0);
  const [signInOpen, setSignInOpen] = useState(false);
  async function refresh() {
    setConfig(await cloudConfig());
    setQueue(await cloudBackup.reconcile(app.repo));
    refreshIdentity((n) => n + 1);
  }
  async function action(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run();
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const config = await cloudConfig(),
        queue = await backupQueue();
      if (active) {
        setConfig(config);
        setQueue(queue);
        refreshIdentity((n) => n + 1);
      }
    };
    void cloudBackup.session
      .resume()
      .then(refresh)
      .catch(() => undefined);
    const timer = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!signInOpen || !GOOGLE_CLIENT_ID || !signIn.current) return;
    let active = true;
    void cloudBackup.session
      .renderSignIn(
        signIn.current,
        () => {
          if (active) refreshIdentity((n) => n + 1);
        },
        (error) => {
          if (active) setError(errorMessage(error));
        },
      )
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [signInEpoch, signInOpen]);
  const connected = cloudBackup.session.driveIdentity;
  const identity = cloudBackup.session.identity;
  function drive() {
    if (!config?.owner || connected?.sub !== config.owner)
      throw new Error(
        "Connect your selected backup Google Drive account first",
      );
    return new GoogleDriveRepository(cloudBackup.session, config.owner);
  }
  async function history() {
    setFiles(await drive().list());
  }
  async function connect(enable = false, reconnect = false) {
    if (reconnect || !cloudBackup.session.driveIdentity)
      await cloudBackup.session.connectDrive();
    const user = cloudBackup.session.driveIdentity;
    if (!user)
      throw new Error(
        "Google Drive connection cancelled. Local records are unchanged.",
      );
    const current = await cloudConfig();
    if (current.owner && current.owner !== user.sub)
      throw new Error(
        "This workspace is bound to another Google Drive account. Disconnect and reconnect the original account; no records were uploaded.",
      );
    if (!current.owner) cloudBackup.lock();
    await configureCloud({
      owner: user.sub,
      ...(enable ? { enabled: true } : {}),
    });
    await cloudBackup.retryAfterAuthorization();
    await refresh();
    setFiles(
      await new GoogleDriveRepository(cloudBackup.session, user.sub).list(),
    );
    if (enable && cloudBackup.unlocked) await backUpNow();
  }
  async function backUpNow() {
    const previous = await backupQueue();
    await cloudBackup.run(app.repo, true, true);
    await history();
    const result = await backupQueue();
    if (
      result.status !== "verified" ||
      !result.lastSuccess ||
      result.lastSuccess === previous.lastSuccess
    )
      throw new Error(
        result.message ||
          "Backup is still pending. No new verified backup is confirmed yet.",
      );
    app.notify("Google Drive backup uploaded and verified.");
  }
  function restore() {
    if (!preview) return;
    app.confirm(
      "Replace local records with the selected cloud backup?",
      "No merge will be attempted. A full safety file is downloaded and an on-device snapshot is retained before atomic replacement. Verify the safety file. Cancel if this is not the correct workspace.",
      async () => {
        const current = await app.repo.read();
        if (current.revision !== previewRevision)
          throw new Error(
            "Local records changed since the preview. Unlock and review this backup again.",
          );
        download(backupFilename(true), await fullBackup(current));
        await app.mutate("Restore verified cloud backup", (draft) => {
          if (draft.revision !== previewRevision)
            throw new Error("Local records changed. Review the backup again.");
          const audit = draft.audit;
          const ids = new Set(audit.map((a) => a.id));
          Object.assign(draft, structuredClone(preview.state));
          draft.audit = [
            ...audit,
            ...preview.state.audit.filter((a) => !ids.has(a.id)),
          ];
        });
        const after = await app.repo.read();
        for (const key of Object.keys(preview.state) as (keyof typeof after)[])
          if (
            key !== "revision" &&
            key !== "audit" &&
            JSON.stringify(after[key]) !== JSON.stringify(preview.state[key])
          )
            throw new Error(
              "Post-restore verification needs attention. The safety snapshot is retained.",
            );
        setPreview(undefined);
        app.notify(
          "Restore completed. Local records and relationships were verified.",
        );
      },
    );
  }
  return (
    <Card>
      <h2>Account and Backup</h2>
      <p>
        Optional encrypted Google Drive snapshots. Local records remain
        available offline; this is not live synchronization or a local access
        lock.
      </p>
      {!GOOGLE_CLIENT_ID && (
        <p className="notice">
          Google Drive backup is not available yet. Pennywise needs a one-time
          service setup by the app owner; you do not need a developer account.
          Your records remain on this device and manual backups below still
          work.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h3>Google Drive backup</h3>
      <p role="status">
        {config?.enabled
          ? "Google Drive backup is enabled on this device. Your choice is saved when you close Pennywise."
          : "Google Drive backup is off."}
        {config?.enabled &&
          (!connected
            ? " Reconnect your Google account to resume; you do not need to enable backup again."
            : !cloudBackup.unlocked
              ? " Unlock encryption below to resume backing up."
              : " New changes are backed up while Pennywise is open.")}
      </p>
      <p>
        Choose your Google account to keep encrypted backups in your own Drive.
        No separate Pennywise sign-in is required. Only choose an account you
        control; this connects the existing local workspace, not a separate set
        of financial records.
      </p>
      {(!config?.enabled || !connected) && (
        <Button
          disabled={busy || !config || !GOOGLE_CLIENT_ID}
          onClick={() => void action(() => connect(true))}
        >
          {config?.enabled
            ? "Reconnect Google Drive"
            : "Enable Google Drive Backup"}
        </Button>
      )}
      <details onToggle={(event) => setSignInOpen(event.currentTarget.open)}>
        <summary>Optional Google sign-in</summary>
        <h3>Account</h3>
        <p>
          {identity && identity.expiresAt > Date.now()
            ? `Signed in with Google: ${identity.email}`
            : "Not signed in / session expired. Local records are unaffected."}
        </p>
        <div ref={signIn} />
        <Button
          secondary
          disabled={busy || !identity}
          onClick={() => {
            cloudBackup.session.signOut();
            cloudBackup.lock();
            setPassword("");
            setConfirmation("");
            setRecovery("");
            refreshIdentity((n) => n + 1);
            setSignInEpoch((n) => n + 1);
          }}
        >
          Sign out
        </Button>
        {identity && (
          <Button
            secondary
            disabled={busy}
            onClick={() =>
              app.confirm(
                "Remove Google sign-in consent?",
                "Removes the application sign-in connection only. Delete cloud backups separately if wanted. Local financial records and independently authorized Drive access are not deleted.",
                async () => {
                  const { googleLibrary } = await import("./google-services");
                  const library = await googleLibrary();
                  await new Promise<void>((resolve) =>
                    library.accounts.id.revoke(identity.sub, resolve),
                  );
                  cloudBackup.session.signOut();
                  cloudBackup.lock();
                  setSignInEpoch((n) => n + 1);
                  await refresh();
                },
              )
            }
          >
            Remove account connection
          </Button>
        )}
      </details>
      <h3>Google Drive</h3>
      <p>
        {connected
          ? `Connected: ${connected.email}`
          : "Disconnected or authorization expired"}
      </p>
      <div className="actions">
        {config?.owner && (
          <Button
            disabled={busy || !GOOGLE_CLIENT_ID}
            onClick={() => void action(() => connect(false, true))}
          >
            Reconnect Drive
          </Button>
        )}
        <Button
          secondary
          disabled={busy || !connected}
          onClick={() =>
            void action(async () => {
              await configureCloud({ enabled: false });
              cloudBackup.lock();
              setFiles([]);
              setPreview(undefined);
              await cloudBackup.session.disconnectDrive();
            })
          }
        >
          Disconnect Drive
        </Button>
      </div>
      <h3>Encryption</h3>
      <p>
        Encryption is mandatory for cloud backups.{" "}
        {cloudBackup.unlocked ? "Unlocked in this tab." : "Locked."} Secrets are
        never saved. Losing both your passphrase and the optional recovery key
        makes backups unrecoverable; Google account recovery cannot help.
      </p>
      <label>
        Drive encryption passphrase (12+ characters)
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        Confirm passphrase
        <input
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </label>
      <label>
        Optional recovery key for new backups in this tab
        <input
          type="password"
          autoComplete="off"
          value={recovery}
          onChange={(e) => setRecovery(e.target.value)}
        />
      </label>
      <div className="actions">
        <Button
          secondary
          disabled={busy}
          onClick={() => {
            const value = newRecoveryKey();
            setRecovery(value);
            download(
              "Pennywise-recovery-key.txt",
              `Pennywise recovery key\n${value}\nKeep separately from your backups. Applies only to snapshots created with this key.`,
              "text/plain",
            );
          }}
        >
          Generate and download recovery key
        </Button>
        <Button
          disabled={busy || !connected}
          onClick={() =>
            void action(async () => {
              await cloudBackup.unlock(
                password,
                confirmation,
                app.repo,
                recovery,
              );
              setPassword("");
              setConfirmation("");
              setRecovery("");
              if ((await cloudConfig()).enabled) await backUpNow();
            })
          }
        >
          Unlock and Back Up
        </Button>
        <Button
          secondary
          disabled={busy}
          onClick={() => {
            cloudBackup.lock();
            setPassword("");
            setConfirmation("");
            setRecovery("");
            refreshIdentity((n) => n + 1);
          }}
        >
          Lock encryption
        </Button>
      </div>
      <p>
        Existing latest backup must unlock successfully before any new uploads
        can run. Recovery keys apply only to files whose envelope includes that
        key; supply your saved key again when unlocking a new session if you
        want it on new backups.
      </p>
      <h3>Backup</h3>
      <p>
        Status: {queue?.status ?? "Loading"}
        {queue?.message ? ` — ${queue.message}` : ""}
      </p>
      <p>
        Last successful backup: {queue?.lastSuccess || "Never"}. Last attempted:{" "}
        {queue?.lastAttempt || "Never"}. Pending changes:{" "}
        {Math.max(
          0,
          app.state.revision - Math.max(0, queue?.verifiedRevision ?? 0),
        )}
        . Latest file: {queue?.lastFile || "None"}. Size: {queue?.lastSize ?? 0}{" "}
        bytes.
      </p>
      <label>
        <input
          type="checkbox"
          checked={config?.enabled ?? false}
          disabled={busy || !config || (!GOOGLE_CLIENT_ID && !config.enabled)}
          onChange={(e) => {
            const enabled = e.target.checked;
            const previous = config;
            if (!enabled && config) setConfig({ ...config, enabled: false });
            void action(async () => {
              if (enabled) await connect(true);
              else {
                try {
                  await configureCloud({ enabled: false });
                } catch (error) {
                  setConfig(previous);
                  throw error;
                }
              }
            });
          }}
        />{" "}
        Automatic backups while the application is active
      </label>
      <label>
        Recent verified snapshots to retain
        <input
          type="number"
          min={2}
          max={100}
          defaultValue={config?.retention ?? 10}
          key={config?.deviceId}
          onBlur={(e) =>
            void action(async () => {
              await configureCloud({ retention: Number(e.target.value) });
            })
          }
        />
      </label>
      <p>
        Also retains monthly checkpoints and protected manual backups. Automatic
        execution stops when the app is closed; your enabled setting and pending
        revisions survive. Google may ask you to reconnect, and encryption must
        be unlocked after restarting. These steps do not turn off your saved
        backup setting.
      </p>
      <div className="actions">
        <Button
          disabled={busy || !connected || !cloudBackup.unlocked}
          onClick={() => void action(backUpNow)}
        >
          Back Up Now
        </Button>
        <Button
          secondary
          disabled={busy || !connected}
          onClick={() => void action(history)}
        >
          Backup history / Restore Backup
        </Button>
      </div>
      <h3>Restore and passphrase recovery</h3>
      <label>
        <input
          type="checkbox"
          checked={useRecovery}
          onChange={(e) => setUseRecovery(e.target.checked)}
        />{" "}
        Use recovery key instead of passphrase to unlock a selected version
      </label>
      <p>
        Enter the selected backup's passphrase above, or recovery key in the
        recovery field. Unlocking a version previews it only; local data is
        never merged or replaced automatically.
      </p>
      <label>
        New passphrase for key rewrapping (optional)
        <input
          type="password"
          autoComplete="new-password"
          value={nextPassword}
          onChange={(e) => setNextPassword(e.target.value)}
        />
      </label>
      <label>
        Confirm new passphrase
        <input
          type="password"
          autoComplete="new-password"
          value={nextConfirmation}
          onChange={(e) => setNextConfirmation(e.target.value)}
        />
      </label>
      {files.map((file) => (
        <div key={file.id} className="notice">
          <p>
            {file.createdTime || "Date unavailable"} · {file.size || "Unknown"}{" "}
            bytes ·{" "}
            {file.appProperties.verified === "true"
              ? "Upload verified; unlock to validate"
              : "Not yet verified"}
            {file.appProperties.protected === "true" ? " · Protected" : ""}
          </p>
          <Button
            secondary
            disabled={busy}
            onClick={() =>
              void action(async () => {
                setPreview(undefined);
                const local = await app.repo.read();
                const text = await drive().download(file);
                const result = await inspectCloudBackup(
                  text,
                  useRecovery ? recovery : password,
                  useRecovery,
                );
                setPreviewSource(
                  cloudEnvelopeSchema.parse(JSON.parse(text)).metadata,
                );
                setPreviewRevision(local.revision);
                setPreview(result);
                setPassword("");
                setRecovery("");
              })
            }
          >
            Unlock and preview
          </Button>
          <Button
            secondary
            disabled={busy || !nextPassword}
            onClick={() =>
              void action(async () => {
                if (nextPassword !== nextConfirmation)
                  throw new Error("New passphrases do not match");
                const old = await drive().download(file);
                const changed = await rewrapCloudBackup(
                  old,
                  useRecovery ? recovery : password,
                  nextPassword,
                  useRecovery,
                );
                const envelope = cloudEnvelopeSchema.parse(JSON.parse(changed));
                // Different file identity preserves the old readable version and its content identity.
                const replacement = await drive().upload(
                  changed,
                  crypto.randomUUID(),
                  true,
                );
                const downloaded = await drive().download(replacement);
                if (downloaded !== changed)
                  throw new Error(
                    "Rewrapped upload did not match; the old backup is retained",
                  );
                await inspectCloudBackup(downloaded, nextPassword);
                await drive().markVerified(replacement);
                cloudBackup.lock();
                setPassword("");
                setRecovery("");
                setNextPassword("");
                setNextConfirmation("");
                app.notify(
                  `Passphrase rewrapped in a new protected file. Original snapshot ${envelope.metadata.backupId} remains available under its old passphrase.`,
                );
                await history();
              })
            }
          >
            Change passphrase for this version
          </Button>
          <Button
            secondary
            disabled={busy}
            onClick={() =>
              app.confirm(
                "Move this cloud backup to Drive trash?",
                "This deletes only the selected cloud file, never local records. Keep another verified backup. Protected snapshots can only be removed explicitly.",
                async () => {
                  const remaining = files.filter(
                    (f) =>
                      f.id !== file.id && f.appProperties.verified === "true",
                  );
                  if (!remaining.length)
                    throw new Error(
                      "Keep at least one other verified backup before deleting this version.",
                    );
                  await drive().remove(file);
                  await history();
                },
              )
            }
          >
            Delete cloud version
          </Button>
        </div>
      ))}
      {preview && (
        <div className="notice">
          <h3>Restore preview</h3>
          <p>
            Created {preview.createdAt}; app {preview.appVersion}; schema{" "}
            {preview.state.version}. {preview.state.accounts.length} accounts,{" "}
            {preview.state.transactions.length} transactions,{" "}
            {preview.state.bonds.length} bonds. All collections and
            relationships validated. Source device and snapshot details are
            authenticated inside the cloud envelope.
          </p>
          <p>
            Source device: {previewSource?.deviceId}. Snapshot:{" "}
            {previewSource?.backupId}. Source revision:{" "}
            {previewSource?.revision}.
          </p>
          <Button disabled={busy} onClick={restore}>
            Replace local data after safety backup
          </Button>
          <Button secondary onClick={() => setPreview(undefined)}>
            Cancel restore
          </Button>
        </div>
      )}
      <details>
        <summary>Diagnostics and limitations</summary>
        <p>
          No tokens, secrets or financial records are included in these
          diagnostics.
        </p>
        <pre>
          {JSON.stringify(
            {
              configured: Boolean(GOOGLE_CLIENT_ID),
              automatic: config?.enabled,
              status: queue?.status,
              attempts: queue?.attempts,
              retryAt: queue?.retryAt,
              pendingSnapshot: Boolean(queue?.pending),
              sessionEncryptionUnlocked: cloudBackup.unlocked,
            },
            null,
            2,
          )}
        </pre>
        <p>
          Merge is not supported. Use an empty workspace or explicit
          replacement. Browser sign-in is a local identity convenience, not
          server-side access control. No two-device or live Google acceptance is
          claimed until external configuration and manual verification are
          completed.
        </p>
      </details>
    </Card>
  );
}

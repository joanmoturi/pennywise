import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "./context";
import { WorkspaceSync, syncMarkers } from "./workspace-sync";
import { SYNC_CONFIGURED } from "./sync-config";
import { Card, Button, errorMessage } from "./ui";
import { download } from "./storage";

const SyncContext = createContext<{
  controller: WorkspaceSync;
  version: number;
} | null>(null);
export function WorkspaceSyncProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const latest = useRef(app);
  latest.current = app;
  const [version, refresh] = useState(0);
  const [controller] = useState(
    () =>
      new WorkspaceSync(
        {
          read: () => latest.current.repo.read(),
          canApply: () => latest.current.canApplySync !== false,
          async replace(remote, expectedRevision) {
            await latest.current.mutate(
              "Restore synchronized encrypted workspace",
              (state) => {
                if (latest.current.hasOpenSyncForm)
                  throw new Error(
                    "Close open forms before applying cloud records.",
                  );
                if (state.revision !== expectedRevision)
                  throw new Error(
                    "Local records changed during sync. Nothing was replaced; retry or review versions.",
                  );
                const audit = state.audit;
                const ids = new Set(audit.map((entry) => entry.id));
                Object.assign(state, structuredClone(remote));
                state.audit = [
                  ...audit,
                  ...remote.audit.filter((entry) => !ids.has(entry.id)),
                ];
              },
            );
            return latest.current.repo.read();
          },
        },
        syncMarkers,
        () => refresh((n) => n + 1),
      ),
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      void controller.run(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [controller, app.state.revision]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void controller.run(true);
    };
    const timer = setInterval(tick, 60000);
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [controller]);
  return (
    <SyncContext.Provider value={{ controller, version }}>
      {children}
    </SyncContext.Provider>
  );
}
export function WorkspaceSyncPanel() {
  const controller = useContext(SyncContext)?.controller;
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedLocal, setSavedLocal] = useState(false);
  const [savedRemote, setSavedRemote] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  if (!controller) return null;
  const sync = controller;
  const review = sync.review;
  async function action(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function resetReview() {
    setSavedLocal(false);
    setSavedRemote(false);
    setAcknowledged(false);
  }
  const canChoose =
    !busy && savedLocal && (!review?.remote || savedRemote) && acknowledged;
  return (
    <section aria-label="Cross-device sync">
      <Card>
        <h2>Cross-device sync</h2>
        <p>
          Optional encrypted workspace synchronization, separate from Google
          Drive backups. Use the same Google account and sync passphrase on each
          device. This is not a shared household ledger.
        </p>
        <p role="status">
          Sync: {sync.status.phase} — {sync.status.message}
        </p>
        {!SYNC_CONFIGURED && (
          <p className="notice">
            Cross-device sync is not configured in this build. The app owner
            must enable Google sign-in and Firestore on the no-billing Spark
            plan. Existing local records and Drive backups still work.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!sync.remote ? (
          <Button
            disabled={busy || !SYNC_CONFIGURED}
            onClick={() =>
              void action(async () => {
                const { connectFirebaseSync } = await import("./firebase-sync");
                await sync.connect(await connectFirebaseSync());
                resetReview();
              })
            }
          >
            Connect Google for Sync
          </Button>
        ) : (
          <>
            <p>
              Connected to your Google sync account. Account isolation uses its
              verified Firebase user ID, not an editable email.
            </p>
            <label>
              Sync workspace passphrase (12+ characters)
              <input
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Confirm sync passphrase
              <input
                type="password"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <div className="actions">
              <Button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    resetReview();
                    await sync.unlock(password, confirmation);
                    setPassword("");
                    setConfirmation("");
                  })
                }
              >
                Unlock Sync Workspace
              </Button>
              <Button
                secondary
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    sync.lock();
                    setPassword("");
                    setConfirmation("");
                  })
                }
              >
                Lock Sync
              </Button>
              <Button
                secondary
                disabled={busy}
                onClick={() => void action(() => sync.pause())}
              >
                Pause and Disconnect Sync
              </Button>
              <Button
                secondary
                disabled={busy}
                onClick={() => void action(() => sync.run())}
              >
                Sync Now
              </Button>
              <Button
                secondary
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    resetReview();
                    await sync.inspectConflict();
                  })
                }
              >
                Review Sync Versions
              </Button>
            </div>
          </>
        )}
        {review && (
          <section aria-label="Sync version review">
            <h3>Review before linking or replacing</h3>
            <p>
              On this device: {review.local.accounts.length} accounts /{" "}
              {review.local.transactions.length} transactions. Cloud:{" "}
              {review.remote
                ? `${review.remote.accounts.length} accounts / ${review.remote.transactions.length} transactions`
                : "No workspace"}
              .
            </p>
            <p>
              Neither version is merged automatically. Keep encrypted safety
              exports of both versions before choosing. They use your sync
              passphrase and can be restored using the full-backup file picker.
            </p>
            <div className="actions">
              <Button
                secondary
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    download(
                      "Pennywise-sync-local-safety.encrypted.json",
                      await sync.exportReview("local"),
                    );
                    setSavedLocal(true);
                  })
                }
              >
                Export This Device Safety Copy
              </Button>
              {review.remote && (
                <Button
                  secondary
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      download(
                        "Pennywise-sync-cloud-safety.encrypted.json",
                        await sync.exportReview("remote"),
                      );
                      setSavedRemote(true);
                    })
                  }
                >
                  Export Cloud Safety Copy
                </Button>
              )}
            </div>
            <label>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I saved the safety copies and understand that choosing a version
              replaces the other, not merges it.
            </label>
            <div className="actions">
              <Button
                disabled={!canChoose}
                onClick={() => void action(() => sync.choose("local"))}
              >
                {review.remote
                  ? "Replace Cloud With This Device"
                  : "Start Sync With This Device"}
              </Button>
              {review.remote && (
                <Button
                  disabled={!canChoose}
                  onClick={() => void action(() => sync.choose("remote"))}
                >
                  Use Cloud Workspace on This Device
                </Button>
              )}
            </div>
          </section>
        )}
        <p>
          Changes synchronize while Pennywise is open, online, signed in and
          unlocked. Concurrent edits stop for explicit conflict review. A lost
          passphrase cannot be reset by Gmail; keep encrypted backups and the
          passphrase separately. Local records are still readable on this
          browser after sign-out: use a separate browser profile on shared
          devices. Keep only one active editing tab per device; an unsaved form
          in another tab cannot be protected by this tab's form guard.
        </p>
        <p>
          No payment card is needed on Spark, but usage is limited and sync can
          stop at quota. Encrypted workspaces are capped at 3.2 MB; large
          receipts still work locally and in Drive backups. Never enable billing
          just to dismiss a sync error.
        </p>
      </Card>
    </section>
  );
}

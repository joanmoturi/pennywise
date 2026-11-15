import { useEffect, useState } from "react";
import { useApp } from "./context";
import {
  cloudBackup,
  cloudConfig,
  backupQueue,
  type CloudConfig,
  type BackupQueue,
} from "./cloud-backup";
import { GOOGLE_CLIENT_ID } from "./google-services";
import { backupHealth } from "./backup-health";
import { Badge, Button, Card } from "./ui";

interface HealthSnapshot {
  config: CloudConfig;
  queue: BackupQueue;
  lastSuccess: string;
}
export function BackupHealthCard({
  inBackupCentre = false,
}: {
  inBackupCentre?: boolean;
}) {
  const { state, navigate } = useApp();
  const [snapshot, setSnapshot] = useState<HealthSnapshot>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let reading = false;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      try {
        const [config, queue] = await Promise.all([
          cloudConfig(),
          backupQueue(),
        ]);
        if (active) {
          setSnapshot({
            config,
            queue,
            lastSuccess:
              queue.lastFile && Number.isFinite(Date.parse(queue.lastSuccess))
                ? queue.lastSuccess
                : "",
          });
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [state.revision]);
  const health = failed
    ? {
        label: "Action needed",
        message:
          "Backup status could not be read. Your financial records are unchanged; download a manual backup or try again.",
        action: "Create a manual backup",
        target: "backup-download",
        warning: true,
      }
    : snapshot &&
      backupHealth({
        config: snapshot.config,
        queue: snapshot.queue,
        revision: state.revision,
        configured: Boolean(GOOGLE_CLIENT_ID),
        connected: Boolean(
          snapshot.config.owner &&
          cloudBackup.session.driveIdentity?.sub === snapshot.config.owner,
        ),
        unlocked: cloudBackup.unlocked,
        online: navigator.onLine,
      });
  return (
    <section aria-label="Backup health">
      <Card className="backup-health">
        <div className="card-head">
          <h2>Backup health</h2>
          <span role="status" aria-live="polite">
            <Badge warning={health?.warning}>
              {health?.label ?? "Checking backup health"}
            </Badge>
          </span>
        </div>
        <p>
          {health?.message ??
            "Checking this device's saved backup status. No Google connection is started."}
        </p>
        <p className="backup-timestamp">
          Last verified Drive backup:{" "}
          {snapshot?.lastSuccess ? (
            <time dateTime={snapshot.lastSuccess}>
              {new Date(snapshot.lastSuccess).toLocaleString()}
            </time>
          ) : snapshot ? (
            "Never on this device"
          ) : failed ? (
            "Unavailable"
          ) : (
            "Checking local status"
          )}
          .
        </p>
        {state.settings.lastBackupAt && (
          <p className="backup-timestamp">
            Manual export initiated:{" "}
            <time dateTime={state.settings.lastBackupAt}>
              {state.settings.lastBackupAt}
            </time>
            . Check the downloaded file yourself.
          </p>
        )}
        <Button
          secondary
          disabled={!health}
          onClick={() => {
            if (!inBackupCentre) navigate("backup");
            else {
              const target =
                document.getElementById(health!.target) ??
                document.getElementById("drive-reconnect");
              target?.scrollIntoView({ block: "center", behavior: "auto" });
              target?.focus();
            }
          }}
        >
          {health?.action ?? "Checking backup status"}
        </Button>
      </Card>
    </section>
  );
}

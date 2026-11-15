import type { BackupQueue, CloudConfig } from "./cloud-backup";

export interface BackupHealthInput {
  config: CloudConfig;
  queue: BackupQueue;
  revision: number;
  configured: boolean;
  connected: boolean;
  unlocked: boolean;
  online: boolean;
}
export interface BackupHealth {
  label: string;
  message: string;
  action: string;
  target: string;
  warning: boolean;
}
export function backupHealth(input: BackupHealthInput): BackupHealth {
  const { config, queue, revision, configured, connected, unlocked, online } =
    input;
  const currentVerified =
    !queue.pending &&
    queue.verifiedRevision === revision &&
    Boolean(queue.lastFile) &&
    Number.isFinite(Date.parse(queue.lastSuccess));
  const result = (
    label: string,
    message: string,
    action: string,
    target: string,
    warning = true,
  ): BackupHealth => ({ label, message, action, target, warning });
  if (!configured)
    return result(
      "Action needed",
      "Google Drive backup is unavailable in this build. You can still download a manual backup.",
      "Create a manual backup",
      "backup-download",
    );
  if (!config.enabled)
    return result(
      "Backup is off",
      "Automatic Drive backup is off. Your records stay on this device; a manual download is not a verified Drive backup.",
      "Manage backups",
      "drive-connect",
    );
  if (queue.status === "uploading" || queue.status === "uploaded")
    return result(
      "Backup in progress",
      "Your snapshot is not confirmed safe in Drive until upload, read-back and validation finish.",
      "View backup progress",
      "backup-progress",
      false,
    );
  if (!online && currentVerified)
    return result(
      "Backed up",
      "The current local revision has a verified Drive snapshot. You are offline; new backups wait for a connection.",
      "Create a manual backup",
      "backup-download",
      false,
    );
  if (!online)
    return result(
      "Changes pending",
      "You are offline. Local records are available; Drive backup can resume when you reconnect.",
      "Create a manual backup",
      "backup-download",
    );
  if (!connected)
    return result(
      "Action needed",
      "Reconnect the Google account linked to this workspace. Your saved backup preference is still enabled.",
      "Review Google connection",
      "drive-connect",
    );
  if (!unlocked)
    return result(
      "Action needed",
      "Unlock encryption in this tab to resume backups. Your passphrase is never saved.",
      "Unlock backup encryption",
      "drive-passphrase",
    );
  if (queue.status === "failed" || queue.status === "authorization required")
    return result(
      "Action needed",
      queue.message ||
        "The last backup did not finish. Earlier verified backups and pending work are retained.",
      "Review backup failure",
      queue.status === "authorization required"
        ? "drive-connect"
        : "drive-backup-now",
    );
  if (
    queue.pending ||
    queue.verifiedRevision !== revision ||
    queue.status === "retry scheduled" ||
    !queue.lastFile ||
    !Number.isFinite(Date.parse(queue.lastSuccess))
  )
    return result(
      "Changes pending",
      queue.status === "retry scheduled"
        ? "The last attempt failed. Encrypted pending work is retained for retry while Pennywise is open."
        : "This workspace has changes without a confirmed Drive backup. Back up now or leave Pennywise open for automatic backup.",
      "Review pending backup",
      "drive-backup-now",
    );
  return result(
    "Backed up",
    "The current local revision has a verified Drive snapshot. Automatic backups run while Pennywise is open and unlocked.",
    "View backup details",
    "backup-progress",
    false,
  );
}

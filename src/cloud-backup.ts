import { z } from "zod";
import { auxiliaryRead, auxiliaryUpdate } from "./auxiliary-storage";
import {
  createCloudBackup,
  inspectCloudBackup,
  cloudEnvelopeSchema,
} from "./cloud-crypto";
import {
  DriveError,
  GoogleDriveRepository,
  GoogleSession,
} from "./google-services";
import type { Repository } from "./storage";

const configSchema = z.object({
  deviceId: z.string().uuid(),
  owner: z.string().default(""),
  enabled: z.boolean().default(false),
  retention: z.number().int().min(2).max(100).default(10),
});
const queueSchema = z.object({
  status: z
    .enum([
      "pending",
      "uploading",
      "uploaded",
      "verified",
      "failed",
      "retry scheduled",
      "authorization required",
      "encryption required",
    ])
    .default("pending"),
  verifiedRevision: z.number().int().default(-1),
  latestRevision: z.number().int().default(0),
  attempts: z.number().int().nonnegative().default(0),
  retryAt: z.number().default(0),
  lastAttempt: z.string().default(""),
  lastSuccess: z.string().default(""),
  lastFile: z.string().default(""),
  lastSize: z.number().default(0),
  message: z.string().default(""),
  pending: z
    .object({
      text: z.string().max(50_000_000),
      revision: z.number().int(),
      backupId: z.string().uuid(),
      owner: z.string(),
    })
    .optional(),
});
export type CloudConfig = z.infer<typeof configSchema>;
export type BackupQueue = z.infer<typeof queueSchema>;
export async function cloudConfig(): Promise<CloudConfig> {
  return auxiliaryUpdate("cloud-config", (value) =>
    configSchema.parse(value ?? { deviceId: crypto.randomUUID() }),
  );
}
export async function configureCloud(
  change: Partial<Omit<CloudConfig, "deviceId">>,
) {
  return auxiliaryUpdate("cloud-config", (value) =>
    configSchema.parse({ ...(value as CloudConfig), ...change }),
  );
}
export async function backupQueue(): Promise<BackupQueue> {
  return queueSchema.parse(
    await auxiliaryRead("cloud-queue", queueSchema.parse({})),
  );
}
async function updateQueue(change: Partial<BackupQueue>) {
  return auxiliaryUpdate("cloud-queue", (value) =>
    queueSchema.parse({ ...queueSchema.parse(value ?? {}), ...change }),
  );
}
export class CloudBackupController {
  readonly session = new GoogleSession();
  private password = "";
  private recovery = "";
  private running = false;
  get unlocked() {
    return Boolean(this.password);
  }
  lock() {
    this.password = "";
    this.recovery = "";
  }
  async retryAfterAuthorization() {
    await updateQueue({
      retryAt: 0,
      attempts: 0,
      message: "",
      status: "pending",
    });
  }
  async unlock(
    password: string,
    confirmation: string,
    repo: Repository,
    recovery = "",
  ) {
    if (password !== confirmation) throw new Error("Passphrases do not match");
    const config = await cloudConfig();
    if (!config.owner || this.session.driveIdentity?.sub !== config.owner)
      throw new Error(
        "Connect and confirm your backup Google Drive account first",
      );
    const drive = new GoogleDriveRepository(this.session, config.owner);
    const files = await drive.list();
    const latest = files.find((f) => f.appProperties.verified === "true");
    if (latest)
      await inspectCloudBackup(await drive.download(latest), password);
    const test = await createCloudBackup(
      await repo.read(),
      password,
      config.deviceId,
      recovery || undefined,
    );
    await inspectCloudBackup(test, password);
    if (recovery) await inspectCloudBackup(test, recovery, true);
    this.password = password;
    this.recovery = recovery;
    await updateQueue({ retryAt: 0, message: "", status: "pending" });
  }
  async reconcile(repo: Repository): Promise<BackupQueue> {
    const state = await repo.read();
    return updateQueue({ latestRevision: state.revision });
  }
  async run(
    repo: Repository,
    manual = false,
    protectedBackup = false,
  ): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (!navigator.locks) {
        await updateQueue({
          status: "failed",
          message:
            "This browser lacks safe cross-tab backup locking. Use manual encrypted downloads.",
          retryAt: Number.MAX_SAFE_INTEGER,
        });
        return;
      }
      await navigator.locks.request(
        "pennywise-cloud-backup",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          const config = await cloudConfig();
          let queue = await this.reconcile(repo);
          if (
            !manual &&
            (!config.enabled ||
              queue.retryAt > Date.now() ||
              (!queue.pending &&
                queue.latestRevision === queue.verifiedRevision))
          )
            return;
          if (!navigator.onLine) {
            await updateQueue({
              status: "pending",
              message: "Waiting for internet. Local changes are safe.",
            });
            return;
          }
          if (
            !config.owner ||
            this.session.driveIdentity?.sub !== config.owner
          ) {
            await updateQueue({
              status: "authorization required",
              message: "Google Drive needs reconnection",
            });
            return;
          }
          if (!this.password) {
            await updateQueue({
              status: "encryption required",
              message: "Unlock encryption to back up local changes",
            });
            return;
          }
          const drive = new GoogleDriveRepository(this.session, config.owner);
          await updateQueue({
            lastAttempt: new Date().toISOString(),
            message: "",
          });
          try {
            if (queue.pending && queue.pending.owner !== config.owner)
              throw new DriveError(
                "permanent",
                "Pending backup belongs to a different Google Drive account. Reconnect that account.",
              );
            if (!queue.pending) {
              const snapshot = await repo.read();
              const text = await createCloudBackup(
                snapshot,
                this.password,
                config.deviceId,
                this.recovery || undefined,
              );
              await inspectCloudBackup(text, this.password);
              const envelope = cloudEnvelopeSchema.parse(JSON.parse(text));
              queue = await updateQueue({
                pending: {
                  text,
                  backupId: envelope.metadata.backupId,
                  revision: snapshot.revision,
                  owner: config.owner,
                },
                status: "pending",
              });
            }
            const pending = queue.pending!;
            await updateQueue({ status: "uploading" });
            const file = await drive.upload(
              pending.text,
              pending.backupId,
              protectedBackup,
            );
            await updateQueue({ status: "uploaded" });
            const downloaded = await drive.download(file);
            if (downloaded !== pending.text)
              throw new DriveError(
                "permanent",
                "Uploaded backup did not match. Earlier backups are retained.",
              );
            await inspectCloudBackup(downloaded, this.password);
            await drive.markVerified(file);
            await updateQueue({
              status: "verified",
              verifiedRevision: pending.revision,
              pending: undefined,
              lastSuccess: new Date().toISOString(),
              lastFile: file.id,
              lastSize: new Blob([downloaded]).size,
              attempts: 0,
              retryAt: 0,
              message: "",
            });
            try {
              const files = await drive.list();
              const verified = files.filter(
                (f) => f.appProperties.verified === "true",
              );
              const retained = new Set(
                verified.slice(0, config.retention).map((f) => f.id),
              );
              // Retain one older snapshot per month in addition to the recent window.
              const months = new Set<string>();
              for (const old of verified) {
                const month = old.createdTime?.slice(0, 7);
                if (month && !months.has(month)) {
                  months.add(month);
                  retained.add(old.id);
                }
              }
              for (const old of verified) {
                if (this.session.driveIdentity?.sub !== config.owner) break;
                if (
                  old.id !== file.id &&
                  old.appProperties.protected !== "true" &&
                  !retained.has(old.id)
                )
                  await drive.remove(old);
              }
            } catch {
              await updateQueue({
                message:
                  "Backed up and verified. Some older snapshots could not be pruned; all are retained safely.",
              });
            }
            await this.reconcile(repo);
          } catch (error) {
            const current = await backupQueue();
            const transient =
              error instanceof DriveError && error.kind === "transient";
            const authorization =
              error instanceof DriveError && error.kind === "authorization";
            const attempts = current.attempts + 1;
            await updateQueue({
              status: authorization
                ? "authorization required"
                : transient && attempts < 8
                  ? "retry scheduled"
                  : "failed",
              attempts,
              retryAt:
                transient && attempts < 8
                  ? Date.now() + Math.min(3600000, 30000 * 2 ** (attempts - 1))
                  : Number.MAX_SAFE_INTEGER,
              message:
                error instanceof DriveError
                  ? error.message
                  : "Backup could not be completed. Pending work and earlier backups are retained. Retry or check configuration.",
            });
            if (manual) throw error;
          }
        },
      );
    } finally {
      this.running = false;
    }
  }
}
export const cloudBackup = new CloudBackupController();

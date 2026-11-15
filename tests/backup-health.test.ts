import { describe, expect, it } from "vitest";
import { backupHealth, type BackupHealthInput } from "../src/backup-health";

function input(): BackupHealthInput {
  return {
    config: {
      deviceId: "synthetic-device",
      enabled: true,
      owner: "synthetic-owner",
      retention: 10,
    },
    queue: {
      status: "verified",
      verifiedRevision: 4,
      latestRevision: 4,
      attempts: 0,
      retryAt: 0,
      lastAttempt: "2026-11-15T10:00:00Z",
      lastSuccess: "2026-11-15T10:00:00Z",
      lastFile: "synthetic-file",
      lastSize: 4000,
      message: "",
    },
    revision: 4,
    configured: true,
    connected: true,
    unlocked: true,
    online: true,
  };
}
describe("customer backup health", () => {
  it("only describes the current verified revision as backed up", () => {
    const state = input();
    expect(backupHealth(state).label).toBe("Backed up");
    state.revision++;
    expect(backupHealth(state).label).toBe("Changes pending");
    expect(state.queue.verifiedRevision).toBe(4);
  });
  it.each(["lastSuccess", "lastFile"] as const)(
    "does not infer success from a missing %s",
    (field) => {
      const state = input();
      state.queue[field] = "";
      expect(backupHealth(state).label).toBe("Changes pending");
    },
  );
  it("does not treat an uploaded or in-flight snapshot as verified", () => {
    const state = input();
    for (const status of ["uploading", "uploaded"] as const) {
      state.queue.status = status;
      expect(backupHealth(state).label).toBe("Backup in progress");
    }
    state.queue.status = "failed";
    expect(backupHealth(state).label).toBe("Action needed");
  });
  it("routes expired authorization and locked encryption to their own recovery controls", () => {
    const state = input();
    state.connected = false;
    expect(backupHealth(state).target).toBe("drive-connect");
    state.connected = true;
    state.unlocked = false;
    expect(backupHealth(state).target).toBe("drive-passphrase");
  });
  it("distinguishes an offline verified snapshot from offline unsaved changes", () => {
    const state = input();
    state.online = false;
    expect(backupHealth(state).label).toBe("Backed up");
    state.revision++;
    expect(backupHealth(state)).toMatchObject({
      label: "Changes pending",
      target: "backup-download",
    });
  });
  it("retains pending/retry warnings even when the last revision number matches", () => {
    const state = input();
    state.queue.status = "retry scheduled";
    expect(backupHealth(state).label).toBe("Changes pending");
    state.queue.status = "pending";
    state.queue.pending = {
      text: "synthetic-ciphertext",
      revision: 4,
      backupId: "synthetic-id",
      owner: "synthetic-owner",
    };
    expect(backupHealth(state).label).toBe("Changes pending");
  });
  it("keeps off/unconfigured workflows distinct from a successful cloud backup", () => {
    const state = input();
    state.config.enabled = false;
    expect(backupHealth(state).label).toBe("Backup is off");
    state.configured = false;
    expect(backupHealth(state)).toMatchObject({
      label: "Action needed",
      target: "backup-download",
    });
  });
});

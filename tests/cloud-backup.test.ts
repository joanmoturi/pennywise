import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCloudBackup,
  inspectCloudBackup,
  newRecoveryKey,
  rewrapCloudBackup,
} from "../src/cloud-crypto";
import { decodeBackup, encryptBackup } from "../src/backup";
import { auxiliaryUpdate } from "../src/auxiliary-storage";
import {
  CloudBackupController,
  backupQueue,
  cloudConfig,
  configureCloud,
} from "../src/cloud-backup";
import {
  GoogleDriveRepository,
  DriveError,
  GoogleSession,
} from "../src/google-services";
import { openDatabase, Repository } from "../src/storage";
import { fixture, tx } from "./fixtures";

const passphrase = "synthetic private passphrase";
const deviceId = "8f09e87b-e9fa-4dfe-8c34-f30f6c1a3178";
const file = {
  id: "synthetic-file",
  name: "Pennywise-synthetic.encrypted.json",
  appProperties: {
    application: "pennywise",
    backupId: "synthetic",
    verified: "true",
  },
  createdTime: "2026-11-10T12:00:00Z",
};
beforeEach(async () => {
  await auxiliaryUpdate("cloud-config", () => ({
    deviceId,
    owner: "owner",
    enabled: true,
    retention: 2,
  }));
  await auxiliaryUpdate("cloud-queue", () => undefined);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          run: (lock: object) => Promise<void>,
        ) => run({}),
      },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("cloud authenticated encryption", () => {
  it("round-trips complete financial relationships on another simulated device and manual import", async () => {
    const state = fixture();
    state.transactions.push(tx("income", "123.45"));
    const text = await createCloudBackup(state, passphrase, deviceId);
    expect(text).not.toContain("TEST");
    expect((await inspectCloudBackup(text, passphrase)).state).toEqual(state);
    expect(await decodeBackup(text, passphrase)).toEqual(state);
  });
  it("uses fresh keys, salt and IV and supports independent recovery", async () => {
    const recovery = newRecoveryKey();
    const state = fixture();
    const first = await createCloudBackup(
      state,
      passphrase,
      deviceId,
      recovery,
    );
    const second = await createCloudBackup(
      state,
      passphrase,
      deviceId,
      recovery,
    );
    expect(JSON.parse(first).iv).not.toEqual(JSON.parse(second).iv);
    expect(JSON.parse(first).password.salt).not.toEqual(
      JSON.parse(second).password.salt,
    );
    expect((await inspectCloudBackup(first, recovery, true)).state).toEqual(
      state,
    );
  });
  it("rejects wrong passphrases, corrupted ciphertext, changed metadata and unsupported versions", async () => {
    const text = await createCloudBackup(fixture(), passphrase, deviceId);
    await expect(
      inspectCloudBackup(text, "wrong synthetic phrase"),
    ).rejects.toThrow(/Cannot unlock/);
    for (const change of [
      (e: Record<string, unknown>) => {
        e.data = "AAAA";
      },
      (e: Record<string, unknown>) => {
        (e.metadata as Record<string, unknown>).revision = 100;
      },
      (e: Record<string, unknown>) => {
        (e.metadata as Record<string, unknown>).format = "v99";
      },
      (e: Record<string, unknown>) => {
        e.iv = "AAAA";
      },
      (e: Record<string, unknown>) => {
        (e.password as Record<string, unknown>).salt = "AAAA";
      },
      (e: Record<string, unknown>) => {
        (e.metadata as Record<string, unknown>).iterations = 1;
      },
    ]) {
      const envelope = JSON.parse(text);
      change(envelope);
      await expect(
        inspectCloudBackup(JSON.stringify(envelope), passphrase),
      ).rejects.toThrow();
    }
  });
  it("rewraps only the data key without changing payload and retains the original readable version", async () => {
    const state = fixture();
    const original = await createCloudBackup(state, passphrase, deviceId);
    const changed = await rewrapCloudBackup(
      original,
      passphrase,
      "new synthetic passphrase",
    );
    expect(JSON.parse(changed).data).toBe(JSON.parse(original).data);
    expect(
      (await inspectCloudBackup(changed, "new synthetic passphrase")).state,
    ).toEqual(state);
    await expect(inspectCloudBackup(changed, passphrase)).rejects.toThrow();
    expect((await inspectCloudBackup(original, passphrase)).state).toEqual(
      state,
    );
  });
  it("keeps existing manual encrypted backups readable and rejects oversized or invalid files", async () => {
    const state = fixture();
    expect(
      await decodeBackup(await encryptBackup(state, passphrase), passphrase),
    ).toEqual(state);
    await expect(inspectCloudBackup("{", passphrase)).rejects.toThrow();
    await expect(
      createCloudBackup(fixture(), "short", deviceId),
    ).rejects.toThrow(/12/);
    await expect(
      inspectCloudBackup(" ".repeat(50_000_001), passphrase),
    ).rejects.toThrow(/50 MB/);
  });
  it("encrypts and validates a larger synthetic attached-receipt payload", async () => {
    const state = fixture();
    const transaction = tx("expense", "1");
    transaction.receipt = {
      name: "synthetic.pdf",
      mime: "application/pdf",
      data: "data:application/pdf;base64," + "A".repeat(1_000_000),
    };
    state.transactions.push(transaction);
    const text = await createCloudBackup(state, passphrase, deviceId);
    expect((await inspectCloudBackup(text, passphrase)).state).toEqual(state);
  });
});
async function setupController() {
  const db = await openDatabase(`TEST-cloud-${crypto.randomUUID()}`);
  const repo = new Repository(db);
  await repo.restore(fixture());
  const controller = new CloudBackupController();
  vi.spyOn(controller.session, "driveIdentity", "get").mockReturnValue({
    sub: "owner",
    email: "synthetic@example.test",
  });
  vi.spyOn(GoogleDriveRepository.prototype, "list").mockResolvedValue([]);
  let uploaded = "";
  const upload = vi
    .spyOn(GoogleDriveRepository.prototype, "upload")
    .mockImplementation(async (text) => {
      uploaded = text;
      return file;
    });
  vi.spyOn(GoogleDriveRepository.prototype, "download").mockImplementation(
    async () => uploaded,
  );
  const verified = vi
    .spyOn(GoogleDriveRepository.prototype, "markVerified")
    .mockResolvedValue();
  const remove = vi
    .spyOn(GoogleDriveRepository.prototype, "remove")
    .mockResolvedValue();
  await controller.unlock(passphrase, passphrase, repo);
  return { db, repo, controller, upload, verified, remove };
}
describe("durable active-application backup engine", () => {
  it("uploads ciphertext, downloads and authenticates before marking success; avoids unchanged automatic duplicates", async () => {
    const { db, repo, controller, upload, verified } = await setupController();
    try {
      await controller.run(repo);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload.mock.calls[0][0]).not.toContain("TEST");
      expect(verified).toHaveBeenCalledTimes(1);
      const queue = await backupQueue();
      expect(queue.status).toBe("verified");
      expect(queue.pending).toBeUndefined();
      expect(queue.verifiedRevision).toBe((await repo.read()).revision);
      await controller.run(repo);
      expect(upload).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });
  it("retains encrypted pending payload and earlier backups after failed upload, with bounded exponential retry", async () => {
    const { db, repo, controller, upload, remove } = await setupController();
    try {
      upload.mockRejectedValue(
        new DriveError("transient", "Network unavailable"),
      );
      await controller.run(repo);
      const queue = await backupQueue();
      expect(queue.status).toBe("retry scheduled");
      expect(queue.pending?.text).toBeTruthy();
      expect(queue.verifiedRevision).toBe(-1);
      expect(queue.retryAt).toBeGreaterThan(Date.now());
      expect(remove).not.toHaveBeenCalled();
      await controller.run(repo);
      expect(upload).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });
  it("does not mark verified or prune when uploaded bytes fail integrity", async () => {
    const { db, repo, controller, verified, remove } = await setupController();
    try {
      vi.mocked(GoogleDriveRepository.prototype.download).mockResolvedValue(
        "{}",
      );
      await expect(controller.run(repo, true)).rejects.toThrow(/did not match/);
      expect((await backupQueue()).pending).toBeDefined();
      expect(verified).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it("retains writes made during upload as dirty for another backup", async () => {
    const { db, repo, controller, upload } = await setupController();
    try {
      const original = upload.getMockImplementation()!;
      upload.mockImplementation(async (...args) => {
        await repo.update("Synthetic concurrent transaction", (state) =>
          state.transactions.push(tx("income", "1")),
        );
        return original(...args);
      });
      await controller.run(repo);
      const queue = await backupQueue();
      expect(queue.latestRevision).toBeGreaterThan(queue.verifiedRevision);
    } finally {
      db.close();
    }
  });
  it("discovers pending revisions after restart while preserving local offline operation", async () => {
    const { db, repo, controller, upload } = await setupController();
    try {
      await controller.run(repo);
      await repo.update("Synthetic offline write", (state) =>
        state.transactions.push(tx("income", "1")),
      );
      controller.lock();
      const restarted = new CloudBackupController();
      const restartedIdentity = vi
        .spyOn(restarted.session, "driveIdentity", "get")
        .mockReturnValue(undefined);
      await restarted.run(repo);
      expect((await backupQueue()).status).toBe("authorization required");
      expect((await cloudConfig()).enabled).toBe(true);
      restartedIdentity.mockReturnValue({
        sub: "owner",
        email: "synthetic@example.test",
      });
      await restarted.run(repo);
      expect((await backupQueue()).status).toBe("encryption required");
      expect((await cloudConfig()).enabled).toBe(true);
      expect((await repo.read()).transactions).toHaveLength(1);
      expect(upload).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });
  it("does not retry permanent authorization failures or upload to another account", async () => {
    const { db, repo, controller, upload } = await setupController();
    try {
      vi.spyOn(controller.session, "driveIdentity", "get").mockReturnValue({
        sub: "other",
        email: "other@example.test",
      });
      await controller.run(repo);
      expect((await backupQueue()).status).toBe("authorization required");
      expect(upload).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it("disabled automatic backup and locked encryption never upload", async () => {
    const { db, repo, controller, upload } = await setupController();
    try {
      await configureCloud({ enabled: false });
      await controller.run(repo);
      expect(upload).not.toHaveBeenCalled();
      controller.lock();
      await controller.run(repo, true);
      expect((await backupQueue()).status).toBe("encryption required");
      expect(upload).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it("retains recent, monthly and protected versions and only prunes after verification", async () => {
    const { db, repo, controller, verified, remove } = await setupController();
    try {
      vi.mocked(GoogleDriveRepository.prototype.list).mockResolvedValue([
        file,
        { ...file, id: "recent", createdTime: "2026-11-09T12:00:00Z" },
        { ...file, id: "monthly", createdTime: "2026-10-30T12:00:00Z" },
        { ...file, id: "prunable", createdTime: "2026-10-20T12:00:00Z" },
        {
          ...file,
          id: "protected",
          createdTime: "2026-10-10T12:00:00Z",
          appProperties: { ...file.appProperties, protected: "true" },
        },
      ]);
      await controller.run(repo);
      expect(remove.mock.calls.map(([file]) => file.id)).toEqual(["prunable"]);
      expect(verified.mock.invocationCallOrder[0]).toBeLessThan(
        remove.mock.invocationCallOrder[0],
      );
    } finally {
      db.close();
    }
  });
  it("pruning failure never converts a verified upload into a failed backup", async () => {
    const { db, repo, controller, remove } = await setupController();
    try {
      vi.mocked(GoogleDriveRepository.prototype.list).mockResolvedValue([
        file,
        { ...file, id: "recent", createdTime: "2026-11-09T12:00:00Z" },
        { ...file, id: "old", createdTime: "2026-11-08T12:00:00Z" },
      ]);
      remove.mockRejectedValue(new Error("quota"));
      await controller.run(repo);
      expect((await backupQueue()).status).toBe("verified");
      expect((await backupQueue()).pending).toBeUndefined();
    } finally {
      db.close();
    }
  });
  it("sign-out is independent of Drive and never changes local records", async () => {
    const session = new GoogleSession();
    session.identity = {
      sub: "synthetic",
      email: "synthetic@example.test",
      expiresAt: Date.now() + 10000,
    };
    const disconnect = vi.spyOn(session, "disconnectDrive");
    session.signOut();
    expect(session.identity).toBeUndefined();
    expect(disconnect).not.toHaveBeenCalled();
    expect((await cloudConfig()).owner).toBe("owner");
  });
});

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceSync,
  type SyncBinding,
  type SyncMarkers,
} from "../src/workspace-sync";
import {
  SyncConflict,
  syncDigest,
  splitSyncCiphertext,
  workspaceDigest,
  type SyncHead,
  type SyncRemote,
} from "../src/sync-protocol";
import { createCloudBackup, inspectCloudBackup } from "../src/cloud-crypto";
import { openDatabase, Repository } from "../src/storage";
import { fixture, tx } from "./fixtures";

const secret = "TEST isolated sync passphrase";
const databases: IDBDatabase[] = [];
beforeEach(() => {
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
  databases.splice(0).forEach((db) => db.close());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
class Remote implements SyncRemote {
  owner = "TEST-owner";
  project = "demo-pennywise";
  current: SyncHead | null = null;
  snapshots = new Map<string, string>();
  commits = 0;
  failure?: Error;
  corrupt = false;
  race?: () => void;
  async head() {
    if (this.failure) throw this.failure;
    return this.current;
  }
  async read(head: SyncHead) {
    return this.corrupt ? "{}" : this.snapshots.get(head.id)!;
  }
  async commit(expected: string | null, text: string) {
    this.race?.();
    this.race = undefined;
    if ((this.current?.id ?? null) !== expected) throw new SyncConflict();
    if (this.failure) throw this.failure;
    const chunks = splitSyncCiphertext(text).length;
    const head: SyncHead = {
      protocol: 1,
      id: crypto.randomUUID(),
      chunks,
      digest: await syncDigest(text),
      previous: this.current
        ? { id: this.current.id, chunks: this.current.chunks }
        : null,
    };
    this.snapshots.set(head.id, text);
    this.current = head;
    this.commits++;
    return head;
  }
  watch() {
    return () => undefined;
  }
  async close() {}
}
async function device(remote: Remote, state = fixture()) {
  const db = await openDatabase(`TEST-sync-${crypto.randomUUID()}`);
  databases.push(db);
  const repo = new Repository(db);
  await repo.restore(state);
  let saved: SyncBinding | undefined;
  let blocked = false;
  let afterReplace: (() => Promise<void>) | undefined;
  const markers: SyncMarkers = {
    async read() {
      return saved ? structuredClone(saved) : undefined;
    },
    async write(value) {
      saved = structuredClone(value);
    },
  };
  const sync = new WorkspaceSync(
    {
      read: () => repo.read(),
      canApply: () => !blocked,
      replace: async (replacement, revision) => {
        await repo.update("Restore sync test", (local) => {
          if (local.revision !== revision)
            throw new Error("Concurrent local write");
          const audit = local.audit;
          Object.assign(local, replacement);
          local.audit = [...audit, ...replacement.audit];
        });
        await afterReplace?.();
        return repo.read();
      },
    },
    markers,
  );
  await sync.connect(remote);
  return {
    sync,
    repo,
    markers,
    afterReplace: (run: () => Promise<void>) => {
      afterReplace = run;
    },
    block: (value: boolean) => {
      blocked = value;
    },
  };
}
async function publish(target: Awaited<ReturnType<typeof device>>) {
  await target.sync.unlock(secret, secret);
  await target.sync.choose("local");
}
async function receive(target: Awaited<ReturnType<typeof device>>) {
  await target.sync.unlock(secret, secret);
  await target.sync.choose("remote");
}
describe("encrypted account-bound workspace synchronization", () => {
  it("explains provider quota failures, retains records and stops automatic retries", async () => {
    const remote = new Remote();
    const target = await device(remote);
    await publish(target);
    await target.repo.update("TEST queued local expense", (state) =>
      state.transactions.push(tx("expense", "10")),
    );
    const before = await target.repo.read();
    remote.failure = Object.assign(new Error("TEST-private-provider-context"), {
      code: "resource-exhausted",
    });
    await target.sync.run();
    expect(target.sync.status.phase).toBe("error");
    expect(target.sync.status.message).toContain("Stop repeated retries");
    expect(target.sync.status.message).not.toContain("TEST-private");
    expect(await target.repo.read()).toEqual(before);
    remote.failure = undefined;
    await target.sync.run(true);
    expect(remote.commits).toBe(1);
    await target.sync.run();
    expect(remote.commits).toBe(2);
    expect(target.sync.status.phase).toBe("synced");
  });
  it("keeps edits made immediately after an incoming commit queued for upload", async () => {
    const remote = new Remote();
    const a = await device(remote);
    await publish(a);
    const b = await device(remote);
    await receive(b);
    b.afterReplace(async () => {
      await b.repo.update("TEST newer local edit", (s) =>
        s.transactions.push(tx("income", "10")),
      );
    });
    await a.repo.update("TEST remote edit", (s) => s.accounts[0].opening++);
    await a.sync.run();
    await b.sync.run();
    expect(remote.commits).toBe(2);
    await b.sync.run();
    expect(remote.commits).toBe(3);
    const synced = await inspectCloudBackup(
      remote.snapshots.get(remote.current!.id)!,
      secret,
    );
    expect(synced.state.transactions).toHaveLength(1);
  });
  it("requires explicit linking, then moves real validated records between independent repositories without echo", async () => {
    const remote = new Remote();
    const a = await device(remote);
    await a.sync.unlock(secret, secret);
    expect(remote.commits).toBe(0);
    expect(a.sync.status.phase).toBe("review");
    await a.sync.choose("local");
    expect(remote.snapshots.get(remote.current!.id)).not.toContain(
      "TEST everyday",
    );
    const b = await device(remote);
    await receive(b);
    await a.repo.update("TEST expense", (s) =>
      s.transactions.push(tx("expense", "120")),
    );
    await a.sync.run();
    await b.sync.run();
    expect((await b.repo.read()).transactions).toEqual(
      (await a.repo.read()).transactions,
    );
    await b.sync.run();
    await a.sync.run();
    expect(remote.commits).toBe(2);
    expect(b.sync.status.phase).toBe("synced");
  });
  it("stops concurrent offline edits for review and keeps both cloud/local safety versions", async () => {
    const remote = new Remote();
    const a = await device(remote);
    await publish(a);
    const b = await device(remote);
    await receive(b);
    await a.repo.update("TEST first device", (s) =>
      s.transactions.push(tx("expense", "100")),
    );
    await b.repo.update("TEST second device", (s) =>
      s.transactions.push(tx("income", "500")),
    );
    await a.sync.run();
    const before = await b.repo.read();
    await b.sync.run();
    expect(b.sync.status.phase).toBe("conflict");
    expect(await b.repo.read()).toEqual(before);
    await b.sync.run();
    expect(remote.commits).toBe(2);
    await b.sync.inspectConflict();
    const local = await b.sync.exportReview("local");
    const cloud = await b.sync.exportReview("remote");
    expect(
      (await inspectCloudBackup(local, secret)).state.transactions[0].type,
    ).toBe("income");
    expect(
      (await inspectCloudBackup(cloud, secret)).state.transactions[0].type,
    ).toBe("expense");
    await b.sync.choose("remote");
    expect((await b.repo.safetyBackup())!.transactions[0].type).toBe("income");
  });
  it("rejects wrong passphrases, account/project substitution and damaged ciphertext without local mutation", async () => {
    const remote = new Remote();
    const a = await device(remote);
    await publish(a);
    const b = await device(remote);
    const before = await b.repo.read();
    await expect(
      b.sync.unlock("wrong TEST passphrase", "wrong TEST passphrase"),
    ).rejects.toThrow("Cannot unlock");
    const text = remote.snapshots.get(remote.current!.id)!;
    await expect(
      inspectCloudBackup(text, secret, false, "firebase:other:TEST-owner:main"),
    ).rejects.toThrow("Cannot unlock");
    remote.corrupt = true;
    await expect(b.sync.unlock(secret, secret)).rejects.toThrow(
      "Cannot unlock",
    );
    expect(await b.repo.read()).toEqual(before);
    remote.corrupt = false;
    const other = new Remote();
    other.owner = "TEST-other";
    await b.sync.pause();
    await expect(b.sync.connect(other)).rejects.toThrow(
      "different Google account",
    );
  });
  it("does not persist secrets and preserves local work on quota, offline, pause and restart", async () => {
    const remote = new Remote();
    const a = await device(remote);
    await publish(a);
    await a.repo.update("TEST pending", (s) =>
      s.transactions.push(tx("expense", "50")),
    );
    remote.failure = new Error("resource-exhausted");
    await a.sync.run();
    expect(a.sync.status.phase).toBe("error");
    expect((await a.repo.read()).transactions).toHaveLength(1);
    expect(JSON.stringify(await a.markers.read())).not.toContain(secret);
    remote.failure = undefined;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await a.sync.run();
    expect(a.sync.status.phase).toBe("pending");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await a.sync.run();
    expect(remote.commits).toBe(2);
    await a.sync.pause();
    await a.repo.update("TEST after pause", (s) =>
      s.transactions.push(tx("income", "70")),
    );
    await a.sync.run();
    expect(remote.commits).toBe(2);
    expect((await a.markers.read())!.owner).toBe(remote.owner);
  });
  it("uses optimistic compare-and-swap instead of last-write-wins", async () => {
    const remote = new Remote();
    const a = await device(remote);
    await publish(a);
    await a.repo.update("TEST change", (s) =>
      s.transactions.push(tx("expense", "50")),
    );
    remote.race = () => {
      remote.current = { ...remote.current!, id: crypto.randomUUID() };
    };
    await a.sync.run();
    expect(a.sync.status.phase).toBe("conflict");
    expect(remote.commits).toBe(1);
  });
  it("waits for open forms and rejects stale review before replacement", async () => {
    const remote = new Remote();
    const a = await device(remote);
    await publish(a);
    const b = await device(remote);
    await receive(b);
    b.block(true);
    await a.repo.update("TEST new", (s) =>
      s.transactions.push(tx("income", "42")),
    );
    await a.sync.run();
    await b.sync.run();
    expect(b.sync.status.phase).toBe("pending");
    expect((await b.repo.read()).transactions).toEqual([]);
    b.block(false);
    await b.sync.run();
    expect((await b.repo.read()).transactions).toHaveLength(1);
    await b.sync.inspectConflict();
    await b.repo.update("TEST intervening write", (s) =>
      s.transactions.push(tx("expense", "1")),
    );
    await expect(b.sync.choose("remote")).rejects.toThrow(
      "Local records changed",
    );
  });
  it("validates size caps and does not let larger receipts break local storage", async () => {
    expect(() => splitSyncCiphertext("x".repeat(3_200_001))).toThrow("3.2 MB");
    expect(
      splitSyncCiphertext("x".repeat(400_001)).map((s) => s.length),
    ).toEqual([200000, 200000, 1]);
    const state = fixture();
    const initial = await workspaceDigest(state);
    state.revision++;
    state.audit = [];
    expect(await workspaceDigest(state)).toBe(initial);
    state.accounts[0].opening++;
    expect(await workspaceDigest(state)).not.toBe(initial);
    const legacy = await createCloudBackup(
      fixture(),
      secret,
      crypto.randomUUID(),
    );
    expect(
      (await inspectCloudBackup(legacy, secret)).state.accounts,
    ).toHaveLength(3);
  });
});

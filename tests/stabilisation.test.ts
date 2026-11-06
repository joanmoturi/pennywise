import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Repository, openDatabase } from "../src/storage";
import { accountBalance, accountBalances, summary } from "../src/engine";
import { today } from "../src/domain";
import { fullBackup, decodeBackup } from "../src/backup";
import { fixture, tx } from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function legacyDatabase(name: string, value: unknown) {
  const request = indexedDB.open(name, 3);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () =>
      request.result.createObjectStore("state").put(value, "current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
}
it.each([1, 2, 3, 4])(
  "atomically migrates a physical v3 database containing financial schema %s",
  async (version) => {
    const name = `TEST-migration-${crypto.randomUUID()}`;
    const original = fixture();
    original.transactions.push(tx("expense", "12.34"));
    const legacy: Record<string, unknown> = { ...original, version };
    if (version < 4) delete legacy.notifications;
    await legacyDatabase(name, legacy);
    const db = await openDatabase(name);
    try {
      const repo = new Repository(db);
      const state = await repo.read();
      expect(db.version).toBe(5);
      expect(state.accounts).toEqual(original.accounts);
      expect(state.transactions).toEqual(original.transactions);
      expect(summary(state)).toEqual(summary(original));
      const exported = await decodeBackup(await fullBackup(state));
      expect(exported).toEqual(state);
    } finally {
      db.close();
    }
  },
);
it("failed storage migration leaves the old database and financial records intact", async () => {
  const name = `TEST-bad-migration-${crypto.randomUUID()}`;
  const bad = fixture();
  bad.transactions.push(tx("income", "1", { accountId: "missing" }));
  await legacyDatabase(name, bad);
  await expect(openDatabase(name)).rejects.toThrow(/upgrade/);
  const request = indexedDB.open(name, 3);
  const db = await new Promise<IDBDatabase>((resolve) => {
    request.onsuccess = () => resolve(request.result);
  });
  try {
    expect(db.objectStoreNames.contains("records")).toBe(false);
    const saved = await new Promise<unknown>((resolve) => {
      const read = db.transaction("state").objectStore("state").get("current");
      read.onsuccess = () => resolve(read.result);
    });
    expect(saved).toEqual(bad);
  } finally {
    db.close();
  }
});
it("ordinary account edits read only the revision header and write only the changed record plus audit", async () => {
  const db = await openDatabase(`TEST-targeted-${crypto.randomUUID()}`);
  try {
    const repo = new Repository(db);
    await repo.restore(fixture());
    const all = vi.spyOn(IDBObjectStore.prototype, "getAll");
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    await repo.update("TEST account edit", (s) => {
      s.accounts[0].notes = "TEST revised";
    });
    expect(all).not.toHaveBeenCalled();
    const recordPuts = put.mock.calls.filter(([, key]) => Array.isArray(key));
    expect(recordPuts.map(([, key]) => (key as string[])[0])).toEqual([
      "accounts",
      "audit",
    ]);
    expect(put.mock.calls.filter(([, key]) => key === "current")).toHaveLength(
      1,
    );
    expect((await repo.read()).accounts[0].notes).toBe("TEST revised");
  } finally {
    db.close();
  }
});
it("independent connections serialize writes and invalidate cached revisions without losing records", async () => {
  const name = `TEST-tabs-${crypto.randomUUID()}`;
  const a = await openDatabase(name);
  const b = await openDatabase(name);
  try {
    const left = new Repository(a);
    const right = new Repository(b);
    await left.restore(fixture());
    await right.read();
    await Promise.all([
      left.update("TEST tab one", (s) =>
        s.transactions.push(tx("income", "1")),
      ),
      right.update("TEST tab two", (s) =>
        s.transactions.push(tx("income", "2")),
      ),
    ]);
    expect((await left.read()).transactions).toHaveLength(2);
    expect((await right.read()).transactions).toHaveLength(2);
    expect(summary(await left.read()).income).toBe(300);
  } finally {
    a.close();
    b.close();
  }
});
it.each(["constructor", "postMessage"])(
  "acknowledges committed saves even when BroadcastChannel %s throws",
  async (point) => {
    const db = await openDatabase(`TEST-broadcast-${crypto.randomUUID()}`);
    try {
      const repo = new Repository(db);
      await repo.restore(fixture());
      vi.stubGlobal(
        "BroadcastChannel",
        class {
          constructor() {
            if (point === "constructor") throw new Error("TEST unavailable");
          }
          postMessage() {
            throw new Error("TEST unavailable");
          }
          close() {}
        },
      );
      const saved = await repo.update("TEST committed write", (s) =>
        s.transactions.push(tx("income", "1")),
      );
      expect(saved.transactions).toHaveLength(1);
      expect((await repo.read()).transactions).toHaveLength(1);
    } finally {
      db.close();
    }
  },
);
it("quota failure retains every previous record and a retry commits only once", async () => {
  const db = await openDatabase(`TEST-quota-${crypto.randomUUID()}`);
  try {
    const repo = new Repository(db);
    const before = await repo.restore(fixture());
    const original = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === "records")
          throw new DOMException("TEST full", "QuotaExceededError");
        return original.call(this, value, key);
      });
    const record = tx("income", "1");
    await expect(
      repo.update("TEST quota", (s) => s.transactions.push(record)),
    ).rejects.toThrow(/storage is full/);
    expect(await repo.read()).toEqual(before);
    put.mockRestore();
    await repo.update("TEST retry", (s) => s.transactions.push(record));
    expect((await repo.read()).transactions).toEqual([record]);
  } finally {
    db.close();
  }
});
it("abort after targeted writes rolls back both records and revision metadata", async () => {
  const db = await openDatabase(`TEST-abort-${crypto.randomUUID()}`);
  try {
    const repo = new Repository(db);
    const before = await repo.restore(fixture());
    const original = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const result = original.call(this, value, key);
        if (key === "current") this.transaction.abort();
        return result;
      });
    await expect(
      repo.update("TEST interrupted", (s) =>
        s.transactions.push(tx("income", "1")),
      ),
    ).rejects.toThrow(/aborted/);
    put.mockRestore();
    expect(await new Repository(db).read()).toEqual(before);
  } finally {
    db.close();
  }
});
it("does not expose the repository's cached snapshot to caller mutation", async () => {
  const db = await openDatabase(`TEST-cache-${crypto.randomUUID()}`);
  try {
    const repo = new Repository(db);
    const saved = await repo.restore(fixture());
    saved.accounts[0].opening = 0;
    const read = await repo.read();
    expect(read.accounts[0].opening).not.toBe(0);
    read.accounts[0].opening = 1;
    const after = await repo.update("TEST unrelated", (s) => {
      s.accounts[0].notes = "TEST";
    });
    expect(after.accounts[0].opening).not.toBe(1);
  } finally {
    db.close();
  }
});
it("aggregated balances preserve per-account ledger treatment, cutoff dates and signed reversals", () => {
  const s = fixture();
  s.transactions.push(
    tx("income", "50"),
    tx("expense", "10"),
    tx("transfer", "20", { destinationId: "other" }),
    tx("loan_recovery", "3"),
    tx("liability_draw", "2"),
    tx("liability_repayment", "1"),
    tx("loan_disbursement", "4"),
    tx("expense", "-2"),
    tx("reserve_transfer", "5"),
    tx("income", "100", { date: "2026-11-03" }),
  );
  for (const date of ["2026-11-01", "2026-11-04"])
    for (const a of s.accounts)
      expect(accountBalances(s, date).get(a.id)).toBe(
        accountBalance(s, a.id, date),
      );
});
it("cached date formatting still changes at Nairobi midnight", () => {
  vi.setSystemTime(new Date("2026-11-04T20:59:59Z"));
  expect(today()).toBe("2026-11-04");
  vi.setSystemTime(new Date("2026-11-04T21:00:01Z"));
  expect(today()).toBe("2026-11-05");
});

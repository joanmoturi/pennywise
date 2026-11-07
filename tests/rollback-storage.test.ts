import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  DB_NAME,
  LEGACY_DB_NAME,
  openDatabase,
  Repository,
} from "../src/storage";
import { fixture, tx } from "./fixtures";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}
async function seedPreviousVersion() {
  const original = fixture();
  original.transactions.push(tx("expense", "123.45"));
  const legacy: Record<string, unknown> = { ...original, version: 4 };
  for (const key of ["businesses", "budgetChanges", "allowances"])
    delete legacy[key];
  const collections = Object.entries(legacy)
    .filter(([key, value]) => key !== "notifications" && Array.isArray(value))
    .map(([key, value]) => [key, value as { id: string }[]] as const);
  for (const [key, value] of Object.entries(original.notifications))
    collections.push([`notifications.${key}`, value]);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME, 4);
    request.onupgradeneeded = () => {
      const state = request.result.createObjectStore("state");
      const records = request.result.createObjectStore("records");
      state.put(
        {
          format: "kichella-records-v1",
          version: 4,
          revision: original.revision,
          settings: original.settings,
          order: Object.fromEntries(
            collections.map(([key, rows]) => [key, rows.map((r) => r.id)]),
          ),
        },
        "current",
      );
      state.put(legacy, "safety-before-destructive");
      for (const [collection, rows] of collections)
        for (const value of rows)
          records.put({ collection, id: value.id, value }, [
            collection,
            value.id,
          ]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return { db, original };
}
async function contents(db: IDBDatabase) {
  const transaction = db.transaction(["state", "records"]);
  const header = transaction.objectStore("state").get("current");
  const records = transaction.objectStore("records").getAll();
  const safety = transaction
    .objectStore("state")
    .get("safety-before-destructive");
  await complete(transaction);
  return {
    header: header.result,
    records: records.result,
    safety: safety.result,
  };
}
it("copies once, preserves the old version exactly and never overwrites newer entries on reopening", async () => {
  const { db: previous, original } = await seedPreviousVersion();
  const before = await contents(previous);
  const [first, second] = await Promise.all([openDatabase(), openDatabase()]);
  try {
    expect(first.name).toBe(DB_NAME);
    expect(first.version).toBe(5);
    expect(previous.version).toBe(4);
    const repo = new Repository(first);
    expect((await repo.read()).transactions).toEqual(original.transactions);
    expect((await repo.read()).accounts).toEqual(original.accounts);
    expect((await repo.safetyBackup())!.transactions).toEqual(
      original.transactions,
    );
    await repo.update("TEST new-version expense", (state) =>
      state.transactions.push(tx("expense", "5")),
    );
    expect((await new Repository(second).read()).transactions).toHaveLength(2);
    expect(await contents(previous)).toEqual(before);
  } finally {
    first.close();
    second.close();
    previous.close();
  }
  const reopened = await openDatabase();
  try {
    expect((await new Repository(reopened).read()).transactions).toHaveLength(
      2,
    );
  } finally {
    reopened.close();
  }
  const rollback = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME, 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    expect(await contents(rollback)).toEqual(before);
  } finally {
    rollback.close();
  }
});
it("rolls back a failed copy and retries without changing the old database", async () => {
  const { db: previous, original } = await seedPreviousVersion();
  const before = await contents(previous);
  const put = IDBObjectStore.prototype.put;
  const failure = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        this.transaction.db.name === DB_NAME &&
        key === "legacy-copy-complete"
      )
        throw new DOMException("TEST copy failure", "QuotaExceededError");
      return put.call(this, value, key);
    });
  await expect(openDatabase()).rejects.toThrow("TEST copy failure");
  expect(await contents(previous)).toEqual(before);
  failure.mockRestore();
  const retry = await openDatabase();
  try {
    expect((await new Repository(retry).read()).transactions).toEqual(
      original.transactions,
    );
    expect(await contents(previous)).toEqual(before);
  } finally {
    retry.close();
    previous.close();
  }
});
it("starts clean without creating or replacing a previous-version database", async () => {
  const db = await openDatabase();
  try {
    expect((await new Repository(db).read()).accounts).toEqual([]);
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(
      LEGACY_DB_NAME,
    );
  } finally {
    db.close();
  }
});
it("refuses an incomplete old workspace rather than silently starting empty", async () => {
  const { db: previous } = await seedPreviousVersion();
  const remove = previous.transaction("records", "readwrite");
  remove.objectStore("records").delete(["accounts", "cash"]);
  await complete(remove);
  const before = await contents(previous);
  try {
    await expect(openDatabase()).rejects.toThrow("incomplete");
    expect(await contents(previous)).toEqual(before);
  } finally {
    previous.close();
  }
});

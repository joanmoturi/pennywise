import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectBackup, encryptBackup } from "../src/backup";
import { openDatabase, Repository } from "../src/storage";
import { fixture, tx } from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
it.each(["deployed-schema4.json", "deployed-schema4.encrypted.json"])(
  "restores actual deployed %s without guessing business ownership",
  async (file) => {
    const contents = await readFile(resolve("tests", "fixtures", file), "utf8");
    const preview = await inspectBackup(
      contents,
      file.includes("encrypted") ? "TEST-only-backup-passphrase" : "",
    );
    expect(preview.integrityVerified).toBe(true);
    expect(preview.state.version).toBe(5);
    expect(preview.state.businesses).toEqual([]);
    expect(preview.state.budgetChanges).toEqual([]);
    expect(preview.state.allowances).toEqual([]);
    expect(preview.state.accounts[0].name).toBe("DEMO everyday account");
    const roundTrip = await inspectBackup(
      await encryptBackup(preview.state, "TEST-only-new-schema-passphrase"),
      "TEST-only-new-schema-passphrase",
    );
    expect(roundTrip.state).toEqual(preview.state);
  },
);
it("atomically upgrades the deployed physical-v4 record layout and preserves its safety backup", async () => {
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
  const name = `TEST-physical4-${crypto.randomUUID()}`;
  const before = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 4);
    request.onupgradeneeded = () => {
      const state = request.result.createObjectStore("state");
      const records = request.result.createObjectStore("records");
      state.put(
        {
          format: "kichella-records-v1",
          version: 4,
          revision: legacy.revision,
          settings: legacy.settings,
          order: Object.fromEntries(
            collections.map(([key, values]) => [key, values.map((v) => v.id)]),
          ),
        },
        "current",
      );
      state.put(legacy, "safety-before-destructive");
      for (const [collection, values] of collections)
        for (const value of values)
          records.put({ collection, id: value.id, value }, [
            collection,
            value.id,
          ]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  before.close();
  const db = await openDatabase(name);
  try {
    const repo = new Repository(db);
    expect(db.version).toBe(5);
    const state = await repo.read();
    expect(state.accounts).toEqual(original.accounts);
    expect(state.transactions).toEqual(original.transactions);
    expect(state.budgets).toEqual(original.budgets);
    expect((await repo.safetyBackup())!.transactions).toEqual(
      original.transactions,
    );
    const safety = await new Promise<unknown>((resolve) => {
      const request = db
        .transaction("state")
        .objectStore("state")
        .get("safety-before-schema-5");
      request.onsuccess = () => resolve(request.result);
    });
    expect(safety).toBeDefined();
    await repo.update("TEST migrated ordinary write", (draft) => {
      draft.accounts[0].notes = "Survives reload";
    });
    expect((await new Repository(db).read()).accounts[0].notes).toBe(
      "Survives reload",
    );
  } finally {
    db.close();
  }
});

it("aborts a malformed physical-v4 record migration without overwriting its original header", async () => {
  const name = `TEST-invalid-physical4-${crypto.randomUUID()}`;
  const header = {
    format: "kichella-records-v1",
    version: 4,
    revision: 1,
    settings: fixture().settings,
    order: { accounts: ["missing-record"] },
  };
  const before = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 4);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("records");
      request.result.createObjectStore("state").put(header, "current");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  before.close();
  await expect(openDatabase(name)).rejects.toThrow(
    "Existing records were not reset",
  );
  const original = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    expect(original.version).toBe(4);
    const saved = await new Promise<unknown>((resolve) => {
      const request = original
        .transaction("state")
        .objectStore("state")
        .get("current");
      request.onsuccess = () => resolve(request.result);
    });
    expect(saved).toEqual(header);
  } finally {
    original.close();
  }
});

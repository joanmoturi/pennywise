import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  fullBackup,
  decodeBackup,
  encryptBackup,
  inspectBackup,
} from "../src/backup";
import { Repository, openDatabase, migrate } from "../src/storage";
import { summary, validateState } from "../src/engine";
import {
  generateOccurrences,
  recordPrepaid,
  commitCapture,
  finalizeReview,
} from "../src/expense-engine";
import {
  cash,
  fixture,
  tx,
  liability,
  receivable,
  reserve,
  budget,
  recurring,
  prepaid,
} from "./fixtures";
import type { State } from "../src/domain";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T09:00:00Z"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function repository() {
  const db = await openDatabase(`TEST-${crypto.randomUUID()}`);
  return { db, repo: new Repository(db) };
}
function allRecords(): State {
  const s = fixture();
  liability(s);
  receivable(s);
  reserve(s);
  const b = budget(s);
  recurring(s);
  generateOccurrences(s, "2027-01-01");
  recordPrepaid(s, prepaid());
  s.transactions.push(
    tx("expense", "8000", {
      receipt: {
        name: "test.png",
        mime: "image/png",
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=",
      },
    }),
  );
  s.occasional.push({
    id: "occasion",
    name: "TEST gift",
    category: "Gifts",
    estimated: cash("1000"),
    month: "2026-12",
    pattern: "",
    priority: 3,
    maximum: cash("1000"),
    savingsTarget: 0,
    notes: "",
  });
  commitCapture(s, {
    id: "capture",
    budgetId: b.id,
    category: "Food",
    date: "2026-11-01",
    accountId: "cash",
    actions: [
      { kind: "reserve", reserveId: "emergency", amount: cash("2000") },
    ],
    notes: "",
  });
  finalizeReview(s, b);
  s.scenarios.push({
    id: "scenario",
    name: "TEST emergency",
    days: 90,
    income: 0,
    expense: cash("1000"),
    monthlyIncome: 0,
    spendingBps: 8000,
    delayDays: 0,
    includeExpected: true,
  });
  return validateState(s);
}
describe("comprehensive portable backups", () => {
  it("exports all records, attachments and relationships, not just visible dashboard data", async () => {
    const original = allRecords();
    const file = await fullBackup(original);
    const envelope = JSON.parse(file);
    expect(envelope.schemaVersion).toBe(3);
    expect(envelope.integrity.algorithm).toBe("SHA-256");
    const restored = await decodeBackup(file);
    expect(restored).toEqual(original);
    expect(restored.transactions.find((t) => t.receipt)?.receipt).toEqual(
      original.transactions.find((t) => t.receipt)?.receipt,
    );
    expect(summary(restored)).toEqual(summary(original));
  });
  it("restores a full backup into an independent fresh database (cross-device simulation)", async () => {
    const original = allRecords();
    const a = await repository();
    const b = await repository();
    try {
      await a.repo.restore(original);
      const downloaded = await fullBackup(await a.repo.read());
      await b.repo.restore(await decodeBackup(downloaded));
      const restored = await b.repo.read();
      for (const key of [
        "accounts",
        "transactions",
        "recurring",
        "occurrences",
        "prepaids",
        "captures",
        "reviews",
        "budgets",
        "liabilities",
        "receivables",
        "reserves",
        "scenarios",
      ] as const)
        expect(restored[key]).toEqual(original[key]);
      expect(summary(restored)).toEqual(summary(original));
    } finally {
      a.db.close();
      b.db.close();
    }
  });
  it("verifies integrity including metadata and detects single-field alteration", async () => {
    const file = JSON.parse(await fullBackup(allRecords()));
    file.data.accounts[0].opening++;
    await expect(decodeBackup(JSON.stringify(file))).rejects.toThrow(
      /integrity/,
    );
    const metadata = JSON.parse(await fullBackup(allRecords()));
    metadata.appVersion = "changed";
    await expect(decodeBackup(JSON.stringify(metadata))).rejects.toThrow(
      /integrity/,
    );
  });
  it.each(["", "{", '{"format":"unknown"}', '{"version":99}', '{"version":3}'])(
    "rejects malformed or unsupported backups %s",
    async (file) => {
      await expect(decodeBackup(file)).rejects.toThrow();
    },
  );
  it("detects incomplete envelope and unsupported envelope versions", async () => {
    const file = JSON.parse(await fullBackup(fixture()));
    delete file.data;
    await expect(decodeBackup(JSON.stringify(file))).rejects.toThrow();
    const next = JSON.parse(await fullBackup(fixture()));
    next.backupVersion = 2;
    await expect(decodeBackup(JSON.stringify(next))).rejects.toThrow();
  });
  it("detects duplicate IDs and missing relationships before restoration", () => {
    const s = fixture();
    s.accounts.push({ ...s.accounts[0] });
    expect(() => migrate(s)).toThrow(/Duplicate/);
    const other = allRecords();
    other.recurring = [];
    expect(() => migrate(other)).toThrow();
  });
  it("migrates older v1/v2 backups with IDs and amounts unchanged", async () => {
    for (const version of [1, 2]) {
      const s = fixture();
      const {
        recurring: _r,
        occurrences: _o,
        occasional: _oc,
        prepaids: _p,
        captures: _c,
        reviews: _rv,
        ...old
      } = s;
      void [_r, _o, _oc, _p, _c, _rv];
      const legacy = {
        ...old,
        version,
        budgets: old.budgets.map(({ profileId: _id, ...b }) => {
          void _id;
          return b;
        }),
      };
      const preview = await inspectBackup(JSON.stringify(legacy));
      expect(preview.integrityVerified).toBe(false);
      expect(preview.state.accounts).toEqual(s.accounts);
      expect(preview.state.version).toBe(3);
      expect(preview.state.recurring).toEqual([]);
    }
  });
  it("encrypts portable full backups with authenticated round-trip", async () => {
    const original = allRecords();
    const file = await encryptBackup(original, "a private test passphrase");
    expect(file).not.toContain("TEST everyday");
    expect(await decodeBackup(file, "a private test passphrase")).toEqual(
      original,
    );
  });
  it("uses fresh salts and IVs for repeated password-protected exports", async () => {
    const s = fixture();
    const a = JSON.parse(await encryptBackup(s, "a private test passphrase"));
    const b = JSON.parse(await encryptBackup(s, "a private test passphrase"));
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });
  it("rejects wrong passwords, short passwords and damaged ciphertext", async () => {
    const file = await encryptBackup(fixture(), "a private test passphrase");
    await expect(
      decodeBackup(file, "a different test passphrase"),
    ).rejects.toThrow(/Wrong passphrase/);
    await expect(encryptBackup(fixture(), "short")).rejects.toThrow(/12/);
    const envelope = JSON.parse(file);
    envelope.data = "A" + envelope.data.slice(1);
    await expect(
      decodeBackup(JSON.stringify(envelope), "a private test passphrase"),
    ).rejects.toThrow();
  });
});
describe("transactional IndexedDB reliability", () => {
  it("persists independently of component state and survives database reopening", async () => {
    const name = `TEST-persist-${crypto.randomUUID()}`;
    const db = await openDatabase(name);
    const repo = new Repository(db);
    await repo.restore(fixture());
    await repo.update("TEST record income", (s) =>
      s.transactions.push(tx("income", "123.45")),
    );
    db.close();
    const reopened = await openDatabase(name);
    try {
      expect(summary(await new Repository(reopened).read()).income).toBe(
        cash("123.45"),
      );
    } finally {
      reopened.close();
    }
  });
  it("does not regenerate initial budget IDs between reads and first writes", async () => {
    const { db, repo } = await repository();
    try {
      const first = await repo.read();
      const next = await repo.update("TEST activate initial profile", (s) => {
        s.settings.activeBudgetId = first.budgets[1].id;
      });
      expect(next.budgets.map((b) => b.id)).toEqual(
        first.budgets.map((b) => b.id),
      );
    } finally {
      db.close();
    }
  });
  it("serializes concurrent updates without lost transactions", async () => {
    const { db, repo } = await repository();
    try {
      await repo.restore(fixture());
      await Promise.all([
        repo.update("TEST A", (s) => s.transactions.push(tx("income", "1"))),
        repo.update("TEST B", (s) => s.transactions.push(tx("income", "2"))),
      ]);
      expect(summary(await repo.read()).income).toBe(cash("3"));
    } finally {
      db.close();
    }
  });
  it("failed mutation or invalid restoration leaves all current data unchanged", async () => {
    const { db, repo } = await repository();
    try {
      await repo.restore(allRecords());
      const before = await repo.read();
      await expect(
        repo.update("TEST interruption", (s) => {
          s.transactions = [];
          throw new Error("interrupted");
        }),
      ).rejects.toThrow("interrupted");
      expect(await repo.read()).toEqual(before);
      const bad = { ...fixture(), accounts: [] };
      bad.transactions.push(tx("expense", "1"));
      await expect(repo.restore(bad)).rejects.toThrow(/missing/);
      expect(await repo.read()).toEqual(before);
      await repo.update("TEST after failure", (s) =>
        s.transactions.push(tx("income", "1")),
      );
      expect(summary(await repo.read()).income).toBe(cash("1"));
    } finally {
      db.close();
    }
  });
  it("rolls back an interrupted database restore even after a put request", async () => {
    const { db, repo } = await repository();
    try {
      await repo.restore(allRecords());
      const before = await repo.read();
      const original = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = original.call(this, value, key);
        if (key === "current" && (value as State).settings.demo)
          this.transaction.abort();
        return request;
      });
      const replacement = fixture();
      replacement.settings.demo = true;
      await expect(repo.restore(replacement)).rejects.toThrow(/aborted/);
      expect(await repo.read()).toEqual(before);
    } finally {
      db.close();
    }
  });
  it("creates a full local safety snapshot before destructive restore and reset", async () => {
    const { db, repo } = await repository();
    try {
      await repo.restore(allRecords());
      const before = await repo.read();
      await repo.reset();
      expect((await repo.safetyBackup())?.transactions).toEqual(
        before.transactions,
      );
      expect((await repo.read()).transactions).toHaveLength(0);
    } finally {
      db.close();
    }
  });
  it("records monetary before/after changes in local audit history", async () => {
    const { db, repo } = await repository();
    try {
      await repo.restore(fixture());
      const saved = await repo.update("TEST ledger addition", (s) =>
        s.transactions.push(tx("income", "10")),
      );
      expect(saved.audit.at(-1)?.after).toContain('"amount":1000');
      expect(saved.audit.at(-1)?.before).toContain("deleted");
    } finally {
      db.close();
    }
  });
});

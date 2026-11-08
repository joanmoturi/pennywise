import { initialState, uid, type State } from "./domain";
import { validateState } from "./engine";
import { timing } from "./performance";
import { stampCurrency, workspaceHasMoney } from "./currency";

export const DB_NAME = "pennywise-connected-v5";
export const LEGACY_DB_NAME = "pennywise-private";
const DB_VERSION = 5;
const DATABASE_DEADLINE_MS = 15000;
const collections = [
  "accounts",
  "transactions",
  "incomes",
  "liabilities",
  "receivables",
  "bonds",
  "events",
  "budgets",
  "necessities",
  "reserves",
  "rules",
  "scenarios",
  "recurring",
  "occurrences",
  "occasional",
  "prepaids",
  "captures",
  "reviews",
  "audit",
  "businesses",
  "budgetChanges",
  "allowances",
  "notifications.inbox",
  "notifications.rules",
  "notifications.sources",
] as const;
type Collection = (typeof collections)[number];
interface StoredRecord {
  collection: Collection;
  id: string;
  value: { id: string };
}
interface Header {
  format: "kichella-records-v1";
  version: number;
  revision: number;
  settings: State["settings"];
  order: Record<Collection, string[]>;
}
function records(s: State, key: Collection): { id: string }[] {
  if (key === "notifications.inbox") return s.notifications.inbox;
  if (key === "notifications.rules") return s.notifications.rules;
  if (key === "notifications.sources") return s.notifications.sources;
  return s[key];
}
function header(s: State): Header {
  return {
    format: "kichella-records-v1",
    version: s.version,
    revision: s.revision,
    settings: s.settings,
    order: Object.fromEntries(
      collections.map((key) => [key, records(s, key).map((r) => r.id)]),
    ) as Header["order"],
  };
}
function recordKey(collection: Collection, id: string): string {
  return JSON.stringify([collection, id]);
}
function index(s: State): Map<string, StoredRecord> {
  return new Map(
    collections.flatMap((collection) =>
      records(s, collection).map(
        (value) =>
          [
            recordKey(collection, value.id),
            { collection, id: value.id, value },
          ] as const,
      ),
    ),
  );
}
function assemble(meta: Header, entries: StoredRecord[]): State {
  const byId = new Map(
    entries.map((r) => [recordKey(r.collection, r.id), r.value]),
  );
  const data: Record<string, unknown> = {
    version: meta.version,
    revision: meta.revision,
    settings: meta.settings,
  };
  const notifications: Record<string, unknown> = {};
  for (const key of collections) {
    const ids = meta.order[key] ?? (meta.version < 5 ? [] : undefined);
    if (!ids)
      throw new Error("Missing financial collection. No data was overwritten.");
    const values = ids.map((id) => {
      const value = byId.get(recordKey(key, id));
      if (!value)
        throw new Error(
          "Local storage is incomplete. No data was overwritten.",
        );
      return value;
    });
    if (key.startsWith("notifications."))
      notifications[key.split(".")[1]] = values;
    else data[key] = values;
  }
  data.notifications = notifications;
  return migrate(data);
}
function snapshot(store: IDBObjectStore, s: State) {
  for (const r of index(s).values()) store.put(r, [r.collection, r.id]);
}
export function migrate(input: unknown): State {
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    (input.version === 1 || input.version === 2)
  ) {
    const old = input as Record<string, unknown>;
    const defaults = initialState();
    return validateState({
      ...old,
      version: 5,
      businesses: [],
      budgetChanges: [],
      allowances: [],
      audit: old.audit ?? [],
      settings: {
        ...defaults.settings,
        ...(old.settings as Record<string, unknown>),
      },
      budgets: (old.budgets as Record<string, unknown>[]).map((b) => ({
        ...b,
        profileId: b.id,
        allocations: (b.allocations as Record<string, unknown>[]).map((a) => ({
          ...a,
          rolloverRule: b.rollover ? "full" : "none",
          rolloverAmount: 0,
        })),
      })),
      recurring: [],
      occurrences: [],
      occasional: [],
      prepaids: [],
      captures: [],
      reviews: [],
      notifications: { inbox: [], rules: [], sources: [] },
    });
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    input.version === 3
  ) {
    return validateState({
      ...input,
      version: 5,
      businesses: [],
      budgetChanges: [],
      allowances: [],
      notifications: { inbox: [], rules: [], sources: [] },
    });
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    input.version === 4
  )
    return validateState({
      ...input,
      version: 5,
      businesses: [],
      budgetChanges: [],
      allowances: [],
    });
  if (
    typeof input !== "object" ||
    input === null ||
    !("version" in input) ||
    input.version !== 5
  )
    throw new Error("Unsupported financial data schema version");
  return validateState(input);
}
function openStorage(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let abandoned = false;
    const timeout = setTimeout(() => {
      abandoned = true;
      reject(
        new Error(
          "Local storage did not open. Close other app tabs and retry; no records were reset.",
        ),
      );
    }, DATABASE_DEADLINE_MS);
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const tx = request.transaction!;
      const recordStore = request.result.objectStoreNames.contains("records")
        ? tx.objectStore("records")
        : request.result.createObjectStore("records");
      if (!request.result.objectStoreNames.contains("state")) {
        const store = request.result.createObjectStore("state");
        const state = initialState();
        snapshot(recordStore, state);
        store.put(header(state), "current");
      } else {
        const store = tx.objectStore("state");
        const state = store.get("current");
        state.onsuccess = () => {
          try {
            if (!state.result) throw new Error("Missing financial state");
            if (state.result.format === "kichella-records-v1") {
              const all = recordStore.getAll();
              all.onsuccess = () => {
                try {
                  const migrated = assemble(
                    state.result as Header,
                    all.result as StoredRecord[],
                  );
                  store.put(
                    { header: state.result, records: all.result },
                    "safety-before-schema-5",
                  );
                  snapshot(recordStore, migrated);
                  store.put(header(migrated), "current");
                } catch {
                  tx.abort();
                }
              };
            } else {
              const migrated = migrate(state.result);
              store.put(state.result, "safety-before-schema-5");
              snapshot(recordStore, migrated);
              store.put(header(migrated), "current");
            }
          } catch {
            tx.abort();
          }
        };
      }
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (abandoned) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timeout);
      reject(
        new Error(
          "Unable to open or upgrade local storage. Existing records were not reset.",
        ),
      );
    };
    request.onblocked = () => {
      abandoned = true;
      clearTimeout(timeout);
      reject(new Error("Close other app tabs to upgrade storage, then retry"));
    };
  });
}
function copyLegacyDatabase(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let legacy: IDBDatabase | undefined;
    let pending: IDBTransaction | undefined;
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      if (error) {
        try {
          pending?.abort();
        } catch {
          /* The transaction may have already finished. */
        }
      }
      legacy?.close();
      if (error) reject(error);
      else resolve();
    };
    const deadline = setTimeout(
      () =>
        finish(
          new Error(
            "Preparing the upgrade copy timed out. Your previous version's records were not changed. Close other Pennywise tabs and retry.",
          ),
        ),
      DATABASE_DEADLINE_MS,
    );
    const commit = (source?: State, before?: unknown, safety?: unknown) => {
      if (finished) return;
      const tx = db.transaction(["state", "records"], "readwrite");
      pending = tx;
      const store = tx.objectStore("state");
      const marker = store.get("legacy-copy-complete");
      marker.onsuccess = () => {
        if (marker.result) return;
        const current = store.get("current");
        current.onsuccess = () => {
          try {
            if (source) {
              if (
                current.result?.revision !== 0 ||
                current.result?.order.accounts.length ||
                current.result?.order.transactions.length
              )
                throw new Error(
                  "The new workspace already has records. Nothing was overwritten.",
                );
              tx.objectStore("records").clear();
              snapshot(tx.objectStore("records"), source);
              store.put(header(source), "current");
              store.put(before, "safety-before-schema-5");
              if (safety) store.put(safety, "safety-before-destructive");
            }
            store.put(
              { database: LEGACY_DB_NAME, revision: source?.revision ?? null },
              "legacy-copy-complete",
            );
          } catch (error) {
            finish(error);
          }
        };
      };
      tx.oncomplete = () => finish();
      tx.onabort = () =>
        finish(
          new Error(
            "The upgrade copy could not be saved. Your previous version's records were not changed. Check storage space and retry.",
          ),
        );
    };
    const readLegacy = () => {
      let absent = false;
      const request = indexedDB.open(LEGACY_DB_NAME);
      request.onupgradeneeded = () => {
        absent = true;
        request.transaction!.abort();
      };
      request.onerror = (event) => {
        event.preventDefault();
        if (absent) commit();
        else
          finish(
            new Error(
              "Cannot read the previous workspace. No records were reset.",
            ),
          );
      };
      request.onsuccess = () => {
        legacy = request.result;
        if (finished) {
          legacy.close();
          return;
        }
        if (!legacy.objectStoreNames.contains("state")) {
          finish(
            new Error(
              "The previous workspace is incomplete. No records were reset.",
            ),
          );
          return;
        }
        const hasRecords = legacy.objectStoreNames.contains("records");
        const tx = legacy.transaction(
          hasRecords ? ["state", "records"] : ["state"],
          "readonly",
        );
        pending = tx;
        const current = tx.objectStore("state").get("current");
        const safety = tx.objectStore("state").get("safety-before-destructive");
        const all = hasRecords ? tx.objectStore("records").getAll() : undefined;
        tx.oncomplete = () => {
          try {
            const source =
              current.result?.format === "kichella-records-v1"
                ? assemble(current.result as Header, all?.result ?? [])
                : migrate(current.result);
            commit(
              source,
              { header: current.result, records: all?.result ?? [] },
              safety.result,
            );
          } catch (error) {
            finish(error);
          }
        };
        tx.onabort = () =>
          finish(
            new Error(
              "Cannot read the previous workspace. No records were reset.",
            ),
          );
      };
    };
    const tx = db.transaction("state", "readonly");
    pending = tx;
    const marker = tx.objectStore("state").get("legacy-copy-complete");
    tx.oncomplete = () => (marker.result ? finish() : readLegacy());
    tx.onabort = () =>
      finish(
        new Error("Cannot inspect the upgrade copy. No records were reset."),
      );
  });
}
export async function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  const db = await openStorage(name);
  try {
    if (name === DB_NAME) await copyLegacyDatabase(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function auditValue(record: StoredRecord | undefined): string {
  return (
    JSON.stringify(record?.value, (key, value) =>
      key === "receipt"
        ? { name: value.name, mime: value.mime, attached: true }
        : value,
    ) ?? "deleted"
  );
}
export class Repository {
  private cached?: State;
  constructor(private readonly db: IDBDatabase) {}
  private load(
    tx: IDBTransaction,
    loaded: (s: State) => void,
    fail: (error: unknown) => void,
  ) {
    const endRead = timing("database-read");
    const request = tx.objectStore("state").get("current");
    request.onsuccess = () => {
      try {
        const meta = request.result as Header | undefined;
        if (!meta || meta.format !== "kichella-records-v1")
          throw new Error(
            "Local storage failed validation. No records were overwritten.",
          );
        if (this.cached?.revision === meta.revision) {
          endRead();
          loaded(this.cached);
        } else {
          const all = tx.objectStore("records").getAll();
          all.onsuccess = () => {
            try {
              const s = assemble(meta, all.result as StoredRecord[]);
              endRead();
              loaded(s);
            } catch (e) {
              fail(e);
            }
          };
        }
      } catch (e) {
        fail(e);
      }
    };
  }
  private transaction(
    action?: string,
    mutate?: (s: State) => void,
  ): Promise<State> {
    return new Promise((resolve, reject) => {
      const endCommit = timing("database-commit");
      const tx = this.db.transaction(
        ["state", "records"],
        mutate ? "readwrite" : "readonly",
      );
      const store = tx.objectStore("state");
      let next: State;
      let failure: unknown;
      const abort = (error: unknown) => {
        failure =
          error instanceof DOMException && error.name === "QuotaExceededError"
            ? new Error(
                "Device storage is full. Nothing was saved. Free space without clearing this app's data, then retry.",
              )
            : error;
        // If commit already won the race, only oncomplete may report success.
        try {
          tx.abort();
        } catch {
          /* Wait for the terminal transaction event. */
        }
      };
      const deadline = setTimeout(
        () =>
          abort(
            new Error(
              "Local storage took too long. No changes were saved. Keep this form open and retry.",
            ),
          ),
        DATABASE_DEADLINE_MS,
      );
      this.load(
        tx,
        (previous) => {
          try {
            if (!mutate || !action) {
              next = previous;
              return;
            }
            if (
              action.toLowerCase().startsWith("restore") ||
              action.toLowerCase().startsWith("reset")
            )
              store.put(previous, "safety-before-destructive");
            const endMutation = timing("mutation");
            next = structuredClone(previous);
            mutate(next);
            if (!/^(restore|reset)/i.test(action)) {
              if (
                next.settings.currency !== previous.settings.currency &&
                workspaceHasMoney(previous)
              )
                throw new Error(
                  "The base currency cannot be relabeled after recording money. Existing amounts keep their original currency.",
                );
              if (next.settings.currency !== previous.settings.currency)
                delete next.settings.exchange;
              stampCurrency(next, previous);
            }
            next.revision = previous.revision + 1;
            endMutation();
            const endDiff = timing("audit-diff");
            const before = index(previous);
            const after = index(next);
            const changed = new Set<string>();
            const audit: { before: string; after: string }[] = [];
            for (const key of new Set([...before.keys(), ...after.keys()])) {
              const prior = before.get(key);
              const current = after.get(key);
              if (
                JSON.stringify(prior?.value) === JSON.stringify(current?.value)
              )
                continue;
              changed.add(key);
              const collection = (current ?? prior)!.collection;
              if (collection !== "audit")
                audit.push({
                  before: `${collection}: ${auditValue(prior)}`,
                  after: `${collection}: ${auditValue(current)}`,
                });
            }
            for (const key of ["settings", "version"] as const)
              if (JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
                audit.push({
                  before: `${key}: ${JSON.stringify(previous[key])}`,
                  after: `${key}: ${JSON.stringify(next[key])}`,
                });
            for (const entry of audit) {
              const id = uid();
              next.audit.push({
                id,
                at: new Date().toISOString(),
                action,
                revision: next.revision,
                ...entry,
              });
              changed.add(recordKey("audit", id));
            }
            endDiff();
            const endValidation = timing("financial-validation");
            next = validateState(next);
            endValidation();
            const recordStore = tx.objectStore("records");
            const validated = index(next);
            for (const key of changed) {
              const r = validated.get(key);
              if (r) recordStore.put(r, [r.collection, r.id]);
              else {
                const removed = before.get(key)!;
                recordStore.delete([removed.collection, removed.id]);
              }
            }
            store.put(header(next), "current");
          } catch (error) {
            abort(error);
          }
        },
        abort,
      );
      tx.oncomplete = () => {
        clearTimeout(deadline);
        endCommit();
        this.cached = next;
        resolve(structuredClone(next));
        if (mutate && typeof BroadcastChannel !== "undefined") {
          try {
            const channel = new BroadcastChannel("pennywise-revisions");
            try {
              channel.postMessage(next.revision);
            } finally {
              channel.close();
            }
          } catch {
            // Optional cross-tab notification must never hide a committed save.
          }
        }
      };
      tx.onabort = () => {
        clearTimeout(deadline);
        reject(failure ?? new Error("Write aborted; no changes were saved"));
      };
      tx.onerror = (event) => {
        const error = (event.target as IDBRequest).error;
        failure ??= new Error(
          error?.name === "QuotaExceededError"
            ? "Device storage is full. Nothing was saved. Free space without clearing this app's data, then retry."
            : error?.name === "AbortError"
              ? "Write aborted; no changes were saved"
              : "Storage write failed. Check browser storage space.",
        );
      };
    });
  }
  async read(): Promise<State> {
    return this.transaction();
  }
  async update(action: string, mutate: (s: State) => void): Promise<State> {
    return this.transaction(action, mutate);
  }
  async restore(input: unknown): Promise<State> {
    const restored = migrate(input);
    return this.update("Restore validated backup", (s) => {
      const audit = s.audit;
      const ids = new Set(audit.map((a) => a.id));
      Object.assign(s, structuredClone(restored));
      s.audit = [...audit, ...restored.audit.filter((a) => !ids.has(a.id))];
    });
  }
  async safetyBackup(): Promise<State | undefined> {
    return new Promise((resolve, reject) => {
      const request = this.db
        .transaction("state", "readonly")
        .objectStore("state")
        .get("safety-before-destructive");
      request.onsuccess = () => {
        try {
          resolve(request.result ? migrate(request.result) : undefined);
        } catch (e) {
          reject(e);
        }
      };
      request.onerror = () => reject(new Error("Cannot read safety backup"));
    });
  }
  async reset(): Promise<State> {
    return this.update("Reset all financial records", (s) =>
      Object.assign(s, initialState()),
    );
  }
}
export function download(
  name: string,
  data: string | Blob,
  mime = "application/json",
) {
  const url = URL.createObjectURL(
    typeof data === "string" ? new Blob([data], { type: mime }) : data,
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.append(a);
  window.dispatchEvent(
    new CustomEvent("pennywise-prepared-download", { detail: { name, url } }),
  );
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}

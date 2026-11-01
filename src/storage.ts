import { initialState, uid, type State } from "./domain";
import { validateState } from "./engine";

const DB_NAME = "pennywise-private";
const DB_VERSION = 3;
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
      version: 3,
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
    });
  }
  if (
    typeof input !== "object" ||
    input === null ||
    !("version" in input) ||
    input.version !== 3
  )
    throw new Error("Unsupported financial data schema version");
  return validateState(input);
}
export function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("state")) {
        const store = request.result.createObjectStore("state");
        store.put(initialState(), "current");
      } else {
        const store = request.transaction!.objectStore("state");
        const state = store.get("current");
        state.onsuccess = () => {
          try {
            if (state.result) store.put(migrate(state.result), "current");
          } catch {
            request.transaction!.abort();
          }
        };
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new Error("Unable to open local database"));
    request.onblocked = () =>
      reject(new Error("Close other Pennywise tabs to upgrade storage"));
  });
}
function changes(
  before: State,
  after: State,
): { before: string; after: string }[] {
  const result: { before: string; after: string }[] = [];
  for (const key of Object.keys(after).filter(
    (key) => key !== "audit" && key !== "revision",
  ) as (keyof State)[]) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    const prior = before[key],
      next = after[key];
    if (Array.isArray(prior) && Array.isArray(next)) {
      const oldRecords = new Map(
        prior.map((r) => [(r as { id: string }).id, r]),
      );
      const newRecords = new Map(
        next.map((r) => [(r as { id: string }).id, r]),
      );
      const ids = new Set([...oldRecords.keys(), ...newRecords.keys()]);
      for (const id of ids) {
        const a = oldRecords.get(id);
        const b = newRecords.get(id);
        const stripReceipt = (r: unknown) =>
          JSON.stringify(r, (k, value) =>
            k === "receipt"
              ? { name: value.name, mime: value.mime, attached: true }
              : value,
          ) ?? "deleted";
        const old = stripReceipt(a),
          current = stripReceipt(b);
        if (old !== current)
          result.push({
            before: `${key}: ${old}`,
            after: `${key}: ${current}`,
          });
      }
    } else
      result.push({
        before: `${key}: ${JSON.stringify(prior)}`,
        after: `${key}: ${JSON.stringify(next)}`,
      });
  }
  return result;
}
export class Repository {
  constructor(private readonly db: IDBDatabase) {}
  async read(): Promise<State> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("state", "readonly");
      const request = tx.objectStore("state").get("current");
      request.onsuccess = () => {
        try {
          resolve(request.result ? migrate(request.result) : initialState());
        } catch {
          reject(
            new Error(
              "Local data failed validation. Restore a valid backup; no data was overwritten.",
            ),
          );
        }
      };
      request.onerror = () =>
        reject(new Error("Cannot read local financial data"));
    });
  }
  async update(action: string, mutate: (s: State) => void): Promise<State> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("state", "readwrite");
      const store = tx.objectStore("state");
      const request = store.get("current");
      let next: State;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const previous = request.result
            ? migrate(request.result)
            : initialState();
          if (
            action.toLowerCase().startsWith("restore") ||
            action.toLowerCase().startsWith("reset")
          )
            store.put(previous, "safety-before-destructive");
          next = structuredClone(previous);
          mutate(next);
          next.revision = previous.revision + 1;
          for (const changed of changes(previous, next)) {
            next.audit.push({
              id: uid(),
              at: new Date().toISOString(),
              action,
              revision: next.revision,
              ...changed,
            });
          }
          next = validateState(next);
          store.put(next, "current");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("pennywise-revisions");
          channel.postMessage(next.revision);
          channel.close();
        }
        resolve(next);
      };
      tx.onabort = () =>
        reject(failure ?? new Error("Write aborted; no changes were saved"));
      tx.onerror = (event) => {
        const error = (event.target as IDBRequest).error;
        failure ??= new Error(
          error?.name === "AbortError"
            ? "Write aborted; no changes were saved"
            : "Storage write failed. Check browser storage space.",
        );
      };
    });
  }
  async restore(input: unknown): Promise<State> {
    const restored = migrate(input);
    return this.update("Restore validated backup", (s) => {
      const audit = s.audit;
      Object.assign(s, structuredClone(restored));
      s.audit = [
        ...audit,
        ...restored.audit.filter((a) => !audit.some((r) => r.id === a.id)),
      ];
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

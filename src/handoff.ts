import {
  notificationBatchSchema,
  type NotificationBatch,
} from "./notification-schema";

export const MAX_HANDOFF_BYTES = 500_000;
interface StagedHandoff {
  id: string;
  receivedAt: number;
  batch: NotificationBatch;
}
async function stagingDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pennywise-notification-handoff", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("pending", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Cannot open local handoff storage"));
  });
}
export async function stagedHandoffs(): Promise<StagedHandoff[]> {
  const db = await stagingDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("pending").objectStore("pending").getAll();
      request.onsuccess = () => resolve(request.result as StagedHandoff[]);
      request.onerror = () => reject(new Error("Cannot read pending handoffs"));
    });
  } finally {
    db.close();
  }
}
export async function stageHandoff(text: string) {
  if (new TextEncoder().encode(text).length > MAX_HANDOFF_BYTES)
    throw new Error("Handoff exceeds 500 KB");
  const batch = notificationBatchSchema.parse(JSON.parse(text));
  batch.candidates = batch.candidates
    .filter(
      (c) =>
        !/\b(otp|one[- ]time|verification code|password|passcode|login|log[- ]in|security code|pin)\b/i.test(
          [c.raw, c.counterparty].join(" "),
        ),
    )
    .map((candidate) => {
      const copy = { ...candidate };
      delete copy.raw;
      return copy;
    });
  if (!batch.candidates.length) throw new Error("No non-sensitive candidates");
  const db = await stagingDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pending", "readwrite");
      const store = tx.objectStore("pending");
      const count = store.count();
      let full = false;
      count.onsuccess = () => {
        const existing = store.get(batch.batchId);
        existing.onsuccess = () => {
          if (count.result >= 10 && !existing.result) {
            full = true;
            tx.abort();
          } else
            store.put({ id: batch.batchId, receivedAt: Date.now(), batch });
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          new Error(
            full
              ? "Review or discard pending shares first; queue is full"
              : "Handoff was not saved; retry from companion",
          ),
        );
      tx.onerror = () =>
        reject(new Error("Local handoff storage failed; retry from companion"));
    });
  } finally {
    db.close();
  }
}
export async function discardHandoff(id: string) {
  const db = await stagingDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pending", "readwrite");
      tx.objectStore("pending").delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error("Could not remove pending share"));
      tx.onerror = () => reject(new Error("Could not remove pending share"));
    });
  } finally {
    db.close();
  }
}

const NAME = "pennywise-reference-and-backup";

export async function inspectAuxiliary(
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const db = await new Promise<IDBDatabase | undefined>((resolve, reject) => {
    let absent = false;
    let blocked = false;
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction!.abort();
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () =>
      absent
        ? resolve(undefined)
        : reject(new Error("Optional feature status could not be read"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Optional feature status is blocked by another tab"));
    };
  });
  if (!db) return {};
  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const tx = db.transaction("metadata", "readonly");
      const values: Record<string, unknown> = {};
      for (const key of keys) {
        const request = tx.objectStore("metadata").get(key);
        request.onsuccess = () => {
          values[key] = request.result;
        };
      }
      tx.oncomplete = () => resolve(values);
      tx.onabort = () =>
        reject(new Error("Optional feature status could not be read"));
      tx.onerror = () => {
        /* onabort reports the terminal result. */
      };
    });
  } finally {
    db.close();
  }
}

export async function auxiliaryUpdate<T>(
  key: string,
  update: (previous: unknown) => T,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("metadata");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Cannot open optional feature storage"));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("metadata", "readwrite");
      const store = tx.objectStore("metadata");
      const request = store.get(key);
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          result = update(request.result);
          store.put(result, key);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure ?? new Error("Optional feature storage write failed"));
      tx.onerror = () => {
        /* onabort reports the terminal result. */
      };
    });
  } finally {
    db.close();
  }
}
export async function auxiliaryRead<T>(key: string, fallback: T): Promise<T> {
  return auxiliaryUpdate(key, (value) => (value ?? fallback) as T);
}

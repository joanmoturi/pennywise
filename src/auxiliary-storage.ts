const NAME = "pennywise-reference-and-backup";
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

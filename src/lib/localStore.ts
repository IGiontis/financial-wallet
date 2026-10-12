// ─── A small key-value store on the device ───────────────────────────────────
//
// IndexedDB, not localStorage: a few thousand records is a few hundred
// kilobytes, which localStorage would hold but parse on the main thread at
// every start, and its 5 MB is shared with everything else the app keeps.
//
// Every call settles, never throws. Where there is no IndexedDB (a private
// window in some browsers, the test environment) reads come back empty and
// writes do nothing, and whatever relies on this simply reads from the server
// as it always did.

const DB_NAME = "myfiwallet-local";
const STORE = "kv";

let opening: Promise<IDBDatabase | null> | undefined;

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(STORE, mode);
          const request = work(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(request ? (request.result as T) : undefined);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const localGet = <T>(key: string) => run<T>("readonly", (store) => store.get(key));

export const localSet = (key: string, value: unknown) => run<void>("readwrite", (store) => void store.put(value, key));

export const localDelete = (key: string) => run<void>("readwrite", (store) => void store.delete(key));

/** Removes every key that starts with `prefix` — one user's copies, on sign-out. */
export const localDeletePrefix = (prefix: string) =>
  run<void>("readwrite", (store) => {
    // The upper bound is the prefix followed by the highest code unit, so the
    // range covers exactly the keys that begin with it.
    void store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`));
  });

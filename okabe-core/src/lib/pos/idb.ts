/** Pembungkus kecil IndexedDB untuk data POS di perangkat kasir (offline-first, NFR-03). */

const DB_NAME = "okabe-pos";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "client_uuid" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

export const kv = {
  get: <T>(key: string) => tx<T | undefined>("kv", "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => tx("kv", "readwrite", (s) => s.put(value, key)),
  del: (key: string) => tx("kv", "readwrite", (s) => s.delete(key)),
};

export const queueStore = {
  all: <T>() => tx<T[]>("queue", "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  put: (value: unknown) => tx("queue", "readwrite", (s) => s.put(value)),
  del: (key: string) => tx("queue", "readwrite", (s) => s.delete(key)),
};

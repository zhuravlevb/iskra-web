/**
 * IndexedDB на промисах — ровно столько, сколько нужно своим базам (аккаунты,
 * черновики). Кэш синхронизации и криптохранилище ведёт сам `matrix-js-sdk`.
 */

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Другая вкладка держит старую версию базы. Лок одной вкладки должен был этого
    // не допустить, но ждать вечно — хуже, чем упасть.
    req.onblocked = () => reject(new Error(`IndexedDB "${name}" is blocked by another tab`));
  });
}

export function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // Заблокирована открытым соединением — удалится, когда его закроют. Не ждём.
    req.onblocked = () => resolve();
  });
}

/** Одна транзакция над одним хранилищем; результат — то, что вернул `body`. */
export async function transact<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const tx = db.transaction(store, mode);
  const result = request(body(tx.objectStore(store)));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
  return result;
}

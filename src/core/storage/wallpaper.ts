/**
 * Своё фото на обои — на этом устройстве, и больше нигде (`WallpaperStore` нативной Искры).
 * Не данные аккаунта: не синхронизируется, не уходит на сервер. Лежит как есть, одним
 * `Blob` в своей маленькой базе: пересжатая для хранения фотография — фотография, ставшая
 * хуже ни для чего. Забывается при выходе из аккаунта — следующий на этом устройстве — другой
 * человек.
 *
 * Хранится не `Blob`, а байты и тип: WebKit в эфемерной сессии (приватное окно Safari, и так же
 * Playwright) отказывается класть `Blob` в IndexedDB — фото пропадало после перезагрузки.
 * `ArrayBuffer` умеют все.
 */
import { deleteDatabase, openDatabase, transact } from './idb';

const DB_NAME = 'iskra-wallpaper';
const STORE = 'photo';
const KEY = 'current';

interface Stored {
  type: string;
  bytes: ArrayBuffer;
}

function open(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, 1, (db) => {
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  });
}

export const wallpaperPhoto = {
  /** Фото — или ничего: нет, не читается, хранилища нет. */
  async load(): Promise<Blob | undefined> {
    try {
      const db = await open();
      try {
        const value = await transact(db, STORE, 'readonly', (s) => s.get(KEY) as IDBRequest<Stored | undefined>);
        return value?.bytes instanceof ArrayBuffer ? new Blob([value.bytes], { type: value.type }) : undefined;
      } finally {
        db.close();
      }
    } catch {
      return undefined;
    }
  },

  async save(photo: Blob): Promise<void> {
    // Байты — до транзакции: транзакция IndexedDB закрывается на первом же await.
    const stored: Stored = { type: photo.type, bytes: await photo.arrayBuffer() };
    const db = await open();
    try {
      await transact(db, STORE, 'readwrite', (s) => s.put(stored, KEY));
    } finally {
      db.close();
    }
  },

  async forget(): Promise<void> {
    await deleteDatabase(DB_NAME).catch(() => {});
  },
};

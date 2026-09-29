/**
 * Своё фото на обои — на этом устройстве, и больше нигде (`WallpaperStore` нативной Искры).
 * Не данные аккаунта: не синхронизируется, не уходит на сервер. Лежит как есть, одним
 * `Blob` в своей маленькой базе: пересжатая для хранения фотография — фотография, ставшая
 * хуже ни для чего. Забывается при выходе из аккаунта — следующий на этом устройстве — другой
 * человек.
 */
import { deleteDatabase, openDatabase, transact } from './idb';

const DB_NAME = 'iskra-wallpaper';
const STORE = 'photo';
const KEY = 'current';

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
        const value = await transact(db, STORE, 'readonly', (s) => s.get(KEY) as IDBRequest<unknown>);
        return value instanceof Blob ? value : undefined;
      } finally {
        db.close();
      }
    } catch {
      return undefined;
    }
  },

  async save(photo: Blob): Promise<void> {
    const db = await open();
    try {
      await transact(db, STORE, 'readwrite', (s) => s.put(photo, KEY));
    } finally {
      db.close();
    }
  },

  async forget(): Promise<void> {
    await deleteDatabase(DB_NAME).catch(() => {});
  },
};

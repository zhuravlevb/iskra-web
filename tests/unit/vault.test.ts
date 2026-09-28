import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { vault } from '../../src/core/storage/vault';
import { fromBase64 } from '../../src/core/storage/secretBox';

afterEach(() => vault.destroy());

const alice = {
  userId: '@alice:example.org',
  deviceId: 'DEV1',
  homeserverUrl: 'https://matrix.example.org',
  method: 'password' as const,
  accessToken: 'syt_secret_token',
};

async function rawRecord(userId: string): Promise<Record<string, unknown>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('iskra-accounts');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const record = await new Promise<Record<string, unknown>>((resolve) => {
    const r = db.transaction('accounts').objectStore('accounts').get(userId);
    r.onsuccess = () => resolve(r.result);
  });
  db.close();
  return record;
}

describe('хранилище аккаунтов', () => {
  it('токены лежат зашифрованными, ключ — неизвлекаемый', async () => {
    await vault.add(alice);
    const raw = await rawRecord(alice.userId);
    expect(JSON.stringify(raw)).not.toContain('syt_secret_token');
    expect(raw['accessToken']).toBeUndefined();
    expect((raw['key'] as CryptoKey).extractable).toBe(false);
  });

  it('секреты возвращаются, ключ криптохранилища — 32 байта', async () => {
    const { secrets } = await vault.add(alice);
    const read = await vault.secrets(alice.userId);
    expect(read).toEqual(secrets);
    expect(read?.accessToken).toBe('syt_secret_token');
    expect(fromBase64(read!.cryptoStorageKey)).toHaveLength(32);
  });

  it('обновление токенов сохраняет ключ криптохранилища', async () => {
    const { secrets } = await vault.add({ ...alice, method: 'oauth', refreshToken: 'r1' });
    await vault.updateTokens(alice.userId, { accessToken: 'a2', refreshToken: 'r2' });
    expect(await vault.secrets(alice.userId)).toEqual({
      accessToken: 'a2',
      refreshToken: 'r2',
      cryptoStorageKey: secrets.cryptoStorageKey,
    });
  });

  it('текущий — последний вошедший; удаление — насовсем', async () => {
    await vault.add(alice);
    await new Promise((r) => setTimeout(r, 2));
    await vault.add({ ...alice, userId: '@bob:example.org' });
    expect((await vault.current())?.userId).toBe('@bob:example.org');
    await vault.remove('@bob:example.org');
    expect((await vault.current())?.userId).toBe(alice.userId);
    expect(await vault.secrets('@bob:example.org')).toBeUndefined();
  });
});

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

  it('черновики: по чату, под ключом аккаунта, пустой — удаляется, уходят вместе с аккаунтом', async () => {
    const bob = { ...alice, userId: '@bob:example.org' };
    await vault.add(alice);
    await vault.add(bob);
    await vault.saveDraft(alice.userId, '!a:x', 'Привет, это черновик');
    await vault.saveDraft(alice.userId, '!b:x', 'Второй');
    await vault.saveDraft(bob.userId, '!a:x', 'Чужой');
    expect(await vault.draft(alice.userId, '!a:x')).toBe('Привет, это черновик');
    expect(await vault.draft(alice.userId, '!c:x')).toBe('');

    // На диске — не текст.
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('iskra-accounts');
      r.onsuccess = () => resolve(r.result);
    });
    const raw = await new Promise<{ sealed: { data: ArrayBuffer } }>((resolve) => {
      const r = db.transaction('drafts').objectStore('drafts').get([alice.userId, '!a:x']);
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    expect(raw.sealed.data.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(raw.sealed.data)).not.toContain('черновик');

    await vault.saveDraft(alice.userId, '!b:x', '   ');
    expect(await vault.draft(alice.userId, '!b:x')).toBe('');

    await vault.remove(alice.userId);
    expect(await vault.draft(alice.userId, '!a:x')).toBe('');
    expect(await vault.draft(bob.userId, '!a:x')).toBe('Чужой');
  });

  it('локальные имена: по чату, под ключом аккаунта, пустое — удаляется, уходят вместе с аккаунтом', async () => {
    const bob = { ...alice, userId: '@bob:example.org' };
    await vault.add(alice);
    await vault.add(bob);
    await vault.saveLocalName(alice.userId, '!a:x', '  Мама ');
    await vault.saveLocalName(alice.userId, '!b:x', 'Шеф');
    await vault.saveLocalName(bob.userId, '!a:x', 'Тёща');
    expect(await vault.localNames(alice.userId)).toEqual({ '!a:x': 'Мама', '!b:x': 'Шеф' });

    await vault.saveLocalName(alice.userId, '!b:x', ' ');
    expect(await vault.localNames(alice.userId)).toEqual({ '!a:x': 'Мама' });

    await vault.remove(alice.userId);
    expect(await vault.localNames(alice.userId)).toEqual({});
    expect(await vault.localNames(bob.userId)).toEqual({ '!a:x': 'Тёща' });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { RecoveryStore } from '../../src/core/encryption/recovery.svelte.ts';
import { SecretStorageKeyHolder } from '../../src/core/encryption/secretStorageKey';
import { quietLogger } from '../../src/core/support/logger';

const clients: MatrixClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) await stop(c);
});

/**
 * Остановить, дождавшись фоновой проверки резервной копии: иначе она доработает на уже
 * освобождённой olm-машине («null pointer passed to rust»). Проверка одна, и этот вызов
 * возвращает её же.
 */
async function stop(client: MatrixClient): Promise<void> {
  await client.getCrypto()?.checkKeyBackupAndEnable().catch(() => {});
  client.stopClient();
}

/** Новое устройство: вход паролем, Rust-крипто в памяти, первая синхронизация. */
async function device(server: DemoHomeserver) {
  const logger = quietLogger();
  const anonymous = createClient({ baseUrl: server.baseUrl, fetchFn: server.fetch, logger });
  const login = await anonymous.loginRequest({ type: 'm.login.password', identifier: { type: 'm.id.user', user: 'alice' }, password: 'password' });
  const keys = new SecretStorageKeyHolder();
  const client = createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger,
    userId: login.user_id,
    deviceId: login.device_id,
    accessToken: login.access_token,
    cryptoCallbacks: keys.callbacks,
  });
  clients.push(client);
  await client.initRustCrypto({ useIndexedDB: false });
  const prepared = new Promise<void>((resolve) => client.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 5 });
  await prepared;
  return { client, recovery: new RecoveryStore(client, keys) };
}

describe('код восстановления на демо-сервере', () => {
  it('новый аккаунт: бэкапа нет → создаём, код — один раз; дальше «всё открыто»', async () => {
    const server = new DemoHomeserver();
    const { recovery } = await device(server);
    expect(await recovery.refresh()).toBe('off');
    const code = await recovery.protectHistory();
    expect(recovery.failure).toBeNull();
    expect(code).toMatch(/^[A-Za-z0-9]{4}( [A-Za-z0-9]{4}){11}$/);
    expect(await recovery.refresh()).toBe('on');
    expect(server.unknown).toEqual([]);
  }, 30_000);

  it('новое устройство: «нужен код»; неверный — «не подошёл», чужой — «составлен верно, но не тот»; верный — открыто', async () => {
    const server = new DemoHomeserver();
    const first = await device(server);
    await first.recovery.refresh();
    const code = (await first.recovery.protectHistory())!;
    await stop(first.client);

    const second = await device(server);
    expect(await second.recovery.refresh()).toBe('keyNeeded');

    expect(await second.recovery.restore('не код')).toBe(false);
    expect(second.recovery.failure).toBe('restoreFailed');

    // Код правильной формы, но от другого ключа — как после «создать новый код».
    const other = await (await device(new DemoHomeserver())).client.getCrypto()!.createRecoveryKeyFromPassphrase();
    expect(await second.recovery.restore(other.encodedPrivateKey!)).toBe(false);
    expect(second.recovery.failure).toBe('staleCodeFailed');

    expect(await second.recovery.restore(`  ${code}\n`)).toBe(true);
    expect(second.recovery.failure).toBeNull();
    expect(await second.recovery.refresh()).toBe('on');
    expect(server.unknown).toEqual([]);
  }, 60_000);

  it('новый код взамен старого: старый перестаёт подходить', async () => {
    const server = new DemoHomeserver();
    const first = await device(server);
    await first.recovery.refresh();
    const oldCode = (await first.recovery.protectHistory())!;
    const newCode = (await first.recovery.makeNewKey())!;
    expect(newCode).not.toBe(oldCode);
    await stop(first.client);

    const second = await device(server);
    expect(await second.recovery.restore(oldCode)).toBe(false);
    expect(second.recovery.failure).toBe('staleCodeFailed');
    expect(await second.recovery.restore(newCode)).toBe(true);
  }, 60_000);

  it('с чистого листа: сервер спрашивает пароль, после — новая личность и новый код', async () => {
    const server = new DemoHomeserver();
    const first = await device(server);
    await first.recovery.refresh();
    await first.recovery.protectHistory();
    await stop(first.client);

    const second = await device(server);
    expect(await second.recovery.refresh()).toBe('keyNeeded');
    expect(await second.recovery.hasOtherDevices()).toBe(true);

    const started = second.recovery.startOver();
    await expect.poll(() => second.recovery.authRequest).toEqual({ kind: 'password' });
    second.recovery.answerPassword('password');
    const code = await started;
    expect(second.recovery.failure).toBeNull();
    expect(code).toBeTruthy();
    expect(await second.recovery.refresh()).toBe('on');
  }, 60_000);

  it('передумал на вопросе о пароле — ничего не выброшено и не сломано', async () => {
    const server = new DemoHomeserver();
    const first = await device(server);
    await first.recovery.refresh();
    await first.recovery.protectHistory();
    await stop(first.client);

    const second = await device(server);
    await second.recovery.refresh();
    const started = second.recovery.startOver();
    await expect.poll(() => second.recovery.authRequest).toEqual({ kind: 'password' });
    second.recovery.cancelAuth();
    expect(await started).toBeNull();
    expect(second.recovery.failure).toBeNull();
    expect(await second.recovery.refresh()).toBe('keyNeeded');
  }, 60_000);
});

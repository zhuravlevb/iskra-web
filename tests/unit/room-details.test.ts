import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, EventType, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { RoomDetailsStore } from '../../src/core/rooms/roomDetails.svelte.ts';
import { createDirect, createGroup } from '../../src/core/rooms/create';
import { quietLogger } from '../../src/core/support/logger';

let client: MatrixClient | undefined;
let store: RoomDetailsStore | undefined;
afterEach(() => {
  store?.destroy();
  client?.stopClient();
  client = store = undefined;
});

async function started() {
  const server = new DemoHomeserver();
  client = createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger: quietLogger(),
    userId: demoUsers.alice,
    deviceId: 'DEMODEVICE',
    accessToken: 'demo-token-DEMODEVICE',
  });
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 5 });
  await prepared;
  return { client, server };
}

const directOf = (c: MatrixClient) => (roomId: string) =>
  Object.values((c.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>).some((ids) => ids.includes(roomId));

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('«О чате» на демо-сервере', () => {
  it('права — из power levels: где Алиса админ — можно всё; где нет — ничего не видно', async () => {
    const { client } = await started();
    store = new RoomDetailsStore(client, demoRooms.history, directOf(client));
    await until(() => store!.members.length === 3);
    expect(store.permissions).toEqual({
      canRename: true, canChangeTopic: true, canChangePicture: true, canChangeVisibility: true,
      canInvite: true, canRemove: true, canBan: true, canChangeRoles: true,
    });
    expect(store.members.map((m) => [m.name, m.role])).toEqual([['Алиса', 'administrator'], ['Борис', 'member'], ['Вера', 'member']]);
    const boris = store.members.find((m) => m.name === 'Борис')!;
    expect(store.mayRemove(boris)).toBe(true);
    expect(store.rolesFor(boris)).toEqual(['administrator', 'moderator', 'member']);
    // Себя — нельзя: уйти — другая кнопка.
    expect(store.mayRemove(store.members[0]!)).toBe(false);
    store.destroy();

    store = new RoomDetailsStore(client, demoRooms.weekend, directOf(client));
    await until(() => store!.members.length === 3);
    // Приглашать по умолчанию может любой участник (`invite: 0`) — остальное закрыто.
    expect(store.permissions).toMatchObject({ canRename: false, canRemove: false, canBan: false, canChangeRoles: false, canInvite: true });
    expect(store.members[0]).toMatchObject({ name: 'Борис', role: 'administrator' });
    expect(store.mayRemove(store.members[0]!)).toBe(false);
    expect(store.rolesFor(store.members.find((m) => m.name === 'Вера')!)).toEqual([]);
  });

  it('название, описание, открытость — меняются и приходят обратно синхронизацией', async () => {
    const { client } = await started();
    store = new RoomDetailsStore(client, demoRooms.history, directOf(client));
    expect(await store.rename('Очень длинная история')).toBe(true);
    await until(() => store!.name === 'Очень длинная история');
    expect(await store.setTopic('Проверяем подгрузку')).toBe(true);
    await until(() => store!.topic === 'Проверяем подгрузку');
    expect(await store.setOpen(true)).toBe(true);
    await until(() => store!.open);
  });

  it('участники: пригласить, повысить, исключить, заблокировать; кривой адрес — ошибка', async () => {
    const { client, server } = await started();
    store = new RoomDetailsStore(client, demoRooms.history, directOf(client));
    await until(() => store!.members.length === 3);
    expect(await store.invite('аня')).toBe(false);
    expect(store.failure).toBe('invite');
    expect(await store.invite(demoUsers.anya)).toBe(true);
    await until(() => store!.members.some((m) => m.id === demoUsers.anya && m.invited));

    const boris = () => store!.members.find((m) => m.id === demoUsers.boris)!;
    expect(await store.setRole(boris(), 'moderator')).toBe(true);
    await until(() => boris().role === 'moderator');

    expect(await store.remove(boris())).toBe(true);
    await until(() => !store!.members.some((m) => m.id === demoUsers.boris));
    const vera = store.members.find((m) => m.id === demoUsers.vera)!;
    expect(await store.ban(vera)).toBe(true);
    await until(() => !store!.members.some((m) => m.id === demoUsers.vera));
    expect(server.unknown).toEqual([]);
  });

  it('уведомления комнаты: все → только упоминания → выключены → все; «Дом 14» — выключен с самого начала', async () => {
    const { client } = await started();
    store = new RoomDetailsStore(client, demoRooms.quiet, directOf(client));
    expect(store.alerts).toBe('muted');
    store.destroy();
    store = new RoomDetailsStore(client, demoRooms.weekend, directOf(client));
    expect(store.alerts).toBe('all');
    for (const alerts of ['mentions', 'muted', 'all'] as const) {
      expect(await store.setAlerts(alerts)).toBe(true);
      await until(() => {
        store!.read();
        return store!.alerts === alerts;
      });
    }
  });

  it('новый чат: с тем, с кем уже есть, — тот же; с новым — зашифрованный и в m.direct', async () => {
    const { client } = await started();
    expect(await createDirect(client, demoUsers.anya)).toBe(demoRooms.anya);
    const roomId = await createDirect(client, demoUsers.boris);
    await until(() => !!client.getRoom(roomId));
    expect(client.getRoom(roomId)!.hasEncryptionStateEvent()).toBe(true);
    await until(() => directOf(client)(roomId));
    store = new RoomDetailsStore(client, roomId, directOf(client));
    expect(store.direct).toBe(true);
    expect(store.permissions.canChangeVisibility).toBe(false);
  });

  it('новая комната: закрытая — зашифрована, открытая — нет', async () => {
    const { client } = await started();
    const closed = await createGroup(client, 'Книги', false);
    const open = await createGroup(client, 'Все сюда', true);
    await until(() => !!client.getRoom(closed) && !!client.getRoom(open));
    expect(client.getRoom(closed)!.hasEncryptionStateEvent()).toBe(true);
    expect(client.getRoom(open)!.hasEncryptionStateEvent()).toBe(false);
    expect(client.getRoom(open)!.getJoinRule()).toBe('public');
    expect(client.getRoom(closed)!.name).toBe('Книги');
  });
});

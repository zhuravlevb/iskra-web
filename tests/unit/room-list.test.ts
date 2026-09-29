import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { RoomListStore } from '../../src/core/rooms/roomListStore.svelte.ts';
import { LocalNames } from '../../src/core/rooms/localNames.svelte.ts';
import { searchRooms } from '../../src/core/rooms/organize';
import { emphasisOf, hasUnread } from '../../src/core/rooms/types';
import { quietLogger } from '../../src/core/support/logger';

const logger = quietLogger();
let client: MatrixClient | undefined;
let store: RoomListStore | undefined;

afterEach(() => {
  store?.destroy();
  client?.stopClient();
  client = store = undefined;
});

async function started(server = new DemoHomeserver()): Promise<{ client: MatrixClient; server: DemoHomeserver }> {
  client = createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger,
    userId: demoUsers.alice,
    deviceId: 'DEMODEVICE',
    accessToken: 'demo-token-DEMODEVICE',
  });
  const prepared = new Promise<void>((resolve) =>
    client!.on(ClientEvent.Sync, (state) => state === SyncState.Prepared && resolve()),
  );
  await client.startClient({ initialSyncLimit: 20 });
  await prepared;
  return { client, server };
}

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
    store?.flush();
  }
}

describe('список чатов на демо-сервере', () => {
  it('один список, как в нативной Искре: приглашение, закреплённый, дальше по активности; архив отдельно', async () => {
    const { client } = await started();
    store = new RoomListStore(client);
    const { list, archived } = store.organized;
    const byActivity = list.slice(2).map((r) => r.id);
    expect(list.slice(0, 2).map((r) => r.id)).toEqual([demoRooms.invite, demoRooms.anya]);
    // Пространство — среди чатов, на своём месте по активности, а не отдельным разделом.
    expect(byActivity).toContain(demoRooms.family);
    // По последней активности: выходные (40 мин назад) → дом (5 ч) → история (26 ч).
    const chats = byActivity.filter((id) => id !== demoRooms.family);
    expect(chats).toEqual([demoRooms.weekend, demoRooms.quiet, demoRooms.history]);
    const times = list.slice(2).map((r) => r.lastActivity);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(archived.map((r) => r.id)).toEqual([demoRooms.archived]);
  });

  it('личный чат — имя, лицо и шифрование от собеседника', async () => {
    const { client } = await started();
    store = new RoomListStore(client);
    const anya = store.get(demoRooms.anya)!;
    expect(anya).toMatchObject({ kind: 'direct', name: 'Аня', avatarSeed: demoUsers.anya, encrypted: true, faces: [] });
    expect(anya.preview).toEqual({ kind: 'text', text: 'Возьми плед, там ветрено' });
  });

  it('локальное имя — только у личного чата, и список узнаёт о нём сразу', async () => {
    const { client } = await started();
    const saved: string[] = [];
    const names = new LocalNames(demoUsers.alice, { load: async () => ({ [demoRooms.anya]: 'Анечка' }), save: async (_u, room, name) => void saved.push(`${room}=${name}`) });
    await names.load();
    store = new RoomListStore(client, names);
    expect(store.get(demoRooms.anya)!.name).toBe('Анечка');

    names.set(demoRooms.anya, '  ');
    await until(() => store!.get(demoRooms.anya)!.name === 'Аня');
    // Группу не переименовать: её имя — общее.
    names.set(demoRooms.weekend, 'Моя дача');
    store.flush();
    expect(store.get(demoRooms.weekend)!.name).toBe('Выходные');
    expect(saved).toEqual([`${demoRooms.anya}=`, `${demoRooms.weekend}=Моя дача`]);
  });

  it('группа без фото — лица собеседников, без себя', async () => {
    const { client } = await started();
    store = new RoomListStore(client);
    const weekend = store.get(demoRooms.weekend)!;
    expect(weekend.kind).toBe('group');
    expect(weekend.name).toBe('Выходные');
    expect(weekend.avatarSeed).toBe(demoRooms.weekend);
    expect(weekend.faces.map((f) => f.id)).toEqual([demoUsers.boris, demoUsers.vera]);
  });

  it('непрочитанное: уведомления, упоминание, беззвучный — серый, прочитанный — тихий', async () => {
    const { client } = await started();
    store = new RoomListStore(client);
    const weekend = store.get(demoRooms.weekend)!;
    expect(weekend).toMatchObject({ unreadCount: 3, mentionCount: 1 });
    expect(emphasisOf(weekend)).toBe('ordinary');

    const quiet = store.get(demoRooms.quiet)!;
    expect(quiet).toMatchObject({ unreadCount: 0, isMuted: true, hasUnreadMessages: true });
    expect(hasUnread(quiet)).toBe(true);
    expect(emphasisOf(quiet)).toBe('muted');

    expect(hasUnread(store.get(demoRooms.history)!)).toBe(false);
    // Приглашение, личный с двумя, группа с упоминанием; беззвучный не в счёт.
    expect(store.badge).toBe(3);
  });

  it('превью: опрос — это «опрос», правка — не новое сообщение', async () => {
    const { client } = await started();
    store = new RoomListStore(client);
    // Последнее в выходных — сообщение Веры с упоминанием; опрос перед ним.
    expect(store.get(demoRooms.weekend)!.preview).toEqual({ kind: 'text', text: 'Алиса, ты с нами?' });
  });

  it('пространство знает свои комнаты', async () => {
    const { client } = await started();
    store = new RoomListStore(client);
    expect(store.childrenOf(demoRooms.family).map((r) => r.id).sort()).toEqual([demoRooms.anya, demoRooms.weekend].sort());
  });

  it('приглашение: «Войти» делает комнату чатом, «Отклонить» убирает её', async () => {
    const { client, server } = await started();
    store = new RoomListStore(client);
    const invite = store.get(demoRooms.invite)!;
    expect(invite).toMatchObject({ membership: 'invite', name: 'Книжный клуб', invitedBy: 'Борис' });

    await store.accept(demoRooms.invite);
    await until(() => store!.get(demoRooms.invite)?.membership === 'join');
    expect(store.organized.list.filter((r) => r.membership === 'invite')).toEqual([]);
    expect(server.unknown).toEqual([]);
  });

  it('отказ от приглашения', async () => {
    const { client, server } = await started();
    store = new RoomListStore(client);
    await store.decline(demoRooms.invite);
    await until(() => !store!.get(demoRooms.invite));
    expect(server.unknown).toEqual([]);
  });

  it('прочитали — значок гаснет', async () => {
    const { client } = await started();
    store = new RoomListStore(client);
    const room = client.getRoom(demoRooms.weekend)!;
    const last = room.getLiveTimeline().getEvents().at(-1)!;
    await client.sendReadReceipt(last);
    await until(() => store!.get(demoRooms.weekend)!.unreadCount === 0);
    expect(hasUnread(store.get(demoRooms.weekend)!)).toBe(false);
  });
});

describe('быстрый переход', () => {
  const room = (id: string, name: string, lastActivity: number) =>
    ({ id, name, lastActivity, kind: 'group', membership: 'join', isLowPriority: false }) as never;
  const rooms = [room('!a:x', 'Выходные', 3), room('!b:x', 'Дом 14, подъезд 2', 2), room('!c:x', 'Ёлка на работе', 1), room('!d:x', 'Новые выходы', 5)];
  const nameOf = (r: { name?: string }) => r.name ?? '';

  it('сначала с начала названия, потом с начала слова, потом где угодно', () => {
    expect(searchRooms(rooms, 'вых', nameOf).map((r) => r.id)).toEqual(['!a:x', '!d:x']);
    expect(searchRooms(rooms, 'под', nameOf).map((r) => r.id)).toEqual(['!b:x']);
    expect(searchRooms(rooms, 'ходн', nameOf).map((r) => r.id)).toEqual(['!a:x']);
  });

  it('без регистра и ё', () => {
    expect(searchRooms(rooms, 'елка', nameOf).map((r) => r.id)).toEqual(['!c:x']);
  });

  it('пустой запрос — все по активности', () => {
    expect(searchRooms(rooms, '', nameOf).map((r) => r.id)).toEqual(['!d:x', '!a:x', '!b:x', '!c:x']);
  });
});
